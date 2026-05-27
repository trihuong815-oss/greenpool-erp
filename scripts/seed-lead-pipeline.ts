// Seed Lead Pipeline: 30 ngày × 5 cơ sở.
//   - leads (~25 mỗi cơ sở/30days = 125)
//   - leadActivities (~2-3 mỗi lead = ~300)
//   - sales (chỉ leads converted, ~25% × 125 = ~30)
// Idempotent: skip nếu doc có external_id đã tồn tại.
// Mặc định DRY-RUN. --apply để ghi.
//
// Chạy:
//   npx --yes tsx scripts/seed-lead-pipeline.ts
//   npx --yes tsx scripts/seed-lead-pipeline.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const APPLY = process.argv.includes('--apply');
const MIGRATION_VERSION = '6.0.0-seed';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }), projectId: sa.project_id });
}
const db = getFirestore();

const BRANCHES = ['HM', 'TK', 'CTT', '24', 'TT'] as const;
const SOURCES = ['MKT', 'Sale', 'Renew', 'Referral', 'Walk-in'] as const;
const ACTIVITY_TYPES = ['call', 'meet', 'message', 'email', 'note'] as const;
const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'closed_won', 'closed_lost'] as const;

// Close rate theo source (mimic thực tế)
const CLOSE_RATE: Record<string, number> = {
  MKT: 0.25, Sale: 0.32, Renew: 0.55, Referral: 0.40, 'Walk-in': 0.38,
};

const PACKAGES = [
  { id: 'pkg-3m',  name: 'Hội viên 3 tháng',  basePrice: 1_800_000 },
  { id: 'pkg-6m',  name: 'Hội viên 6 tháng',  basePrice: 3_300_000 },
  { id: 'pkg-12m', name: 'Hội viên 12 tháng', basePrice: 6_000_000 },
  { id: 'pkg-pt',  name: 'Gói PT 10 buổi',    basePrice: 4_500_000 },
];

const SALE_STAFF_PER_BRANCH: Record<string, string[]> = {
  HM:  ['1aef6498-249e-4605-9dc9-940b1d21cfab', 'c6a9e9e7-cb12-4d0f-a291-cc188038278f'], // TT_AS + QLCS_HM (test users)
  TK:  ['nv-sale-tk-01', 'nv-sale-tk-02'],
  CTT: ['nv-sale-ctt-01', 'nv-sale-ctt-02', 'nv-sale-ctt-03'],
  '24':['nv-sale-24-01', 'nv-sale-24-02'],
  TT:  ['nv-sale-tt-01', 'nv-sale-tt-02'],
};

const CUSTOMERS = [
  'Nguyễn Văn An', 'Trần Thị Bình', 'Lê Hoàng Cường', 'Phạm Mai Dung',
  'Hoàng Anh Em', 'Bùi Văn Phú', 'Đặng Thị Giang', 'Vũ Quốc Huy',
  'Đỗ Minh Khang', 'Ngô Lan Hương', 'Cao Văn Minh', 'Hồ Thị Nga',
  'Lý Quốc Toàn', 'Trương Thị Phương', 'Phan Văn Quân', 'Tô Mỹ Linh',
];

const ACTIVITY_TEMPLATES: Record<string, string[]> = {
  call:    ['Gọi giới thiệu gói dịch vụ', 'Gọi follow-up tư vấn', 'Gọi xác nhận lịch hẹn'],
  meet:    ['Tư vấn tại cơ sở', 'Demo dịch vụ trực tiếp', 'Gặp ký hợp đồng'],
  message: ['Nhắn Zalo giới thiệu', 'Gửi báo giá qua Messenger', 'Follow-up qua Zalo'],
  email:   ['Gửi brochure', 'Gửi hợp đồng + báo giá', 'Gửi thư cảm ơn'],
  note:    ['Khách quan tâm gói 6m', 'Cần thêm 1 tuần suy nghĩ', 'Sẽ giới thiệu bạn'],
};

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

interface LeadSeed {
  external_id: string;
  inputSource: typeof SOURCES[number];
  assignedSaleId: string;
  branchId: string;
  status: typeof LEAD_STATUSES[number];
  customerName: string;
  customerPhone: string;
  createdAt: Date;
  // Internal: nếu closed_won, generate sale + activities accordingly
  willClose: boolean;
}

