import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
const sa = JSON.parse(readFileSync('./secrets/firebase-admin-sa.json','utf8'));
if (getApps().length === 0) initializeApp({ credential: cert(sa) });
async function main() {
  const db = getFirestore();
  const all = await db.collection('tasks').get();
  const recent = all.docs.filter((d) => (d.data().createdAt?.toDate?.()?.getTime?.() ?? 0) > Date.now() - 24*60*60_000);
  console.log(`Total tasks: ${all.size} | Created last 24h: ${recent.length}`);
  recent.sort((a,b) => (b.data().createdAt?.toDate?.()?.getTime?.() ?? 0) - (a.data().createdAt?.toDate?.()?.getTime?.() ?? 0));
  for (const d of recent) {
    const x = d.data() as any;
    const cb = await db.collection('users').doc(x.createdBy).get();
    const cbName = cb.exists ? (cb.data() as any).displayName : '?';
    const cbRole = cb.exists ? (cb.data() as any).roleId : '?';
    console.log(`\n${d.id}`);
    console.log(`  kind=${x.kind} status=${x.status}`);
    console.log(`  title=${x.title}`);
    console.log(`  createdBy=${cbName} (${cbRole})`);
    console.log(`  currentApprover=${x.currentApprover}`);
    console.log(`  approvalChain=${JSON.stringify(x.approvalChain)}`);
    console.log(`  recipientUid=${x.recipientUid} recipientTier=${x.recipientTier}`);
  }

  // Tất cả pending_approval hiện tại
  console.log(`\n=== ALL pending_approval ===`);
  const pa = all.docs.filter((d) => d.data().status === 'pending_approval');
  console.log(`Count: ${pa.length}`);
  pa.forEach((d) => {
    const x = d.data() as any;
    console.log(`  ${d.id}: ${x.title?.slice(0,60)} | currentApprover=${x.currentApprover} | createdAt=${x.createdAt?.toDate?.()?.toISOString?.()}`);
  });
}
main().catch(e=>{console.error(e); process.exit(1)});
