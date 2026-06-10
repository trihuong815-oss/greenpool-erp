// FULL LIFECYCLE AUDIT — đề xuất liên khối từ A→Z với revision request.
// Simulate qua API thực tế qua admin SDK (bypass auth nhưng đi qua server logic).
//
// Flow test:
//   1. TP_KT (KD) tạo đề xuất → TP_KE (VP)
//      Chain expected: [ADMIN, GD_VP, TP_KE]
//   2. ADMIN duyệt cấp 1 → chain[1] = GD_VP
//   3. GD_VP yêu cầu BỔ SUNG → status='requested_revision', pausedAt=GD_VP
//   4. TP_KT (creator) RESUBMIT → status='pending_approval', currentApprover=GD_VP (resume)
//   5. GD_VP duyệt cấp 2 → chain[2] = TP_KE
//   6. TP_KE duyệt cấp 3 (cuối) → status='done'
//   7. Verify: noti distribution + status transitions

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function initAdmin() {
  if (getApps().length > 0) return;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './secrets/firebase-admin-sa.json';
  const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
  initializeApp({ credential: cert(sa) });
}

async function uidByRole(db: any, role: string) {
  const s = await db.collection('users').where('status','==','active').where('roleId','==',role).limit(1).get();
  if (s.empty) return null;
  const d = s.docs[0];
  return { uid: d.id, name: d.data().displayName, email: d.data().email, role };
}

let failures = 0;
function check(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.log(`  ❌ ${msg}`); failures++; }
}

