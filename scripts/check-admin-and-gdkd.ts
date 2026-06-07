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

  console.log('=== Tất cả ADMIN ===');
  const admins = await db.collection('users').where('roleId', '==', 'ADMIN').get();
  for (const d of admins.docs) {
    const x = d.data();
    console.log(`\nUID ${d.id} | ${x.email} | ${x.displayName} | status=${x.status}`);
    const devices: any[] = Array.isArray(x.fcmDevices) ? x.fcmDevices : [];
    const legacy: any[] = Array.isArray(x.fcmTokens) ? x.fcmTokens : [];
    console.log(`  fcmDevices: ${devices.length}`);
    devices.forEach((d, i) => console.log(`    [${i}] token=${(d.token||'').slice(0,30)}... enabled=${d.enabled !== false} label=${d.label} lastSeen=${d.lastSeen}`));
    console.log(`  fcmTokens (legacy): ${legacy.length}`);
    legacy.forEach((t, i) => console.log(`    [${i}] ${(t||'').slice(0,30)}...`));
    console.log(`  fcmTokensUpdatedAt: ${x.fcmTokensUpdatedAt}`);
  }

  console.log('\n=== Tất cả CEO ===');
  const ceos = await db.collection('users').where('roleId', '==', 'CEO').get();
  for (const d of ceos.docs) {
    const x = d.data();
    console.log(`UID ${d.id} | ${x.email} | ${x.displayName} | status=${x.status}`);
    const devices: any[] = Array.isArray(x.fcmDevices) ? x.fcmDevices : [];
    console.log(`  fcmDevices: ${devices.length} entries`);
  }

  console.log('\n=== Tất cả users có "gdkd" trong email/displayName ===');
  const all = await db.collection('users').get();
  all.forEach((d) => {
    const x = d.data();
    const em = (x.email || '').toLowerCase();
    const dn = (x.displayName || '').toLowerCase();
    if (em.includes('gdkd') || dn.includes('gdkd') || em.includes('kd@') || em.includes('.kd.')) {
      console.log(`UID ${d.id} | ${x.email} | ${x.displayName} | roleId=${x.roleId} | status=${x.status}`);
    }
  });

  console.log('\n=== Users đã bật FCM (6 users) ===');
  all.forEach((d) => {
    const x = d.data();
    const devices: any[] = Array.isArray(x.fcmDevices) ? x.fcmDevices : [];
    const legacy: any[] = Array.isArray(x.fcmTokens) ? x.fcmTokens : [];
    if (devices.length > 0 || legacy.length > 0) {
      console.log(`  ${x.email} | ${x.displayName} | role=${x.roleId} | devices=${devices.length} legacy=${legacy.length}`);
    }
  });
}

main().catch(e => { console.error(e); process.exit(1); });
