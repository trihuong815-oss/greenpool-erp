import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
async function main() {
  for (const month of [1, 2, 3, 4]) {
    const snap = await db.collection('salesEntries')
      .where('branchId', '==', 'TT')
      .where('year', '==', 2026)
      .where('month', '==', month)
      .get();
    let leads = 0, closed = 0;
    const bySource: Record<string, { l: number; c: number }> = {};
    for (const d of snap.docs) {
      const x = d.data();
      leads += x.leads ?? 0;
      closed += x.closed ?? 0;
      const src = x.source ?? '?';
      bySource[src] = bySource[src] ?? { l: 0, c: 0 };
      bySource[src].l += x.leads ?? 0;
      bySource[src].c += x.closed ?? 0;
    }
    console.log(`Tháng ${month}/2026: ${snap.size} docs · L=${leads} C=${closed}`);
    for (const [src, v] of Object.entries(bySource).sort()) {
      console.log(`  ${src.padEnd(10)} L=${v.l.toString().padStart(4)} C=${v.c.toString().padStart(4)}`);
    }
  }
}
main().catch(console.error);
