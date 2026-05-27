// Seed instance hôm nay cho cơ sở Hoàng Mai (HM) để QLCS_HM có thứ test.
// Idempotent: dọn instance HM trong ngày trùng template trước khi insert.
// Chạy:  npx --yes tsx scripts/seed-today-hm-instances.ts

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS!, 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
}
const db = getFirestore();

const FACILITY_ID = 'HM';
const FACILITY_NAME = 'Hoàng Mai';
const TODAY = new Date().toISOString().slice(0, 10);

// Spec: ngày hôm nay, mix status để user test đủ flow
interface InstanceSpec {
  template_name: string;        // dùng để tra template_id
  status: 'pending' | 'in_progress' | 'submitted';
  scheduled_time: string;       // HH:MM:SS
  deadline_time: string;
  note?: string;
}

const SPECS: InstanceSpec[] = [
  { template_name: '🧪 TEST 1d.A — QLCS Hoàng Mai (KD)',     status: 'pending',     scheduled_time: '07:00:00', deadline_time: '08:00:00' },
  { template_name: '🧪 TEST 1d.B — Bộ phận An sinh (KD/AS)', status: 'pending',     scheduled_time: '14:00:00', deadline_time: '15:00:00' },
  { template_name: '🧪 TEST 1d.A — QLCS Hoàng Mai (KD)',     status: 'in_progress', scheduled_time: '12:00:00', deadline_time: '13:00:00', note: 'Bản 2 (in_progress) để test continue' },
];

function makeTimestamp(time: string): Date {
  const [hh, mm, ss] = time.split(':').map((n) => Number(n));
  const d = new Date();
  d.setHours(hh ?? 0, mm ?? 0, ss ?? 0, 0);
  return d;
}

async function findTemplate(name: string): Promise<{ id: string; data: FirebaseFirestore.DocumentData } | null> {
  const snap = await db.collection('checklistTemplates').where('name', '==', name).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, data: snap.docs[0].data() };
}

async function purgeOldOfToday(templateId: string): Promise<number> {
  // Xóa instance HM hôm nay có cùng template_id (idempotent re-run)
  const snap = await db.collection('checklistInstances')
    .where('facility_id', '==', FACILITY_ID)
    .where('date', '==', TODAY)
    .where('template_id', '==', templateId)
    .get();
  if (snap.empty) return 0;
  const batch = db.batch();
  for (const d of snap.docs) {
    const items = await d.ref.collection('items').get();
    items.docs.forEach((i) => batch.delete(i.ref));
    batch.delete(d.ref);
  }
  await batch.commit();
  return snap.size;
}

async function seed(spec: InstanceSpec, idx: number) {
  const tpl = await findTemplate(spec.template_name);
  if (!tpl) {
    console.log(`  ⚠ Không tìm thấy template "${spec.template_name}" — bỏ qua`);
    return null;
  }

  // Purge old chỉ với instance đầu tiên (idx===0) cho template này
  if (idx === 0 || SPECS.findIndex((s) => s.template_name === spec.template_name) === idx) {
    const purged = await purgeOldOfToday(tpl.id);
    if (purged > 0) console.log(`  ~ purged ${purged} instance cũ của template ${tpl.id.slice(0, 8)}`);
  }

  // Tạo instance
  const now = new Date();
  const instRef = await db.collection('checklistInstances').add({
    template_id: tpl.id,
    facility_id: FACILITY_ID,
    facility_name: FACILITY_NAME,
    department_id: tpl.data.department_id ?? null,
    department_name: tpl.data.department_id ?? null,
    checklist_group: tpl.data.checklist_group ?? null,
    specialty_group: null,
    date: TODAY,
    shift_type: tpl.data.shift_type,
    shift_label: tpl.data.shift_type === 'morning' ? 'Ca sáng' : tpl.data.shift_type === 'afternoon' ? 'Ca chiều' : 'Cả ngày',
    checklist_type: tpl.data.checklist_type,
    status: spec.status,
    review_note: null,
    general_note: spec.note ?? null,
    incident_report: null,
    assigned_to: null,
    assigned_display_name: tpl.data.role_label ?? '',
    actual_operator_name: null,
    actual_operator_role: null,
    actual_operator_note: null,
    reviewer_id: null,
    reviewer_name: tpl.data.reviewer_role_code ?? null,
    reviewer_role: tpl.data.reviewer_role_code ?? null,
    functional_reviewer_id: null,
    functional_reviewer_name: null,
    functional_reviewer_role: null,
    submitted_by: null,
    approved_by: null,
    account_type: 'role_based',
    evidence_urls: [],
    scheduled_at: makeTimestamp(spec.scheduled_time),
    deadline_at: makeTimestamp(spec.deadline_time),
    submitted_at: null,
    reviewed_at: null,
    approved_at: null,
    created_at: now,
  });

  // Copy items từ template subcollection
  const tplItems = await db.collection('checklistTemplates').doc(tpl.id).collection('items').orderBy('sort_order').get();
  const batch = db.batch();
  let itemCount = 0;
  tplItems.docs.forEach((d, i) => {
    const data = d.data();
    const isChecked = spec.status === 'in_progress' && i === 0; // 1 mục đã tick nếu in_progress
    const itemRef = instRef.collection('items').doc();
    batch.set(itemRef, {
      content: data.content,
      sort_order: data.sort_order ?? i,
      is_required: !!data.is_required,
      requires_file: !!data.requires_file,
      requires_note: !!data.requires_note,
      is_checked: isChecked,
      checked_at: isChecked ? now : null,
      checked_by: null,
      note: null,
      file_urls: [],
      created_at: now,
    });
    itemCount++;
  });
  await batch.commit();

  return { id: instRef.id, items: itemCount };
}

async function main() {
  console.log(`Date: ${TODAY}  Facility: ${FACILITY_ID} (${FACILITY_NAME})`);
  for (let i = 0; i < SPECS.length; i++) {
    const spec = SPECS[i];
    const r = await seed(spec, i);
    if (r) console.log(`+ ${spec.status.padEnd(11)} ${spec.template_name.slice(0, 50)}  id=${r.id.slice(0, 8)}  items=${r.items}`);
  }
  console.log('\nXong. Login QLCS_HM → /checklist sẽ thấy 3 instance hôm nay của HM.');
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('LỖI:', e);
  process.exit(1);
});
