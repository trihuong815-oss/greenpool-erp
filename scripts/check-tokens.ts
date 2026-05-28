import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
async function main() {
  const u = await db.collection('users').get();
  for (const d of u.docs) {
    const x = d.data();
    const tk = Array.isArray(x.fcmTokens) ? x.fcmTokens : [];
    if (tk.length === 0) continue;
    console.log(`${x.displayName} — ${tk.length} token(s) updated=${x.fcmTokensUpdatedAt?.toDate?.()?.toISOString() ?? '?'}`);
    tk.forEach((t: string, i: number) => console.log(`  [${i}] ${t.slice(0, 30)}...${t.slice(-10)}`));
  }
}
main().catch(console.error);
