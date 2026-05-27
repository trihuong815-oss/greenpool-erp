// Seed 12 role mới cho phòng Kỹ thuật (PP_HT, PP_XLN, KT_HT_*, KT_XLN_*).
// Idempotent: dùng set({merge:true}) — chạy nhiều lần OK.
//
// DRY-RUN:  npx --yes tsx scripts/seed-tech-roles.ts
// APPLY:    npx --yes tsx scripts/seed-tech-roles.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath || !existsSync(resolve(process.cwd(), credPath))) {
  console.error('Missing GOOGLE_APPLICATION_CREDENTIALS'); process.exit(1);
}
const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
if (!getApps().length) initializeApp({
  credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }),
});
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

interface RoleDoc {
  code: string;
  name: string;
  tier: number;
  block_id: string;
  dept_id: string;
  facility_id: string | null;
  is_qlcs: boolean;
  is_tp: boolean;
  parent_role: string;
  description: string | null;
}

const BRANCH_LABEL: Record<string, string> = {
  HM: 'Hoàng Mai', TK: '20 Thuỵ Khuê', CTT: 'CTT Mỹ Đình', '24NCT': '24 NCT', TT: 'Thanh Trì',
};

const ROLES: RoleDoc[] = [
  // Phó phòng — tier 4 (giữa TP_KT tier=3 và NV tier=6)
  { code: 'PP_HT',  name: 'PP Hệ thống',     tier: 4, block_id: 'KD', dept_id: 'KT', facility_id: null, is_qlcs: false, is_tp: false, parent_role: 'TP_KT', description: 'Phó phòng phụ trách Kỹ thuật Hệ thống (máy lọc + nhiệt)' },
  { code: 'PP_XLN', name: 'PP Xử lý nước',   tier: 4, block_id: 'KD', dept_id: 'KT', facility_id: null, is_qlcs: false, is_tp: false, parent_role: 'TP_KT', description: 'Phó phòng phụ trách Kỹ thuật Xử lý nước (clo + axit)' },
];

// KT viên cơ sở — tier 6 (như NV_SALE)
const BRANCHES: Array<{ id: string; suffix: string }> = [
  { id: 'HM',  suffix: 'HM' },
  { id: 'TK',  suffix: 'TK' },
  { id: 'CTT', suffix: 'CTT' },
  { id: '24',  suffix: '24NCT' },
  { id: 'TT',  suffix: 'TT' },
];

for (const b of BRANCHES) {
  ROLES.push({
    code: `KT_HT_${b.suffix}`,
    name: `KTV Hệ thống ${BRANCH_LABEL[b.suffix] ?? b.id}`,
    tier: 6, block_id: 'KD', dept_id: 'KT', facility_id: b.id,
    is_qlcs: false, is_tp: false, parent_role: 'PP_HT',
    description: `Kỹ thuật viên hệ thống tại cơ sở ${b.id}`,
  });
  ROLES.push({
    code: `KT_XLN_${b.suffix}`,
    name: `KTV Xử lý nước ${BRANCH_LABEL[b.suffix] ?? b.id}`,
    tier: 6, block_id: 'KD', dept_id: 'KT', facility_id: b.id,
    is_qlcs: false, is_tp: false, parent_role: 'PP_XLN',
    description: `Kỹ thuật viên xử lý nước tại cơ sở ${b.id}`,
  });
}

async function main() {
  console.log(`Seed tech roles — mode: ${APPLY ? '🚀 APPLY' : '🧪 DRY-RUN'}`);
  console.log(`Tổng: ${ROLES.length} roles (2 PP + 10 KTV cơ sở)\n`);

  for (const r of ROLES) {
    const existing = await db.collection('roles').doc(r.code).get();
    const status = existing.exists ? '⊝ EXIST' : '✓ NEW  ';
    console.log(`  ${status}  ${r.code.padEnd(14)}  tier=${r.tier}  fac=${r.facility_id ?? '—'}  parent=${r.parent_role}  · ${r.name}`);
  }

  if (!APPLY) {
    console.log('\n⚠ DRY-RUN — chạy lại với --apply để ghi Firestore.');
    return;
  }

  console.log('\n🚀 APPLY — ghi roles…\n');
  for (const r of ROLES) {
    await db.collection('roles').doc(r.code).set(r, { merge: true });
    console.log(`  ✓ ${r.code} written.`);
  }
  console.log(`\n✓ Hoàn thành ${ROLES.length} roles.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
