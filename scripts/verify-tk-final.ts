import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
async function main() {
  let yearPkg = 0, yearSale = 0;
  console.log('═══ TK 2026 — sau khi fix ═══');
  for (const m of [1,2,3,4]) {
    const pq = await db.collection('packageQuantities').where('branchId','==','TK').where('year','==',2026).where('month','==',m).get();
    let pkgSum = 0; pq.docs.forEach(d => { pkgSum += d.data().revenue ?? 0; });

    const ps = await db.collection('packageSales').where('branchId','==','TK').where('year','==',2026).where('month','==',m).get();
    let saleSum = 0;
    const saleDetail: string[] = [];
    ps.docs.forEach(d => {
      const x = d.data();
      const r = x.revenue ?? 0;
      saleSum += r;
      saleDetail.push(`${x.saleName?.split(' ').slice(-1)[0]}=${r.toLocaleString('vi-VN')}`);
    });

    const diff = saleSum - pkgSum;
    const flag = diff === 0 ? '✓ KHỚP' : `⚠ lệch ${diff.toLocaleString('vi-VN')}`;
    console.log(`T${m}: pkg=${pkgSum.toLocaleString('vi-VN').padStart(15)} sale=${saleSum.toLocaleString('vi-VN').padStart(15)} ${flag}`);
    console.log(`     ${saleDetail.join(' · ')}`);
    yearPkg += pkgSum;
    yearSale += saleSum;
  }
  const yearDiff = yearSale - yearPkg;
  console.log(`\nNĂM: pkg=${yearPkg.toLocaleString('vi-VN')} sale=${yearSale.toLocaleString('vi-VN')} ${yearDiff === 0 ? '✓ KHỚP' : '⚠ lệch ' + yearDiff.toLocaleString('vi-VN')}`);
}
main().catch(console.error);
