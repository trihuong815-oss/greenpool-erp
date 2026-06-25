'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { effectiveMenu } from '@/lib/permissions';
import {
  Home, CheckSquare, ListTodo, Inbox,
  Users, FileBarChart, GraduationCap, Megaphone, Settings, LogOut, UserCog, Wrench, X, Briefcase, ShieldCheck, Search,
  Sliders, Bell, Building2, Factory, Briefcase as BriefcaseBusiness, Rocket, ChevronDown,
  PencilLine, ClipboardCheck, CreditCard, TrendingUp, Tag, Calculator, BarChart3,
  History, Receipt,
  type LucideIcon,
} from 'lucide-react';
import { DispatchBadge } from './DispatchBadge';
import { ProposalsBadge } from './ProposalsBadge';
import { ChecklistBadge } from './ChecklistBadge';
import { TechWorkBadge } from './TechWorkBadge';
import { SalesV2Badge } from './SalesV2Badge';
import { useMobileNav } from './MobileNavContext';
import { useCommandPalette } from './ui/CommandPalette';

interface MenuItem {
  route: string;
  label: string;
  icon: LucideIcon;
  /** V9.0: badge nhỏ bên cạnh label. 'soon' = sắp ra mắt, 'wip' = đang phát triển. */
  badge?: 'soon' | 'wip';
  /** V9.0: sub-items cho menu nested (vd. Cơ sở > 5 chi nhánh). */
  children?: MenuItem[];
  /** V9.3 (2026-06-20): role explicit exclude — ẨN item BẤT KỂ children có visible
   *  (vd: KVP > Tài chính kế toán KHÔNG hiển thị cho Sale dù họ có share permission
   *  cong-no/tong-ket — đây là workflow-based separation). */
  hideForRoles?: string[];
  /** PR-IA1A (2026-06-22): inverse của hideForRoles — chỉ hiện item cho role list này.
   *  Dùng cho entry workflow-specific: vd "Đề xuất khuyến mãi" chỉ QLCS thấy,
   *  "Duyệt khuyến mãi" chỉ GD_KD/GD_VP thấy, "Cấu hình khuyến mãi" chỉ TP_KE/NV_KE.
   *  Cùng route + multiple entry → label khác theo workflow của role.
   *  Khi cùng route lặp lại trong children list, render key = `${route}_${label}` để
   *  tránh React duplicate key conflict. */
  showOnlyForRoles?: string[];
  /** PR-PROMO1A (2026-06-22): query string append vào href để auto-focus tab/filter
   *  đúng workflow theo role. Bao gồm dấu '?' (vd '?filter=proposal'). KHÔNG có
   *  queryParams thì link không thay đổi. Active state vẫn match theo route base. */
  queryParams?: string;
}

// PR-IA1A: helper render key cho item — bao gồm label để 2 entry cùng route
// (vd "Đề xuất khuyến mãi" vs "Duyệt khuyến mãi" → /chuong-trinh) không bị conflict key.
function menuItemKey(item: MenuItem): string {
  return `${item.route}__${item.label}`;
}

interface MenuSection {
  /** title rỗng = top-level item, không group. */
  title: string;
  items: MenuItem[];
}

