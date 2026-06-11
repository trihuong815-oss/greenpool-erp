// Check Huệ (GD_VP): FCM tokens + inAppNoti recent + tasks she should see in
// pending_approval badge.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function initAdmin() {
  if (getApps().length > 0) return;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './secrets/firebase-admin-sa.json';
  const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
  initializeApp({ credential: cert(sa) });
}

async function main() {
  initAdmin();
  const db = getFirestore();
  const HUE = 'hurFPpSieUanTtwln7Nij1Ztc2d2';

  const u = await db.collection('users').doc(HUE).get();
  const x = u.data() ?? {};
  console.log('Huệ profile keys:', Object.keys(x).filter((k) => /fcm|push|token/i.test(k)));
  console.log('fcmTokens (legacy array):', x.fcmTokens?.length ?? 0);
  console.log('fcmDevices (new):', (x.fcmDevices ?? []).length);
  if (x.fcmDevices) {
    (x.fcmDevices as any[]).forEach((d, i) => {
      console.log(`  [${i}] platform=${d.platform} ua=${(d.userAgent ?? '').slice(0,50)} lastSeen=${d.lastSeen?.toDate?.()?.toISOString?.() ?? d.lastSeen}`);
    });
  }

  // Tasks đang chờ Huệ duyệt
  const q1 = await db.collection('tasks')
    .where('status', '==', 'pending_approval')
    .where('currentApprover', '==', `user:${HUE}`)
    .get();
  console.log(`\nTasks chờ Huệ duyệt (user:${HUE}): ${q1.size}`);
  q1.docs.forEach((d) => {
    const t = d.data();
    console.log(`  - ${d.id} | ${t.title} | createdBy=${t.createdByName} | updatedAt=${t.updatedAt?.toDate?.()?.toISOString?.()}`);
  });

  const q2 = await db.collection('tasks')
    .where('status', '==', 'pending_approval')
    .where('currentApprover', '==', 'role:GD_VP')
    .get();
  console.log(`\nTasks chờ role:GD_VP duyệt: ${q2.size}`);
  q2.docs.forEach((d) => {
    const t = d.data();
    console.log(`  - ${d.id} | ${t.title}`);
  });

  // Last 10 inAppNoti
  const ni = await db.collection('inAppNotifications').doc(HUE).collection('items')
    .orderBy('createdAt', 'desc').limit(15).get();
  console.log(`\nInApp noti gần nhất (${ni.size}):`);
  ni.docs.forEach((n) => {
    const x = n.data();
    console.log(`  [${x.createdAt?.toDate?.()?.toISOString?.()}] seen=${x.seenAt ? 'Y' : 'N'} ${x.title?.slice(0,55)}`);
  });
}
main().catch((e) => { console.error(e); process.exit(1); });