interface ActivitySeed {
  external_id: string;
  leadId: string;             // sẽ điền sau khi tạo lead
  saleId: string;
  branchId: string;
  type: typeof ACTIVITY_TYPES[number];
  content: string;
  nextFollowUpAt: Date | null;
  createdAt: Date;
}

interface SaleSeed {
  external_id: string;
  leadId: string;
  packageId: string;
  packageName: string;
  amount: number;
  closeSource: typeof SOURCES[number];
  saleBy: string;
  branchId: string;
  status: 'confirmed' | 'pending_payment' | 'cancelled';
  createdAt: Date;
}

function buildPlan(): { leads: LeadSeed[]; salesPlan: { leadIdx: number; sale: SaleSeed }[] } {
  const r = rng(2026_05_24);
  const leads: LeadSeed[] = [];
  const salesPlan: { leadIdx: number; sale: SaleSeed }[] = [];

  for (const branchId of BRANCHES) {
    const staff = SALE_STAFF_PER_BRANCH[branchId];
    // 25 leads per branch over 30 days
    for (let i = 0; i < 25; i++) {
      const dayBack = Math.floor(r() * 30);
      const created = new Date();
      created.setDate(created.getDate() - dayBack);
      created.setHours(8 + Math.floor(r() * 10), Math.floor(r() * 60), 0, 0);

      const inputSource = pick(SOURCES, r);
      const willClose = r() < CLOSE_RATE[inputSource];
      const status: typeof LEAD_STATUSES[number] =
        willClose ? 'closed_won' :
        r() < 0.2 ? 'closed_lost' :
        r() < 0.5 ? 'qualified' :
        r() < 0.7 ? 'contacted' :
        'new';

      const leadIdx = leads.length;
      const lead: LeadSeed = {
        external_id: `seed_lead_${branchId}_${i.toString().padStart(3, '0')}`,
        inputSource,
        assignedSaleId: pick(staff, r),
        branchId,
        status,
        customerName: pick(CUSTOMERS, r),
        customerPhone: '09' + String(Math.floor(r() * 100_000_000)).padStart(8, '0'),
        createdAt: created,
        willClose,
      };
      leads.push(lead);

      // Nếu closed_won → tạo sale
      if (status === 'closed_won') {
        const pkg = pick(PACKAGES, r);
        const closedAt = new Date(created);
        closedAt.setDate(closedAt.getDate() + Math.floor(r() * 5)); // 0-5 ngày sau lead
        const sale: SaleSeed = {
          external_id: `seed_sale_${branchId}_${i.toString().padStart(3, '0')}`,
          leadId: '',  // điền sau
          packageId: pkg.id,
          packageName: pkg.name,
          amount: pkg.basePrice + Math.floor(r() * 500_000) - 250_000,
          closeSource: inputSource,
          saleBy: lead.assignedSaleId,
          branchId,
          status: r() < 0.9 ? 'confirmed' : 'pending_payment',
          createdAt: closedAt,
        };
        salesPlan.push({ leadIdx, sale });
      }
    }
  }
  return { leads, salesPlan };
}

function buildActivities(leads: { id: string; data: LeadSeed }[]): ActivitySeed[] {
  const r = rng(2026_05_24 + 1);
  const out: ActivitySeed[] = [];

  for (const { id, data: lead } of leads) {
    // 2-4 activities per lead
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const offsetDays = Math.floor(r() * 7);
      const ts = new Date(lead.createdAt);
      ts.setDate(ts.getDate() + offsetDays);
      ts.setHours(8 + Math.floor(r() * 10), Math.floor(r() * 60), 0, 0);

      const type = pick(ACTIVITY_TYPES, r);
      const content = pick(ACTIVITY_TEMPLATES[type], r);
      const willFollow = r() < 0.5;
      const followUp = willFollow ? new Date(ts) : null;
      if (followUp) followUp.setDate(followUp.getDate() + 1 + Math.floor(r() * 7));

      out.push({
        external_id: `seed_act_${lead.external_id.slice(10)}_${i}`,
        leadId: id,
        saleId: lead.assignedSaleId,
        branchId: lead.branchId,
        type,
        content,
        nextFollowUpAt: followUp,
        createdAt: ts,
      });
    }
  }
  return out;
}

