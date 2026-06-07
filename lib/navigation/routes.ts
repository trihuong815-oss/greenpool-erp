// Phase UI-3 (2026-06-07): central registry routes cho Command Palette + future
// breadcrumb/sitemap. Route slug khớp với lib/permissions.MENU_PERMISSIONS.
//
// Pattern: thêm route mới vào sidebar = thêm 1 entry ở đây để Cmd+K tự nhặt.
// Không pass LucideIcon ở đây để tránh RSC function-props bug (xem
// feedback_rsc_no_function_props memory). Dùng iconId string + map client-side.

export type IconId =
  | 'home' | 'message' | 'briefcase'
  | 'chart' | 'wrench' | 'check-square' | 'file-text' | 'list-todo'
  | 'users' | 'dollar'
  | 'file-bar' | 'grad-cap' | 'megaphone'
  | 'shield' | 'settings' | 'user-cog'
  | 'lock';

export interface NavRoute {
  /** Route slug — KHỚP với lib/permissions MENU_PERMISSIONS key. */
  route: string;
  /** Vietnamese label hiển thị. */
  label: string;
  /** Tiêu đề section trong sidebar (giúp Cmd+K group). */
  section: string;
  /** Từ khoá phụ để tìm — tiếng Việt không dấu / tiếng Anh / alias. */
  keywords: string[];
  /** Icon ID — map sang LucideIcon trong CommandPalette client component. */
  icon: IconId;
}

export const NAV_ROUTES: NavRoute[] = [
  // Tổng quan
  { route: 'dashboard',         section: 'Tổng quan', label: 'Dashboard',          icon: 'home',
    keywords: ['trang chu', 'home', 'tong quan', 'overview'] },
  { route: 'tin-nhan',          section: 'Tổng quan', label: 'Tin nhắn',           icon: 'message',
    keywords: ['chat', 'message', 'tro chuyen', 'zalo', 'nhan tin'] },
  { route: 'cong-viec-ca-nhan', section: 'Tổng quan', label: 'Công việc cá nhân', icon: 'briefcase',
    keywords: ['todo', 'task', 'cong viec', 'reminder', 'nhac viec'] },

  // Vận hành
  { route: 'doanh-so',          section: 'Vận hành', label: 'Doanh số (Dashboard)', icon: 'chart',
    keywords: ['sale', 'doanh thu', 'revenue', 'kpi', 'so lieu'] },
  { route: 'doanh-so/nhap',     section: 'Vận hành', label: 'Nhập doanh số',        icon: 'chart',
    keywords: ['nhap sale', 'data entry', 'nhap don', 'lead'] },
  { route: 'ky-thuat',          section: 'Vận hành', label: 'Kỹ thuật vận hành',    icon: 'wrench',
    keywords: ['ky thuat', 'tech', 'maintenance', 'hoa chat', 'may', 'so do be'] },
  { route: 'checklist-v2',      section: 'Vận hành', label: 'Checklist vận hành',   icon: 'check-square',
    keywords: ['checklist', 'kiem tra', 'task list', 'daily'] },
  { route: 'quy-trinh',         section: 'Vận hành', label: 'Quy trình phòng ban',  icon: 'file-text',
    keywords: ['quy trinh', 'sop', 'process', 'tai lieu'] },
  { route: 'giao-viec',         section: 'Vận hành', label: 'Nhiệm vụ · Giao việc · Đề xuất', icon: 'list-todo',
    keywords: ['task', 'giao viec', 'nhiem vu', 'de xuat', 'proposal', 'assignment'] },

  // Nhân sự & Lương
  { route: 'sodo',  section: 'Nhân sự', label: 'Sơ đồ tổ chức',  icon: 'users',
    keywords: ['org', 'so do', 'to chuc', 'nhan su', 'cay nhan vien'] },
  { route: 'luong', section: 'Nhân sự', label: 'Lương 3P & KPI',  icon: 'dollar',
    keywords: ['salary', 'luong', 'kpi', 'thuong', '3p', 'p1 p2 p3'] },

  // Báo cáo & Tích hợp
  { route: 'bao-cao', section: 'Báo cáo', label: 'Báo cáo tự động', icon: 'file-bar',
    keywords: ['bao cao', 'report', 'thong ke', 'tu dong'] },
  { route: 'daotao',  section: 'Báo cáo', label: 'Đào tạo (API)',    icon: 'grad-cap',
    keywords: ['training', 'dao tao', 'hoc', 'api'] },
  { route: 'mkt',     section: 'Báo cáo', label: 'Marketing (API)',  icon: 'megaphone',
    keywords: ['mkt', 'marketing', 'quang cao', 'api', 'campaign'] },

  // Cài đặt
  { route: 'bao-mat',            section: 'Cài đặt', label: 'Bảo mật & Thông báo', icon: 'shield',
    keywords: ['security', 'bao mat', '2fa', 'mfa', 'notification', 'fcm', 'thong bao'] },
  { route: 'doanh-so/packages',  section: 'Cài đặt', label: 'Cài đặt gói dịch vụ', icon: 'settings',
    keywords: ['package', 'goi', 'dich vu', 'price'] },
  { route: 'users',              section: 'Cài đặt', label: 'Cài đặt user',         icon: 'user-cog',
    keywords: ['user', 'nhan vien', 'role', 'phan quyen', 'staff'] },
  // Always-accessible
  { route: 'doi-mat-khau',       section: 'Cài đặt', label: 'Đổi mật khẩu',         icon: 'lock',
    keywords: ['password', 'mat khau', 'reset'] },
];

/** Chuẩn hoá string để fuzzy search: lowercase + bỏ dấu tiếng Việt. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

/** Search routes — return entries match query (label/keywords/section). */
export function searchRoutes(
  query: string,
  allowedRoutes: Set<string>,
): NavRoute[] {
  const q = normalize(query.trim());
  // Always allow doi-mat-khau (mọi user đều đổi được)
  const isAllowed = (r: NavRoute) =>
    r.route === 'doi-mat-khau' || allowedRoutes.has(r.route);

  if (!q) return NAV_ROUTES.filter(isAllowed);

  return NAV_ROUTES
    .filter(isAllowed)
    .filter((r) => {
      const haystack = [r.label, r.section, ...r.keywords].map(normalize).join(' ');
      return haystack.includes(q);
    });
}
