import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
(async () => {
  try {
    const cutoff = new Date(Date.now() - 24 * 3600_000);
    const snap = await db.collection('discrepancies')
      .where('resolved', '==', false)
      .where('createdAt', '<', cutoff)
      .get();
    console.log(`✅ Query OK — ${snap.size} stale discrepancies`);
    for (const d of snap.docs) console.log(' ', d.id, d.data());
  } catch (e: any) {
    console.error('❌ Query FAIL:', e.code, e.message);
  }
})().then(() => process.exit(0));
