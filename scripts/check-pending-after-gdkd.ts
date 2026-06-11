// Debug: check task GDKD vừa duyệt — chain còn pending GDVP đúng chưa,
// inAppNoti của GDVP có nhận không.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function initAdmin() {
  if (getApps().length > 0) return;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './secrets/firebase-admin-sa.json';
  const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
  initializeApp({ credential: cert(sa) });
}

async function main() {
  initAdmin();
  const db = getFirestore();

  // Find GD_KD và GD_VP active
  const gdkdSnap = await db.collection('users').where('status','==','active').where('roleId','==','GD_KD').get();
  const gdvpSnap = await db.collection('users').where('status','==','active').where('roleId','==','GD_VP').get();
  const adminSnap = await db.collection('users').where('status','==','active').where('roleId','==','ADMIN').get();
  const gdkd = gdkdSnap.docs.map((d) => ({ uid: d.id, name: d.data().displayName }));
  const gdvp = gdvpSnap.docs.map((d) => ({ uid: d.id, name: d.data().displayName }));
  const admin = adminSnap.docs.map((d) => ({ uid: d.id, name: d.data().displayName }));
  console.log('GD_KD active:', gdkd);
  console.log('GD_VP active:', gdvp);
  console.log('ADMIN active:', admin);

  // Tìm task pending_approval gần nhất (proposal), order by updatedAt desc
  const tasksSnap = await db.collection('tasks')
    .orderBy('updatedAt', 'desc')
    .limit(20)
    .get();

  console.log(`\nTasks pending_approval (proposal) gần nhất: ${tasksSnap.size}\n`);
  for (const d of tasksSnap.docs) {
    const t = d.data();
    console.log(`──── ${d.id} ─────`);
    console.log(`Title: ${t.title}`);
    console.log(`Creator: ${t.createdByName} (${t.createdBy})`);
    console.log(`Status: ${t.status}`);
    console.log(`approvalChain: ${JSON.stringify(t.approvalChain)}`);
    console.log(`approvalsCompleted: ${JSON.stringify((t.approvalsCompleted ?? []).map((x: any) => ({role: x.role, name: x.name, decision: x.decision})))}`);
    console.log(`currentApprover: ${t.currentApprover}`);
    console.log(`updatedAt: ${t.updatedAt?.toDate?.()?.toISOString?.() ?? t.updatedAt}`);
    console.log('');
  }

  // Check inAppNoti của các GDVP gần nhất
  for (const u of gdvp) {
    const niSnap = await db.collection('inAppNotifications').doc(u.uid).collection('items')
      .orderBy('createdAt', 'desc').limit(5).get();
    console.log(`\nInApp noti gần nhất của GD_VP ${u.name} (${u.uid}):`);
    niSnap.docs.forEach((n) => {
      const x = n.data();
      console.log(`  - [${x.createdAt?.toDate?.()?.toISOString?.() ?? '?'}] ${x.title} | ${x.body?.slice(0,80)} | kind=${x.kind}`);
    });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
