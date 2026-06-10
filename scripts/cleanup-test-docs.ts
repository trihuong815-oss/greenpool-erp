import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
const sa = JSON.parse(readFileSync('./secrets/firebase-admin-sa.json','utf8'));
if (getApps().length === 0) initializeApp({ credential: cert(sa) });
async function main() {
  const db = getFirestore();
  const IDS = ['cuEDlDBRxBTv8263P3ER','DZLsr4e8rMztJGQF2x6g','OfbB1NIkFUiaBikRokdN','KtBU5r5NRfFmMUIEBg5x'];
  for (const id of IDS) {
    const ref = db.collection('tasks').doc(id);
    const snap = await ref.get();
    if (!snap.exists) { console.log(`${id} not exists`); continue; }
    const x = snap.data() as any;
    if (!x.title?.startsWith('[Test')) {
      console.log(`${id}: SKIP — title không bắt đầu [Test (${x.title})`);
      continue;
    }
    // Delete comments subcollection
    const comments = await ref.collection('comments').get();
    const batch = db.batch();
    comments.forEach((c) => batch.delete(c.ref));
    batch.delete(ref);
    await batch.commit();
    console.log(`✓ Deleted ${id} (${comments.size} comments)`);
  }
  console.log('Done');
}
main().catch(e=>{console.error(e); process.exit(1)});
