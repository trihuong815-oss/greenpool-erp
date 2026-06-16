import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import sa from '../secrets/firebase-admin-sa.json';

initializeApp({ credential: cert(sa as any) });
const db = getFirestore();

async function main() {
  const all = await db.collection('users')
    .where('roleId', 'in', ['GD_KD', 'ADMIN', 'CEO'])
    .get();
  console.log('Top role users:', all.size);
  for (const doc of all.docs) {
    const d = doc.data();
    console.log('---');
    console.log('uid:', doc.id);
    console.log('email:', d.email);
    console.log('username:', d.username);
    console.log('roleCode (roleId):', d.roleId);
    console.log('status:', d.status);
    console.log('menuOverrides:', JSON.stringify(d.menuOverrides ?? null));
  }
}
main().catch(console.error).then(() => process.exit(0));
