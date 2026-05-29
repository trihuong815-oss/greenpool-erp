import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
async function main() {
  let yearQty = 0, yearRev = 0;
  for (const m of [1,2,3,4]) {
    const s = await db.collection('packageQuantities').where('branchId','==','TK').where('year','==',2026).where('month','==',m).get();
    let q = 0, r = 0;
    s.docs.forEach(d => { q += d.data().quantity ?? 0; r += d.data().revenue ?? 0; });
    yearQty += q; yearRev += r;
    console.log(`T${m}: ${s.size} packages · ${q} gói · ${r.toLocaleString('vi-VN')}đ`);
  }
  console.log(`\n═══ Tổng năm 2026 (T1-T4): ${yearQty} gói · ${yearRev.toLocaleString('vi-VN')}đ ═══`);

  // Compare per-sale __total
  const ps = await db.collection('packageSales').where('branchId','==','TK').where('year','==',2026).where('packageId','==','__total').get();
  let psYear = 0;
  const psMonth: Record<number, number> = {};
  for (const d of ps.docs) {
    const x = d.data();
    psYear += x.revenue ?? 0;
    psMonth[x.month] = (psMonth[x.month] ?? 0) + (x.revenue ?? 0);
  }
  console.log(`\n--- Per-sale __total cross-check ---`);
  for (const m of [1,2,3,4]) {
    console.log(`  T${m} per-sale: ${(psMonth[m] ?? 0).toLocaleString('vi-VN')}đ`);
  }
  console.log(`  Tổng năm per-sale: ${psYear.toLocaleString('vi-VN')}đ`);
  console.log(`  Lệch year: ${(yearRev - psYear).toLocaleString('vi-VN')}đ`);
}
main().catch(console.error);
