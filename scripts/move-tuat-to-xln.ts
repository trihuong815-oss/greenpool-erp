import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const APPLY = process.argv.includes('--apply');
async function main() {
  const uid = 'Zbhh4Cx4DZMQAnwBl7fIoQGtCTl2';
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) { console.error('Not found'); process.exit(1); }
  const cur = snap.data()!;
  console.log(`Before: name="${cur.displayName}" roleId=${cur.roleId} branchId=${cur.branchId}`);
  if (cur.roleId !== 'KT_HT_TT') {
    console.log('⚠ roleId không phải KT_HT_TT — abort');
    return;
  }
  console.log(`After:  roleId=KT_XLN_TT (branchId=TT giữ nguyên)`);
  if (APPLY) {
    await ref.update({ roleId: 'KT_XLN_TT' });
    console.log('✅ Updated');
  } else {
    console.log('(dry — use --apply)');
  }
}
main().catch(console.error);
