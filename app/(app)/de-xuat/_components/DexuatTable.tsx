'use client';

// /de-xuat V3 — DexuatTable
// SPEC anh chốt 2026-05-31:
//   - 8 tabs (Tất cả · Tôi tạo · Chờ tôi duyệt · Đang xem xét · YCBS · Đã duyệt · Đã chuyển điều phối · Quá SLA)
//   - Filter row: search + 4 select (kind · status · khối · budget tier)
//   - Bảng 12 cột (sticky header bg-slate-50) — tabular-nums right-align cho số
//   - SLA tự tính từ updatedAt + slaHours theo role approver hiện tại; quá hạn → rose bold
//   - 7 hành động dropdown per row (ẩn theo quyền):
//       Xem · Duyệt · Đồng ý nguyên tắc · YCBS · Từ chối · Chuyển điều phối · Đóng hồ sơ
//   - Pagination footer (X-Y/Z + 1..N + per-page select)
// Tái sử dụng type ProposalV3 + label/color maps trong ./types (đã V3).
// KHÔNG đụng /giao-viec /dieu-phoi /doanh-so /checklist.

import { useMemo, useState, useEffect, useRef } from 'react';
import {
  Search,
  Inbox,
  FilePlus2,
  UserCheck,
  Clock,
  AlertCircle,
  CheckCircle2,
  Send,
  AlarmClock,
  MoreHorizontal,
  Eye,
  ThumbsUp,
  ShieldCheck,
  RotateCcw,
  XCircle,
  ArrowRightCircle,
  Archive,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  PROPOSAL_STATUS_LABEL,
  PROPOSAL_STATUS_COLOR,
  PROPOSAL_KIND_LABEL,
  PROPOSAL_KIND_COLOR,
  SLA_HOURS,
  type ProposalStatus,
  type ProposalKind,
  type ProposalV3,
  type ApproverStep,
} from './types';

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────
type TabKey =
  | 'all'
  | 'mine'
  | 'pending_me'
  | 'dang_xem_xet'
  | 'ycbs'
  | 'da_duyet'
  | 'chuyen_dieu_phoi'
  | 'qua_sla';

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'all',              label: 'Tất cả',              icon: Inbox },
  { key: 'mine',             label: 'Tôi tạo',             icon: FilePlus2 },
  { key: 'pending_me',       label: 'Chờ tôi duyệt',       icon: UserCheck },
  { key: 'dang_xem_xet',     label: 'Đang xem xét',        icon: Clock },
  { key: 'ycbs',             label: 'Yêu cầu bổ sung',     icon: AlertCircle },
  { key: 'da_duyet',         label: 'Đã duyệt',            icon: CheckCircle2 },
  { key: 'chuyen_dieu_phoi', label: 'Đã chuyển điều phối', icon: Send },
  { key: 'qua_sla',          label: 'Quá SLA',             icon: AlarmClock },
];

const BLOCK_LABEL: Record<string, string> = {
  KD: 'Khối Kinh doanh',
  VP: 'Khối Văn phòng',
  cross: 'Liên khối',
};

// Budget tiers — sẽ tách ra _lib/budget-config.ts ở task khác
const BUDGET_TIERS: { key: string; label: string; min: number; max: number }[] = [
  { key: 'tier_0',     label: '0 đ (không chi phí)', min: 0,             max: 0 },
  { key: 'tier_lt10',  label: '< 10 triệu',          min: 1,             max: 10_000_000 - 1 },
  { key: 'tier_10_50', label: '10 – 50 triệu',       min: 10_000_000,    max: 50_000_000 },
  { key: 'tier_gt50',  label: '> 50 triệu',          min: 50_000_001,    max: Number.MAX_SAFE_INTEGER },
];

// SLA mặc định theo role approver hiện tại (giờ) — theo SPEC
function slaHoursForRole(roleCode?: string): number {
  const r = (roleCode || '').toUpperCase();
  if (r.includes('CEO') || r.includes('CHU_TICH')) return SLA_HOURS.ceo;
  if (r.includes('GD') || r.includes('GĐ')) return SLA_HOURS.gd;
  if (r.includes('TP') || r.includes('QLCS')) return SLA_HOURS.tp;
  return SLA_HOURS.tp;
}

// Format VND raw (đ / Tr / Tỷ tuỳ ngưỡng)
function formatVNDRaw(value: number | undefined | null): string {
  if (value == null || isNaN(value as number)) return '—';
  if (value === 0) return '0 đ';
  if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(2) + ' Tỷ';
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1).replace(/\.0$/, '') + ' Tr';
  return value.toLocaleString('vi-VN') + ' đ';
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

