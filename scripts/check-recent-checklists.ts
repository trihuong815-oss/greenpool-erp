import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
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
  // 24h gần đây
  const cutoff = Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60_000));
  const snap = await db.collection('checklistRunsV2')
    .where('updatedAt', '>=', cutoff)
    .get();
  console.log(`Checklist v2 runs updated in last 24h: ${snap.size}`);
  snap.docs.forEach((d) => {
    const x = d.data() as any;
    const updatedAt = x.updatedAt?.toDate?.()?.toISOString?.() ?? x.updatedAt;
    const submittedAt = x.submittedAt?.toDate?.()?.toISOString?.() ?? x.submittedAt;
    console.log(`  ${d.id}: status=${x.status} owner=${x.ownerName} updatedAt=${updatedAt} submittedAt=${submittedAt}`);
  });

  // Also check audit log
  console.log(`\n=== Audit log submit_checklist_v2 last 24h ===`);
  try {
    const auditSnap = await db.collection('auditLogs')
      .where('action', '==', 'submit_checklist_v2')
      .where('createdAt', '>=', cutoff)
      .get();
    console.log(`Found ${auditSnap.size} events`);
    auditSnap.docs.forEach((d) => {
      const x = d.data() as any;
      console.log(`  ${x.createdAt?.toDate?.()?.toISOString?.()} | ${x.actor_name} | ${JSON.stringify(x.after)}`);
    });
  } catch (e: any) {
    console.log('  (query needs index — ' + e?.message?.slice(0, 100) + ')');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
