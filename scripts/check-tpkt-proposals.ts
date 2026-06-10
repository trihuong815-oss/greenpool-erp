import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
const sa = JSON.parse(readFileSync('./secrets/firebase-admin-sa.json','utf8'));
if (getApps().length === 0) initializeApp({ credential: cert(sa) });
async function main() {
  const db = getFirestore();
  const tpkt = await db.collection('users').where('roleId','==','TP_KT').where('status','==','active').limit(1).get();
  if (tpkt.empty) { console.log('no TP_KT'); return; }
  const tpktUid = tpkt.docs[0].id;
  const tpktName = tpkt.docs[0].data().displayName;
  console.log(`TP_KT uid=${tpktUid} (${tpktName})`);

  const all = await db.collection('tasks').where('createdBy','==',tpktUid).get();
  const recent = all.docs.filter((d) => (d.data().createdAt?.toDate?.()?.getTime?.() ?? 0) > Date.now() - 24*60*60_000);
  console.log(`\nProposals/Tasks TP_KT in 24h: ${recent.length}`);
  for (const d of recent) {
    const x = d.data() as any;
    console.log(`\n--- ${d.id} ---`);
    console.log(`  kind=${x.kind} status=${x.status}`);
    console.log(`  title=${x.title}`);
    console.log(`  createdByBlock=${x.createdByBlock}`);
    console.log(`  assigneeBlock=${x.assigneeBlock}`);
    console.log(`  assigneeUserIds=${JSON.stringify(x.assigneeUserIds)}`);
    console.log(`  currentApprover=${x.currentApprover}`);
    console.log(`  approvalChain=${JSON.stringify(x.approvalChain)}`);
    console.log(`  approvalsCompleted=${JSON.stringify(x.approvalsCompleted)}`);
    console.log(`  recipientTier=${x.recipientTier} recipientUid=${x.recipientUid}`);
  }
}
main().catch(e=>{console.error(e); process.exit(1)});
