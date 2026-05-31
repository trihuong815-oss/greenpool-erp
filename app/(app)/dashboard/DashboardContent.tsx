'use client';

import Link from 'next/link';
import type { Facility, Task } from '@/lib/types';
import {
  Building2, BarChart3, ListChecks,
  TrendingUp, Clock, ShieldCheck, AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import { KTDashboardSection } from './KTDashboardSection';

interface RevenueSummary {
  year: number;
  month: number;
  yearActual: number;
  yearTarget: number;
  monthActual: number;
  monthTarget: number;
  branchCount: number;
}

interface TaskCounts {
  approvalNeeded: number;
  myPending: number;
  myInProgress: number;
  myDone: number;
  myTotal: number;
}

interface Props {
  roleCode: string;
  facilities: Facility[];
  tasks: Task[];
  taskCounts: TaskCounts;
  revenueSummary: RevenueSummary;
  visibleFacilities: string[];
  isAdmin: boolean;
  kyThuatSummary?: import('./data.kythuat').KyThuatSummary | null;
  ktVisibleBranchIds?: string[];
}

// KT-only roles (TP/PP/KT viên cơ sở) — không thấy module Doanh số.
const KT_ONLY_ROLES = new Set(['TP_KT', 'PP_HT', 'PP_XLN']);
function isKTOnly(role: string): boolean {
  if (KT_ONLY_ROLES.has(role)) return true;
  return /^KT_(HT|XLN)_/.test(role);
}
// KT-eligible (xem được khu KT dashboard).
function isKTViewer(role: string): boolean {
  if (isKTOnly(role)) return true;
  return role === 'ADMIN' || role === 'CEO' || role === 'GD_KD' || role === 'GD_VP';
}

export function DashboardContent({
  roleCode, facilities, taskCounts, revenueSummary,
  visibleFacilities, isAdmin,
  kyThuatSummary, ktVisibleBranchIds,
}: Props) {
  const showKT = isKTViewer(roleCode) && !!kyThuatSummary;
  const hideRevenue = isKTOnly(roleCode);

  return (
    <div className="space-y-5">
      {/* Brief banner */}
      <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 px-4 py-3">
        <div className="font-semibold text-slate-800">
          {isAdmin
            ? 'Toàn cụm 5 cơ sở'
            : visibleFacilities.length > 0
              ? 'Cơ sở của bạn'
              : 'Phạm vi cá nhân'}
        </div>
        <div className="text-xs text-slate-600 mt-0.5">
          Vai trò: <strong>{roleCode}</strong> · {visibleFacilities.length} cơ sở trong phạm vi
        </div>
      </div>

      {/* ===== 1. ẢNH CƠ SỞ ===== */}
      <SectionTitle icon={Building2} title="Cơ sở" count={visibleFacilities.length} />
      <div className="card">
        {(() => {
          const shown = facilities.filter((f) => visibleFacilities.includes(f.id));
          if (shown.length === 0) {
            return <div className="text-sm text-slate-400 italic py-6 text-center">Bạn chưa được gán cơ sở.</div>;
          }
          const gridCls =
            shown.length === 1 ? 'grid grid-cols-1 gap-4'
            : shown.length === 2 ? 'grid grid-cols-1 md:grid-cols-2 gap-4'
            : shown.length === 3 ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
            : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4';
          const cardSize: 'lg' | 'md' = shown.length <= 2 ? 'lg' : 'md';
          return (
            <div className={gridCls}>
              {shown.map((f) => <FacilityCard key={f.id} facility={f} size={cardSize} />)}
            </div>
          );
        })()}
      </div>

      {/* ===== 2. DOANH SỐ ===== (ẩn cho TP_KT / PP_HT / PP_XLN / KT viên cơ sở) */}
      {!hideRevenue && (<>
        <SectionTitle icon={BarChart3} title="Doanh số" subtitle={`Năm ${revenueSummary.year}`} />
        <RevenueSection r={revenueSummary} />
      </>)}

      {/* ===== KỸ THUẬT VẬN HÀNH ===== — TP_KT / PP / KT viên + ADMIN/CEO/GD */}
      {showKT && kyThuatSummary && (<>
        <SectionTitle icon={BarChart3} title="Kỹ thuật vận hành" subtitle={`Năm ${kyThuatSummary.year} · clo · axit · công suất máy`} />
        <KTDashboardSection
          summary={kyThuatSummary}
          visibleBranchIds={ktVisibleBranchIds ?? []}
          myRoleCode={roleCode}
        />
      </>)}

      {/* ===== 3. CÔNG VIỆC ===== */}
      <SectionTitle icon={ListChecks} title="Công việc" subtitle="Đề xuất · Nhiệm vụ · Giao việc" />
      <TasksSection counts={taskCounts} roleCode={roleCode} />
    </div>
  );
}

// ============================================================================
// REVENUE SECTION
// ============================================================================
function RevenueSection({ r }: { r: RevenueSummary }) {
  const yearRate = r.yearTarget > 0 ? Math.round((r.yearActual / r.yearTarget) * 100) : 0;
  const monthRate = r.monthTarget > 0 ? Math.round((r.monthActual / r.monthTarget) * 100) : 0;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <RevenueCard
        label={`Doanh số năm ${r.year}`}
        actual={r.yearActual}
        target={r.yearTarget}
        rate={yearRate}
        sub={`${r.branchCount} cơ sở · lũy kế từ đầu năm`}
        icon={TrendingUp}
      />
      <RevenueCard
        label={`Doanh số tháng ${r.month}/${r.year}`}
        actual={r.monthActual}
        target={r.monthTarget}
        rate={monthRate}
        sub="Tháng hiện tại"
        icon={Clock}
      />
      <div className="lg:col-span-2 text-right">
        <Link href="/doanh-so" className="text-xs text-emerald-700 hover:underline font-semibold">
          Xem dashboard doanh số chi tiết →
        </Link>
      </div>
    </div>
  );
}

