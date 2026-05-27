// Inspect Firestore — list collections + đọc 1 doc mẫu mỗi collection để xem schema.
// Chạy:  npx --yes tsx scripts/inspect-firestore.ts

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath || !existsSync(resolve(process.cwd(), credPath))) {
  console.error('Thiếu GOOGLE_APPLICATION_CREDENTIALS');
  process.exit(1);
}
const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      privateKey: sa.private_key,
    }),
  });
}

const db = getFirestore();

async function main() {
  const cols = await db.listCollections();
  for (const c of cols) {
    const snap = await c.limit(1).get();
    const count = (await c.count().get()).data().count;
    console.log(`\n=== ${c.id} (${count} docs) ===`);
    if (snap.empty) {
      console.log('  (empty)');
      continue;
    }
    const doc = snap.docs[0];
    console.log(`  id: ${doc.id}`);
    const data = doc.data();
    for (const k of Object.keys(data)) {
      const v = data[k];
      let preview: string;
      if (v === null) preview = 'null';
      else if (typeof v === 'object') {
        if (v.toDate) preview = `Timestamp(${v.toDate().toISOString()})`;
        else preview = JSON.stringify(v).slice(0, 80);
      } else {
        preview = String(v).slice(0, 80);
      }
      console.log(`  ${k}: ${preview}`);
    }
    // Liệt kê subcollections của doc đầu (nếu có)
    const subs = await doc.ref.listCollections();
    if (subs.length) {
      for (const s of subs) {
        const subCount = (await s.count().get()).data().count;
        console.log(`  └ subcollection ${s.id} (${subCount} docs)`);
      }
    }
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('LỖI:', e.message);
  process.exit(1);
});
