// Templates hardcoded cho Checklist v2 (theo spec hình 2026-05-28).
// 3 role × 3 ca = 9 template.
// Items cố định — admin không config được (đơn giản, đồng nhất).

export type ChecklistRole = 'QLCS' | 'PP_XLN' | 'PP_HT';
export type ChecklistShift = 'morning' | 'afternoon' | 'evening';

export interface ChecklistTemplate {
  id: string;            // VD: 'QLCS_morning'
  role: ChecklistRole;
  shift: ChecklistShift;
  shiftLabel: string;    // hiển thị UI
  /** Giờ deadline để gửi (cho notification reminder). HHMM, 24h. */
  deadlineHour: number;
  deadlineMinute: number;
  items: { id: string; label: string }[];
}

// ─────────── QLCS — Quản lý cơ sở (cho 5 cơ sở) ───────────
const QLCS_MORNING: ChecklistTemplate = {
  id: 'QLCS_morning',
  role: 'QLCS', shift: 'morning',
  shiftLabel: 'Đầu ca sáng (5h30 — 8h)',
  deadlineHour: 8, deadlineMinute: 0,
  items: [
    { id: 'm1', label: 'Nhân sự đi làm đúng giờ' },
    { id: 'm2', label: 'Đồng phục đầy đủ' },
    { id: 'm3', label: 'Vệ sinh sảnh · quầy tiếp khách · quầy lễ tân' },
    { id: 'm4', label: 'Vệ sinh phòng thay đồ · sấy tóc · nhà tắm tráng' },
    { id: 'm5', label: 'Nhà vệ sinh' },
    { id: 'm6', label: 'Vệ sinh khu vực bể (chất lượng nước và vệ sinh quanh bể)' },
    { id: 'm7', label: 'Vệ sinh phòng tập' },
    { id: 'm8', label: 'Cứu hộ an toàn, đúng vị trí' },
  ],
};

const QLCS_AFTERNOON: ChecklistTemplate = {
  id: 'QLCS_afternoon',
  role: 'QLCS', shift: 'afternoon',
  shiftLabel: 'Đầu ca chiều (13h30)',
  deadlineHour: 14, deadlineMinute: 0,
  items: [
    { id: 'a1', label: 'Nhân sự đi làm đúng giờ' },
    { id: 'a2', label: 'Đồng phục đầy đủ' },
    { id: 'a3', label: 'Vệ sinh sảnh · quầy tiếp khách · quầy lễ tân' },
    { id: 'a4', label: 'Vệ sinh phòng thay đồ · sấy tóc · nhà tắm tráng' },
    { id: 'a5', label: 'Nhà vệ sinh' },
    { id: 'a6', label: 'Bể bơi' },
    { id: 'a7', label: 'Phòng tập' },
  ],
};

const QLCS_EVENING: ChecklistTemplate = {
  id: 'QLCS_evening',
  role: 'QLCS', shift: 'evening',
  shiftLabel: 'Cuối ca (21h30)',
  deadlineHour: 22, deadlineMinute: 0,
  items: [
    { id: 'e1', label: 'An toàn khách hàng' },
    { id: 'e2', label: 'Dọn dẹp · vệ sinh các khu vực sạch sẽ' },
    { id: 'e3', label: 'Tắt điện các khu' },
    { id: 'e4', label: 'Khoá cửa cẩn thận' },
  ],
};

// ─────────── PP_XLN — Phó phòng Xử lý nước (cross-branch) ───────────
const PP_XLN_MORNING: ChecklistTemplate = {
  id: 'PP_XLN_morning',
  role: 'PP_XLN', shift: 'morning',
  shiftLabel: 'Checklist đầu ngày (8h30)',
  deadlineHour: 9, deadlineMinute: 0,
  items: [
    { id: 'x1', label: 'Hút bể đúng giờ các cơ sở' },
    { id: 'x2', label: 'Thả hoá chất đúng giờ' },
    { id: 'x3', label: 'Đo · kiểm tra nước đúng giờ' },
    { id: 'x4', label: 'Kiểm tra báo cáo đầu ngày checklist của nhân sự' },
    { id: 'x5', label: 'Kiểm tra chạy máy và lượng hoá chất xử lý của từng bên' },
  ],
};

const PP_XLN_AFTERNOON: ChecklistTemplate = {
  id: 'PP_XLN_afternoon',
  role: 'PP_XLN', shift: 'afternoon',
  shiftLabel: 'Checklist giữa ca (13h30)',
  deadlineHour: 14, deadlineMinute: 0,
  items: [
    { id: 'xa1', label: 'Kiểm tra nồng độ hoá chất và chất lượng nước cơ sở Hoàng Mai' },
    { id: 'xa2', label: 'Kiểm tra nồng độ hoá chất và chất lượng nước cơ sở Thuỵ Khuê' },
    { id: 'xa3', label: 'Kiểm tra nồng độ hoá chất và chất lượng nước cơ sở 24 NCT' },
    { id: 'xa4', label: 'Kiểm tra nồng độ hoá chất và chất lượng nước cơ sở Thanh Trì' },
    { id: 'xa5', label: 'Kiểm tra nồng độ hoá chất và chất lượng nước cơ sở CTT Mỹ Đình' },
  ],
};

