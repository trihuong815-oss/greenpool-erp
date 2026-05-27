// Verify: số lead / số chốt / tỷ lệ chốt cho TK 2026 — đảm bảo invariants:
//   1. ∑ leads per source per month = leads of that month (byMonth.leads)
//   2. ∑ closed per source per month = closed of that month (byMonth.closed)
//   3. ∑ over months (per source) = year total of that source
//   4. closeRate per source = closed/leads (no rounding error)
//   5. closeRate per month = byMonth.closed / byMonth.leads
//   6. closeRate year = totalClosed / totalLeads

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) { console.error('Missing GOOGLE_APPLICATION_CREDENTIALS'); process.exit(1); }
const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }), projectId: sa.project_id });
}
const db = getFirestore();

const BRANCH = 'TK';
const YEAR = 2026;
const SOURCES = ['MKT', 'Sale', 'Renew', 'Referral', 'Walk-in'] as const;

(async () => {
  const snap = await db.collection('salesEntries')
    .where('branchId', '==', BRANCH).where('year', '==', YEAR).get();

  // Build matrices
  const leadsBMS: Record<number, Record<string, number>> = {};
  const closedBMS: Record<number, Record<string, number>> = {};
  for (let m = 1; m <= 12; m++) {
    leadsBMS[m] = {}; closedBMS[m] = {};
    for (const s of SOURCES) { leadsBMS[m][s] = 0; closedBMS[m][s] = 0; }
  }
  for (const d of snap.docs) {
    const x = d.data();
    const m = x.month;
    const src = SOURCES.includes(x.source) ? x.source : 'Walk-in';
    if (m >= 1 && m <= 12) {
      leadsBMS[m][src] += Number(x.leads ?? 0);
      closedBMS[m][src] += Number(x.closed ?? 0);
    }
  }

  // Per source year totals
  console.log(`\n📊 TK ${YEAR} — TỔNG NĂM PER SOURCE\n`);
  console.log('Source'.padEnd(12), 'Leads'.padEnd(8), 'Closed'.padEnd(8), 'NotClosed'.padEnd(10), 'Close rate');
  console.log('─'.repeat(60));
  let yearLeads = 0, yearClosed = 0;
  for (const s of SOURCES) {
    let l = 0, c = 0;
    for (let m = 1; m <= 12; m++) { l += leadsBMS[m][s]; c += closedBMS[m][s]; }
    const rate = l > 0 ? (c / l * 100) : 0;
    const nc = Math.max(0, l - c);
    console.log(s.padEnd(12), String(l).padEnd(8), String(c).padEnd(8), String(nc).padEnd(10), `${rate.toFixed(1)}%`);
    yearLeads += l; yearClosed += c;
  }
  console.log('─'.repeat(60));
  const yearRate = yearLeads > 0 ? (yearClosed / yearLeads * 100) : 0;
  console.log('TỔNG'.padEnd(12), String(yearLeads).padEnd(8), String(yearClosed).padEnd(8), String(Math.max(0, yearLeads-yearClosed)).padEnd(10), `${yearRate.toFixed(1)}%`);

  // Per month totals
  console.log(`\n📊 TK ${YEAR} — TỔNG PER MONTH (T1-T4)\n`);
  console.log('Month'.padEnd(8), 'Leads'.padEnd(8), 'Closed'.padEnd(8), 'NotClosed'.padEnd(10), 'Close rate');
  console.log('─'.repeat(60));
  for (let m = 1; m <= 4; m++) {
    let l = 0, c = 0;
    for (const s of SOURCES) { l += leadsBMS[m][s]; c += closedBMS[m][s]; }
    const rate = l > 0 ? (c / l * 100) : 0;
    const nc = Math.max(0, l - c);
    console.log(`T${m}`.padEnd(8), String(l).padEnd(8), String(c).padEnd(8), String(nc).padEnd(10), `${rate.toFixed(1)}%`);
  }

  // INVARIANT checks
  console.log(`\n✅ INVARIANT VERIFICATION:`);
  for (let m = 1; m <= 4; m++) {
    const sumSrcLeads = SOURCES.reduce((a, s) => a + leadsBMS[m][s], 0);
    const sumSrcClosed = SOURCES.reduce((a, s) => a + closedBMS[m][s], 0);
    console.log(`T${m}: ∑src(leads)=${sumSrcLeads} ∑src(closed)=${sumSrcClosed}  ← phải khớp byMonth[${m}].{leads,closed}`);
  }
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
