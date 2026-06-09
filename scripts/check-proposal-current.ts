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

  // Doc QLCS_TT proposal
  const docId = '8vDn0yWFfFgXpMHwyYLO';
  const snap = await db.collection('tasks').doc(docId).get();
  if (!snap.exists) { console.log('Not found'); return; }
  const t = snap.data() as any;
  console.log(`=== Task ${docId} ===`);
  console.log(`Title: ${t.title}`);
  console.log(`Status: ${t.status}`);
  console.log(`currentApprover: ${t.currentApprover}`);
  console.log(`approvalChain: ${JSON.stringify(t.approvalChain)}`);
  console.log(`approvalsCompleted: ${JSON.stringify(t.approvalsCompleted)}`);
  console.log(`crossBlock: ${t.crossBlock}`);
  console.log(`assigneeBlock: ${t.assigneeBlock}`);
  console.log(`createdBy: ${t.createdBy}`);
  console.log(`updatedAt: ${t.updatedAt?.toDate?.()?.toISOString?.()}`);

  // Resolve EACH chain entry user identity
  console.log(`\n=== Chain identities ===`);
  for (let i = 0; i < (t.approvalChain || []).length; i++) {
    const entry: string = t.approvalChain[i];
    if (entry.startsWith('user:')) {
      const uid = entry.slice(5);
      const u = await db.collection('users').doc(uid).get();
      if (u.exists) {
        const ud = u.data() as any;
        console.log(`  [${i}] ${entry}`);
        console.log(`        → ${ud.displayName} | ${ud.email} | roleId=${ud.roleId} | status=${ud.status}`);
      } else {
        console.log(`  [${i}] ${entry} → ❌ USER KHÔNG TỒN TẠI`);
      }
    } else {
      console.log(`  [${i}] ${entry} (role-key)`);
    }
  }

  // Recent comments on the doc
  console.log(`\n=== Comments (last 10) ===`);
  const comments = await db.collection('tasks').doc(docId).collection('comments').orderBy('createdAt', 'desc').limit(10).get();
  comments.forEach((c) => {
    const x = c.data() as any;
    console.log(`  ${x.createdAt?.toDate?.()?.toISOString?.()} | ${x.kind} | ${x.authorName ?? '?'} | ${x.body?.slice(0, 80)}`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
