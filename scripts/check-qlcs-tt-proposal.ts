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

  // QLCS_TT user
  const ttSnap = await db.collection('users').where('roleId', '==', 'QLCS_TT').limit(1).get();
  if (ttSnap.empty) { console.log('No QLCS_TT user'); return; }
  const ttUid = ttSnap.docs[0].id;
  console.log(`QLCS_TT uid: ${ttUid} (${ttSnap.docs[0].data().displayName})`);

  // Recent proposals from QLCS_TT (last 24h)
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const allTaskSnap = await db.collection('tasks').where('createdBy', '==', ttUid).get();
  const propSnap = { docs: allTaskSnap.docs.filter((d) => {
    const c = (d.data() as any).createdAt?.toDate?.()?.getTime?.() ?? 0;
    return c >= cutoff;
  })};
  console.log(`\nProposals from QLCS_TT in 24h: ${propSnap.docs.length}`);
  for (const d of propSnap.docs) {
    const x = d.data() as any;
    console.log(`\n--- ${d.id} ---`);
    console.log(`  kind: ${x.kind}`);
    console.log(`  title: ${x.title}`);
    console.log(`  status: ${x.status}`);
    console.log(`  createdAt: ${x.createdAt?.toDate?.()?.toISOString?.()}`);
    console.log(`  currentApprover: ${x.currentApprover}`);
    console.log(`  approvalChain: ${JSON.stringify(x.approvalChain)}`);
    console.log(`  approvalsCompleted: ${JSON.stringify(x.approvalsCompleted)}`);
    console.log(`  recipientTier: ${x.recipientTier}`);
    console.log(`  recipientUid: ${x.recipientUid}`);
    console.log(`  crossBlock: ${x.crossBlock}`);
    console.log(`  assigneeBlock: ${x.assigneeBlock}`);

    // Resolve currentApprover identity
    if (x.currentApprover?.startsWith('user:')) {
      const uid = x.currentApprover.slice(5);
      const u = await db.collection('users').doc(uid).get();
      if (u.exists) {
        const ud = u.data() as any;
        console.log(`  → currentApprover user: ${ud.displayName} | ${ud.email} | roleId=${ud.roleId} | status=${ud.status}`);
      } else {
        console.log(`  ❌ currentApprover user uid=${uid} KHÔNG TỒN TẠI`);
      }
    }
  }

  // List ALL ADMIN to confirm
  console.log(`\n=== All ADMIN (any status) ===`);
  const adminSnap = await db.collection('users').where('roleId', '==', 'ADMIN').get();
  adminSnap.forEach((d) => {
    const x = d.data() as any;
    console.log(`  ${d.id} | ${x.email} | status=${x.status}`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
