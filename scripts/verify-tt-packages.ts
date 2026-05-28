import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
async function main() {
  for (const m of [1, 2, 3, 4]) {
    const s = await db.collection('packageQuantities').where('branchId', '==', 'TT').where('year', '==', 2026).where('month', '==', m).get();
    let q = 0, r = 0;
    s.docs.forEach(d => { q += d.data().quantity ?? 0; r += d.data().revenue ?? 0; });
    console.log(`T${m}/2026: ${s.size} docs · ${q} gói · ${r.toLocaleString('vi-VN')}đ`);
  }
}
main().catch(console.error);
