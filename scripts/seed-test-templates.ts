// Seed 2 template test rõ ràng cho Phase 1d browser test.
// Idempotent: nếu đã tồn tại (theo name) thì update.
// Chạy:  npx --yes tsx scripts/seed-test-templates.ts

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS!, 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
}
const db = getFirestore();

interface Tpl {
  name: string;
  role_label: string;
  block_id: string;
  department_id: string | null;
  shift_type: string;
  checklist_type: string;
  facility_scope: string;
  checklist_group: string | null;
  evidence_type: string;
  scheduled_time: string;
  deadline_time: string;
  assigned_role_code: string;
  reviewer_role_code: string;
  active: boolean;
  items: string[];
}

const SEEDS: Tpl[] = [
  {
    name: '🧪 TEST 1d.A — QLCS Hoàng Mai (KD)',
    role_label: 'QLCS Hoàng Mai',
    block_id: 'KD',
    department_id: null,
    shift_type: 'morning',
    checklist_type: 'opening',
    facility_scope: 'specific',
    checklist_group: 'Quản lý cơ sở',
    evidence_type: 'note',
    scheduled_time: '07:00:00',
    deadline_time: '08:00:00',
    assigned_role_code: 'QLCS_HM',
    reviewer_role_code: 'GD_KD',
    active: true,
    items: [
      'Kiểm tra hệ thống lọc bể',
      'Đo độ pH + clo nước',
      'Kiểm tra phòng thay đồ + WC',
      'Lau dọn khu vực lễ tân',
      'Bật điều hòa + hệ thống chiếu sáng',
    ],
  },
  {
    name: '🧪 TEST 1d.B — Bộ phận An sinh (KD/AS)',
    role_label: 'NV An sinh',
    block_id: 'KD',
    department_id: 'AS',
    shift_type: 'afternoon',
    checklist_type: 'handover',
    facility_scope: 'all',
    checklist_group: 'An sinh vệ sinh',
    evidence_type: 'photo',
    scheduled_time: '14:00:00',
    deadline_time: '15:00:00',
    assigned_role_code: 'NV_CH',
    reviewer_role_code: 'TT_AS',
    active: true,
    items: [
      'Lau rửa WC nam',
      'Lau rửa WC nữ',
      'Thay khăn tắm + khăn lau chân',
      'Vứt rác đúng phân loại',
    ],
  },
];

async function findByName(name: string): Promise<string | null> {
  const snap = await db.collection('checklistTemplates').where('name', '==', name).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

async function upsert(t: Tpl): Promise<{ id: string; created: boolean }> {
  const existing = await findByName(t.name);
  const now = new Date();
  const payload: Record<string, any> = {
    name: t.name,
    role_label: t.role_label,
    block_id: t.block_id,
    department_id: t.department_id,
    shift_type: t.shift_type,
    checklist_type: t.checklist_type,
    facility_scope: t.facility_scope,
    checklist_group: t.checklist_group,
    evidence_type: t.evidence_type,
    scheduled_time: t.scheduled_time,
    deadline_time: t.deadline_time,
    assigned_role_code: t.assigned_role_code,
    reviewer_role_code: t.reviewer_role_code,
    active: t.active,
    updated_at: now,
  };
  let id: string;
  if (existing) {
    await db.collection('checklistTemplates').doc(existing).update(payload);
    id = existing;
  } else {
    const ref = await db.collection('checklistTemplates').add({ ...payload, created_at: now });
    id = ref.id;
  }
  // Replace items
  const itemsCol = db.collection('checklistTemplates').doc(id).collection('items');
  const old = await itemsCol.get();
  const batch = db.batch();
  old.docs.forEach((d) => batch.delete(d.ref));
  t.items.forEach((content, idx) => {
    const ref = itemsCol.doc();
    batch.set(ref, {
      content,
      sort_order: idx,
      is_required: idx < 2, // 2 mục đầu bắt buộc
      requires_file: t.evidence_type === 'photo',
      requires_note: false,
      created_at: now,
      updated_at: now,
    });
  });
  await batch.commit();
  return { id, created: !existing };
}

async function main() {
  for (const t of SEEDS) {
    const { id, created } = await upsert(t);
    console.log(`${created ? '+' : '~'} ${t.name}  id=${id.slice(0, 8)}  items=${t.items.length}`);
  }
  console.log('\nXong. Login → /checklist/templates sẽ thấy 2 template test ở đầu list.');
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('LỖI:', e);
  process.exit(1);
});
