// Tab 4 — Giao việc · Báo cáo · Đề xuất
// 3 panel: Tasks (giao việc) · Reports (báo cáo) · Proposals (đề xuất).
// Server-side fetch theo scope rồi truyền xuống client.

import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import {
  kyThuatReadScope, getTechSpecialization,
  canCreateTask, canCreateReport, canCreateProposal,
} from '@/lib/firebase/ky-thuat-scope';
import { GiaoViecClient, type WorkRow, type AssigneeOption } from './GiaoViecClient';

const ALL_BRANCHES = ['HM', 'TK', 'CTT', '24', 'TT'] as const;
const BRANCH_LABELS: Record<string, string> = {
  HM:  'Green Pool Hoàng Mai',
  TK:  'Green Pool 20 Thuỵ Khuê',
  CTT: 'Green Pool Cung Thể Thao MĐ',
  '24':'Green Pool 24 NCT',
  TT:  'Green Pool Thanh Trì',
};

interface PageProps {
  searchParams: Promise<{ tab?: string; branchId?: string }>;
}

function serialize(id: string, data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { id };
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && typeof v.toDate === 'function') out[k] = v.toDate().toISOString();
    else out[k] = v;
  }
  return out;
}

export default async function GiaoViecPage({ searchParams }: PageProps) {
  const { profile } = await requireAuthedProfile();
  const sp = await searchParams;
  const tab = sp.tab === 'reports' || sp.tab === 'proposals' ? sp.tab : 'tasks';
  const branchId = sp.branchId && (ALL_BRANCHES as readonly string[]).includes(sp.branchId) ? sp.branchId : null;

  const callerProfile = {
    uid: profile.id, role_code: profile.roleCode, facility_id: profile.branchId,
    department_id: profile.departmentId, shift_assignment: profile.shiftAssignment,
    is_shared_shift_account: profile.isSharedShiftAccount,
  };
  const scope = kyThuatReadScope(callerProfile);
  if (scope.branchIds && scope.branchIds.length === 0) {
    return <div className="p-6 text-center text-slate-500">Bạn chưa được gán cơ sở/quyền xem.</div>;
  }
  const visibleBranchIds: readonly string[] = scope.branchIds === null
    ? ALL_BRANCHES
    : (scope.branchIds.length > 0 ? scope.branchIds : []);
  if (branchId && !visibleBranchIds.includes(branchId)) {
    return <div className="p-6 text-center text-rose-600">Bạn không có quyền xem cơ sở này.</div>;
  }

  const db = getFirebaseAdminDb();

  // Fetch all 3 kinds song song. Per-kind limit 200 để giữ payload nhỏ.
  async function fetchKind(kind: 'task' | 'report' | 'proposal'): Promise<WorkRow[]> {
    let q: FirebaseFirestore.Query = db.collection(COLLECTIONS.TECH_WORK).where('kind', '==', kind);
    if (branchId) q = q.where('branchId', '==', branchId);
    else if (scope.branchIds) {
      if (scope.branchIds.length === 1) q = q.where('branchId', '==', scope.branchIds[0]);
      else q = q.where('branchId', 'in', scope.branchIds.slice(0, 10));
    }
    q = q.orderBy('createdAt', 'desc').limit(200);
    const snap = await q.get();
    return snap.docs.map((d) => serialize(d.id, d.data()) as WorkRow);
  }

  // Graceful degrade khi composite index Firestore đang build hoặc chưa tồn tại.
  // Page không crash — chỉ show empty + banner.
  let tasks: WorkRow[] = [];
  let reports: WorkRow[] = [];
  let proposals: WorkRow[] = [];
  let indexBuilding = false;
  try {
    [tasks, reports, proposals] = await Promise.all([
      fetchKind('task'), fetchKind('report'), fetchKind('proposal'),
    ]);
  } catch (e: any) {
    const msg = String(e?.message ?? '');
    if (msg.includes('FAILED_PRECONDITION') || msg.includes('requires an index')) {
      indexBuilding = true;
      console.warn('[giao-viec] Firestore index chưa sẵn sàng — trả empty.');
    } else {
      throw e;
    }
  }

  // Tải KTV làm assignee — chỉ khi user có quyền giao việc.
  const userCanCreateTask = canCreateTask(callerProfile);
  let assignees: AssigneeOption[] = [];
  if (userCanCreateTask) {
    // Firestore 'in' limit 10 → chia 2 batch.
    // PP_HT + PP_XLN (Phó phòng) thuộc cấp khối, branchId=null → giao việc xuyên cơ sở.
    const techRoles = ['KT_HT_HM', 'KT_HT_TK', 'KT_HT_CTT', 'KT_HT_24NCT', 'KT_HT_TT',
      'KT_XLN_HM', 'KT_XLN_TK', 'KT_XLN_CTT', 'KT_XLN_24NCT', 'KT_XLN_TT'];
    const techRoles2 = ['PP_HT', 'PP_XLN'];
    const [s1, s2] = await Promise.all([
      db.collection(COLLECTIONS.USERS).where('roleId', 'in', techRoles).where('status', '==', 'active').get(),
      db.collection(COLLECTIONS.USERS).where('roleId', 'in', techRoles2).where('status', '==', 'active').get(),
    ]);
    const raw = [...s1.docs, ...s2.docs].map((d) => {
      const x = d.data();
      const roleId: string = x.roleId ?? '';
      const spec: 'HT' | 'XLN' | null =
        /^KT_HT_/.test(roleId) || roleId === 'PP_HT' ? 'HT' :
        /^KT_XLN_/.test(roleId) || roleId === 'PP_XLN' ? 'XLN' : null;
      return {
        uid: d.id,
        displayName: x.displayName ?? '(không tên)',
        roleId,
        branchId: x.branchId ?? null,
        specialization: spec,
      };
    });
    // QLCS chỉ thấy người ở cơ sở mình + PP cấp khối (branchId=null).
    // ADMIN/CEO/TP_KT (scope.branchIds === null) thấy tất cả.
    assignees = raw.filter((u) => {
      if (scope.branchIds === null) return true;
      if (u.branchId === null) return true;        // PP cấp khối — hiện ở mọi cơ sở
      return scope.branchIds.includes(u.branchId);
    });
  }

  const myRoleSpecialization = getTechSpecialization(profile.roleCode);

  return (
    <GiaoViecClient
      tab={tab}
      branchId={branchId}
      branchName={branchId ? (BRANCH_LABELS[branchId] ?? branchId) : null}
      visibleBranchIds={visibleBranchIds as string[]}
      branchLabels={BRANCH_LABELS}
      tasks={tasks}
      reports={reports}
      proposals={proposals}
      assignees={assignees}
      currentUserId={profile.id}
      myRoleCode={profile.roleCode}
      myRoleSpecialization={myRoleSpecialization}
      myBranchId={profile.branchId ?? null}
      canCreateTask={userCanCreateTask}
      canCreateReport={canCreateReport(callerProfile)}
      canCreateProposal={canCreateProposal(callerProfile)}
      indexBuilding={indexBuilding}
    />
  );
}
