// Test FCM push trực tiếp tới 2 token của huongnguyenvu để xem lỗi gì
const admin = require('firebase-admin');
const sa = require('../secrets/firebase-admin-sa.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const msg = admin.messaging();

(async () => {
  const uid = 'BkPxat7jkRh0guR5Fm4t4eARggg2';
  const snap = await db.collection('users').doc(uid).get();
  const devices = (snap.data()?.fcmDevices || []).filter(d => d.enabled !== false && d.token);
  console.log(`Sending test push to ${devices.length} devices of ${snap.data()?.email}\n`);

  for (const [i, d] of devices.entries()) {
    const ua = (d.userAgent || '').slice(0, 60);
    console.log(`[Device ${i}] ${ua}`);
    console.log(`           token: ${d.token.slice(0,30)}... lastSeen ${((Date.now()-d.lastSeen)/3600_000).toFixed(1)}h trước`);
    try {
      const res = await msg.send({
        token: d.token,
        notification: {
          title: '🧪 Test ổn định noti',
          body: `Test từ debug script — ${new Date().toLocaleString('vi-VN')}`,
        },
        webpush: {
          fcm_options: { link: 'https://greenpool-erp.vercel.app/de-xuat' },
        },
      });
      console.log(`           ✅ OK messageId=${res}\n`);
    } catch (e) {
      console.log(`           ❌ FAIL code=${e.code} | ${e.message}\n`);
    }
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
