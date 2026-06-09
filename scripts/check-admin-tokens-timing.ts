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
  const snap = await db.collection('users').where('roleId', '==', 'ADMIN').where('status', '==', 'active').get();
  for (const d of snap.docs) {
    const x = d.data() as any;
    console.log(`UID ${d.id} | ${x.email}`);
    const devices: any[] = Array.isArray(x.fcmDevices) ? x.fcmDevices : [];
    devices.forEach((dv, i) => {
      const lastSeenMs = typeof dv.lastSeen === 'number' ? dv.lastSeen : (dv.lastSeen?.toDate?.()?.getTime?.() ?? null);
      const createdAtMs = typeof dv.createdAt === 'number' ? dv.createdAt : (dv.createdAt?.toDate?.()?.getTime?.() ?? null);
      console.log(`  [${i}] token=${(dv.token||'').slice(0,20)}...`);
      console.log(`      label=${dv.label} enabled=${dv.enabled !== false}`);
      console.log(`      createdAt=${createdAtMs ? new Date(createdAtMs).toISOString() : '?'}`);
      console.log(`      lastSeen =${lastSeenMs ? new Date(lastSeenMs).toISOString() : '?'}`);
    });
  }

  // Check checklist submit times for comparison
  console.log(`\n=== Submit times last 24h (compare timing) ===`);
  const checks = await db.collection('checklistRunsV2').get();
  const recent = checks.docs.filter((d) => {
    const x = d.data() as any;
    if (x.status !== 'submitted') return false;
    const sa = x.submittedAt?.toDate?.()?.getTime?.() ?? 0;
    return sa > Date.now() - 24 * 60 * 60_000;
  });
  recent.sort((a, b) => (b.data().submittedAt?.toDate?.()?.getTime?.() ?? 0) - (a.data().submittedAt?.toDate?.()?.getTime?.() ?? 0));
  recent.slice(0, 10).forEach((d) => {
    const x = d.data() as any;
    console.log(`  ${d.id}: submittedAt=${x.submittedAt?.toDate?.()?.toISOString?.()}`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