// V9.0 Sidebar restructure (2026-06-19) — quy hoạch theo cấu trúc vận hành mới.
// Module hiện có map về vị trí mới. Module thừa (tin-nhan, giao-viec, quan-ly-cong-viec,
// quan-ly-sale, doanh-so V1, doanh-so/nhap V1) ẨN khỏi sidebar nhưng GIỮ route
// (truy cập qua URL trực tiếp + Cmd+K palette).
const MENU_SECTIONS: MenuSection[] = [
  // 1. DASHBOARD CEO — top-level single link (V9.1: route riêng /dashboard-ceo)
  {
    title: '',
    items: [
      { route: 'dashboard-ceo', label: 'Dashboard CEO', icon: Home, badge: 'wip' },
    ],
  },
  // 2. TRUNG TÂM ĐIỀU HÀNH
  {
    title: 'Trung tâm điều hành',
    items: [
      { route: 'cong-viec-ca-nhan', label: 'Công việc cá nhân',  icon: Briefcase },
      { route: 'dieu-phoi',         label: 'Điều phối công việc', icon: ListTodo },
      { route: 'de-xuat',           label: 'Đề xuất',             icon: Inbox },
      { route: 'phe-duyet',         label: 'Phê duyệt',           icon: CheckSquare, badge: 'wip' },
      { route: 'thong-bao',         label: 'Thông báo',           icon: Bell,        badge: 'wip' },
    ],
  },
  // 3. KHỐI KINH DOANH (V9.1: Cơ sở = single link → /co-so list page;
  //    V9.2: + "Doanh số" nested expandable cho Sale workflow)
  {
    title: 'Khối kinh doanh',
    items: [
      { route: 'co-so',    label: 'Cơ sở',               icon: Building2 },
      // V9.2: Doanh số = nested expandable. Sub-items chỉ show nếu có permission.
      // Parent route 'doanh-so-v2-kkd' chỉ là key cho React, không phải URL thực.
      {
        // PR-IA1A (2026-06-22): nhánh "Doanh số" KKD theo luồng nghiệp vụ Sale/QLCS/GD_KD.
        //   - hideForRoles: ẨN cho TP_KE/NV_KE (workflow kế toán → vào TCKT)
        //   - Children mở rộng: + Đối chiếu (QLCS), + Đề xuất KM (QLCS), + Duyệt KM (GD_KD)
        //   - 3 entry chung route /chuong-trinh nhưng label khác workflow:
        //     QLCS → "Đề xuất khuyến mãi"
        //     GD_KD → "Duyệt khuyến mãi"
        //     (TP_KE/NV_KE → "Cấu hình KM" trong TCKT, GD_VP → "Duyệt KM" trong TCKT)
        route: 'doanh-so-v2-kkd', label: 'Doanh số', icon: BarChart3,
        hideForRoles: ['TP_KE', 'NV_KE'],
        children: [
          { route: 'doanh-so-v2/nhap',         label: 'Nhập doanh số',           icon: PencilLine },
          { route: 'doanh-so-v2/doi-chieu',    label: 'Đối chiếu doanh số',      icon: ClipboardCheck },
          { route: 'doanh-so-v2/cong-no',      label: 'Công nợ bán hàng',        icon: CreditCard },
          { route: 'doanh-so-v2/tong-ket',     label: 'Tổng kết doanh số tháng', icon: TrendingUp },
          // PR-IA1A: 2 entry promo workflow-specific (cùng route, label khác)
          // PR-PROMO1A (2026-06-22): + queryParams auto-focus tab đúng workflow.
          { route: 'doanh-so-v2/chuong-trinh', label: 'Đề xuất khuyến mãi',      icon: Tag,
            queryParams: '?filter=proposal',
            showOnlyForRoles: ['QLCS_HM', 'QLCS_TK', 'QLCS_CTT', 'QLCS_24NCT', 'QLCS_TT'] },
          { route: 'doanh-so-v2/chuong-trinh', label: 'Duyệt khuyến mãi',        icon: CheckSquare,
            queryParams: '?filter=pending_approval&step=gd_kd',
            showOnlyForRoles: ['GD_KD'] },
          // PR-7A (2026-06-22): GD_KD chỉ thuộc KKD (KHÔNG có TCKT) — entry "Lịch sử thao tác" ở đây.
          // GD_VP/TP_KE entry ở TCKT. ADMIN/CEO/CHU_TICH entry ở TCKT (đã có nested expandable đầy đủ).
          { route: 'audit-history', label: 'Lịch sử thao tác', icon: History,
            showOnlyForRoles: ['GD_KD'] },
        ],
      },
      { route: 'mkt',      label: 'Marketing',           icon: Megaphone },
      { route: 'daotao',   label: 'Đào tạo',             icon: GraduationCap },
      { route: 'ky-thuat', label: 'Kỹ thuật vận hành',   icon: Wrench },
    ],
  },
  // 4. KHỐI VĂN PHÒNG (V9.2: Tài chính kế toán = nested expandable cho Kế toán workflow)
  {
    title: 'Khối văn phòng',
    items: [
      // Tài chính kế toán nested — 6 sub-tool, hiển thị theo permission.
      // Parent route 'tai-chinh-ke-toan' là key cho React, không phải URL thực.
      // V9.3: hideForRoles — Sale (NV_SALE/NV_SALE_PT) tuy có chia sẻ permission
      // cong-no + tong-ket nhưng KHÔNG thuộc workflow Kế toán → ẩn nhánh này.
      // Sale dùng KKD>Doanh số (3 sub) cho công việc daily.
      {
        // PR-IA1A (2026-06-22): nhánh TCKT theo luồng kế toán workflow.
        //   - hideForRoles: ẨN Sale + 5 QLCS (workflow KD → vào KKD>Doanh số)
        //                   + TP_GS (workflow giám sát → vào nhánh "Giám sát" riêng)
        //   - 3 entry promo workflow-specific:
        //     TP_KE/NV_KE → "Cấu hình khuyến mãi"
        //     GD_VP → "Duyệt khuyến mãi" (bước 2)
        //     ADMIN/CEO/CHU_TICH → "Chương trình KM" (toàn quyền)
        route: 'tai-chinh-ke-toan', label: 'Tài chính kế toán', icon: BriefcaseBusiness,
        hideForRoles: [
          'NV_SALE', 'NV_SALE_PT',
          'QLCS_HM', 'QLCS_TK', 'QLCS_CTT', 'QLCS_24NCT', 'QLCS_TT',
          'TP_GS',
        ],
        children: [
          { route: 'doanh-so-v2/doi-chieu',             label: 'Đối chiếu doanh số',     icon: ClipboardCheck },
          { route: 'doanh-so-v2/cong-no',               label: 'Công nợ phải thu',       icon: CreditCard },
          { route: 'doanh-so-v2/tong-ket',              label: 'Báo cáo doanh thu tháng', icon: TrendingUp },
          // PR-IA1A: 3 entry promo workflow-specific (cùng route, label khác theo role)
          // PR-PROMO1A (2026-06-22): + queryParams auto-focus workflow tab.
          // ADMIN/CEO/CHU_TICH KHÔNG có queryParams — vào /chuong-trinh xem overview.
          { route: 'doanh-so-v2/chuong-trinh',          label: 'Cấu hình khuyến mãi',    icon: Tag,
            queryParams: '?filter=approved&action=configure',
            showOnlyForRoles: ['TP_KE', 'NV_KE'] },
          { route: 'doanh-so-v2/chuong-trinh',          label: 'Duyệt khuyến mãi',       icon: CheckSquare,
            queryParams: '?filter=pending_approval&step=gd_vp',
            showOnlyForRoles: ['GD_VP'] },
          { route: 'doanh-so-v2/chuong-trinh',          label: 'Chương trình KM',        icon: Tag,
            showOnlyForRoles: ['ADMIN', 'CEO', 'CHU_TICH'] },
          { route: 'doanh-so-v2/quay-le-tan/nhap',      label: 'Quầy lễ tân — Nhập',     icon: Calculator },
          { route: 'doanh-so-v2/quay-le-tan/cau-hinh',  label: 'Quầy lễ tân — Cấu hình', icon: Sliders },
          // PR-CASH1C (2026-06-23): Editor Thu-Chi cơ sở.
          //   - NV_KE = primary editor (form nhập chi + nộp báo cáo).
          //   - TP_KE / QLCS_* / top role = view-only (server-enforced; UI ẩn form theo canEdit).
          //   - NV_SALE / TP_GS / THU_QUY: KHÔNG có permission → KHÔNG render entry.
          //     THU_QUY view màn Báo cáo thu-chi sẽ làm ở PR-CASH1D (route khác).
          { route: 'chi-phi-co-so',                     label: 'Chi phí cơ sở',          icon: Receipt },
          // PR-CASH1D (2026-06-23): View báo cáo thu-chi đã nộp.
          //   - THU_QUY/TP_KE/lãnh đạo (ADMIN/CEO/CHU_TICH/GD_KD/GD_VP) = view + TP_KE check/return.
          //   - TP_GS: parent hideForRoles=TP_GS → KHÔNG hiện ở đây; entry riêng dưới "Giám sát" bên dưới.
          //   - QLCS: parent hideForRoles=QLCS_* → KHÔNG hiện ở sidebar; URL trực tiếp vẫn vào (view own).
          { route: 'bao-cao-thu-chi',                   label: 'Báo cáo thu-chi',        icon: FileBarChart },
          // PR-7A (2026-06-22): TCKT thấy "Lịch sử thao tác" — TP_KE + top role (đã có permission).
          // GD_VP có entry này (cùng cấp với GD_KD). Sale/QLCS/TP_GS bị hideForRoles ở parent → KHÔNG thấy.
          { route: 'audit-history', label: 'Lịch sử thao tác', icon: History,
            showOnlyForRoles: ['TP_KE', 'ADMIN', 'CEO', 'CHU_TICH', 'GD_VP'] },
        ],
      },
      // PR-IA1A (2026-06-22): section "Giám sát" CHỈ cho TP_GS — read-only audit role.
      // Render trong cùng "Khối văn phòng" để không tạo section thứ 8 riêng.
      // PR-7A (2026-06-22): + "Lịch sử thao tác" — TP_GS audit log Sales V2 (read-only).
      // KHÔNG mở /chuong-trinh cho TP_GS trong PR-IA1A (chờ PR-PROMO1A harden UI read-only).
      // KHÔNG mở /cong-no /doi-chieu vì TP_GS chưa có permission (anh chốt KHÔNG sửa permission).
      {
        route: 'giam-sat-gs', label: 'Giám sát', icon: ClipboardCheck,
        showOnlyForRoles: ['TP_GS'],
        children: [
          { route: 'doanh-so-v2/tong-ket', label: 'Báo cáo doanh thu tháng', icon: TrendingUp },
          { route: 'audit-history',        label: 'Lịch sử thao tác',         icon: History },
          // PR-PROMO1B (2026-06-23): TP_GS giám sát KM đang áp dụng — read-only.
          // queryParams=?filter=active auto-focus tab "Đang áp dụng" (PR-PROMO1A).
          { route: 'doanh-so-v2/chuong-trinh', label: 'Khuyến mãi đang áp dụng', icon: Tag,
            queryParams: '?filter=active' },
          // PR-CASH1D (2026-06-23): TP_GS giám sát báo cáo thu-chi — read-only (server enforce).
          { route: 'bao-cao-thu-chi',      label: 'Báo cáo thu-chi',         icon: FileBarChart },
        ],
      },
      // Nhân sự → /sodo (sơ đồ tổ chức)
      { route: 'sodo',                  label: 'Nhân sự',           icon: Users },
      // Giám sát → /checklist-v2 (checklist là tool giám sát chính)
      { route: 'checklist-v2',          label: 'Giám sát',          icon: CheckSquare },
    ],
  },
  // 5. KHỐI DỰ ÁN (V9.1: + AI & Chuyển đổi số)
  {
    title: 'Khối dự án',
    items: [
      { route: 'du-an/erp',       label: 'ERP',                 icon: Rocket,  badge: 'soon' },
      { route: 'du-an/mo-co-so',  label: 'Mở cơ sở mới',        icon: Factory, badge: 'soon' },
      { route: 'du-an/dac-biet',  label: 'Dự án đặc biệt',      icon: Rocket,  badge: 'soon' },
      { route: 'du-an/ai',        label: 'AI & Chuyển đổi số',  icon: Sliders, badge: 'soon' },
    ],
  },
  // 6. BÁO CÁO & AI
  {
    title: 'Báo cáo & AI',
    items: [
      { route: 'bao-cao', label: 'Báo cáo tự động', icon: FileBarChart },
    ],
  },
  // 7. CÀI ĐẶT (V9.2: bỏ "Đơn giá lễ tân" — đã chuyển về TCKT nested)
  {
    title: 'Cài đặt',
    items: [
      { route: 'bao-mat',           label: 'Bảo mật & Thông báo',  icon: ShieldCheck },
      { route: 'doanh-so/packages', label: 'Gói dịch vụ',          icon: Settings },
      { route: 'users',             label: 'Tài khoản user',       icon: UserCog },
    ],
  },
];

