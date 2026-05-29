import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const APPLY = process.argv.includes('--apply');
async function main() {
  // Check nếu đã có
  const exist = await db.collection('packages').where('branchId','==','HM').where('name','==','Thẻ 2 tháng').limit(1).get();
  if (exist.size > 0) { console.log(`Đã có: ${exist.docs[0].id}`); return; }

  const doc = {
    branchId: 'HM',
    groupId: '1i9DeoSdRxND',  // group Thẻ member bơi HM
    name: 'Thẻ 2 tháng',
    defaultPrice: 1_000_000,  // ước tính, có thể chỉnh sau
    active: true,
    sortOrder: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'admin@migration',
    updatedBy: 'admin@migration',
  };
  console.log(APPLY ? '🚀 APPLY' : '👀 DRY');
  console.log('Sẽ tạo package "Thẻ 2 tháng" HM:');
  console.log(JSON.stringify(doc, null, 2));
  if (APPLY) {
    const ref = await db.collection('packages').add(doc);
    console.log(`✅ Created id=${ref.id}`);
  }
}
main().catch(console.error);
