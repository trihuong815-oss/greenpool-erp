// Seed sample sales cho 5 cơ sở, năm 2026, để có data demo cho /doanh-so.
// Idempotent: skip nếu doc với cùng "external_id" đã tồn tại (deterministic seed).
// Mặc định DRY-RUN. Truyền --apply để ghi thật.
//
// Chạy:
//   npx --yes tsx scripts/seed-sample-sales.ts            (dry-run)
//   npx --yes tsx scripts/seed-sample-sales.ts --apply    (ghi thật)

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const APPLY = process.argv.includes('--apply');
const MIGRATION_VERSION = '2.0.0-seed';
const SOURCE_TAG = 'seed';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }), projectId: sa.project_id });
}
const db = getFirestore();

const BRANCHES = ['HM', 'TK', 'CTT', '24', 'TT'] as const;
const SOURCES = ['MKT', 'Sale', 'Renew', 'Referral', 'Walk-in'] as const;
const PAYMENT_METHODS = ['cash', 'transfer', 'card', 'qr'] as const;
const TYPES = ['membership-3m', 'membership-6m', 'membership-12m', 'pt-package', 'single-session'] as const;
const STAFF = ['nv_sale_01', 'nv_sale_02', 'nv_sale_03', 'qlcs_self'] as const;

const CUSTOMERS = [
  'Nguyễn Văn An', 'Trần Thị Bình', 'Lê Hoàng Cường', 'Phạm Mai Dung',
  'Hoàng Anh Em', 'Bùi Văn Phú', 'Đặng Thị Giang', 'Vũ Quốc Huy',
  'Đỗ Minh Khang', 'Ngô Lan Hương', 'Cao Văn Minh', 'Hồ Thị Nga',
];

// Deterministic PRNG (seeded) để re-run giống nhau
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function pick<T>(arr: readonly T[], r: () => number): T {
  return arr[Math.floor(r() * arr.length)];
}

interface SaleSeed {
  external_id: string; // deterministic key cho idempotent
  branchId: string;
  amount: number;
  paymentMethod: string;
  type: string;
  status: string;
  source: string;
  customerName: string;
  customerPhone: string;
  packageId: string | null;
  saleStaffId: string;
  notes: string | null;
  closedAt: Date;
}

function generateSales(): SaleSeed[] {
  const out: SaleSeed[] = [];
  const r = rng(42);

  // Mỗi branch ~ 30 sales rải đều 5 tháng đầu năm 2026
  for (const branchId of BRANCHES) {
    for (let i = 0; i < 30; i++) {
      const month = Math.floor(r() * 5); // 0-4 (Jan-May)
      const day = 1 + Math.floor(r() * 27);
      const closedAt = new Date(2026, month, day, 9 + Math.floor(r() * 10), Math.floor(r() * 60));

      const source = pick(SOURCES, r);
      const type = pick(TYPES, r);
      const amountByType: Record<string, number> = {
        'membership-3m':   1_800_000,
        'membership-6m':   3_300_000,
        'membership-12m':  6_000_000,
        'pt-package':      4_500_000,
        'single-session':    250_000,
      };
      const amount = amountByType[type] + Math.floor(r() * 500_000) - 250_000;

      // Closed rate khác nhau theo source (mimic close rate thực)
      const closeRate: Record<string, number> = {
        MKT: 0.25, Sale: 0.32, Renew: 0.55, Referral: 0.40, 'Walk-in': 0.38,
      };
      const isClosed = r() < closeRate[source];
      const status = isClosed ? 'confirmed' : pick(['pending', 'cancelled'] as const, r);

      const customerName = pick(CUSTOMERS, r);
      const customerPhone = '09' + String(Math.floor(r() * 100_000_000)).padStart(8, '0');

      out.push({
        external_id: `seed_${branchId}_${i.toString().padStart(3, '0')}`,
        branchId,
        amount: Math.max(amount, 100_000),
        paymentMethod: pick(PAYMENT_METHODS, r),
        type,
        status,
        source,
        customerName,
        customerPhone,
        packageId: type === 'single-session' ? null : `pkg_${type}`,
        saleStaffId: pick(STAFF, r),
        notes: r() < 0.2 ? 'Khách giới thiệu bởi hội viên cũ.' : null,
        closedAt,
      });
    }
  }
  return out;
}

async function findExisting(external_id: string): Promise<string | null> {
  const snap = await db.collection('sales').where('external_id', '==', external_id).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

async function main() {
  console.log(`=== Seed sample sales ===`);
  console.log(`Mode: ${APPLY ? 'APPLY (sẽ ghi thật)' : 'DRY-RUN (chỉ đếm, --apply để ghi)'}\n`);

  const sales = generateSales();
  console.log(`Đã generate ${sales.length} sales:`);
  const byBranch: Record<string, number> = {};
  for (const s of sales) byBranch[s.branchId] = (byBranch[s.branchId] ?? 0) + 1;
  console.log('  by branch:', JSON.stringify(byBranch));
  console.log();

  let created = 0, exists = 0;
  for (const s of sales) {
    const existingId = await findExisting(s.external_id);
    if (existingId) {
      exists++;
      continue;
    }
    if (APPLY) {
      const now = new Date();
      await db.collection('sales').add({
        external_id: s.external_id,
        branchId: s.branchId,
        amount: s.amount,
        paymentMethod: s.paymentMethod,
        type: s.type,
        status: s.status,
        source: s.source,
        customerName: s.customerName,
        customerPhone: s.customerPhone,
        packageId: s.packageId,
        saleStaffId: s.saleStaffId,
        notes: s.notes,
        closedAt: s.closedAt,
        createdAt: now,
        createdBy: 'seed-script',
        updatedAt: now,
        updatedBy: 'seed-script',
        // Migration metadata theo spec
        migrationVersion: MIGRATION_VERSION,
        migratedAt: now,
        migratedBy: 'system',
        sourceCollection: SOURCE_TAG,
      });
    }
    created++;
  }

  console.log(`Kết quả: created=${created}  exists=${exists}`);
  if (!APPLY) console.log(`\n→ Dry-run xong. Re-run với --apply để ghi thật.`);
  else console.log(`\n→ Done.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('LỖI:', e); process.exit(1); });