// ── SLA tính từ updatedAt + slaHours theo role approver hiện tại ─────────────
interface SLAInfo {
  totalH: number;
  remainingH: number; // > 0: còn lại, < 0: quá hạn
  ratio: number;      // 1 = đầy, 0 = hết hạn, < 0 = quá
  overdue: boolean;
}
function computeSLA(p: ProposalV3): SLAInfo | null {
  // Đã kết thúc → không tính SLA
  if (p.status === 'da_phe_duyet' || p.status === 'tu_choi' ||
      p.status === 'chuyen_dieu_phoi' || p.status === 'nhap' ||
      p.status === 'dong_ho_so') {
    return null;
  }
  const baseIso = p.updatedAt || p.createdAt;
  if (!baseIso) return null;
  const base = new Date(baseIso).getTime();
  if (isNaN(base)) return null;
  const now = Date.now();
  const elapsedH = (now - base) / 3_600_000;
  const currStep = p.approverChain[p.approverIdx];
  const totalH = slaHoursForRole(currStep?.roleCode);
  const remainingH = totalH - elapsedH;
  return {
    totalH,
    remainingH,
    ratio: remainingH / totalH,
    overdue: remainingH < 0,
  };
}

// Helper xác định approver hiện tại có phải mình không
function isCurrentApproverMe(p: ProposalV3, uid: string): boolean {
  const step = p.approverChain[p.approverIdx];
  return !!step && step.uid === uid;
}

function tabsContaining(p: ProposalV3): TabKey[] {
  const tabs: TabKey[] = ['all'];
  if (p.status === 'dang_xem_xet') tabs.push('dang_xem_xet');
  if (p.status === 'yeu_cau_bo_sung') tabs.push('ycbs');
  if (p.status === 'da_phe_duyet' || p.status === 'dong_y_nguyen_tac') tabs.push('da_duyet');
  if (p.status === 'chuyen_dieu_phoi') tabs.push('chuyen_dieu_phoi');
  const sla = computeSLA(p);
  if (sla?.overdue) tabs.push('qua_sla');
  return tabs;
}

// ──────────────────────────────────────────────────────────────────────────────
// Per-action visibility
// ──────────────────────────────────────────────────────────────────────────────
function canApprove(p: ProposalV3, uid: string): boolean {
  return isCurrentApproverMe(p, uid) &&
    (p.status === 'da_gui' || p.status === 'dang_xem_xet' || p.status === 'yeu_cau_bo_sung');
}
function canConvert(p: ProposalV3, uid: string, role: string): boolean {
  if (p.status !== 'da_phe_duyet') return false;
  if (!p.createCoordAfter) return false;
  if (p.linkedCoordTaskId) return false;
  const r = (role || '').toUpperCase();
  return p.creatorUid === uid || r.includes('GD') || r.includes('GĐ') || r.includes('CEO') || r.includes('QLCS');
}
function canClose(p: ProposalV3, uid: string, role: string): boolean {
  if (p.status === 'nhap' || p.status === 'dong_ho_so') return false;
  if (p.status === 'chuyen_dieu_phoi' || p.status === 'tu_choi' || p.status === 'da_phe_duyet') {
    const r = (role || '').toUpperCase();
    return p.creatorUid === uid || r.includes('CEO') || r.includes('GD') || r.includes('GĐ');
  }
  return false;
}

// ──────────────────────────────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────────────────────────────
export type ActionKey =
  | 'view'
  | 'approve'
  | 'approve_principle'
  | 'request_revision'
  | 'reject'
  | 'convert_coord'
  | 'close';

