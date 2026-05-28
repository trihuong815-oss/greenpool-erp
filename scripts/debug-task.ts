import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
async function main() {
  // Find user Hướng
  const userSnap = await db.collection('users').get();
  let myUid = '';
  for (const d of userSnap.docs) {
    const x = d.data();
    if (x.email?.includes('trihuong815') || x.displayName?.includes('Hướng')) { myUid = d.id; break; }
  }
  console.log(`My uid: ${myUid}`);

  // All personalTasks of mine
  const t = await db.collection('personalTasks').where('ownerId', '==', myUid).get();
  console.log(`\nTotal my tasks: ${t.size}`);
  const now = new Date();
  console.log(`Now: ${now.toISOString()} (UTC) = ${now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} VN\n`);
  for (const d of t.docs) {
    const x = d.data();
    if (x.deleted) continue;
    console.log(`━ [${d.id}] "${x.title}"`);
    console.log(`  dueDate=${x.dueDate} scheduledTime=${x.scheduledTime} status=${x.status}`);
    console.log(`  reminderAt=${x.reminderAt}  reminderSent=${x.reminderSent ?? false}`);
    if (x.reminderAt) {
      const at = new Date(x.reminderAt);
      const diffMin = Math.round((at.getTime() - now.getTime()) / 60000);
      console.log(`  reminder ${diffMin > 0 ? '+' + diffMin : diffMin}m from now (VN: ${at.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })})`);
    }
    console.log(`  createdAt=${x.createdAt?.toDate?.()?.toISOString() ?? '?'}`);
  }
}
main().catch(console.error);
