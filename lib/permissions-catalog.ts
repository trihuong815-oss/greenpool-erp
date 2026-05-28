// Catalog các quyền (module-level) — ADMIN dùng để cấp quyền per-user qua tab "Cấp quyền sử dụng".
// Mỗi item = 1 route. Override per user lưu ở `users/{uid}.menuOverrides`.
// Khi missing override → fall back vào MENU_PERMISSIONS theo role.

export type PermissionGroup =
  | 'common'      // Dashboard, sơ đồ, báo cáo — ai cũng nên có
  | 'sales'       // Doanh số, nhập số
  | 'ops'         // Checklist, quy trình, giao việc
  | 'department'  // Module phòng ban (đào tạo, MKT, kỹ thuật)
  | 'admin';      // Quản trị — packages, users, lương, quản lý sale

export interface PermissionItem {
  route: string;          // khớp key trong MENU_PERMISSIONS
  label: string;          // Hiển thị trong UI cấp quyền
  description: string;
  group: PermissionGroup;
  /** Cảnh báo khi bật quyền này cho non-admin (vd. xem lương). */
  sensitive?: boolean;
}

export const PERMISSION_GROUPS: { id: PermissionGroup; label: string; desc: string }[] = [
  { id: 'common',     label: 'Chung',           desc: 'Mọi nhân sự nên có để vận hành cơ bản' },
  { id: 'sales',      label: 'Doanh số',        desc: 'Module bán hàng / kinh doanh' },
  { id: 'ops',        label: 'Vận hành',        desc: 'Checklist · quy trình · giao việc' },
  { id: 'department', label: 'Phòng ban',       desc: 'Đào tạo · marketing · kỹ thuật' },
  { id: 'admin',      label: 'Quản trị',        desc: 'Cấp quản lý cao — chỉ cấp cẩn trọng' },
];

export const PERMISSION_CATALOG: PermissionItem[] = [
  // Common
  { route: 'dashboard',         label: 'Dashboard',                description: 'Tổng quan + KPI ngắn',                                           group: 'common' },
  { route: 'cong-viec-ca-nhan', label: 'Công việc cá nhân',        description: 'Không gian cá nhân — hồ sơ · task · lịch · AI (chỉ cấp quản lý)', group: 'common' },
  { route: 'sodo',              label: 'Sơ đồ tổ chức',            description: 'Cây tổ chức 5 cơ sở · 7 phòng ban',                                group: 'common' },
  { route: 'bao-cao',           label: 'Báo cáo',                  description: 'Tổng hợp báo cáo (chưa active)',                                   group: 'common' },

  // Sales
  { route: 'doanh-so',          label: 'Doanh số (xem)',           description: 'Bảng doanh số theo cơ sở',                                         group: 'sales' },
  { route: 'doanh-so/nhap',     label: 'Nhập doanh số',            description: 'Nhập/sửa entries · gói đã bán · chỉ tiêu',                         group: 'sales' },

  // Ops
  { route: 'checklist',         label: 'Checklist vận hành (v1)',  description: 'Bảng kiểm tra hằng ngày — module cũ',                              group: 'ops' },
  { route: 'checklist-v2',      label: 'Checklist vận hành (v2)',  description: 'QLCS + PP_HT + PP_XLN tick đảm bảo · ghi chú · gửi cấp trên',     group: 'ops' },
  { route: 'quy-trinh',         label: 'Quy trình',                description: 'Template checklist · CRUD theo phòng',                              group: 'ops' },
  { route: 'giao-viec',         label: 'Giao việc',                description: 'Tasks chung — đề xuất · nhiệm vụ',                                  group: 'ops' },

  // Department
  { route: 'ky-thuat',          label: 'Kỹ thuật vận hành',        description: 'Hoá chất · máy · giao việc kỹ thuật',                               group: 'department' },
  { route: 'daotao',            label: 'Đào tạo',                  description: 'Module đào tạo (chưa hoàn thiện)',                                   group: 'department' },
  { route: 'mkt',               label: 'Marketing',                description: 'Module marketing (chưa hoàn thiện)',                                 group: 'department' },

  // Admin
  { route: 'quan-ly-cong-viec', label: 'Quản lý công việc',        description: 'Theo dõi + duyệt tasks trong scope',                                group: 'admin' },
  { route: 'quan-ly-sale',      label: 'Quản lý NV Sale',          description: 'Thêm/đổi tên/tắt NV_SALE per cơ sở',                                group: 'admin', sensitive: true },
  { route: 'doanh-so/packages', label: 'Quản trị gói dịch vụ',     description: 'Catalog gói · bể bơi / phòng tập / member',                         group: 'admin', sensitive: true },
  { route: 'luong',             label: 'Lương 3P & KPI',           description: 'Bảng lương + KPI nhân viên',                                        group: 'admin', sensitive: true },
  { route: 'users',             label: 'Quản lý người dùng',       description: 'CRUD tài khoản · phân quyền',                                       group: 'admin', sensitive: true },
];

export function permissionByRoute(route: string): PermissionItem | undefined {
  return PERMISSION_CATALOG.find((p) => p.route === route);
}
