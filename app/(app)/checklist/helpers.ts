export type ChecklistStatus =
  | 'pending' | 'in_progress' | 'submitted'
  | 'approved' | 'rejected' | 'overdue' | 'failed';

export const STATUS_LABEL: Record<ChecklistStatus, { label: string; cls: string; emoji: string }> = {
  pending:     { label: 'Chưa làm',  cls: 'bg-slate-100 text-slate-700',     emoji: '⏳' },
  in_progress: { label: 'Cần làm',   cls: 'bg-blue-100 text-blue-800',       emoji: '✏️' },
  submitted:   { label: 'Chờ duyệt', cls: 'bg-amber-100 text-amber-800',     emoji: '⏰' },
  approved:    { label: 'Đã duyệt',  cls: 'bg-emerald-100 text-emerald-800', emoji: '✅' },
  rejected:    { label: 'Không đạt', cls: 'bg-rose-100 text-rose-800',       emoji: '❌' },
  overdue:     { label: 'Quá hạn',   cls: 'bg-red-100 text-red-800',         emoji: '⏱️' },
  failed:      { label: 'Không đạt', cls: 'bg-rose-100 text-rose-900',       emoji: '❌' },
};

export const CHECKLIST_TYPE_LABEL: Record<string, { label: string; emoji: string; cls: string }> = {
  opening:  { label: 'Đầu ca',     emoji: '🌅', cls: 'bg-amber-100 text-amber-800' },
  handover: { label: 'Giao ca',    emoji: '🔄', cls: 'bg-blue-100 text-blue-800' },
  closing:  { label: 'Cuối ca',    emoji: '🌙', cls: 'bg-indigo-100 text-indigo-800' },
  incident: { label: 'Sự cố',      emoji: '⚠️', cls: 'bg-rose-100 text-rose-800' },
  custom:   { label: 'Tuỳ chỉnh',  emoji: '📋', cls: 'bg-slate-100 text-slate-700' },
};

export const CHECKLIST_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'opening',  label: '🌅 Đầu ca' },
  { value: 'handover', label: '🔄 Giao ca' },
  { value: 'closing',  label: '🌙 Cuối ca' },
  { value: 'incident', label: '⚠️ Sự cố' },
  { value: 'custom',   label: '📋 Tuỳ chỉnh' },
];

export const SHIFT_LABEL: Record<string, string> = {
  morning:   'Ca sáng',
  afternoon: 'Ca chiều',
  evening:   'Ca tối',
  night:     'Ca đêm',
  allday:    'Cả ngày',
};

export const EVIDENCE_LABEL: Record<string, string> = {
  none:      'Không cần',
  photo:     'Ảnh',
  signature: 'Chữ ký',
  file:      'File',
  note:      'Ghi chú',
};

export const SHIFT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'allday',    label: 'Cả ngày' },
  { value: 'morning',   label: 'Ca sáng' },
  { value: 'afternoon', label: 'Ca chiều' },
  { value: 'evening',   label: 'Ca tối' },
  { value: 'night',     label: 'Ca đêm' },
];

export const EVIDENCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'none',      label: 'Không cần' },
  { value: 'photo',     label: 'Ảnh' },
  { value: 'signature', label: 'Chữ ký' },
  { value: 'file',      label: 'File' },
  { value: 'note',      label: 'Ghi chú' },
];

export interface RoleRef { code: string; name: string; block_id: string | null; tier: number }
export interface Facility { id: string; name: string; color: string }
export interface Department { id: string; name: string; block_id: string; color: string }

export interface ChecklistTemplate {
  id: string;
  name: string | null;
  role_label: string;
  block_id: string;
  active: boolean;
  created_at: string;
  department_id: string | null;
  shift_type: string | null;
  checklist_group: string | null;
  evidence_type: string;
  scheduled_time: string | null;
  deadline_time: string | null;
  facility_scope: string;
  reviewer_role_code: string | null;
  assigned_role_code: string | null;
  checklist_type: string;
}

export interface ChecklistTemplateItem {
  id: string;
  template_id: string;
  content: string;
  sort_order: number;
  requires_file: boolean;
  is_required: boolean;
  requires_note: boolean;
}

