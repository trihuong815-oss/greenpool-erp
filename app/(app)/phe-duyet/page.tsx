// V9.1 (2026-06-19): Trung tâm Phê duyệt — roadmap 9 hạng mục.
// Page placeholder hiển thị danh sách module sẽ tích hợp trong tương lai.
// Mỗi card 1 hạng mục với trạng thái + mô tả ngắn. Click chưa hoạt động (Soon).

import { canAccessRoute } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { AppTopBar } from '@/components/AppTopBar';
import {
  CheckSquare, Inbox, BarChart3, Receipt, ShoppingCart,
  UserPlus, CalendarOff, DollarSign, Target, Rocket,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

interface RoadmapItem {
  id: string;
  label: string;
  description: string;
  icon: typeof Inbox;
  status: 'live' | 'soon';
  /** Optional deeplink khi live — KHÔNG dùng cho card 'soon' (em chưa wire). */
  liveHref?: string;
}

const ROADMAP: RoadmapItem[] = [
  {
    id: 'de-xuat',
    label: 'Đề xuất',
    description: 'Phê duyệt đề xuất từ các phòng ban (chain duyệt v2.5 hiện có).',
    icon: Inbox,
    status: 'live',
    liveHref: '/de-xuat',
  },
  {
    id: 'dieu-chinh-doanh-so',
    label: 'Điều chỉnh doanh số',
    description: 'Duyệt yêu cầu sửa / huỷ giao dịch doanh số sau khi đã đối chiếu.',
    icon: BarChart3,
    status: 'soon',
  },
  {
    id: 'chi-phi',
    label: 'Chi phí',
    description: 'Duyệt chi phí vận hành cơ sở, sự kiện, marketing, đào tạo.',
    icon: Receipt,
    status: 'soon',
  },
  {
    id: 'mua-hang',
    label: 'Mua hàng',
    description: 'Duyệt đơn mua hoá chất, vật tư, thiết bị (purchase request).',
    icon: ShoppingCart,
    status: 'soon',
  },
  {
    id: 'tuyen-dung',
    label: 'Tuyển dụng',
    description: 'Duyệt offer letter, job opening, ngân sách tuyển dụng theo vị trí.',
    icon: UserPlus,
    status: 'soon',
  },
  {
    id: 'nghi-phep',
    label: 'Nghỉ phép',
    description: 'Duyệt đơn nghỉ phép, nghỉ không lương, đổi ca cho toàn nhân viên.',
    icon: CalendarOff,
    status: 'soon',
  },
  {
    id: 'luong',
    label: 'Lương',
    description: 'Duyệt bảng lương tháng, thưởng KPI, điều chỉnh lương cá nhân.',
    icon: DollarSign,
    status: 'soon',
  },
  {
    id: 'kpi',
    label: 'KPI',
    description: 'Duyệt thiết lập / điều chỉnh chỉ tiêu KPI cấp phòng / cá nhân.',
    icon: Target,
    status: 'soon',
  },
  {
    id: 'du-an',
    label: 'Dự án',
    description: 'Duyệt ngân sách, milestone, scope thay đổi của các dự án nội bộ.',
    icon: Rocket,
    status: 'soon',
  },
];

export default async function PheDuyetPage() {
  const { profile } = await requireAuthedProfile();
  if (!canAccessRoute(profile.roleCode, 'phe-duyet', profile.menuOverrides)) {
    return (
      <>
        <AppTopBar title="Phê duyệt" icon="checkSquare" />
        <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">🔒</div>
            <div className="font-bold text-slate-800 text-lg mb-2">Không có quyền truy cập</div>
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      <AppTopBar title="Phê duyệt" icon="checkSquare" />
      <div className="flex-1 p-3 md:p-6 bg-slate-50 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="card">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 ring-1 ring-emerald-200">
                <CheckSquare size={20} className="text-emerald-600" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-slate-800">Trung tâm Phê duyệt</h1>
                <p className="text-sm text-slate-600 mt-0.5">
                  Một nơi duy nhất để xử lý mọi yêu cầu cần phê duyệt từ các module. Hiện đã wire <strong>Đề xuất</strong>; các module còn lại đang trên roadmap.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {ROADMAP.map((item) => {
              const Icon = item.icon;
              const isLive = item.status === 'live';
              const Wrapper = ({ children }: { children: React.ReactNode }) =>
                isLive && item.liveHref ? (
                  <a
                    href={item.liveHref}
                    className="group block rounded-xl bg-white p-4 ring-1 ring-slate-200 hover:ring-emerald-300 hover:shadow-md transition"
                  >
                    {children}
                  </a>
                ) : (
                  <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200 opacity-90">
                    {children}
                  </div>
                );
              return (
                <Wrapper key={item.id}>
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ${
                        isLive
                          ? 'bg-emerald-50 ring-emerald-200 text-emerald-600'
                          : 'bg-slate-50 ring-slate-200 text-slate-500'
                      }`}
                    >
                      <Icon size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-bold text-slate-800 truncate">{item.label}</div>
                        <span
                          className={`shrink-0 text-xs uppercase font-semibold px-1.5 py-0.5 rounded ring-1 ${
                            isLive
                              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                              : 'bg-sky-50 text-sky-700 ring-sky-200'
                          }`}
                        >
                          {isLive ? 'Live' : 'Soon'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{item.description}</p>
                    </div>
                  </div>
                </Wrapper>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
