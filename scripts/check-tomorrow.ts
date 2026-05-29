import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
async function main() {
  // Find users with tokens
  const u = await db.collection('users').where('status','==','active').get();
  for (const d of u.docs) {
    const x = d.data();
    const tk = Array.isArray(x.fcmTokens) ? x.fcmTokens.length : 0;
    if (tk === 0) continue;
    console.log(`\n${x.displayName} (${d.id}) — ${tk} tokens`);
    // Check tasks tomorrow
    const t = await db.collection('personalTasks').where('ownerId','==',d.id).where('dueDate','==','2026-05-30').get();
    console.log(`  Tasks 2026-05-30: ${t.size}`);
    for (const td of t.docs) {
      const tx = td.data();
      console.log(`    "${tx.title}" status=${tx.status} time=${tx.scheduledTime ?? '-'}`);
    }
  }
}
main().catch(console.error);