export interface ChecklistInstance {
  id: string;
  template_id: string;
  assigned_to: string | null;
  reviewer_id: string | null;
  facility_id: string | null;
  department_id: string | null;
  date: string;
  shift_type: string | null;
  checklist_type: string;
  scheduled_at: string | null;
  deadline_at: string | null;
  status: ChecklistStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  general_note: string | null;
  incident_report: string | null;
  evidence_urls: string[];
  actual_operator_name: string | null;
  actual_operator_role: string | null;
  created_at: string;
  // Cột thêm ở migration 018 (có thể null cho dữ liệu cũ chưa backfill)
  facility_name?: string | null;
  department_name?: string | null;
  checklist_group?: string | null;
  specialty_group?: string | null;
  shift_label?: string | null;
  assigned_display_name?: string | null;
  actual_operator_note?: string | null;
  reviewer_name?: string | null;
  reviewer_role?: string | null;
  functional_reviewer_id?: string | null;
  functional_reviewer_name?: string | null;
  functional_reviewer_role?: string | null;
  submitted_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  account_type?: string | null;
}

export interface CardData {
  instance: ChecklistInstance;
  template: ChecklistTemplate;
  items: ChecklistInstanceItem[];
  templateItemCount: number;
}

export interface ChecklistInstanceItem {
  id: string;
  instance_id: string;
  template_item_id: string;
  sort_order: number;
  content: string;
  requires_file: boolean;
  is_required: boolean;
  requires_note: boolean;
  is_checked: boolean;
  checked_at: string | null;
  checked_by: string | null;
  note: string | null;
  file_urls: string[];
}

// Backward compat alias (legacy code in TemplateConfig still references this)
export type ChecklistItem = ChecklistTemplateItem;

export interface ProfileRef {
  id: string;
  full_name: string;
  email: string;
  role_code: string;
  facility_id: string | null;
}

export function isAdmin(role: string): boolean {
  return ['ADMIN', 'CEO', 'GD_KD', 'GD_VP'].includes(role);
}

export function canSeeAllFacilities(role: string): boolean {
  return ['ADMIN', 'CEO', 'GD_KD', 'GD_VP', 'TP_GS', 'TP_NS'].includes(role);
}

export function canManageTemplates(role: string): boolean {
  if (isAdmin(role)) return true;
  if (role.startsWith('QLCS_')) return true;
  if (role.startsWith('TP_')) return true;
  return false;
}

// Ai được thấy tab Thống kê — quản lý cấp 3 trở lên
export function canViewStats(role: string): boolean {
  if (isAdmin(role)) return true;             // CEO, GD_KD, GD_VP
  if (role.startsWith('QLCS_')) return true;  // QLCS — xem cơ sở mình
  if (role.startsWith('TP_')) return true;    // TP — xem phòng mình
  if (role === 'TIBAN_TT') return true;
  return false; // NV / GV / TT / PP — ẩn tab Thống kê
}

export function canApproveAny(role: string): boolean {
  if (isAdmin(role)) return true;
  if (role.startsWith('QLCS_')) return true;
  if (role.startsWith('TP_')) return true;
  if (role.startsWith('PP_')) return true;
  if (role.startsWith('TT_')) return true;
  return false;
}

