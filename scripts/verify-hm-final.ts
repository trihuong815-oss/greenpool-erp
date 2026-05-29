import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
async function main() {
  console.log('═══ Final verify HM 2026 ═══\n');

  // 1. Per-month: leads/closed + revenue khớp 3 nguồn
  for (const m of [1,2,3,4]) {
    // Lead total
    const se = await db.collection('salesEntries').where('branchId','==','HM').where('year','==',2026).where('month','==',m).get();
    let leads = 0, closed = 0;
    se.docs.forEach(d => { leads += d.data().leads ?? 0; closed += d.data().closed ?? 0; });

    // Package qty + rev
    const pq = await db.collection('packageQuantities').where('branchId','==','HM').where('year','==',2026).where('month','==',m).get();
    let pkgQty = 0, pkgRev = 0;
    pq.docs.forEach(d => { pkgQty += d.data().quantity ?? 0; pkgRev += d.data().revenue ?? 0; });

    // Per-sale __total rev
    const ps = await db.collection('packageSales').where('branchId','==','HM').where('year','==',2026).where('month','==',m).get();
    let saleRev = 0;
    ps.docs.forEach(d => { saleRev += d.data().revenue ?? 0; });

    const matchRev = pkgRev === saleRev ? '✓' : `⚠ lệch ${(pkgRev-saleRev).toLocaleString('vi-VN')}`;
    console.log(`T${m}: ${leads} leads · ${closed} closed · ${pkgQty} gói · pkg=${pkgRev.toLocaleString('vi-VN')}đ sale=${saleRev.toLocaleString('vi-VN')}đ  ${matchRev}`);
  }

  // 2. Year total
  console.log('\n═══ Tổng năm ═══');
  const allSE = await db.collection('salesEntries').where('branchId','==','HM').where('year','==',2026).get();
  let yLeads = 0, yClosed = 0;
  allSE.docs.forEach(d => { yLeads += d.data().leads ?? 0; yClosed += d.data().closed ?? 0; });
  const allPQ = await db.collection('packageQuantities').where('branchId','==','HM').where('year','==',2026).get();
  let yPkgRev = 0, yPkgQty = 0;
  allPQ.docs.forEach(d => { yPkgRev += d.data().revenue ?? 0; yPkgQty += d.data().quantity ?? 0; });
  const allPS = await db.collection('packageSales').where('branchId','==','HM').where('year','==',2026).get();
  let ySaleRev = 0;
  allPS.docs.forEach(d => { ySaleRev += d.data().revenue ?? 0; });

  console.log(`Leads: ${yLeads}  ·  Closed: ${yClosed}  ·  Close rate: ${(yClosed/yLeads*100).toFixed(1)}%`);
  console.log(`Gói: ${yPkgQty}  ·  pkg=${yPkgRev.toLocaleString('vi-VN')}đ  ·  sale=${ySaleRev.toLocaleString('vi-VN')}đ  ${yPkgRev === ySaleRev ? '✓ KHỚP' : '⚠ lệch'}`);
}
main().catch(console.error);