function RevenueCard({ label, actual, target, rate, sub, icon: Icon }: {
  label: string; actual: number; target: number; rate: number; sub: string; icon: LucideIcon;
}) {
  const accent = rate >= 90 ? 'emerald' : rate >= 60 ? 'amber' : 'rose';
  const accentClass = {
    emerald: { ring: 'ring-emerald-200', text: 'text-emerald-700', bar: 'bg-emerald-500' },
    amber:   { ring: 'ring-amber-200',   text: 'text-amber-700',   bar: 'bg-amber-500' },
    rose:    { ring: 'ring-rose-200',    text: 'text-rose-700',    bar: 'bg-rose-500' },
  }[accent];
  const widthPct = Math.max(0, Math.min(rate, 100));
  return (
    <div className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{formatMoney(actual)}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            / mục tiêu <span className="font-semibold text-slate-700 tabular-nums">{target > 0 ? formatMoney(target) : '— chưa đặt'}</span>
          </div>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 ring-1 ${accentClass.ring} text-emerald-700 shrink-0`}>
          <Icon size={18} />
        </div>
      </div>
      {/* Bar */}
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
        <div className={`h-full ${accentClass.bar} transition-all`} style={{ width: `${widthPct}%` }} />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">{sub}</span>
        <span className={`font-bold tabular-nums ${accentClass.text}`}>{rate}%</span>
      </div>
    </div>
  );
}

// ============================================================================
// TASKS SECTION
// ============================================================================
// Tile click → mở /giao-viec với query param `focus=<type>` → GiaoViecClient tự chuyển tab + filter.
function TasksSection({ counts, roleCode }: { counts: TaskCounts; roleCode: string }) {
  const isApprover = ['ADMIN', 'CEO', 'GD_KD', 'GD_VP'].includes(roleCode);
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {isApprover && (
        <TaskTile
          icon={ShieldCheck}
          label="Chờ tôi duyệt"
          value={counts.approvalNeeded}
          accent={counts.approvalNeeded > 0 ? 'amber' : 'slate'}
          href="/giao-viec?focus=approval"
        />
      )}
      <TaskTile
        icon={ListChecks}
        label="Tôi đang được giao"
        value={counts.myTotal}
        sub={`${counts.myPending} chờ · ${counts.myInProgress} làm`}
        accent="emerald"
        href="/giao-viec?focus=received"
      />
      <TaskTile
        icon={Clock}
        label="Đang triển khai"
        value={counts.myInProgress}
        accent="sky"
        href="/giao-viec?focus=inprogress"
      />
      <TaskTile
        icon={AlertTriangle}
        label="Chờ xử lý"
        value={counts.myPending}
        accent={counts.myPending > 0 ? 'amber' : 'slate'}
        href="/giao-viec?focus=pending"
      />
      <div className="col-span-2 lg:col-span-4 text-right">
        <Link href="/giao-viec" className="text-xs text-emerald-700 hover:underline font-semibold">
          Xem chi tiết công việc →
        </Link>
      </div>
    </div>
  );
}

function TaskTile({ icon: Icon, label, value, sub, accent, href, onClick }: {
  icon: LucideIcon; label: string; value: number; sub?: string;
  accent: 'emerald' | 'sky' | 'amber' | 'rose' | 'slate'; href: string;
  /** Khi có onClick → click sẽ mở modal thay vì nhảy URL. href vẫn dùng cho long-press / fallback. */
  onClick?: () => void;
}) {
  const A = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-100' },
    sky:     { bg: 'bg-sky-50',     text: 'text-sky-700',     ring: 'ring-sky-100' },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   ring: 'ring-amber-100' },
    rose:    { bg: 'bg-rose-50',    text: 'text-rose-700',    ring: 'ring-rose-100' },
    slate:   { bg: 'bg-slate-50',   text: 'text-slate-600',   ring: 'ring-slate-100' },
  }[accent];
  const inner = (
    <>
      <div className="flex items-start justify-between mb-2">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ring-1 ${A.bg} ${A.text} ${A.ring}`}>
          <Icon size={16} />
        </div>
      </div>
      <div className="text-3xl font-bold tabular-nums text-slate-900 leading-tight">{value}</div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mt-0.5 truncate">{label}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-1 truncate">{sub}</div>}
    </>
  );
  const cls = 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md group text-left w-full';
  if (onClick) {
    return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
  }
  return <Link href={href} className={cls}>{inner}</Link>;
}

