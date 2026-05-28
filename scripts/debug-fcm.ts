import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
async function main() {
  // 1. Check users có fcmTokens
  console.log('═══ Users có fcmTokens ═══');
  const u = await db.collection('users').get();
  let withTokens = 0;
  for (const d of u.docs) {
    const x = d.data();
    const tk = Array.isArray(x.fcmTokens) ? x.fcmTokens : [];
    if (tk.length > 0) {
      withTokens++;
      console.log(`  ${x.displayName ?? d.id}  ${tk.length} token(s)  updated=${x.fcmTokensUpdatedAt?.toDate?.()?.toISOString() ?? '?'}`);
    }
  }
  console.log(`Total: ${withTokens}/${u.size} users đã register token\n`);

  // 2. Check tasks có reminderAt
  console.log('═══ PersonalTasks có reminderAt (top 10) ═══');
  const t = await db.collection('personalTasks').get();
  const withReminder = t.docs.filter(d => d.data().reminderAt).slice(0, 10);
  for (const d of withReminder) {
    const x = d.data();
    const at = x.reminderAt;
    const now = new Date().toISOString();
    const fired = String(at) <= now ? '✓ PAST' : '⏳ FUTURE';
    console.log(`  ${(x.title ?? '').padEnd(30)} due=${x.dueDate} time=${x.scheduledTime ?? '-'} reminderAt=${at} ${fired} sent=${x.reminderSent ?? false}`);
  }
  console.log(`Total tasks: ${t.size}, có reminderAt: ${t.docs.filter(d => d.data().reminderAt).length}\n`);
}
main().catch(console.error);
