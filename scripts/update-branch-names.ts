// Update Firestore branches collection — rename theo convention mới ("Green Pool ..." không "Cơ sở ...").

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

const NAMES: Record<string, string> = {
  HM:  'Green Pool Hoàng Mai',
  TK:  'Green Pool 20 Thuỵ Khuê',
  CTT: 'Green Pool Cung Thể Thao MĐ',
  '24': 'Green Pool 24 NCT',
  TT:  'Green Pool Thanh Trì',
};

(async () => {
  const now = new Date();
  let updated = 0;
  for (const [id, name] of Object.entries(NAMES)) {
    const ref = db.collection('branches').doc(id);
    const snap = await ref.get();
    if (!snap.exists) { console.log(`  ⚠ branches/${id} không tồn tại — skip`); continue; }
    const oldName = snap.data()?.name ?? '(chưa có)';
    if (oldName === name) { console.log(`  = ${id}: '${oldName}' (không đổi)`); continue; }
    await ref.update({ name, updatedAt: now, updatedBy: 'update-branch-names-script' });
    console.log(`  ✓ ${id}: '${oldName}' → '${name}'`);
    updated++;
  }
  console.log(`\n✅ Đã cập nhật ${updated}/${Object.keys(NAMES).length} branch.`);
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
