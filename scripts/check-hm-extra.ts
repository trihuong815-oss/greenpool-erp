import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
async function main() {
  // Có doc nào ngoài __total không?
  const s = await db.collection('packageSales').where('branchId','==','HM').where('year','==',2026).get();
  console.log(`Total packageSales HM 2026: ${s.size} docs`);
  for (const d of s.docs) {
    const x = d.data();
    if (x.packageId !== '__total') {
      console.log(`  NON-__total: id=${d.id} pkg=${x.packageId} m=${x.month} rev=${x.revenue?.toLocaleString('vi-VN')} sale=${x.saleName}`);
    }
  }
  // Check group by month
  const byM: Record<number, number> = {};
  for (const d of s.docs) {
    const m = d.data().month ?? 0;
    byM[m] = (byM[m] ?? 0) + (d.data().revenue ?? 0);
  }
  console.log('\nBy month:');
  for (const [m, v] of Object.entries(byM).sort()) {
    console.log(`  T${m}: ${v.toLocaleString('vi-VN')}đ`);
  }
}
main().catch(console.error);
