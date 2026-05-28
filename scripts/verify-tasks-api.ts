// Verify /api/tasks query logic — simulate từng mode + scope, đối chiếu với raw data.
// CHỈ ĐỌC. Không sửa dữ liệu.
//
// Chạy: npx --yes tsx scripts/verify-tasks-api.ts
// Optional: npx --yes tsx scripts/verify-tasks-api.ts --uid=<userId>

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath || !existsSync(resolve(process.cwd(), credPath))) {
  console.error('Thiếu GOOGLE_APPLICATION_CREDENTIALS');
  process.exit(1);
}
const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
}
const db = getFirestore();

const COL = 'tasks';
const LIMIT = 200;

function hr(c = '─', n = 78) { console.log(c.repeat(n)); }
function title(t: string) { console.log(); hr('═'); console.log(`  ${t}`); hr('═'); }

const ROLE_BLOCK: Record<string, 'KD' | 'VP' | 'all'> = {
  CEO: 'all', GD_KD: 'KD', GD_VP: 'VP',
  QLCS_HM: 'KD', QLCS_TK: 'KD', QLCS_CTT: 'KD', QLCS_24NCT: 'KD', QLCS_TT: 'KD',
  TP_KT: 'KD', TP_DT: 'KD', TP_MKT: 'KD',
  TP_GS: 'VP', TP_KE: 'VP', TP_NS: 'VP', TIBAN_TT: 'VP',
  TT_DT: 'KD', GV_CB: 'KD', GV_NC: 'KD', NV_SALE: 'KD', NV_CH: 'KD',
};

interface Profile { uid: string; role_code: string; department_id: string | null; facility_id: string | null; }

function canReadTask(p: Profile, t: any): boolean {
  if (p.role_code === 'CEO') return true;
  if (t.createdBy === p.uid) return true;
  if (Array.isArray(t.assigneeUserIds) && t.assigneeUserIds.includes(p.uid)) return true;
  const myBlock = ROLE_BLOCK[p.role_code];
  const isGD = p.role_code === 'GD_KD' || p.role_code === 'GD_VP';
  const isTP = /^TP_/.test(p.role_code) || p.role_code === 'TIBAN_TT';
  const isQLCS = /^QLCS_/.test(p.role_code);
  if (isGD) return t.assigneeBlock === myBlock || t.createdByBlock === myBlock;
  if (t.assigneeBlock !== myBlock) return false;
  if (isTP) return t.assigneeDeptId === p.department_id;
  if (isQLCS) return t.assigneeFacilityId === p.facility_id;
  if (t.assigneeDeptId && t.assigneeDeptId === p.department_id) return true;
  if (t.assigneeFacilityId && t.assigneeFacilityId === p.facility_id) return true;
  return false;
}

async function runQuery(label: string, q: FirebaseFirestore.Query): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  try {
    const snap = await q.get();
    console.log(`  ✓ ${label}: ${snap.size} docs`);
    return snap.docs;
  } catch (e: any) {
    console.log(`  ✗ ${label}: ${e?.code} — ${e?.message?.slice(0, 150)}`);
    if (e?.message?.includes('https://')) {
      const m = e.message.match(/https:\/\/console\.firebase\.google\.com\/[^\s]+/);
      if (m) console.log(`    → Tạo index: ${m[0]}`);
    }
    return [];
  }
}

async function verifyQueries() {
  title('1. KIỂM TRA QUERY COMPOSITE (cần index)');
  const colRef = db.collection(COL);

  await runQuery(
    'pending_approval (CEO): where(status) orderBy(createdAt)',
    colRef.where('status', '==', 'pending_approval').orderBy('createdAt', 'desc').limit(LIMIT)
  );
  await runQuery(
    'pending_approval (GĐ): where(status) where(approvalRequiredFrom) orderBy(createdAt)',
    colRef.where('status', '==', 'pending_approval').where('approvalRequiredFrom', '==', 'GD_KD').orderBy('createdAt', 'desc').limit(LIMIT)
  );
  await runQuery(
    'created: where(createdBy) orderBy(createdAt)',
    colRef.where('createdBy', '==', 'test-uid').orderBy('createdAt', 'desc').limit(LIMIT)
  );
  await runQuery(
    'assigned user: where(assigneeUserIds array-contains) orderBy(createdAt)',
    colRef.where('assigneeUserIds', 'array-contains', 'test-uid').orderBy('createdAt', 'desc').limit(LIMIT)
  );
  await runQuery(
    'assigned dept: where(assigneeDeptId) orderBy(createdAt)',
    colRef.where('assigneeDeptId', '==', 'NS').orderBy('createdAt', 'desc').limit(LIMIT)
  );
  await runQuery(
    'assigned facility: where(assigneeFacilityId) orderBy(createdAt)',
    colRef.where('assigneeFacilityId', '==', 'HM').orderBy('createdAt', 'desc').limit(LIMIT)
  );
  await runQuery(
    'GĐ block: where(assigneeBlock) orderBy(createdAt)',
    colRef.where('assigneeBlock', '==', 'KD').orderBy('createdAt', 'desc').limit(LIMIT)
  );
  await runQuery(
    'GĐ createdByBlock: where(createdByBlock) orderBy(createdAt)',
    colRef.where('createdByBlock', '==', 'KD').orderBy('createdAt', 'desc').limit(LIMIT)
  );
}