const PP_XLN_EVENING: ChecklistTemplate = {
  id: 'PP_XLN_evening',
  role: 'PP_XLN', shift: 'evening',
  shiftLabel: 'Checklist cuối ngày (21h30)',
  deadlineHour: 22, deadlineMinute: 0,
  items: [
    { id: 'xe1', label: 'Kiểm tra nồng độ hoá chất và chất lượng nước cơ sở Hoàng Mai' },
    { id: 'xe2', label: 'Kiểm tra nồng độ hoá chất và chất lượng nước cơ sở Thuỵ Khuê' },
    { id: 'xe3', label: 'Kiểm tra nồng độ hoá chất và chất lượng nước cơ sở 24 NCT' },
    { id: 'xe4', label: 'Kiểm tra nồng độ hoá chất và chất lượng nước cơ sở Thanh Trì' },
    { id: 'xe5', label: 'Kiểm tra nồng độ hoá chất và chất lượng nước cơ sở CTT Mỹ Đình' },
  ],
};

// ─────────── PP_HT — Phó phòng Hệ thống (cross-branch) ───────────
const PP_HT_MORNING: ChecklistTemplate = {
  id: 'PP_HT_morning',
  role: 'PP_HT', shift: 'morning',
  shiftLabel: 'Checklist đầu ngày (8h30)',
  deadlineHour: 9, deadlineMinute: 0,
  items: [
    { id: 'h1', label: 'Kiểm tra báo cáo checklist cơ sở Hoàng Mai' },
    { id: 'h2', label: 'Kiểm tra báo cáo checklist cơ sở Thuỵ Khuê' },
    { id: 'h3', label: 'Kiểm tra báo cáo checklist cơ sở Cung Thể Thao' },
    { id: 'h4', label: 'Kiểm tra báo cáo checklist cơ sở 24 NCT' },
    { id: 'h5', label: 'Kiểm tra báo cáo checklist cơ sở Thanh Trì' },
    { id: 'h6', label: 'Nhân sự đi làm đúng giờ' },
  ],
};

const PP_HT_AFTERNOON: ChecklistTemplate = {
  id: 'PP_HT_afternoon',
  role: 'PP_HT', shift: 'afternoon',
  shiftLabel: 'Checklist giữa ca (13h30)',
  deadlineHour: 14, deadlineMinute: 0,
  items: [
    { id: 'ha1', label: 'Kiểm tra báo cáo checklist cơ sở Hoàng Mai' },
    { id: 'ha2', label: 'Kiểm tra báo cáo checklist cơ sở Thuỵ Khuê' },
    { id: 'ha3', label: 'Kiểm tra báo cáo checklist cơ sở Cung Thể Thao' },
    { id: 'ha4', label: 'Kiểm tra báo cáo checklist cơ sở 24 NCT' },
    { id: 'ha5', label: 'Kiểm tra báo cáo checklist cơ sở Thanh Trì' },
  ],
};

const PP_HT_EVENING: ChecklistTemplate = {
  id: 'PP_HT_evening',
  role: 'PP_HT', shift: 'evening',
  shiftLabel: 'Checklist cuối ca (17h30)',
  deadlineHour: 18, deadlineMinute: 0,
  items: [
    { id: 'he1', label: 'Kiểm tra báo cáo checklist cơ sở Hoàng Mai' },
    { id: 'he2', label: 'Kiểm tra báo cáo checklist cơ sở Thuỵ Khuê' },
    { id: 'he3', label: 'Kiểm tra báo cáo checklist cơ sở Cung Thể Thao' },
    { id: 'he4', label: 'Kiểm tra báo cáo checklist cơ sở 24 NCT' },
    { id: 'he5', label: 'Kiểm tra báo cáo checklist cơ sở Thanh Trì' },
  ],
};

export const TEMPLATES_V2: ChecklistTemplate[] = [
  QLCS_MORNING, QLCS_AFTERNOON, QLCS_EVENING,
  PP_XLN_MORNING, PP_XLN_AFTERNOON, PP_XLN_EVENING,
  PP_HT_MORNING, PP_HT_AFTERNOON, PP_HT_EVENING,
];

export function getTemplate(role: ChecklistRole, shift: ChecklistShift): ChecklistTemplate | null {
  return TEMPLATES_V2.find((t) => t.role === role && t.shift === shift) ?? null;
}

export function templatesForRole(role: ChecklistRole): ChecklistTemplate[] {
  return TEMPLATES_V2.filter((t) => t.role === role);
}

/** Role của user từ roleCode (chuẩn hoá). null = không thuộc role nào trong v2. */
export function userRoleForChecklistV2(roleCode: string): ChecklistRole | null {
  if (/^QLCS_/.test(roleCode)) return 'QLCS';
  if (roleCode === 'PP_HT') return 'PP_HT';
  if (roleCode === 'PP_XLN') return 'PP_XLN';
  return null;
}

/** Label hiển thị cho role */
export const ROLE_LABEL_V2: Record<ChecklistRole, string> = {
  QLCS: 'Quản lý cơ sở',
  PP_HT: 'Phó phòng KT — Hệ thống',
  PP_XLN: 'Phó phòng KT — Xử lý nước',
};