export interface DexuatTableProps {
  proposals: ProposalV3[];
  currentUserUid: string;
  currentUserRole: string;
  onRowClick: (p: ProposalV3) => void;
  onAction?: (action: ActionKey, id: string) => void;
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────
function DexuatTable(props: DexuatTableProps) {
  const { proposals, currentUserUid, currentUserRole, onRowClick, onAction } = props;

  const [tab, setTab] = useState<TabKey>('all');
  const [keyword, setKeyword] = useState('');
  const [filterKind, setFilterKind] = useState<'all' | ProposalKind>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | ProposalStatus>('all');
  const [filterBlock, setFilterBlock] = useState<'all' | 'KD' | 'VP' | 'cross'>('all');
  const [filterBudget, setFilterBudget] = useState<string>('all');

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  // ── Count badge theo từng tab ────────────────────────────────────────────
  const tabCounts = useMemo(() => {
    const c: Record<TabKey, number> = {
      all: 0, mine: 0, pending_me: 0, dang_xem_xet: 0,
      ycbs: 0, da_duyet: 0, chuyen_dieu_phoi: 0, qua_sla: 0,
    };
    for (const p of proposals) {
      const tabs = tabsContaining(p);
      for (const t of tabs) c[t] += 1;
      if (p.creatorUid === currentUserUid) c.mine += 1;
      if (isCurrentApproverMe(p, currentUserUid) &&
          (p.status === 'da_gui' || p.status === 'dang_xem_xet' || p.status === 'yeu_cau_bo_sung')) {
        c.pending_me += 1;
      }
    }
    return c;
  }, [proposals, currentUserUid]);

  // ── Filter pipeline ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return proposals.filter((p) => {
      // Tab
      if (tab === 'mine' && p.creatorUid !== currentUserUid) return false;
      if (tab === 'pending_me') {
        if (!isCurrentApproverMe(p, currentUserUid)) return false;
        if (!(p.status === 'da_gui' || p.status === 'dang_xem_xet' || p.status === 'yeu_cau_bo_sung')) return false;
      }
      if (tab !== 'all' && tab !== 'mine' && tab !== 'pending_me') {
        const tabs = tabsContaining(p);
        if (!tabs.includes(tab)) return false;
      }
      // Filters
      if (filterKind !== 'all' && p.kind !== filterKind) return false;
      if (filterStatus !== 'all' && p.status !== filterStatus) return false;
      if (filterBlock !== 'all' && p.relatedBlock !== filterBlock) return false;
      if (filterBudget !== 'all') {
        const tier = BUDGET_TIERS.find((b) => b.key === filterBudget);
        const cost = p.estimatedCost ?? 0;
        if (tier && (cost < tier.min || cost > tier.max)) return false;
      }
      // Keyword
      if (kw) {
        const hay = `${p.title} ${p.code} ${p.creatorName}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [proposals, tab, filterKind, filterStatus, filterBlock, filterBudget, keyword, currentUserUid]);

  // Reset page khi filter đổi
  useEffect(() => { setPage(1); }, [tab, filterKind, filterStatus, filterBlock, filterBudget, keyword]);

  const totalPage = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPage);
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * perPage, safePage * perPage),
    [filtered, safePage, perPage],
  );

  return (
    <div className="space-y-3">
      {/* ── Tabs row ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0">
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          const badge = tabCounts[key];
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`relative inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                active
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-600 hover:text-slate-800'
              }`}
            >
              <Icon size={14} /> {label}
              {badge > 0 && (
                <span
                  className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Filter row ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Tìm theo mã / tiêu đề / người tạo…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white"
          />
        </div>
        <select
          value={filterKind}
          onChange={(e) => setFilterKind(e.target.value as any)}
          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-emerald-500"
        >
          <option value="all">Tất cả loại</option>
          {(Object.keys(PROPOSAL_KIND_LABEL) as ProposalKind[]).map((k) => (
            <option key={k} value={k}>{PROPOSAL_KIND_LABEL[k]}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as any)}
          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-emerald-500"
        >
          <option value="all">Tất cả trạng thái</option>
          {(Object.keys(PROPOSAL_STATUS_LABEL) as ProposalStatus[]).map((s) => (
            <option key={s} value={s}>{PROPOSAL_STATUS_LABEL[s]}</option>
          ))}
        </select>
        <select
          value={filterBlock}
          onChange={(e) => setFilterBlock(e.target.value as any)}
          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-emerald-500"
        >
          <option value="all">Tất cả khối</option>
          <option value="KD">Khối Kinh doanh</option>
          <option value="VP">Khối Văn phòng</option>
          <option value="cross">Liên khối</option>
        </select>
        <select
          value={filterBudget}
          onChange={(e) => setFilterBudget(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-emerald-500"
        >
          <option value="all">Tất cả mức chi phí</option>
          {BUDGET_TIERS.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* ── Bảng 12 cột ─────────────────────────────────────────────────────── */}
      <section className="rounded-xl bg-white border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr className="text-left border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                <th className="px-3 py-2.5">Mã</th>
                <th className="px-3 py-2.5">Tiêu đề</th>
                <th className="px-3 py-2.5">Loại</th>
                <th className="px-3 py-2.5">Người tạo</th>
                <th className="px-3 py-2.5">Khối/PB/CS</th>
                <th className="px-3 py-2.5">Người duyệt hiện tại</th>
                <th className="px-3 py-2.5">Trạng thái</th>
                <th className="px-3 py-2.5 text-right">Chi phí</th>
                <th className="px-3 py-2.5 text-right">Ngày gửi</th>
                <th className="px-3 py-2.5">SLA</th>
                <th className="px-3 py-2.5 text-center">Tạo ĐP?</th>
                <th className="px-1 py-2.5 text-center">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-sm text-slate-500">
                    Không có đề xuất nào khớp bộ lọc.
                  </td>
                </tr>
              ) : (
                paged.map((p) => (
                  <DexuatRow
                    key={p.id}
                    p={p}
                    currentUserUid={currentUserUid}
                    currentUserRole={currentUserRole}
                    onRowClick={onRowClick}
                    onAction={onAction}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination footer ─────────────────────────────────────────────── */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-slate-200 bg-slate-50 text-xs text-slate-600 flex-wrap">
            <div>
              Hiển thị{' '}
              <span className="font-semibold text-slate-800 tabular-nums">
                {(safePage - 1) * perPage + 1}
              </span>
              {' – '}
              <span className="font-semibold text-slate-800 tabular-nums">
                {Math.min(safePage * perPage, filtered.length)}
              </span>
              {' trong '}
              <span className="font-semibold text-slate-800 tabular-nums">
                {filtered.length}
              </span>
              {' đề xuất'}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((x) => Math.max(1, x - 1))}
                disabled={safePage <= 1}
                className="p-1 rounded hover:bg-white border border-transparent hover:border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Trang trước"
              >
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: totalPage }).slice(0, 7).map((_, i) => {
                const n = i + 1;
                const active = n === safePage;
                return (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={`min-w-[28px] px-2 py-0.5 text-xs rounded tabular-nums ${
                      active
                        ? 'bg-emerald-600 text-white font-semibold'
                        : 'text-slate-700 hover:bg-white border border-transparent hover:border-slate-200'
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
              {totalPage > 7 && (
                <span className="text-slate-400 px-1">…{totalPage}</span>
              )}
              <button
                onClick={() => setPage((x) => Math.min(totalPage, x + 1))}
                disabled={safePage >= totalPage}
                className="p-1 rounded hover:bg-white border border-transparent hover:border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Trang sau"
              >
                <ChevronRight size={14} />
              </button>
              <span className="ml-2 text-slate-500">/ trang:</span>
              <select
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
                className="text-xs border border-slate-200 rounded px-1.5 py-0.5 bg-white"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Row component — giữ dropdown state riêng cho mỗi dòng
// ──────────────────────────────────────────────────────────────────────────────
interface RowProps {
  p: ProposalV3;
  currentUserUid: string;
  currentUserRole: string;
  onRowClick: (p: ProposalV3) => void;
  onAction?: (action: ActionKey, id: string) => void;
}
function DexuatRow({ p, currentUserUid, currentUserRole, onRowClick, onAction }: RowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const currStep: ApproverStep | undefined = p.approverChain[p.approverIdx];
  const sla = computeSLA(p);
  const overdue = !!sla?.overdue;

  // Initials cho avatar 24px
  const initials = (currStep?.name ?? '?')
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(-2)
    .join('')
    .toUpperCase() || '?';

  // SLA label
  let slaLabel = '—';
  let slaCls = 'text-slate-500';
  if (sla) {
    const absH = Math.abs(sla.remainingH);
    const h = Math.max(0, Math.round(absH));
    if (overdue) {
      slaLabel = `Quá ${h}h`;
      slaCls = 'text-rose-600 font-bold';
    } else if (sla.ratio < 0.5) {
      slaLabel = `Còn ${h}h`;
      slaCls = 'text-amber-600 font-semibold';
    } else {
      slaLabel = `Còn ${h}h`;
      slaCls = 'text-emerald-600 font-medium';
    }
  }

  const showApprove = canApprove(p, currentUserUid);
  const showConvert = canConvert(p, currentUserUid, currentUserRole);
  const showClose = canClose(p, currentUserUid, currentUserRole);

  function emit(a: ActionKey) {
    setMenuOpen(false);
    onAction?.(a, p.id);
  }

  const block = p.relatedBlock ? BLOCK_LABEL[p.relatedBlock] ?? p.relatedBlock : '—';
  const unit = p.relatedDeptId || p.relatedBranchId || '';

  // Ngày gửi: ưu tiên updatedAt (sau khi gửi) — nếu chưa gửi (Nháp) thì createdAt
  const submittedDisplay = p.status === 'nhap' ? '—' : formatDate(p.updatedAt || p.createdAt);

  return (
    <tr
      onClick={() => onRowClick(p)}
      className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer ${
        overdue ? 'bg-rose-50/40' : ''
      }`}
    >
      <td className="px-3 py-2.5 text-[10px] text-slate-400 tabular-nums whitespace-nowrap">
        {p.code}
      </td>
      <td className="px-3 py-2.5">
        <div className="font-medium text-slate-800 truncate max-w-[260px]" title={p.title}>
          {p.title}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ring-1 ${PROPOSAL_KIND_COLOR[p.kind] ?? 'bg-slate-100 text-slate-700 ring-slate-200'}`}>
          {PROPOSAL_KIND_LABEL[p.kind]}
        </span>
      </td>
      <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{p.creatorName}</td>
      <td className="px-3 py-2.5">
        <div className="text-[12px] font-medium text-slate-800 leading-tight">{block}</div>
        {unit && <div className="text-[11px] text-slate-500 leading-tight">{unit}</div>}
      </td>
      <td className="px-3 py-2.5">
        {currStep ? (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center justify-center shrink-0">
              {initials}
            </div>
            <span className="text-slate-700 text-[12px] truncate max-w-[140px]" title={currStep.name}>
              {currStep.name}
            </span>
          </div>
        ) : (
          <span className="text-slate-400 text-[12px]">—</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${PROPOSAL_STATUS_COLOR[p.status] ?? 'bg-slate-100 text-slate-700'}`}>
          {PROPOSAL_STATUS_LABEL[p.status]}
        </span>
      </td>
      <td className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap ${
        (p.estimatedCost ?? 0) > 50_000_000 ? 'text-rose-600 font-semibold' : 'text-slate-700'
      }`}>
        {formatVNDRaw(p.estimatedCost)}
      </td>
      <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums whitespace-nowrap">
        {submittedDisplay}
      </td>
      <td className={`px-3 py-2.5 whitespace-nowrap text-[12px] ${slaCls}`}>
        {slaLabel}
      </td>
      <td className="px-3 py-2.5 text-center">
        {p.createCoordAfter ? (
          <span
            className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold"
            title={p.linkedCoordTaskCode ? `Đã tạo: ${p.linkedCoordTaskCode}` : 'Có tạo điều phối sau duyệt'}
          >
            ✓
          </span>
        ) : (
          <span
            className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-400 text-[10px] font-bold"
            title="Không tạo điều phối"
          >
            ✗
          </span>
        )}
      </td>
      <td className="px-1 py-2.5 text-center relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setMenuOpen((x) => !x)}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
          aria-label="Hành động"
          title="Hành động"
        >
          <MoreHorizontal size={16} />
        </button>
        {menuOpen && (
          <div
            ref={menuRef}
            className="absolute right-2 top-9 z-20 w-56 bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-left text-[13px]"
          >
            <MenuItem icon={Eye}              label="Xem chi tiết"     onClick={() => emit('view')} />
            {showApprove && (
              <>
                <MenuItem icon={ThumbsUp}     label="Duyệt"            onClick={() => emit('approve')}            cls="text-emerald-700" />
                <MenuItem icon={ShieldCheck}  label="Đồng ý nguyên tắc" onClick={() => emit('approve_principle')} cls="text-sky-700" />
                <MenuItem icon={RotateCcw}    label="Yêu cầu bổ sung"  onClick={() => emit('request_revision')}   cls="text-amber-700" />
                <MenuItem icon={XCircle}      label="Từ chối"          onClick={() => emit('reject')}             cls="text-rose-700" />
              </>
            )}
            {showConvert && (
              <MenuItem icon={ArrowRightCircle} label="Chuyển điều phối" onClick={() => emit('convert_coord')} cls="text-violet-700" />
            )}
            {showClose && (
              <MenuItem icon={Archive}        label="Đóng hồ sơ"       onClick={() => emit('close')}              cls="text-slate-600" />
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function MenuItem({
  icon: Icon, label, onClick, cls,
}: { icon: any; label: string; onClick: () => void; cls?: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 ${cls ?? 'text-slate-700'}`}
    >
      <Icon size={14} /> {label}
    </button>
  );
}

export default DexuatTable;