async function verifyScope() {
  title('2. KIỂM TRA SCOPE (canReadTask không leak)');

  const allTasks = (await db.collection(COL).orderBy('createdAt', 'desc').limit(LIMIT).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`  Tổng task trong collection: ${allTasks.length}\n`);

  if (allTasks.length === 0) {
    console.log('  (Không có task để verify scope — bỏ qua)');
    return;
  }

  // Lấy 3 user mẫu khác role
  const usersSnap = await db.collection('users').where('status', '==', 'active').limit(20).get();
  const users = usersSnap.docs.map((d) => {
    const x = d.data();
    return { uid: d.id, role_code: x.roleId, department_id: x.departmentId ?? null, facility_id: x.branchId ?? null };
  });

  const sampleRoles = ['CEO', 'GD_KD', 'GD_VP', 'TP_NS', 'QLCS_HM', 'NV_SALE'];
  for (const role of sampleRoles) {
    const u = users.find((x) => x.role_code === role);
    if (!u) { console.log(`  - ${role.padEnd(12)}: (không có user)`); continue; }
    const visible = allTasks.filter((t: any) => canReadTask(u, t));
    const outOfScope = visible.filter((t: any) => {
      // Sanity check: nếu không CEO/GĐ → block phải khớp
      if (u.role_code === 'CEO') return false;
      const myBlock = ROLE_BLOCK[u.role_code];
      const isGD = /^GD_/.test(u.role_code);
      if (isGD) return false;  // GĐ xem block mình + createdByBlock
      return (t as any).assigneeBlock !== myBlock && (t as any).createdBy !== u.uid && !(Array.isArray((t as any).assigneeUserIds) && (t as any).assigneeUserIds.includes(u.uid));
    });
    console.log(`  - ${role.padEnd(12)} uid=${u.uid.slice(0, 8)}…: thấy ${visible.length}/${allTasks.length}${outOfScope.length > 0 ? ` ⚠ ${outOfScope.length} có thể out-of-scope` : ' ✓'}`);
  }
}

async function verifyFieldNaming() {
  title('3. KIỂM TRA FIELD NAMING (đồng bộ schema chuẩn)');
  const snap = await db.collection(COL).limit(20).get();
  if (snap.empty) { console.log('  (Không có task để kiểm)'); return; }

  const expectedFields = [
    'kind', 'title', 'description',
    'createdBy', 'createdByName', 'createdByRole', 'createdByBlock', 'createdAt',
    'assigneeBlock', 'assigneeDeptId', 'assigneeFacilityId', 'assigneeUserIds',
    'crossBlock', 'status', 'approvalRequiredFrom',
    'priority', 'dueDate', 'progressPct',
    'attachments', 'updatedAt', 'updatedBy',
  ];

  let mismatch = 0;
  for (const d of snap.docs) {
    const data: any = d.data();
    const missing = expectedFields.filter((f) => data[f] === undefined);
    const extra = Object.keys(data).filter((f) => !expectedFields.includes(f) && !['approvedBy', 'approvedAt', 'rejectionReason', 'backfilledAt'].includes(f));
    if (missing.length > 0 || extra.length > 0) {
      mismatch++;
      console.log(`  ⚠ ${d.id}: missing=${missing.join(',') || '-'}  extra=${extra.join(',') || '-'}`);
    }
  }
  if (mismatch === 0) console.log(`  ✓ ${snap.size} task đều khớp schema chuẩn`);
}

async function main() {
  console.log('VERIFY /api/tasks — production-grade audit\n');
  await verifyQueries();
  await verifyScope();
  await verifyFieldNaming();
  console.log();
  console.log('Hoàn thành. Nếu thấy ✗ FAILED_PRECONDITION → deploy indexes:');
  console.log('  firebase deploy --only firestore:indexes');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
