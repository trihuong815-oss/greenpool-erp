// Tab 1 — Quản lý hàm lượng hoá chất
// 3 view: Year (default) → Branch (12 tháng) → Day (entries chi tiết)
// Permission: read theo scope. Write chỉ KT_XLN_cơ sở + TP_KT + PP_XLN + admin.

import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import {
  kyThuatReadScope, canWriteChemical, canReadChemicalEntry, isValidCttSubArea,
} from '@/lib/firebase/ky-thuat-scope';
import { HoaChatClient, type ChemAgg } from './HoaChatClient';

interface PageProps {
  searchParams: Promise<{ year?: string; branchId?: string; month?: string }>;
}

// Phase B.1: BRANCH_IDS single source of truth.
import { BRANCH_IDS } from '@/lib/branches';
const ALL_BRANCHES = BRANCH_IDS;
const BRANCH_LABELS: Record<string, string> = {
  HM:  'Green Pool Hoàng Mai',
  TK:  'Green Pool 20 Thuỵ Khuê',
  CTT: 'Green Pool Cung Thể Thao MĐ',
  '24':'Green Pool 24 NCT',
  TT:  'Green Pool Thanh Trì',
};

export default async function HoaChatPage({ searchParams }: PageProps) {
  const { profile } = await requireAuthedProfile();
  const sp = await searchParams;
  const year = sp.year && /^\d{4}$/.test(sp.year) ? Number(sp.year) : new Date().getFullYear();
  const branchId = sp.branchId && (ALL_BRANCHES as readonly string[]).includes(sp.branchId) ? sp.branchId : null;
  const month = sp.month && /^([1-9]|1[0-2])$/.test(sp.month) ? Number(sp.month) : null;

  const callerProfile = {
    uid: profile.id,
    role_code: profile.roleCode,
    facility_id: profile.branchId,
    department_id: profile.departmentId,
    shift_assignment: profile.shiftAssignment,
    is_shared_shift_account: profile.isSharedShiftAccount,
    sub_areas: profile.subAreas,
  };
  const scope = kyThuatReadScope(callerProfile);
  if (scope.branchIds && scope.branchIds.length === 0) {
    return <div className="p-6 text-center text-slate-500">Bạn chưa được gán cơ sở/quyền xem.</div>;
  }
  // Branch visible cho user (zero-fill nếu admin để show đủ 5).
  const visibleBranchIds: readonly string[] = scope.branchIds === null
    ? ALL_BRANCHES
    : (scope.branchIds.length > 0 ? scope.branchIds : []);

  // Validate branchId in scope
  if (branchId && !visibleBranchIds.includes(branchId)) {
    return <div className="p-6 text-center text-rose-600">Bạn không có quyền xem cơ sở này.</div>;
  }

  // Fetch entries cho year (+ optional branch/month filter)
  const db = getFirebaseAdminDb();
  let q: FirebaseFirestore.Query = db.collection(COLLECTIONS.CHEMICAL_ENTRIES).where('year', '==', year);
  if (branchId) q = q.where('branchId', '==', branchId);
  else if (scope.branchIds) {
    if (scope.branchIds.length === 1) q = q.where('branchId', '==', scope.branchIds[0]);
    else q = q.where('branchId', 'in', scope.branchIds.slice(0, 10));
  }
  const snap = await q.get();

  // Aggregate: per branch × type × month
  const agg: Record<string, ChemAgg> = {};
  for (const b of visibleBranchIds) {
    agg[b] = {
      branchId: b,
      branchName: BRANCH_LABELS[b] ?? b,
      clo: { total: 0, byMonth: Array(12).fill(0), entryCount: 0 },
      axit: { total: 0, byMonth: Array(12).fill(0), entryCount: 0 },
    };
  }
  interface DetailEntry {
    id: string; date: string; day: number; type: 'clo' | 'axit'; amount: number;
    subArea: 'indoor' | 'outdoor' | 'kid' | null;
    batch?: string | null; notes?: string | null; addedByName?: string; addedAt?: string;
    addedBy?: string;
  }
  const detailEntries: DetailEntry[] = [];

  for (const d of snap.docs) {
    const x = d.data();
    const bId = x.branchId;
    const m = Number(x.month);
    const amt = Number(x.amount ?? 0);
    const t = x.type as 'clo' | 'axit';
    if (!agg[bId] || (t !== 'clo' && t !== 'axit') || !(m >= 1 && m <= 12)) continue;
    const entrySubArea = isValidCttSubArea(x.subArea) ? x.subArea : null;
    // KT_XLN_CTT chỉ thấy entry trong bể mình
    if (!canReadChemicalEntry(callerProfile, bId, entrySubArea)) continue;
    agg[bId][t].total += amt;
    agg[bId][t].byMonth[m - 1] += amt;
    agg[bId][t].entryCount++;
    // Detail entries (chỉ giữ khi user view 1 branch + 1 month)
    if (branchId && bId === branchId && month && m === month) {
      detailEntries.push({
        id: d.id,
        date: x.date,
        day: x.day,
        type: t,
        amount: amt,
        subArea: entrySubArea,
        batch: x.batch ?? null,
        notes: x.notes ?? null,
        addedBy: x.addedBy ?? '',
        addedByName: x.addedByName ?? '',
        addedAt: x.addedAt && typeof x.addedAt.toDate === 'function' ? x.addedAt.toDate().toISOString() : '',
      });
    }
  }

  detailEntries.sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    if (cmp !== 0) return cmp;
    return (a.addedAt ?? '').localeCompare(b.addedAt ?? '');
  });

  // Permission write — branch nào user được nhập
  const writableBranches = visibleBranchIds.filter((b) => canWriteChemical(callerProfile, b));

  const aggList = visibleBranchIds.map((b) => agg[b]).filter(Boolean);

  return (
    <HoaChatClient
      year={year}
      branchId={branchId}
      month={month}
      branchName={branchId ? BRANCH_LABELS[branchId] : null}
      agg={aggList}
      detailEntries={detailEntries}
      writableBranches={writableBranches as string[]}
      currentUserId={profile.id}
      userSubAreas={profile.subAreas}
    />
  );
}
