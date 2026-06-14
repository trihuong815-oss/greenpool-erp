// V6.5 (2026-06-14): Chuyển huongnguyenvu2015tokyo@gmail.com từ ADMIN sang GD_KD chính thức.
// Anh chốt: tách bạch — bỏ "kiêm". Việc ADMIN ops dùng trihuong815.
const admin = require('firebase-admin');
const sa = require('/Users/trihuong/Desktop/GreenPool_ERP/secrets/firebase-admin-sa.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

(async () => {
  // 1. Tìm tất cả ADMIN user
  const adminSnap = await db.collection('users').where('roleId', '==', 'ADMIN').get();
  console.log(`[before] ADMIN users (${adminSnap.size}):`);
  for (const d of adminSnap.docs) {
    const x = d.data();
    console.log(`  - ${d.id} | ${x.email} | ${x.displayName} | status=${x.status} | excludeFromBusinessNoti=${x.excludeFromBusinessNoti}`);
  }

  // 2. Tìm GD_KD hiện có
  const gdkdSnap = await db.collection('users').where('roleId', '==', 'GD_KD').get();
  console.log(`\n[before] GD_KD users (${gdkdSnap.size}):`);
  for (const d of gdkdSnap.docs) {
    const x = d.data();
    console.log(`  - ${d.id} | ${x.email} | ${x.displayName} | status=${x.status}`);
  }

  // 3. Tìm huongnguyenvu2015tokyo
  const targetSnap = await db.collection('users').where('email', '==', 'huongnguyenvu2015tokyo@gmail.com').get();
  if (targetSnap.empty) {
    console.error('\n[FAIL] Không tìm thấy user huongnguyenvu2015tokyo@gmail.com');
    process.exit(1);
  }
  if (targetSnap.size > 1) {
    console.error(`\n[FAIL] Có ${targetSnap.size} user trùng email — cần check tay`);
    process.exit(1);
  }
  const targetDoc = targetSnap.docs[0];
  const targetData = targetDoc.data();
  console.log(`\n[target] ${targetDoc.id} | ${targetData.displayName} | role=${targetData.roleId}`);

  if (targetData.roleId === 'GD_KD') {
    console.log('[skip] Đã là GD_KD rồi.');
    process.exit(0);
  }

  // 4. Update roleId/roleName
  await targetDoc.ref.update({
    roleId: 'GD_KD',
    roleName: 'Giám đốc Khối Kinh doanh',
    block: 'KD',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    migrationNote: 'V6.5 2026-06-14: Tách bạch ADMIN/GD_KD. Chuyển từ ADMIN sang GD_KD chính thức.',
  });
  console.log(`\n[OK] Đã chuyển ${targetDoc.id} sang GD_KD`);

  // 5. Verify
  const afterAdmin = await db.collection('users').where('roleId', '==', 'ADMIN').get();
  const afterGdkd = await db.collection('users').where('roleId', '==', 'GD_KD').get();
  console.log(`\n[after] ADMIN=${afterAdmin.size}, GD_KD=${afterGdkd.size}`);
  for (const d of afterGdkd.docs) {
    console.log(`  GD_KD: ${d.id} | ${d.data().email}`);
  }
  for (const d of afterAdmin.docs) {
    console.log(`  ADMIN: ${d.id} | ${d.data().email}`);
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