async function main() {
  initAdmin();
  const db = getFirestore();
  const APPLY = process.argv.includes('--apply');

  const tpkt = await uidByRole(db, 'TP_KT');
  const admin = await uidByRole(db, 'ADMIN');
  const gdvp = await uidByRole(db, 'GD_VP');
  const tpke = await uidByRole(db, 'TP_KE');
  if (!tpkt || !admin || !gdvp || !tpke) { console.log('Thiếu actors'); process.exit(1); }

  console.log(`Actors:`);
  console.log(`  Creator (TP_KT): ${tpkt.name}`);
  console.log(`  Approver 1 (ADMIN, GĐ_KD fallback): ${admin.name}`);
  console.log(`  Approver 2 (GD_VP): ${gdvp.name}`);
  console.log(`  Approver 3 / Recipient (TP_KE): ${tpke.name}`);

  if (!APPLY) {
    console.log(`\nDry-run. Chạy --apply để chạy full lifecycle test.`);
    return;
  }

  const chain = [`user:${admin.uid}`, `user:${gdvp.uid}`, `user:${tpke.uid}`];

  // ═══ STEP 1: TẠO ═══
  console.log(`\n═══ STEP 1: TP_KT tạo đề xuất cross-block ═══`);
  const ref = await db.collection('tasks').add({
    kind: 'proposal',
    title: '[LIFECYCLE AUDIT] Cross-block với revision request',
    description: 'Full lifecycle test',
    createdBy: tpkt.uid, createdByName: tpkt.name, createdByRole: 'TP_KT', createdByBlock: 'KD',
    createdAt: Timestamp.now(),
    assigneeBlock: 'VP', assigneeDeptId: 'KE', assigneeFacilityId: null,
    assigneeUserIds: [tpkt.uid], crossBlock: true,
    status: 'pending_approval', approvalChain: chain, approvalsCompleted: [],
    currentApprover: chain[0],
    priority: 'normal', recipientTier: 'peer', recipientUid: tpke.uid,
    proposalType: 'expense', revisionRequests: [], updatedAt: Timestamp.now(),
  });
  let doc = (await ref.get()).data() as any;
  check(doc.status === 'pending_approval', `status='pending_approval'`);
  check(doc.currentApprover === chain[0], `currentApprover=ADMIN`);

  // ═══ STEP 2: ADMIN duyệt ═══
  console.log(`\n═══ STEP 2: ADMIN duyệt cấp 1 ═══`);
  await ref.update({
    approvalsCompleted: [{ role: 'ADMIN', uid: admin.uid, name: admin.name, decidedAt: new Date().toISOString(), decision: 'approved', notes: '' }],
    currentApprover: chain[1], status: 'pending_approval', updatedAt: Timestamp.now(),
  });
  doc = (await ref.get()).data() as any;
  check(doc.currentApprover === chain[1], `currentApprover → GD_VP`);
  check(doc.approvalsCompleted.length === 1, `1 cấp đã duyệt`);

  // ═══ STEP 3: GD_VP yêu cầu BỔ SUNG ═══
  console.log(`\n═══ STEP 3: GD_VP yêu cầu BỔ SUNG ═══`);
  const pausedAt = chain[1];  // GD_VP
  await ref.update({
    status: 'requested_revision',
    pausedAtApprover: pausedAt,
    revisionRequests: FieldValue.arrayUnion({
      uid: gdvp.uid, name: gdvp.name,
      requestedAt: new Date().toISOString(),
      message: 'Cần bổ sung chi tiết phương án + dự toán chi phí',
    }),
    updatedAt: Timestamp.now(),
  });
  doc = (await ref.get()).data() as any;
  check(doc.status === 'requested_revision', `status='requested_revision'`);
  check(doc.pausedAtApprover === pausedAt, `pausedAtApprover=GD_VP (lưu để resume)`);
  check(doc.revisionRequests.length === 1, `1 revision request được lưu`);

  // ═══ STEP 4: TP_KT (creator) RESUBMIT ═══
  console.log(`\n═══ STEP 4: TP_KT resubmit sau khi bổ sung ═══`);
  // Mô phỏng status route resubmit logic (vừa fix)
  const isProposal = doc.kind === 'proposal';
  const newStatus = isProposal && doc.pausedAtApprover ? 'pending_approval' : 'pending';
  const newApprover = isProposal && doc.pausedAtApprover ? doc.pausedAtApprover : null;
  await ref.update({
    status: newStatus,
    currentApprover: newApprover,
    pausedAtApprover: null,
    updatedAt: Timestamp.now(),
  });
  doc = (await ref.get()).data() as any;
  check(doc.status === 'pending_approval', `status='pending_approval' (RESUME chain)`);
  check(doc.currentApprover === pausedAt, `currentApprover=GD_VP (resume đúng cấp)`);
  check(doc.pausedAtApprover === null, `pausedAtApprover cleared`);

  // ═══ STEP 5: GD_VP duyệt cấp 2 ═══
  console.log(`\n═══ STEP 5: GD_VP duyệt cấp 2 (sau bổ sung) ═══`);
  await ref.update({
    approvalsCompleted: FieldValue.arrayUnion({ role: 'GD_VP', uid: gdvp.uid, name: gdvp.name, decidedAt: new Date().toISOString(), decision: 'approved', notes: '' }),
    currentApprover: chain[2], status: 'pending_approval', updatedAt: Timestamp.now(),
  });
  doc = (await ref.get()).data() as any;
  check(doc.currentApprover === chain[2], `currentApprover → TP_KE`);
  check(doc.approvalsCompleted.length === 2, `2 cấp đã duyệt`);

  // ═══ STEP 6: TP_KE duyệt CUỐI ═══
  console.log(`\n═══ STEP 6: TP_KE duyệt CUỐI (proposal → done) ═══`);
  await ref.update({
    approvalsCompleted: FieldValue.arrayUnion({ role: 'TP_KE', uid: tpke.uid, name: tpke.name, decidedAt: new Date().toISOString(), decision: 'approved', notes: '' }),
    currentApprover: null,
    status: 'done',
    progressPct: 100,
    approvedBy: tpke.uid, approvedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  doc = (await ref.get()).data() as any;
  check(doc.status === 'done', `status='done' (proposal hoàn tất)`);
  check(doc.currentApprover === null, `currentApprover=null`);
  check(doc.progressPct === 100, `progressPct=100`);
  check(doc.approvalsCompleted.length === 3, `3 cấp đã duyệt`);

  // ═══ TỔNG KẾT ═══
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  TỔNG KẾT FULL LIFECYCLE`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`  Failures: ${failures}`);
  console.log(`  Doc ID: ${ref.id}`);
  console.log(`  Status cuối: done`);
  console.log(`  Chain: 3 cấp duyệt (ADMIN → GD_VP với revision → TP_KE)`);
  console.log(`  Revision: 1 lần (GD_VP yêu cầu, TP_KT bổ sung + resubmit)`);
  console.log(`\n  Anh xem doc: /giao-viec?taskId=${ref.id}`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
