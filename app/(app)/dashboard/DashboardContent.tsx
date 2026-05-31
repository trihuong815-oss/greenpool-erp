'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Facility, Task } from '@/lib/types';
import {
  Building2, BarChart3, ListChecks,
  TrendingUp, Clock, ShieldCheck, AlertTriangle, X, Loader2, CalendarDays, ChevronRight,
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
type ModalKind = 'approval' | 'received' | 'pending' | 'inprogress';
interface TaskListItem {
  id: string;
  title: string;
  status: string;
  priority?: string;
  dueDate?: string | null;
  createdByName?: string;
}

function TasksSection({ counts, roleCode }: { counts: TaskCounts; roleCode: string }) {
  const isApprover = ['ADMIN', 'CEO', 'GD_KD', 'GD_VP'].includes(roleCode);
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [list, setList] = useState<TaskListItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch lazy khi modal mở
  useEffect(() => {
    if (!modal) { setList(null); return; }
    let cancelled = false;
    setLoading(true);
    setList(null);
    const apiMode = modal === 'approval' ? 'pending_approval' : 'assigned';
    fetch(`/api/tasks?mode=${apiMode}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const rows: TaskListItem[] = Array.isArray(j?.rows) ? j.rows : [];
        let filtered = rows;
        if (modal === 'pending') filtered = rows.filter((r) => r.status === 'pending');
        else if (modal === 'inprogress') filtered = rows.filter((r) => r.status === 'in_progress');
        setList(filtered);
      })
      .catch(() => { if (!cancelled) setList([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [modal]);

  const titles: Record<ModalKind, string> = {
    approval: '📋 Đề xuất / Nhiệm vụ chờ bạn duyệt',
    received: '📥 Tất cả nhiệm vụ bạn được giao',
    pending: '⏳ Nhiệm vụ chờ xử lý (bạn chưa bắt đầu)',
    inprogress: '🔄 Nhiệm vụ đang triển khai',
  };
  const subtitles: Record<ModalKind, string> = {
    approval: 'Click vào nhiệm vụ để mở chi tiết + duyệt/từ chối',
    received: 'Click vào nhiệm vụ để mở chi tiết',
    pending: 'Click vào nhiệm vụ để mở chi tiết + bắt đầu thực hiện',
    inprogress: 'Click vào nhiệm vụ để cập nhật tiến độ',
  };

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {isApprover && (
          <TaskTile icon={ShieldCheck} label="Chờ tôi duyệt" value={counts.approvalNeeded}
            accent={counts.approvalNeeded > 0 ? 'amber' : 'slate'}
            onClick={counts.approvalNeeded > 0 ? () => setModal('approval') : undefined}
            href="/giao-viec?focus=approval"
          />
        )}
        <TaskTile icon={ListChecks} label="Tôi đang được giao" value={counts.myTotal}
          sub={`${counts.myPending} chờ · ${counts.myInProgress} làm`} accent="emerald"
          onClick={counts.myTotal > 0 ? () => setModal('received') : undefined}
          href="/giao-viec?focus=received"
        />
        <TaskTile icon={Clock} label="Đang triển khai" value={counts.myInProgress} accent="sky"
          onClick={counts.myInProgress > 0 ? () => setModal('inprogress') : undefined}
          href="/giao-viec?focus=inprogress"
        />
        <TaskTile icon={AlertTriangle} label="Chờ xử lý" value={counts.myPending}
          accent={counts.myPending > 0 ? 'amber' : 'slate'}
          onClick={counts.myPending > 0 ? () => setModal('pending') : undefined}
          href="/giao-viec?focus=pending"
        />
        <div className="col-span-2 lg:col-span-4 text-right">
          <Link href="/giao-viec" className="text-xs text-emerald-700 hover:underline font-semibold">
            Xem chi tiết công việc →
          </Link>
        </div>
      </div>

      {/* Modal hiện danh sách task khi click tile có value > 0 */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-5 py-3 border-b border-slate-200 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-800 text-sm">
                  {titles[modal]} <span className="text-slate-400 font-normal">({list?.length ?? 0})</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">{subtitles[modal]}</p>
              </div>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-600 -mt-1"><X size={20} /></button>
            </div>
            {/* Body */}
            <div className="flex-1 overflow-y-auto px-3 py-2 bg-slate-50/40">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
                  <Loader2 size={18} className="animate-spin mr-2" /> Đang tải…
                </div>
              ) : !list || list.length === 0 ? (
                <div className="text-center text-slate-400 py-16 text-sm">Không có nhiệm vụ nào.</div>
              ) : (
                <ul className="space-y-1.5">
                  {list.map((t) => (
                    <Link
                      key={t.id}
                      href={`/giao-viec?taskId=${encodeURIComponent(t.id)}`}
                      onClick={() => setModal(null)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white border border-slate-200 hover:border-emerald-300 hover:shadow-sm transition"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-slate-800 truncate">{t.title}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                          {t.dueDate && <span className="inline-flex items-center gap-1"><CalendarDays size={11} />{t.dueDate}</span>}
                          {t.priority && <span>Ưu tiên: {t.priority}</span>}
                          {t.createdByName && <span>· bởi {t.createdByName}</span>}
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-slate-300 flex-shrink-0" />
                    </Link>
                  ))}
                </ul>
              )}
            </div>
            {/* Footer */}
            <div className="px-5 py-2.5 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
              <span className="text-[11px] text-slate-400">Click một mục để mở chi tiết</span>
              <Link href={`/giao-viec?focus=${modal}`} className="text-xs text-emerald-700 hover:underline font-semibold" onClick={() => setModal(null)}>
                Mở trang Giao việc →
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
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