// canTickInstance — khớp với RLS migration 026.
// Đúng nguyên tắc: admin/CEO/GĐ Khối tick mọi instance; QLCS tick
// trong cơ sở mình; assigned_to tick instance của mình; shared_shift
// khớp 3 chiều facility + department + shift; tất cả đều bị khoá
// nếu status ∈ submitted/approved/failed.
export function canTickInstance(args: {
  status: string;
  facility_id: string | null;
  department_id: string | null;
  shift_type: string | null;
  assigned_to: string | null;
  userId: string;
  userRole: string;
  userFacility: string | null;
  userDepartment: string | null;
  userShift: string | null;
  isSharedShift: boolean;
}): boolean {
  const {
    status, facility_id, department_id, shift_type, assigned_to,
    userId, userRole, userFacility, userDepartment, userShift, isSharedShift,
  } = args;
  if (['submitted', 'approved', 'failed'].includes(status)) return false;
  if (isAdmin(userRole)) return true;
  if (userRole.startsWith('QLCS_') && userFacility && facility_id === userFacility) return true;
  if (assigned_to && assigned_to === userId) return true;
  if (isSharedShift
      && userFacility    && facility_id   === userFacility
      && userDepartment  && department_id === userDepartment
      && userShift       && shift_type    === userShift) return true;
  return false;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function combineDateAndTime(dateStr: string, timeStr: string | null): string | null {
  if (!timeStr) return null;
  const [h, m, s] = timeStr.split(':');
  const d = new Date(dateStr);
  d.setHours(parseInt(h || '0'), parseInt(m || '0'), parseInt(s || '0'), 0);
  return d.toISOString();
}

export function formatVNDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export type InstanceGroup = 'todo' | 'upcoming' | 'overdue' | 'submitted';

export const GROUP_LABEL: Record<InstanceGroup, { label: string; emoji: string; cls: string }> = {
  todo:      { label: 'Cần làm',  emoji: '✏️', cls: 'border-amber-400'  },
  upcoming:  { label: 'Sắp tới',  emoji: '⏳', cls: 'border-blue-400'   },
  overdue:   { label: 'Quá hạn',  emoji: '⏱️', cls: 'border-rose-500'   },
  submitted: { label: 'Đã gửi',   emoji: '✅', cls: 'border-emerald-500' },
};

export function groupInstance(inst: ChecklistInstance, now: Date = new Date()): InstanceGroup {
  // Terminal statuses
  if (['submitted', 'approved', 'rejected', 'failed'].includes(inst.status)) {
    return 'submitted';
  }
  // Overdue
  if (inst.status === 'overdue') return 'overdue';
  if (inst.deadline_at && new Date(inst.deadline_at) < now && ['pending', 'in_progress'].includes(inst.status)) {
    return 'overdue';
  }
  // Upcoming
  if (inst.status === 'pending' && inst.scheduled_at && new Date(inst.scheduled_at) > now) {
    return 'upcoming';
  }
  // Default: todo
  return 'todo';
}

// ============================================================
// Dashboard ordering & grouping (tree CS → BP → Ca → Checklist)
// ============================================================

// Thứ tự cơ sở theo nghiệp vụ (không alphabet)
export const FACILITY_ORDER: Record<string, number> = {
  TK: 1, HM: 2, '24': 3, CTT: 4, TT: 5,
};

// Thứ tự nhóm checklist theo nghiệp vụ
// Khoá là chuỗi đã chuẩn hoá lower-case không dấu — xem normalizeGroup().
export const CHECKLIST_GROUP_ORDER: Array<{ key: string; label: string }> = [
  { key: 'an-toan-ve-sinh',     label: 'An toàn vệ sinh cơ sở' },
  { key: 'le-tan',              label: 'Lễ tân' },
  { key: 'ky-thuat-he-thong',   label: 'Kỹ thuật hệ thống' },
  { key: 'ky-thuat-xu-ly-nuoc', label: 'Kỹ thuật xử lý nước' },
  { key: 'dao-tao',             label: 'Đào tạo' },
  { key: 'kinh-doanh-sale',     label: 'Kinh doanh/Sale' },
  { key: 'quan-ly-co-so',       label: 'Quản lý cơ sở' },
];

const GROUP_ORDER_INDEX: Record<string, number> = Object.fromEntries(
  CHECKLIST_GROUP_ORDER.map((g, i) => [g.key, i + 1])
);

// Chuẩn hoá tên nhóm để khớp với CHECKLIST_GROUP_ORDER.
// Bỏ dấu, lower, đổi space sang '-'. Trả về key đã match được nếu có.
export function normalizeGroupKey(raw: string | null | undefined): string {
  if (!raw) return 'khac';
  const noDiacritic = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  // Match prefix với keys đã định nghĩa
  for (const g of CHECKLIST_GROUP_ORDER) {
    if (noDiacritic.includes(g.key)) return g.key;
  }
  return noDiacritic || 'khac';
}

export function groupLabelByKey(key: string): string {
  const found = CHECKLIST_GROUP_ORDER.find(g => g.key === key);
  if (found) return found.label;
  if (key === 'khac') return 'Nhóm khác';
  const words = key
    .replace(/^G:/, '')
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(word => word[0]?.toUpperCase() + word.slice(1).toLowerCase());
  return words.join(' ') || 'Nhóm khác';
}

export function groupOrderByKey(key: string): number {
  return GROUP_ORDER_INDEX[key.replace(/^G:/, '')] || 99;
}

// Thứ tự ca trong cây
export const SHIFT_ORDER: Record<string, number> = {
  morning: 1, afternoon: 2, evening: 3, night: 4, allday: 5,
};

// Thứ tự loại checklist trong ca (Giao ca trước Cuối ca)
export const CHECKLIST_TYPE_ORDER: Record<string, number> = {
  opening: 1, handover: 2, closing: 3, incident: 4, custom: 5,
};

// ============================================================
// 6 stat cards
// ============================================================
export interface DashboardStats {
  total: number;
  todo: number;
  awaiting: number;
  approved: number;
  failed: number;
  overdue: number;
}

export function computeStats(insts: ChecklistInstance[], now: Date = new Date()): DashboardStats {
  let total = 0, todo = 0, awaiting = 0, approved = 0, failed = 0, overdue = 0;
  for (const i of insts) {
    total++;
    if (i.status === 'approved') approved++;
    else if (i.status === 'failed' || i.status === 'rejected') failed++;
    else if (i.status === 'submitted') awaiting++;
    else if (i.status === 'overdue') overdue++;
    else if (['pending','in_progress'].includes(i.status)) {
      // Overdue runtime check khi deadline đã qua
      if (i.deadline_at && new Date(i.deadline_at) < now) overdue++;
      else todo++;
    }
  }
  return { total, todo, awaiting, approved, failed, overdue };
}

// ============================================================
// Filter state
// ============================================================
export interface FilterState {
  facility: string;       // '' = all
  department: string;     // '' = all
  shift: string;          // '' = all
  checklistType: string;  // '' = all
  status: string;         // '' = all
  date: string;           // YYYY-MM-DD
}

export const EMPTY_FILTER: FilterState = {
  facility: '', department: '', shift: '', checklistType: '', status: '',
  date: todayISO(),
};

export function applyFilter(insts: ChecklistInstance[], f: FilterState): ChecklistInstance[] {
  return insts.filter(i => {
    if (f.facility && i.facility_id !== f.facility) return false;
    if (f.department && i.department_id !== f.department) return false;
    if (f.shift && (i.shift_type || 'allday') !== f.shift) return false;
    if (f.checklistType && i.checklist_type !== f.checklistType) return false;
    if (f.status && i.status !== f.status) return false;
    if (f.date && i.date !== f.date) return false;
    return true;
  });
}

// ============================================================
// Display helpers — chuyển mã/code thành ngôn ngữ nghiệp vụ
// Dùng ở mọi nơi user thấy: tree row, panel chi tiết, modal.
// ============================================================

// Verb đầu cho từng loại checklist
const TYPE_VERB: Record<string, string> = {
  opening:  'Đầu ca',
  handover: 'Giao ca',
  closing:  'Cuối ca',
  incident: 'Sự cố',
};

// Title cho checklist daily/custom (shift_type='allday') theo nhóm
const DAILY_TITLE_BY_GROUP: Record<string, string> = {
  'ky-thuat-he-thong':   'Kiểm tra thiết bị',
  'ky-thuat-xu-ly-nuoc': 'Kiểm tra chất lượng nước',
  'dao-tao':             'Kiểm tra lịch lớp',
  'kinh-doanh-sale':     'Kiểm tra lead/follow khách',
  'quan-ly-co-so':       'Tổng kiểm tra vận hành cơ sở',
  'an-toan-ve-sinh':     'Kiểm tra an toàn vệ sinh',
  'le-tan':              'Kiểm tra lễ tân',
};

// Mặc định "Người thực hiện" theo nhóm checklist
const OPERATOR_BY_GROUP: Record<string, string> = {
  'an-toan-ve-sinh':     'NV Kinh doanh / QLCS',
  'le-tan':              'Lễ tân ca',
  'ky-thuat-he-thong':   'KTV hệ thống',
  'ky-thuat-xu-ly-nuoc': 'KTV xử lý nước',
  'dao-tao':             'Tổ trưởng đào tạo',
  'kinh-doanh-sale':     'NV Kinh doanh',
  'quan-ly-co-so':       'QLCS',
};

// Coi 1 chuỗi name là "mã nội bộ" — không show cho user.
// Hiện tại match SEED-* hoặc các tên toàn dấu '-' viết tắt.
function looksLikeInternalCode(name: string | null | undefined): boolean {
  if (!name) return true;
  if (name.startsWith('SEED-')) return true;
  // Vd: 'AT-M-OP' — toàn chữ in hoa và dấu '-'
  if (/^[A-Z][A-Z0-9\-_]+$/.test(name)) return true;
  return false;
}

interface DisplayNameArgs {
  checklist_group?: string | null;
  checklist_type: string;
  shift_type?: string | null;
  template_name?: string | null;
  role_label?: string | null;
}

export function getChecklistDisplayName(args: DisplayNameArgs): string {
  const groupKey = normalizeGroupKey(args.checklist_group);
  const groupDisplay = groupLabelByKey(groupKey);

  const verb = TYPE_VERB[args.checklist_type];
  if (verb) return `${verb} - ${groupDisplay}`;

  // custom/khác — dùng title theo nhóm
  const dailyTitle = DAILY_TITLE_BY_GROUP[groupKey];
  if (dailyTitle) return `${dailyTitle} - ${groupDisplay}`;

  // Fallback: nếu template.name không phải mã nội bộ thì dùng
  if (!looksLikeInternalCode(args.template_name)) return args.template_name as string;
  if (args.role_label) return args.role_label;
  return groupDisplay || 'Checklist';
}

// Ca / chu kỳ hiển thị
export function getShiftDisplay(shift_type: string | null | undefined, checklist_group?: string | null): string {
  switch (shift_type) {
    case 'morning':   return 'Ca sáng (05:30 - 13:30)';
    case 'afternoon': return 'Ca chiều (13:30 - 21:30)';
    case 'evening':   return 'Ca tối';
    case 'night':     return 'Ca đêm';
    case 'allday': {
      // KT xử lý nước theo ca; còn lại theo ngày
      const key = normalizeGroupKey(checklist_group);
      if (key === 'ky-thuat-xu-ly-nuoc') return 'Theo ca';
      return 'Theo ngày';
    }
    default: return 'Tùy chỉnh';
  }
}

// Label "người thực hiện" theo nhóm (fallback khi chưa có actual_operator_name)
export function getOperatorLabel(args: {
  actual_operator_name?: string | null;
  assigned_display_name?: string | null;
  checklist_group?: string | null;
}): string {
  if (args.actual_operator_name && args.actual_operator_name.trim()) {
    return args.actual_operator_name;
  }
  if (args.assigned_display_name && args.assigned_display_name.trim()) {
    return args.assigned_display_name;
  }
  const key = normalizeGroupKey(args.checklist_group);
  return OPERATOR_BY_GROUP[key] || '—';
}

// Tên nhóm checklist dễ đọc (đã chuẩn hoá hyphen)
export function getGroupDisplay(checklist_group: string | null | undefined): string {
  return groupLabelByKey(normalizeGroupKey(checklist_group));
}

// ============================================================
// Audit log
// ============================================================
export interface AuditLogRow {
  id: string;
  instance_id: string;
  action: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export const AUDIT_ACTION_LABEL: Record<string, { label: string; emoji: string; cls: string }> = {
  check_item:   { label: 'Tick item',           emoji: '✓',  cls: 'bg-emerald-100 text-emerald-700' },
  uncheck_item: { label: 'Bỏ tick item',        emoji: '↶',  cls: 'bg-slate-100 text-slate-600' },
  submit:       { label: 'Gửi duyệt',           emoji: '→',  cls: 'bg-blue-100 text-blue-700' },
  approve:      { label: 'Duyệt',               emoji: '✅', cls: 'bg-emerald-100 text-emerald-700' },
  reject:       { label: 'Trả về',              emoji: '↩',  cls: 'bg-rose-100 text-rose-700' },
  upload_file:  { label: 'Upload bằng chứng',   emoji: '📎', cls: 'bg-amber-100 text-amber-700' },
  remove_file:  { label: 'Xoá file',            emoji: '🗑',  cls: 'bg-slate-100 text-slate-600' },
  reopen:       { label: 'Mở lại',              emoji: '↺',  cls: 'bg-purple-100 text-purple-700' },
};

export function getAuditActionMeta(action: string) {
  return AUDIT_ACTION_LABEL[action]
    || { label: action, emoji: '•', cls: 'bg-slate-100 text-slate-600' };
}
