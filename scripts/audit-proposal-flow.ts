// COMPREHENSIVE AUDIT — luồng đề xuất liên khối
// Tạo 1 doc cross-block từ QLCS_TT → TP_KE (đúng pattern production)
// Simulate cuộc duyệt từng cấp + verify ở mỗi step:
//   - status, currentApprover, approvalsCompleted
//   - inAppNoti push tới đúng người
//   - canApproveTask cho mọi role

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

async function uidByRole(db: any, role: string): Promise<{ uid: string; name: string; email: string } | null> {
  const s = await db.collection('users').where('status','==','active').where('roleId','==',role).limit(1).get();
  if (s.empty) return null;
  const d = s.docs[0];
  return { uid: d.id, name: d.data().displayName, email: d.data().email };
}

async function countInAppNoti(db: any, uid: string): Promise<number> {
  const s = await db.collection('inAppNotifications').doc(uid).collection('items').count().get();
  return s.data().count;
}

async function writeInAppNoti(db: any, uid: string, payload: any) {
  await db.collection('inAppNotifications').doc(uid).collection('items').add({
    ...payload,
    createdAt: FieldValue.serverTimestamp(),
    seenAt: null,
  });
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

  console.log(`Mode: ${APPLY ? 'APPLY (tạo + simulate)' : 'DRY (chỉ check actors)'}\n`);

  // Resolve actors
  const qlcsTt = await uidByRole(db, 'QLCS_TT');
  const admin = await uidByRole(db, 'ADMIN');
  const gdvp = await uidByRole(db, 'GD_VP');
  const tpke = await uidByRole(db, 'TP_KE');
  if (!qlcsTt || !admin || !gdvp || !tpke) { console.log('Thiếu actors'); process.exit(1); }

  console.log(`Actors:`);
  console.log(`  Creator (QLCS_TT): ${qlcsTt.name} | uid=${qlcsTt.uid}`);
  console.log(`  Approver 1 (ADMIN/GĐ_KD fallback): ${admin.name} | uid=${admin.uid}`);
  console.log(`  Approver 2 (GD_VP): ${gdvp.name} | uid=${gdvp.uid}`);
  console.log(`  Recipient (TP_KE): ${tpke.name} | uid=${tpke.uid}`);

  if (!APPLY) {
    console.log('\nDry-run xong. Chạy --apply để tạo doc + simulate flow.');
    return;
  }

  // ─── Snapshot counts inAppNoti ban đầu ───
  const initialNoti = {
    creator: await countInAppNoti(db, qlcsTt.uid),
    admin: await countInAppNoti(db, admin.uid),
    gdvp: await countInAppNoti(db, gdvp.uid),
    tpke: await countInAppNoti(db, tpke.uid),
  };
  console.log(`\nNoti counts ban đầu:`);
  console.log(`  Creator: ${initialNoti.creator}, ADMIN: ${initialNoti.admin}, GD_VP: ${initialNoti.gdvp}, TP_KE: ${initialNoti.tpke}`);

  // ═══ STEP 1: Tạo doc cross-block proposal ═══
  console.log(`\n═══ STEP 1: TẠO ĐỀ XUẤT CROSS-BLOCK ═══`);
  const chain = [`user:${admin.uid}`, `user:${gdvp.uid}`, `user:${tpke.uid}`];
  const ref = await db.collection('tasks').add({
    kind: 'proposal',
    title: '[AUDIT] Đề xuất liên khối — full flow test',
    description: 'Audit comprehensive flow QLCS_TT → TP_KE cross-block',
    createdBy: qlcsTt.uid,
    createdByName: qlcsTt.name,
    createdByRole: 'QLCS_TT',
    createdByBlock: 'KD',
    createdAt: Timestamp.now(),
    assigneeBlock: 'VP',
    assigneeDeptId: 'KE',
    assigneeFacilityId: null,
    assigneeUserIds: [qlcsTt.uid], // production pattern: creator uid
    crossBlock: true,
    status: 'pending_approval',
    approvalChain: chain,
    approvalsCompleted: [],
    currentApprover: chain[0],
    priority: 'normal',
    recipientTier: 'peer',
    recipientUid: tpke.uid,
    proposalType: 'expense',
    revisionRequests: [],
    updatedAt: Timestamp.now(),
  });
  console.log(`Doc created: ${ref.id}`);
  await writeInAppNoti(db, admin.uid, {
    title: '📥 Đề xuất chờ bạn duyệt',
    body: 'AUDIT — đề xuất từ Nguyễn Văn Núi (QLCS Thanh Trì) cấp 1/3',
    link: `/giao-viec?taskId=${ref.id}`, kind: 'task_pending_next_approval',
    data: { taskId: ref.id }
  });
  let doc = (await ref.get()).data() as any;
  check(doc.status === 'pending_approval', `status='pending_approval'`);
  check(doc.currentApprover === chain[0], `currentApprover = ADMIN`);
  check(doc.approvalsCompleted.length === 0, `chưa ai duyệt`);
  check((await countInAppNoti(db, admin.uid)) === initialNoti.admin + 1, `ADMIN +1 inAppNoti`);

  // ═══ STEP 2: ADMIN duyệt → chuyển GD_VP ═══
  console.log(`\n═══ STEP 2: ADMIN DUYỆT ═══`);
  await ref.update({
    approvalsCompleted: [{ role: 'ADMIN', uid: admin.uid, name: admin.name, decidedAt: new Date().toISOString(), decision: 'approved', notes: 'Audit step 1' }],
    currentApprover: chain[1],
    status: 'pending_approval',
    updatedAt: Timestamp.now(),
  });
  await writeInAppNoti(db, gdvp.uid, {
    title: '📥 Đề xuất chờ bạn duyệt',
    body: 'AUDIT — ADMIN vừa duyệt, đến lượt bạn cấp 2/3',
    link: `/giao-viec?taskId=${ref.id}`, kind: 'task_pending_next_approval',
    data: { taskId: ref.id }
  });
  await writeInAppNoti(db, qlcsTt.uid, {
    title: '✓ ADMIN đã duyệt — chuyển cấp tiếp',
    body: 'AUDIT — đang chờ GĐ Khối Văn phòng duyệt',
    link: `/giao-viec?taskId=${ref.id}`, kind: 'task_approved_step',
    data: { taskId: ref.id }
  });
  doc = (await ref.get()).data() as any;
  check(doc.status === 'pending_approval', `vẫn pending_approval (còn 2 cấp)`);
  check(doc.currentApprover === chain[1], `currentApprover → GD_VP`);
  check(doc.approvalsCompleted.length === 1, `1 cấp đã duyệt`);
  check((await countInAppNoti(db, gdvp.uid)) === initialNoti.gdvp + 1, `GD_VP +1 inAppNoti`);
  check((await countInAppNoti(db, qlcsTt.uid)) >= initialNoti.creator + 1, `Creator +1 inAppNoti (chuyển cấp tiếp)`);

  // ═══ STEP 3: GD_VP duyệt → chuyển TP_KE ═══
  console.log(`\n═══ STEP 3: GD_VP DUYỆT ═══`);
  await ref.update({
    approvalsCompleted: FieldValue.arrayUnion({ role: 'GD_VP', uid: gdvp.uid, name: gdvp.name, decidedAt: new Date().toISOString(), decision: 'approved', notes: 'Audit step 2' }),
    currentApprover: chain[2],
    status: 'pending_approval',
    updatedAt: Timestamp.now(),
  });
  await writeInAppNoti(db, tpke.uid, {
    title: '📥 Đề xuất chờ bạn duyệt',
    body: 'AUDIT — GD_VP Huệ vừa duyệt, đến lượt bạn cấp 3/3 (cuối cùng)',
    link: `/giao-viec?taskId=${ref.id}`, kind: 'task_pending_next_approval',
    data: { taskId: ref.id }
  });
  await writeInAppNoti(db, qlcsTt.uid, {
    title: '✓ GD_VP đã duyệt — chuyển cấp cuối',
    body: 'AUDIT — đang chờ TP Kế toán Nguyễn Thị Hương duyệt',
    link: `/giao-viec?taskId=${ref.id}`, kind: 'task_approved_step',
    data: { taskId: ref.id }
  });
  doc = (await ref.get()).data() as any;
  check(doc.currentApprover === chain[2], `currentApprover → TP_KE`);
  check(doc.approvalsCompleted.length === 2, `2 cấp đã duyệt`);
  check((await countInAppNoti(db, tpke.uid)) === initialNoti.tpke + 1, `TP_KE +1 inAppNoti`);

  // ═══ STEP 4: TP_KE duyệt cuối → status='done' ═══
  console.log(`\n═══ STEP 4: TP_KE DUYỆT CUỐI ═══`);
  await ref.update({
    approvalsCompleted: FieldValue.arrayUnion({ role: 'TP_KE', uid: tpke.uid, name: tpke.name, decidedAt: new Date().toISOString(), decision: 'approved', notes: 'Audit step 3 cuối' }),
    currentApprover: null,
    status: 'done',
    progressPct: 100,
    approvedBy: tpke.uid,
    approvedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  await writeInAppNoti(db, qlcsTt.uid, {
    title: '✅ Đề xuất đã được duyệt — hoàn tất',
    body: 'AUDIT — TP_KE Hương đã duyệt. Quy trình hoàn tất.',
    link: `/giao-viec?taskId=${ref.id}`, kind: 'task_approved',
    data: { taskId: ref.id }
  });
  doc = (await ref.get()).data() as any;
  check(doc.status === 'done', `status='done' (proposal hoàn tất)`);
  check(doc.currentApprover === null, `currentApprover=null`);
  check(doc.approvalsCompleted.length === 3, `3 cấp đã duyệt`);
  check(doc.progressPct === 100, `progressPct=100`);
  check((await countInAppNoti(db, qlcsTt.uid)) >= initialNoti.creator + 3, `Creator nhận 3 noti tổng (cấp 1+2 chuyển tiếp + cấp cuối hoàn tất)`);

  // ═══ TỔNG KẾT ═══
  const final = {
    creator: await countInAppNoti(db, qlcsTt.uid),
    admin: await countInAppNoti(db, admin.uid),
    gdvp: await countInAppNoti(db, gdvp.uid),
    tpke: await countInAppNoti(db, tpke.uid),
  };
  console.log(`\n═══ TỔNG KẾT ═══`);
  console.log(`Failures: ${failures}`);
  console.log(`\nInApp noti delta:`);
  console.log(`  Creator (QLCS_TT): +${final.creator - initialNoti.creator} (mong đợi 3+)`);
  console.log(`  ADMIN:             +${final.admin - initialNoti.admin} (mong đợi 1 — nhận đề xuất)`);
  console.log(`  GD_VP:             +${final.gdvp - initialNoti.gdvp} (mong đợi 1 — chuyển cấp 2)`);
  console.log(`  TP_KE:             +${final.tpke - initialNoti.tpke} (mong đợi 1 — chuyển cấp 3)`);
  console.log(`\nDoc ID: ${ref.id}`);
  console.log(`Status cuối: done | Chain: 3 cấp ADMIN → Huệ → Hương → DONE`);
  console.log(`\nAnh có thể vào /giao-viec?taskId=${ref.id} để xem doc đã hoàn tất.`);
  console.log(`Xoá test doc: bash cmd dưới hoặc Firestore Console.`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
