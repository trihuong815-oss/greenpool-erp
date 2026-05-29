import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
async function main() {
  // 1. Find Hướng (admin) — check role + tokens
  const u = await db.collection('users').get();
  console.log('═══ User Hướng ═══');
  for (const d of u.docs) {
    const x = d.data();
    if (x.displayName?.includes('Hướng') || x.email?.includes('trihuong815')) {
      console.log(`  uid=${d.id}`);
      console.log(`  displayName="${x.displayName}"`);
      console.log(`  roleId="${x.roleId}"  status=${x.status}`);
      console.log(`  fcmTokens: ${x.fcmTokens?.length ?? 0} token(s)`);
    }
  }

  // 2. Find QLCS_CTT user
  console.log('\n═══ User QLCS_CTT ═══');
  for (const d of u.docs) {
    const x = d.data();
    if (x.roleId === 'QLCS_CTT') {
      console.log(`  uid=${d.id}`);
      console.log(`  displayName="${x.displayName}"  status=${x.status}`);
    }
  }

  // 3. Check recent checklist v2 notifications (1 ngày gần đây)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const ns = await db.collection('checklistNotificationsV2')
    .where('submittedAt', '>=', since)
    .orderBy('submittedAt', 'desc')
    .limit(10).get();
  console.log(`\n═══ Checklist v2 notifications 24h gần đây: ${ns.size} ═══`);
  for (const d of ns.docs) {
    const x = d.data();
    const t = x.submittedAt?.toDate?.()?.toISOString() ?? '?';
    console.log(`  ${t}  role=${x.role}  branch=${x.branchId ?? '-'}  shift=${x.shift}  owner="${x.ownerName}"`);
  }

  // 4. Check active ADMIN/CEO/GD_KD/GD_VP users + tokens
  console.log('\n═══ Supervisors có fcmTokens ═══');
  const sup = await db.collection('users')
    .where('status', '==', 'active')
    .where('roleId', 'in', ['ADMIN', 'CEO', 'GD_KD', 'GD_VP'])
    .get();
  for (const d of sup.docs) {
    const x = d.data();
    const tk = Array.isArray(x.fcmTokens) ? x.fcmTokens.length : 0;
    console.log(`  ${x.roleId.padEnd(6)} ${(x.displayName ?? '').padEnd(30)} tokens=${tk}`);
  }
}
main().catch(console.error);