// ============================================================================
// SHARED HELPERS
// ============================================================================
function SectionTitle({ icon: Icon, title, subtitle, count }: {
  icon: LucideIcon; title: string; subtitle?: string; count?: number;
}) {
  return (
    <div className="flex items-end justify-between">
      <div className="flex items-center gap-2">
        <div className="h-7 w-1 rounded-full bg-gradient-to-b from-emerald-500 to-teal-600" />
        <Icon size={16} className="text-emerald-700" />
        <h2 className="text-sm font-bold text-emerald-900">{title}</h2>
        {count !== undefined && <span className="text-xs text-slate-500">({count})</span>}
      </div>
      {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
    </div>
  );
}

// Format đầy đủ — dấu chấm tách nghìn (vi-VN), KHÔNG rút gọn để sum khớp chính xác từng đồng.
function formatMoney(value: number): string {
  return value.toLocaleString('vi-VN');
}

/**
 * Ảnh thật của từng cơ sở — đặt trong /public/. Tên file Vietnamese OK, dùng encodeURI khi render.
 * Cơ sở có > 1 ảnh → tự crossfade qua lại bằng CSS animation.
 */
const BRANCH_PHOTOS: Record<string, string[]> = {
  HM:  ['/hoàng mai.png.jpg'],
  TK:  ['/thụy khuê.png.jpg'],
  CTT: ['/CTT.png', '/CTT.png.jpg'],
  '24': ['/24 NCT.png', '/24 NCT2.png.jpg'],
  TT:  ['/thanh trì.png'],
};

/** Ảnh fallback Unsplash — chỉ dùng khi không có ảnh thật. */
const UNSPLASH_FALLBACK: Record<string, string> = {
  HM:  'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=800&q=80',
  TK:  'https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=800&q=80',
  CTT: 'https://images.unsplash.com/photo-1572331165267-854da2b10ccc?auto=format&fit=crop&w=800&q=80',
  '24':'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=800&q=80',
  TT:  'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?auto=format&fit=crop&w=800&q=80',
};

function FacilityCard({ facility, size = 'md' }: { facility: Facility; size?: 'lg' | 'md' }) {
  const photos = (BRANCH_PHOTOS[facility.id] ?? []).map(encodeURI);
  const fallbackUrl = UNSPLASH_FALLBACK[facility.id] ?? '';
  // Lựa render: 0 ảnh → fallback Unsplash. 1 ảnh → static img. ≥2 ảnh → crossfade carousel.
  const localUrl = photos[0] ?? fallbackUrl;
  const aspectCls = size === 'lg' ? 'aspect-[21/9]' : 'aspect-[16/9]';
  const bodyCls = size === 'lg' ? 'p-4' : 'p-3';
  const titleCls = size === 'lg' ? 'text-base' : 'text-sm';
  return (
    <Link
      href={`/doanh-so?facility=${encodeURIComponent(facility.id)}`}
      className="group block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-emerald-300 hover:shadow-md"
    >
      <div
        className={`relative ${aspectCls} overflow-hidden`}
        style={{ background: `linear-gradient(135deg, ${facility.color}, ${facility.color}99)` }}
      >
        {photos.length >= 2 ? (
          // Carousel CSS-only: render N ảnh chồng nhau + animation xoay vòng cứ 5s.
          photos.map((src, i) => (
            <img
              key={src}
              src={src}
              alt={facility.name}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              style={{
                animation: `branchCarousel ${photos.length * 5}s ease-in-out infinite`,
                animationDelay: `${i * 5}s`,
                opacity: i === 0 ? 1 : 0,
              }}
              onError={(e) => {
                if (fallbackUrl && e.currentTarget.src !== fallbackUrl) e.currentTarget.src = fallbackUrl;
                else e.currentTarget.style.display = 'none';
              }}
            />
          ))
        ) : (
          <img
            src={localUrl}
            alt={facility.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => {
              const el = e.currentTarget;
              if (fallbackUrl && el.src !== fallbackUrl) el.src = fallbackUrl;
              else el.style.display = 'none';
            }}
          />
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/40 to-transparent" />
        <div
          className="absolute left-2 top-2 inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-bold text-white backdrop-blur-md ring-1 ring-white/40"
          style={{ backgroundColor: `${facility.color}cc` }}
        >
          {facility.id}
        </div>
      </div>
      <div className={bodyCls}>
        <div className={`font-semibold text-slate-900 ${titleCls} leading-tight truncate`}>
          {facility.name}
        </div>
        <div className="mt-0.5 text-xs text-slate-500 truncate">{facility.address}</div>
      </div>
    </Link>
  );
}

