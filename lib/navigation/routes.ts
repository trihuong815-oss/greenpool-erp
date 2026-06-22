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
  | 'lock'
  // V9.0 sidebar restructure (2026-06-19)
  | 'bell' | 'building' | 'factory' | 'rocket' | 'inbox';

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

  // V9.0 sidebar restructure (2026-06-19) — routes mới
  // V9.1 (2026-06-19): bỏ 5 per-branch routes (co-so/HM, co-so/TK,...) — dùng single 'co-so'.
  //                    + dashboard-ceo (route riêng, không dùng chung /dashboard).
  //                    + du-an/ai (AI & Chuyển đổi số).

  // Dashboard CEO — route riêng, anchor kiến trúc ERP tương lai
  { route: 'dashboard-ceo',      section: 'Dashboard CEO', label: 'Dashboard CEO', icon: 'home',
    keywords: ['dashboard ceo', 'ceo', 'tong quan ceo', 'kpi ceo', 'overview'] },

  // Trung tâm điều hành
  // V9.3 (2026-06-20): + dieu-phoi + de-xuat (Sidebar có entry nhưng NAV_ROUTES
  // thiếu — user không tìm được qua Cmd+K. Route legacy giao-viec sai navigate).
  { route: 'dieu-phoi',          section: 'Trung tâm điều hành', label: 'Điều phối công việc', icon: 'list-todo',
    keywords: ['dieu phoi', 'dispatch', 'cong viec', 'giao viec', 'task assignment', 'phan cong'] },
  { route: 'de-xuat',            section: 'Trung tâm điều hành', label: 'Đề xuất',             icon: 'inbox',
    keywords: ['de xuat', 'proposal', 'request', 'xin duyet', 'kien nghi', 'approval request'] },
  { route: 'phe-duyet',          section: 'Trung tâm điều hành', label: 'Phê duyệt',     icon: 'check-square',
    keywords: ['phe duyet', 'approval', 'approve', 'duyet', 'review'] },
  { route: 'thong-bao',          section: 'Trung tâm điều hành', label: 'Thông báo',     icon: 'bell',
    keywords: ['thong bao', 'notification', 'noti', 'bell', 'alert', 'notification center'] },

  // Khối kinh doanh > Cơ sở (single route, list page + dynamic dashboard per branch)
  { route: 'co-so',              section: 'Cơ sở', label: 'Danh sách cơ sở',       icon: 'building',
    keywords: ['co so', 'branch', 'facility', 'chi nhanh', 'tk', 'hm', 'ctt', '24', 'tt', 'thuy khue', 'hoang mai', 'cung the thao', 'nguyen co thach', 'thanh tri'] },

  // Khối dự án
  { route: 'du-an/erp',          section: 'Khối dự án', label: 'Dự án ERP',                icon: 'rocket',
    keywords: ['du an', 'erp', 'project', 'system'] },
  { route: 'du-an/mo-co-so',     section: 'Khối dự án', label: 'Mở cơ sở mới',             icon: 'factory',
    keywords: ['du an', 'mo co so', 'new branch', 'expand'] },
  { route: 'du-an/dac-biet',     section: 'Khối dự án', label: 'Dự án đặc biệt',           icon: 'rocket',
    keywords: ['du an', 'dac biet', 'special', 'rnd', 'r&d'] },
  { route: 'du-an/ai',           section: 'Khối dự án', label: 'AI & Chuyển đổi số',       icon: 'settings',
    keywords: ['du an', 'ai', 'chuyen doi so', 'digital transformation', 'cds'] },

  // V9.2 (2026-06-19): doanh-so-v2 sub-tools cho Cmd+K (sidebar đã có entry nested,
  // bổ sung registry để user search nhanh).
  { route: 'doanh-so-v2/nhap',                   section: 'Doanh số', label: 'Nhập doanh số (V2)',     icon: 'chart',
    keywords: ['nhap doanh so', 'sale v2', 'daily batch', 'nv sale', 'sale entry'] },
  { route: 'doanh-so-v2/doi-chieu',              section: 'Tài chính kế toán', label: 'Đối chiếu doanh số', icon: 'check-square',
    keywords: ['doi chieu', 'reconcile', 'ke toan duyet', 'review batch'] },
  // PR-NAV1A (2026-06-22): label trong Cmd+K dùng tên TCKT (góc nhìn kế toán —
  // phục vụ nhiều role + chuẩn nghiệp vụ). Keywords mở rộng để Cmd+K vẫn tìm
  // được cả tên cũ + tên KKD mới ("công nợ bán hàng" / "tổng kết doanh số").
  { route: 'doanh-so-v2/cong-no',                section: 'Tài chính kế toán', label: 'Công nợ phải thu',           icon: 'dollar',
    keywords: ['cong no', 'cong no ban hang', 'cong no phai thu', 'debt', 'khach no', 'receivable', 'no con lai'] },
  { route: 'doanh-so-v2/tong-ket',               section: 'Tài chính kế toán', label: 'Báo cáo doanh thu tháng',    icon: 'chart',
    keywords: ['bao cao doanh thu', 'tong ket', 'tong ket thang', 'tong ket doanh so', 'doanh thu thang', 'monthly summary', 'kpi thang', 'thong ke', 'report'] },
  // PR-IA1A (2026-06-22): /chuong-trinh có nhiều entry sidebar theo workflow:
  //   QLCS → "Đề xuất khuyến mãi"; GD_KD/GD_VP → "Duyệt khuyến mãi";
  //   TP_KE/NV_KE → "Cấu hình khuyến mãi"; ADMIN/CEO/CHU_TICH → "Chương trình KM".
  // Cmd+K hiện 1 label trung tính + keywords đủ cho mọi cách gọi.
  { route: 'doanh-so-v2/chuong-trinh',           section: 'Tài chính kế toán', label: 'Chương trình KM',   icon: 'megaphone',
    keywords: ['chuong trinh', 'chuong trinh km', 'promo', 'km', 'khuyen mai', 'giam gia',
               'de xuat khuyen mai', 'de xuat km', 'duyet khuyen mai', 'duyet km',
               'cau hinh khuyen mai', 'cau hinh km', 'approve promo', 'submit promo'] },
  { route: 'doanh-so-v2/quay-le-tan/nhap',       section: 'Tài chính kế toán', label: 'Quầy lễ tân — Nhập', icon: 'chart',
    keywords: ['quay le tan', 'le tan', 'reception', 'cashier', 'walk-in', 'walkin', 'quay le tan nhap', 'quầy lễ tân nhập'] },
  { route: 'doanh-so-v2/quay-le-tan/cau-hinh',   section: 'Tài chính kế toán', label: 'Quầy lễ tân — Cấu hình', icon: 'settings',
    keywords: ['quay le tan cau hinh', 'le tan price', 'reception config', 'don gia le tan'] },
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
