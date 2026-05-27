// Verify lead per source per month cho TK T1-T4/2026.
// So sánh số liệu RAW từ salesEntries với số liệu mới được aggregate đúng.

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

  // Aggregate per month per source (data thật)
  const byMonthSource: Record<number, Record<string, number>> = {};
  for (let m = 1; m <= 12; m++) {
    byMonthSource[m] = {};
    for (const s of SOURCES) byMonthSource[m][s] = 0;
  }
  let totalYear: Record<string, number> = {};
  for (const s of SOURCES) totalYear[s] = 0;

  for (const d of snap.docs) {
    const x = d.data();
    const m = x.month;
    const src = SOURCES.includes(x.source) ? x.source : 'Walk-in';
    const leads = Number(x.leads ?? 0);
    if (m >= 1 && m <= 12) {
      byMonthSource[m][src] += leads;
      totalYear[src] += leads;
    }
  }

  console.log(`\n📊 TK ${YEAR} — LEAD PER SOURCE PER MONTH (data thật):\n`);
  console.log('Month'.padEnd(6), SOURCES.map(s => s.padEnd(8)).join(''), 'Total');
  console.log('─'.repeat(60));
  for (let m = 1; m <= 4; m++) {
    const cells = SOURCES.map(s => String(byMonthSource[m][s]).padEnd(8));
    const total = SOURCES.reduce((a, s) => a + byMonthSource[m][s], 0);
    console.log(`T${m}`.padEnd(6), cells.join(''), total);
  }

  console.log(`\n📊 YEAR (T1-T12) TOTAL — RAW PER SOURCE:`);
  console.log(SOURCES.map(s => s.padEnd(8)).join(''), 'Total');
  const cells = SOURCES.map(s => String(totalYear[s]).padEnd(8));
  const tot = SOURCES.reduce((a, s) => a + totalYear[s], 0);
  console.log(cells.join(''), tot);

  console.log(`\n📊 SO SÁNH với cách CŨ (estimate sai):`);
  const yearTotal = SOURCES.reduce((a, s) => a + totalYear[s], 0);
  console.log(`Tỉ trọng năm: ${SOURCES.map(s => `${s}=${(totalYear[s]/yearTotal*100).toFixed(0)}%`).join(' · ')}`);
  console.log('Month'.padEnd(6), 'Actual leads', '   →', 'Estimate (cũ) vs Real (mới):');
  for (let m = 1; m <= 4; m++) {
    const monthTotal = SOURCES.reduce((a, s) => a + byMonthSource[m][s], 0);
    console.log(`\nT${m}: ${monthTotal} leads tổng`);
    for (const s of SOURCES) {
      const estimate = yearTotal > 0 ? Math.round(totalYear[s] / yearTotal * monthTotal) : 0;
      const real = byMonthSource[m][s];
      const diff = real - estimate;
      const marker = diff !== 0 ? (Math.abs(diff) > 5 ? ' ⚠️' : '') : ' ✓';
      console.log(`  ${s.padEnd(10)} estimate=${String(estimate).padStart(4)}  real=${String(real).padStart(4)}  diff=${diff > 0 ? '+' : ''}${diff}${marker}`);
    }
  }
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
