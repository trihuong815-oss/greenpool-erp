// Xoá 2 role duplicate: PP_KT_HT, PP_KT_XLN — đã có PP_HT, PP_XLN làm canonical.
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const APPLY = process.argv.includes('--apply');
const TARGETS = ['PP_KT_HT', 'PP_KT_XLN'];

async function main() {
  for (const code of TARGETS) {
    const ref = db.collection('roles').doc(code);
    const snap = await ref.get();
    if (!snap.exists) { console.log(`  ✓ ${code}: không tồn tại`); continue; }
    const userCount = (await db.collection('users').where('roleId', '==', code).count().get()).data().count;
    if (userCount > 0) {
      console.error(`  ❌ ${code}: có ${userCount} user — chuyển role trước rồi xóa.`);
      continue;
    }
    console.log(`  ${APPLY ? '🗑️' : '👀'} ${code} (0 users)  data=${JSON.stringify(snap.data())}`);
    if (APPLY) {
      await ref.delete();
      console.log(`     ✅ deleted`);
    }
  }
  if (!APPLY) console.log('\n(dry run — use --apply)');
}
main().catch(console.error);
