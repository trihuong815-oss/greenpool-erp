import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
async function main() {
  // Tìm sale theo tên
  const names = ['Hoa', 'Linh', 'Thuý', 'Duy', 'Nam'];
  const u = await db.collection('users').where('roleId', '==', 'NV_SALE').get();
  console.log(`Tổng NV_SALE: ${u.size}`);
  console.log('Sale có tên match Hoa/Linh/Thuý/Duy/Nam:');
  const found: Record<string, string[]> = {};
  for (const d of u.docs) {
    const x = d.data();
    const n = (x.displayName ?? '').toLowerCase();
    if (n.includes('hoa') || n.includes('linh') || n.includes('thu') || n.includes('duy') || n.includes('nam')) {
      const branch = x.branchId ?? '?';
      found[branch] = found[branch] ?? [];
      found[branch].push(`${x.displayName} (status=${x.status})`);
    }
  }
  for (const [b, list] of Object.entries(found)) {
    console.log(`\n  Branch ${b}: ${list.length} match`);
    list.forEach(s => console.log(`    ${s}`));
  }
}
main().catch(console.error);