interface SidebarProps {
  userName: string;
  userRole: string;
  roleCode: string;
  avatarUrl?: string | null;
  menuOverrides?: Record<string, boolean>;
}

export function Sidebar({ userName, userRole, roleCode, avatarUrl, menuOverrides }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { setOpen } = useMobileNav();
  const allowed = effectiveMenu(roleCode, menuOverrides);

  // V9.0: filter recursive (items + nested children) theo quyền, bỏ section/parent rỗng.
  // Parent item có children: hiển thị nếu CÓ ÍT NHẤT 1 child được phép, không cần parent route.
  // V9.3: + hideForRoles check (parent + child) — explicit ẨN cho role cụ thể bất kể permission.
  function filterItems(items: MenuItem[]): MenuItem[] {
    return items
      .map((it) => {
        // V9.3: explicit hide cho role (ưu tiên cao nhất)
        if (it.hideForRoles?.includes(roleCode)) return null;
        // PR-IA1A: showOnlyForRoles — chỉ hiện cho role list (inverse hide)
        if (it.showOnlyForRoles && !it.showOnlyForRoles.includes(roleCode)) return null;
        if (it.children && it.children.length > 0) {
          const visibleChildren = it.children.filter((c) => {
            if (c.hideForRoles?.includes(roleCode)) return false;
            if (c.showOnlyForRoles && !c.showOnlyForRoles.includes(roleCode)) return false;
            return allowed.has(c.route);
          });
          if (visibleChildren.length === 0) return null;
          return { ...it, children: visibleChildren };
        }
        return allowed.has(it.route) ? it : null;
      })
      .filter((it): it is MenuItem => it !== null);
  }
  const visibleSections: MenuSection[] = MENU_SECTIONS
    .map((s) => ({ ...s, items: filterItems(s.items) }))
    .filter((s) => s.items.length > 0);

  async function handleLogout() {
    // Phase 13.9.3 (2026-06-05): KHÔNG xoá FCM token khi logout — anh chốt rule
    // "bật noti là dùng mãi đến khi tắt". User chủ động tắt trong /bao-mat thì token mới bị xoá.
    // Logout chỉ clear session/auth, giữ token để login sau noti vẫn tới.
    // 1. SignOut Firebase client SDK (xóa trạng thái LOCAL persistence)
    //    → ngăn SessionRefresher tự tạo lại cookie
    try {
      const { getFirebaseClientAuth } = await import('@/lib/firebase/client');
      await getFirebaseClientAuth().signOut();
      try { localStorage.removeItem('gp_last_session_refresh'); } catch { /* ignore */ }
    } catch { /* ignore */ }
    // 2. Clear Firebase session cookie qua API route
    await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
    router.push('/login');
    router.refresh();
  }

  const initials = userName.split(' ').slice(-2).map(w => w[0]).join('').toUpperCase();

  return (
    <aside className="md:sticky md:top-0 flex h-screen w-[85vw] max-w-[300px] md:w-64 flex-col border-r border-slate-200 bg-white shadow-xl md:shadow-none">
      {/* Brand header */}
      <div className="border-b border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 px-4 py-5 relative">
        {/* Close button — chỉ hiển thị trên mobile khi sidebar ở drawer mode */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="md:hidden absolute top-2 right-2 flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-white active:bg-slate-200"
          aria-label="Đóng menu"
        >
          <X size={20} />
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-emerald-100 shrink-0">
            <img src="/logo.png" alt="Green Pool" className="h-[72px] w-[72px] object-contain" />
          </div>
          <div className="min-w-0">
            <div className="text-lg font-bold text-slate-900 leading-tight">Green Pool</div>
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mt-0.5">
              System
            </div>
          </div>
        </div>
      </div>

      {/* Phase UI-3.1 (2026-06-07): Cmd+K Spotlight trigger — desktop hiển thị shortcut hint, mobile vẫn click được */}
      <SidebarCommandTrigger />

      {/* Menu sections — V9.0: support nested children + Soon badge + title rỗng (top-level) */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {visibleSections.map((section, sIdx) => (
          <div key={section.title || `_top_${sIdx}`} className="mb-5 last:mb-0">
            {section.title && (
              <div className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                {section.title}
              </div>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) =>
                item.children && item.children.length > 0 ? (
                  <NestedMenuItem
                    key={menuItemKey(item)}
                    item={item}
                    pathname={pathname}
                    roleCode={roleCode}
                  />
                ) : (
                  <FlatMenuItem
                    key={menuItemKey(item)}
                    item={item}
                    pathname={pathname}
                    roleCode={roleCode}
                  />
                )
              )}
            </ul>
          </div>
        ))}
      </nav>

      {/* User footer — emerald brand đồng bộ với Green Pool System */}
      <div className="border-t border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 px-3 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <div className="flex items-center gap-2.5 rounded-lg bg-white p-2 ring-1 ring-emerald-100 shadow-sm">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={userName}
              className="h-9 w-9 rounded-full object-cover ring-2 ring-emerald-200 shadow-sm"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-teal-700 text-xs font-bold text-white shadow-sm">
              {initials}
            </div>
          )}
          {/* Tên + chức vụ đã chuyển lên menu tài khoản góc phải (tránh hiển thị trùng).
              Footer chỉ giữ avatar nhận diện + thao tác nhanh. */}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-semibold text-emerald-800 leading-tight">Đang đăng nhập</div>
            <Link href="/doi-mat-khau" className="text-[11px] font-medium text-emerald-600 hover:text-emerald-800 hover:underline">
              Hồ sơ &amp; mật khẩu
            </Link>
          </div>
          <button
            onClick={handleLogout}
            title="Đăng xuất"
            className="rounded-md p-1.5 text-emerald-600 transition hover:bg-rose-50 hover:text-rose-600"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

// V9.0 (2026-06-19): Badge "Soon"/"WIP" cho item placeholder/đang phát triển.
function ItemBadge({ kind }: { kind: 'soon' | 'wip' }) {
  const label = kind === 'soon' ? 'Soon' : 'WIP';
  const tone = kind === 'soon'
    ? 'bg-sky-50 text-sky-700 ring-sky-200'
    : 'bg-amber-50 text-amber-700 ring-amber-200';
  return (
    <span className={`ml-auto text-xs uppercase font-semibold px-1.5 py-0.5 rounded ring-1 ${tone}`}>
      {label}
    </span>
  );
}

// V9.0: Slot badge dynamic theo route (DispatchBadge, ProposalsBadge, ...).
// Tách helper để cả FlatMenuItem + NestedMenuItem dùng chung.
function RouteBadgeSlot({ route }: { route: string }) {
  if (route === 'dieu-phoi')           return <DispatchBadge />;
  if (route === 'de-xuat')             return <ProposalsBadge />;
  if (route === 'checklist-v2')        return <ChecklistBadge />;
  if (route === 'ky-thuat')            return <TechWorkBadge />;
  if (route === 'doanh-so-v2/nhap')    return <SalesV2Badge kind="submit" />;
  if (route === 'doanh-so-v2/doi-chieu') return <SalesV2Badge kind="review" />;
  return null;
}

// V9.0: Render 1 item link phẳng (không có children).
function FlatMenuItem({
  item,
  pathname,
  roleCode,
  indent = false,
}: {
  item: MenuItem;
  pathname: string;
  roleCode: string;
  indent?: boolean;
}) {
  const Icon = item.icon;
  const isActive =
    pathname === `/${item.route}` || pathname.startsWith(`/${item.route}/`);
  const tooltip =
    item.route === 'de-xuat' && (roleCode.startsWith('TP_') || roleCode.startsWith('QLCS_'))
      ? 'Xem đề xuất bạn tạo + đề xuất bạn được phê duyệt (theo khối của bạn)'
      : undefined;
  // PR-PROMO1A: append queryParams nếu có (workflow auto-focus). Active state vẫn
  // match theo pathname base — query không ảnh hưởng highlight.
  const href = item.queryParams ? `/${item.route}${item.queryParams}` : `/${item.route}`;
  return (
    <li>
      <Link
        href={href}
        aria-current={isActive ? 'page' : undefined}
        className={`group relative flex items-center gap-3 rounded-lg ${indent ? 'pl-9 pr-3' : 'px-3'} py-2 text-sm transition ${
          isActive
            ? 'bg-emerald-50 font-semibold text-emerald-800'
            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
        }`}
      >
        {isActive && (
          <span
            aria-hidden
            className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-gradient-to-b from-emerald-500 to-cyan-500"
          />
        )}
        <Icon
          className={`h-4 w-4 flex-shrink-0 ${
            isActive ? 'text-emerald-700' : 'text-slate-400 group-hover:text-slate-600'
          }`}
        />
        <span className="truncate" title={tooltip}>{item.label}</span>
        <RouteBadgeSlot route={item.route} />
        {item.badge && <ItemBadge kind={item.badge} />}
      </Link>
    </li>
  );
}

// V9.0: Render 1 item có children (nested expandable). Vd "Cơ sở > 5 chi nhánh".
// Auto-expanded nếu pathname trong children, else collapsed default. User toggle bằng chevron.
function NestedMenuItem({
  item,
  pathname,
  roleCode,
}: {
  item: MenuItem;
  pathname: string;
  roleCode: string;
}) {
  const Icon = item.icon;
  const childActive = (item.children ?? []).some(
    (c) => pathname === `/${c.route}` || pathname.startsWith(`/${c.route}/`),
  );
  const [open, setOpen] = useState<boolean>(childActive);
  // Sync open state khi pathname change (vd direct deeplink mở subroute → auto expand)
  useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive]);

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`group relative w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
          childActive
            ? 'text-emerald-800 font-semibold'
            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
        }`}
      >
        <Icon
          className={`h-4 w-4 flex-shrink-0 ${
            childActive ? 'text-emerald-700' : 'text-slate-400 group-hover:text-slate-600'
          }`}
        />
        <span className="truncate text-left flex-1">{item.label}</span>
        <ChevronDown
          size={14}
          className={`text-slate-400 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}
        />
      </button>
      {open && (
        <ul className="mt-0.5 space-y-0.5">
          {item.children?.map((c) => (
            <FlatMenuItem
              key={menuItemKey(c)}
              item={c}
              pathname={pathname}
              roleCode={roleCode}
              indent
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Phase UI-3.1: nút mở Cmd+K palette, hint shortcut desktop. Tách function để
 *  dùng useCommandPalette hook không pollute Sidebar render. */
function SidebarCommandTrigger() {
  const { toggle } = useCommandPalette();
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
    }
  }, []);
  return (
    <div className="px-3 pt-3">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-500 bg-slate-50 hover:bg-slate-100 rounded-lg ring-1 ring-slate-200 transition"
        aria-label="Tìm nhanh — Cmd K"
      >
        <Search size={14} className="text-slate-400" />
        <span className="flex-1 text-left">Tìm trang…</span>
        <kbd className="hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium text-slate-500 bg-white border border-slate-200 rounded">
          {isMac ? '⌘' : 'Ctrl'} K
        </kbd>
      </button>
    </div>
  );
}
