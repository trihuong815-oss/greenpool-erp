// V6.5 debug: tại sao GD_KD không nhận noti khi TP_KT gửi đề xuất
const admin = require('firebase-admin');
const sa = require('../secrets/firebase-admin-sa.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

(async () => {
  const uid = 'BkPxat7jkRh0guR5Fm4t4eARggg2';
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) { console.log('USER KHÔNG TỒN TẠI'); process.exit(1); }
  const d = snap.data();
  console.log('=== USER huongnguyenvu (GD_KD) ===');
  console.log('  uid             :', uid);
  console.log('  email           :', d.email);
  console.log('  displayName     :', d.displayName);
  console.log('  roleId          :', d.roleId);
  console.log('  status          :', d.status);
  console.log('  disabled        :', d.disabled);
  console.log('  excludeFromBusinessNoti:', d.excludeFromBusinessNoti);
  const devices = Array.isArray(d.fcmDevices) ? d.fcmDevices : [];
  console.log(`\n=== fcmDevices (${devices.length}) ===`);
  const now = Date.now();
  for (const [i, dev] of devices.entries()) {
    const age = dev.lastSeen ? (now - dev.lastSeen) / (3600_000) : null;
    console.log(`  [${i}]`);
    console.log(`     enabled     : ${dev.enabled}`);
    console.log(`     token       : ${(dev.token || '').slice(0, 30)}... (len=${(dev.token||'').length})`);
    console.log(`     platform    : ${dev.platform}`);
    console.log(`     userAgent   : ${(dev.userAgent || '').slice(0, 80)}`);
    console.log(`     lastSeen    : ${dev.lastSeen ? new Date(dev.lastSeen).toLocaleString('vi-VN') : '(none)'} (${age ? age.toFixed(1)+'h trước' : 'N/A'})`);
    console.log(`     createdAt   : ${dev.createdAt ? new Date(dev.createdAt).toLocaleString('vi-VN') : '(none)'}`);
  }

  // Recent proposals gửi cho user này
  console.log(`\n=== Recent proposals (currentApprover=user:${uid}) ===`);
  const q = await db.collection('tasks')
    .where('currentApprover', '==', `user:${uid}`)
    .orderBy('createdAt', 'desc').limit(5).get();
  for (const t of q.docs) {
    const td = t.data();
    console.log(`  - ${t.id} | ${td.kind} | ${td.title} | status=${td.status} | createdBy=${td.createdByName} (${td.createdByRole})`);
    console.log(`     createdAt=${td.createdAt} | chain=${JSON.stringify(td.approvalChain)} | currentApprover=${td.currentApprover}`);
  }

  // Audit log: push attempts
  console.log(`\n=== Audit logs (recent fcm/noti for this user) ===`);
  try {
    const al = await db.collection('auditLogs')
      .where('targetUid', '==', uid)
      .orderBy('createdAt', 'desc').limit(10).get();
    if (al.empty) console.log('  (none)');
    for (const a of al.docs) {
      const x = a.data();
      console.log(`  - ${x.createdAt} | ${x.action} | ${x.details || ''}`);
    }
  } catch (e) {
    console.log('  (audit query skip:', e.message, ')');
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
