import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

async function main() {
  const sa = JSON.parse(readFileSync('/Users/trihuong/Desktop/GreenPool_ERP/secrets/firebase-admin-sa.json', 'utf8'));
  if (getApps().length === 0) initializeApp({ credential: cert(sa) });
  const db = getFirestore();
  const d = await db.collection('tasks').doc('8vDn0yWFfFgXpMHwyYLO').get();
  const x = d.data() as any;
  console.log('assigneeUserIds:', JSON.stringify(x?.assigneeUserIds));
  console.log('assigneeDeptId:', x?.assigneeDeptId);
  console.log('assigneeFacilityId:', x?.assigneeFacilityId);
  console.log('assigneeBlock:', x?.assigneeBlock);
  console.log('recipientUid:', x?.recipientUid);
  console.log('createdBy:', x?.createdBy);
}
main();