async function existing(col: string, external_id: string): Promise<string | null> {
  const snap = await db.collection(col).where('external_id', '==', external_id).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

async function main() {
  console.log(`=== Seed Lead Pipeline ===`);
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

  const { leads: leadSeeds, salesPlan } = buildPlan();
  console.log(`Plan: ${leadSeeds.length} leads, ${salesPlan.length} sales (closed_won)`);

  // 1. Insert leads
  const leadIdMap: { id: string; data: LeadSeed }[] = [];
  let leadCreated = 0, leadExisted = 0;
  for (const seed of leadSeeds) {
    const existId = await existing('leads', seed.external_id);
    if (existId) {
      leadExisted++;
      leadIdMap.push({ id: existId, data: seed });
      continue;
    }
    if (APPLY) {
      const doc = {
        external_id: seed.external_id,
        inputSource: seed.inputSource,
        assignedSaleId: seed.assignedSaleId,
        branchId: seed.branchId,
        status: seed.status,
        customerName: seed.customerName,
        customerPhone: seed.customerPhone,
        crmLeadId: null,
        crmCustomerId: null,
        sourceSystem: 'manual',
        syncedAt: null,
        externalRef: null,
        createdAt: seed.createdAt,
        createdBy: 'seed-script',
        updatedAt: seed.createdAt,
        updatedBy: 'seed-script',
        migrationVersion: MIGRATION_VERSION,
        migratedAt: new Date(),
        migratedBy: 'system',
        sourceCollection: 'seed',
      };
      const ref = await db.collection('leads').add(doc);
      leadIdMap.push({ id: ref.id, data: seed });
    } else {
      leadIdMap.push({ id: `would-create-${leadCreated}`, data: seed });
    }
    leadCreated++;
  }
  console.log(`Leads:      created=${leadCreated}  exists=${leadExisted}`);

  // 2. Insert activities
  const activities = buildActivities(leadIdMap);
  let actCreated = 0, actExisted = 0;
  for (const seed of activities) {
    const existId = await existing('leadActivities', seed.external_id);
    if (existId) { actExisted++; continue; }
    if (APPLY) {
      await db.collection('leadActivities').add({
        external_id: seed.external_id,
        leadId: seed.leadId,
        saleId: seed.saleId,
        branchId: seed.branchId,
        type: seed.type,
        content: seed.content,
        nextFollowUpAt: seed.nextFollowUpAt,
        createdAt: seed.createdAt,
        createdBy: 'seed-script',
        migrationVersion: MIGRATION_VERSION,
        migratedAt: new Date(),
        migratedBy: 'system',
        sourceCollection: 'seed',
      });
    }
    actCreated++;
  }
  console.log(`Activities: created=${actCreated}  exists=${actExisted}`);

  // 3. Insert sales (cần leadIdMap để link)
  let saleCreated = 0, saleExisted = 0;
  for (const { leadIdx, sale } of salesPlan) {
    const leadId = leadIdMap[leadIdx].id;
    const seed: SaleSeed = { ...sale, leadId };
    const existId = await existing('sales', seed.external_id);
    if (existId) { saleExisted++; continue; }
    if (APPLY) {
      await db.collection('sales').add({
        external_id: seed.external_id,
        leadId: seed.leadId,
        packageId: seed.packageId,
        packageName: seed.packageName,
        amount: seed.amount,
        closeSource: seed.closeSource,
        saleBy: seed.saleBy,
        branchId: seed.branchId,
        status: seed.status,
        crmDealId: null,
        crmCustomerId: null,
        sourceSystem: 'manual',
        syncedAt: null,
        externalRef: null,
        createdAt: seed.createdAt,
        createdBy: 'seed-script',
        updatedAt: seed.createdAt,
        updatedBy: 'seed-script',
        migrationVersion: MIGRATION_VERSION,
        migratedAt: new Date(),
        migratedBy: 'system',
        sourceCollection: 'seed',
      });
    }
    saleCreated++;
  }
  console.log(`Sales:      created=${saleCreated}  exists=${saleExisted}`);

  if (!APPLY) console.log(`\n→ Dry-run xong. Re-run với --apply để ghi.`);
  else console.log(`\n→ Done.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('LỖI:', e); process.exit(1); });
