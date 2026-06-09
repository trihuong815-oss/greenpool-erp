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
  const cutoff = Date.now() - 30 * 60_000; // 30 phút gần đây

  const all = await db.collection('users').get();
  let found = 0;
  console.log(`=== Users đã register/update FCM token trong 30 phút gần nhất ===`);
  for (const d of all.docs) {
    const x = d.data() as any;
    const devices: any[] = Array.isArray(x.fcmDevices) ? x.fcmDevices : [];
    const recentDevices = devices.filter((dv) => {
      const ts = typeof dv.createdAt === 'number' ? dv.createdAt
        : (typeof dv.lastSeen === 'number' ? dv.lastSeen : null);
      return ts && ts > cutoff;
    });
    if (recentDevices.length === 0) continue;
    found++;
    console.log(`\n${x.email} | ${x.displayName} | ${x.roleId} | status=${x.status}`);
    devices.forEach((dv, i) => {
      const cMs = typeof dv.createdAt === 'number' ? dv.createdAt : null;
      const lsMs = typeof dv.lastSeen === 'number' ? dv.lastSeen : null;
      const isRecent = (cMs && cMs > cutoff) || (lsMs && lsMs > cutoff);
      console.log(`  ${isRecent ? '🆕' : '   '} [${i}] ${(dv.token||'').slice(0,25)}... label=${dv.label} enabled=${dv.enabled !== false}`);
      console.log(`        createdAt=${cMs ? new Date(cMs).toISOString() : '?'}`);
      console.log(`        lastSeen =${lsMs ? new Date(lsMs).toISOString() : '?'}`);
    });
  }
  if (found === 0) {
    console.log(`(Không có user nào vừa register/update token trong 30 phút qua)`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
