'use client';

// /de-xuat V5 — DexuatTable (OVERWRITE)
// SPEC V5 chốt 2026-06-12:
//   - 8 tabs (đổi label V3: "YCBS" → "Cần bổ sung", "Quá SLA" → "Quá hạn")
//   - Filter row: search + 3 select (kind · priority · phạm vi target block)
//   - Bảng 11 cột (KHÔNG còn cột "Tạo ĐP?" — thay bằng cột "Sau duyệt" 3 trạng thái)
//   - Cột Tiêu đề có badge "Khẩn" khi priority='khan_cap' / 'urgent'
//   - Cột Phạm vi ảnh hưởng: chip list từ affectedScopes (V5 multi-select) hoặc fallback V3 (relatedBlock/Dept/Branch)
//   - Cột "Sau duyệt":
//        • postApprovalDecision='chi_phe_duyet'           → "Chỉ phê duyệt"        (slate)
//        • postApprovalDecision='de_nghi_tao_dieu_phoi'   → "Đề nghị tạo ĐP"      (amber)
//        • linkedCoordTaskId                              → "✓ Đã chuyển ĐP"     (emerald + link/tooltip)
//   - SLA: compute từ updatedAt + SLA_HOURS theo roleCode approver hiện tại
//   - Dropdown 6 hành động:
//        Xem chi tiết · Duyệt · Từ chối · Yêu cầu bổ sung
//        · **Duyệt & Tạo điều phối** (highlight emerald nếu status='da_phe_duyet') · Đóng hồ sơ
//   - Pagination footer giữ V3
// Tái sử dụng ProposalV3 (alias ProposalV5) + label/color maps trong ./types.
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
  XCircle,
  RotateCcw,
  ArrowRightCircle,
  Archive,
  ChevronLeft,
  ChevronRight,
  Flame,
} from 'lucide-react';
import {
  PROPOSAL_STATUS_LABEL,
  PROPOSAL_STATUS_COLOR,
  PROPOSAL_KIND_LABEL,
  PROPOSAL_KIND_COLOR,
  SLA_HOURS,
  type ProposalKind,
  type ProposalV5,
  type ApproverStep,
  type ScopeTarget,
  type AfterApproval,
} from './types';

// ──────────────────────────────────────────────────────────────────────────────
// V5 helpers
// ──────────────────────────────────────────────────────────────────────────────
// V5 priority: binh_thuong / quan_trong / khan_cap
type AnyPriority = string;

// V5 target block scope filter
type TargetBlockFilter = 'all' | 'KD' | 'VP' | 'both';

// ──────────────────────────────────────────────────────────────────────────────
// Tabs (V5 labels)
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
  { key: 'ycbs',             label: 'Cần bổ sung',         icon: AlertCircle },
  { key: 'da_duyet',         label: 'Đã duyệt',            icon: CheckCircle2 },
  { key: 'chuyen_dieu_phoi', label: 'Đã chuyển điều phối', icon: Send },
  { key: 'qua_sla',          label: 'Quá hạn',             icon: AlarmClock },
];

// ──────────────────────────────────────────────────────────────────────────────
// V5 Priority helpers
// ──────────────────────────────────────────────────────────────────────────────
const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'binh_thuong', label: 'Bình thường' },
  { value: 'quan_trong',  label: 'Quan trọng' },
  { value: 'khan_cap',    label: 'Khẩn cấp' },
];

function isUrgent(priority: AnyPriority | undefined): boolean {
  if (!priority) return false;
  const p = String(priority).toLowerCase();
  return p === 'khan_cap' || p === 'urgent';
}

// V5 (binh_thuong/quan_trong/khan_cap) vs V3 (low/normal/high/urgent)
function priorityMatches(p: ProposalV5, filter: string): boolean {
  if (filter === 'all') return true;
  const raw = String(p.priority || '').toLowerCase();
  if (filter === 'khan_cap')  return raw === 'khan_cap'  || raw === 'urgent';
  if (filter === 'quan_trong') return raw === 'quan_trong' || raw === 'high';
  if (filter === 'binh_thuong') return raw === 'binh_thuong' || raw === 'normal' || raw === 'low' || raw === '';
  return raw === filter;
}

// ──────────────────────────────────────────────────────────────────────────────
// Affected scopes (V5 multi-select)
// ──────────────────────────────────────────────────────────────────────────────
// Ưu tiên scopeTargets (đã có label đẹp). Nếu rỗng, dựng từ relatedBlocks/Depts/Facilities.
function getAffectedScopes(p: ProposalV5): ScopeTarget[] {
  if (Array.isArray(p.scopeTargets) && p.scopeTargets.length > 0) return p.scopeTargets;

  const out: ScopeTarget[] = [];
  for (const b of p.relatedBlocks ?? []) {
    const label = b === 'KD' ? 'Khối Kinh doanh' : 'Khối Văn phòng';
    out.push({ type: 'block', id: b, label });
  }
  for (const d of p.relatedDepts ?? []) out.push({ type: 'dept', id: d, label: d });
  for (const f of p.relatedFacilities ?? []) out.push({ type: 'facility', id: f, label: f });
  return out;
}

function scopeMatchesTargetBlock(p: ProposalV5, target: TargetBlockFilter): boolean {
  if (target === 'all') return true;
  const blocks = new Set<string>(p.relatedBlocks ?? []);
  if (target === 'KD') return blocks.has('KD');
  if (target === 'VP') return blocks.has('VP');
  if (target === 'both') return p.isCrossBlock || (blocks.has('KD') && blocks.has('VP'));
  return true;
}

// ──────────────────────────────────────────────────────────────────────────────
// Format helpers
// ──────────────────────────────────────────────────────────────────────────────
function formatVNDRaw(value: number | undefined | null): string {
  if (value == null || isNaN(value as number)) return '—';
  if (value === 0) return '0 đ';
  if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(2) + ' Tỷ';
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1).replace(/\.0$/, '') + ' Tr';
  return value.toLocaleString('vi-VN') + ' đ';
}

// ──────────────────────────────────────────────────────────────────────────────
// SLA — tính từ updatedAt + slaHours theo role approver hiện tại
// ──────────────────────────────────────────────────────────────────────────────
function slaHoursForRole(roleCode?: string): number {
  const r = (roleCode || '').toUpperCase();
  if (r.includes('CEO') || r.includes('CHU_TICH')) return SLA_HOURS.ceo;
  if (r.includes('GD') || r.includes('GĐ')) return SLA_HOURS.gd;
  if (r.includes('TP') || r.includes('QLCS')) return SLA_HOURS.tp;
  return SLA_HOURS.tp;
}

interface SLAInfo {
  totalH: number;
  remainingH: number;
  ratio: number;
  overdue: boolean;
}
function computeSLA(p: ProposalV5): SLAInfo | null {
  // Đã kết thúc → không tính SLA
  if (
    p.status === 'da_phe_duyet' ||
    p.status === 'tu_choi' ||
    p.status === 'chuyen_dieu_phoi' ||
    p.status === 'nhap' ||
    p.status === 'dong_ho_so'
  ) {
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

function isCurrentApproverMe(p: ProposalV5, uid: string): boolean {
  const step = p.approverChain[p.approverIdx];
  return !!step && step.uid === uid;
}

function tabsContaining(p: ProposalV5): TabKey[] {
  const tabs: TabKey[] = ['all'];
  if (p.status === 'dang_xem_xet') tabs.push('dang_xem_xet');
  if (p.status === 'yeu_cau_bo_sung') tabs.push('ycbs');
  if (p.status === 'da_phe_duyet') tabs.push('da_duyet');
  if (p.status === 'chuyen_dieu_phoi') tabs.push('chuyen_dieu_phoi');
  const sla = computeSLA(p);
  if (sla?.overdue) tabs.push('qua_sla');
  return tabs;
}

// ──────────────────────────────────────────────────────────────────────────────
// Per-action visibility
// ──────────────────────────────────────────────────────────────────────────────
function canApprove(p: ProposalV5, uid: string): boolean {
  return (
    isCurrentApproverMe(p, uid) &&
    (p.status === 'da_gui' || p.status === 'dang_xem_xet' || p.status === 'yeu_cau_bo_sung')
  );
}
function canApproveAndCreateCoord(p: ProposalV5, uid: string, role: string): boolean {
  // Có thể gộp ngay khi đang là approver cuối (sẽ chuyển sang da_phe_duyet)
  // hoặc proposal đã da_phe_duyet và chưa có linkedCoordTaskId
  const r = (role || '').toUpperCase();
  const isPrivileged =
    p.creatorUid === uid ||
    r.includes('GD') ||
    r.includes('GĐ') ||
    r.includes('CEO') ||
    r.includes('QLCS');
  if (p.status === 'da_phe_duyet' && !p.linkedCoordTaskId && isPrivileged) return true;
  if (canApprove(p, uid)) {
    // approver bước cuối có thể gộp
    const isLastStep = p.approverIdx >= p.approverChain.length - 1;
    return isLastStep && isPrivileged;
  }
  return false;
}
function canClose(p: ProposalV5, uid: string, role: string): boolean {
  if (p.status === 'nhap' || p.status === 'dong_ho_so') return false;
  if (
    p.status === 'chuyen_dieu_phoi' ||
    p.status === 'tu_choi' ||
    p.status === 'da_phe_duyet'
  ) {
    const r = (role || '').toUpperCase();
    return p.creatorUid === uid || r.includes('CEO') || r.includes('GD') || r.includes('GĐ');
  }
  return false;
}

// ──────────────────────────────────────────────────────────────────────────────
// V5 — Sau duyệt badge
// ──────────────────────────────────────────────────────────────────────────────
function getPostApproval(p: ProposalV5): {
  kind: 'chi_phe_duyet' | 'de_nghi_tao_dieu_phoi' | 'da_chuyen_dp' | 'none';
  label: string;
  cls: string;
  taskCode?: string;
} {
  if (p.linkedCoordTaskId) {
    return {
      kind: 'da_chuyen_dp',
      label: '✓ Đã chuyển ĐP',
      cls: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
      taskCode: p.linkedCoordTaskCode,
    };
  }
  // V5 field: afterApproval
  const dec: AfterApproval | undefined = p.afterApproval;
  if (dec === 'chi_phe_duyet') {
    return {
      kind: 'chi_phe_duyet',
      label: 'Chỉ phê duyệt',
      cls: 'bg-slate-100 text-slate-600 ring-slate-200',
    };
  }
  if (dec === 'de_nghi_tao_dieu_phoi') {
    return {
      kind: 'de_nghi_tao_dieu_phoi',
      label: 'Đề nghị tạo ĐP',
      cls: 'bg-amber-100 text-amber-700 ring-amber-200',
    };
  }
  return {
    kind: 'none',
    label: '—',
    cls: 'text-slate-400',
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Props (V5)
// ──────────────────────────────────────────────────────────────────────────────
export type ActionKey =
  | 'view'
  | 'approve'
  | 'reject'
  | 'request_revision'
  | 'approve_and_create_coord'
  | 'close';

export interface DexuatTableProps {
  proposals: ProposalV5[];
  currentUserUid: string;
  currentUserRole: string;
  onRowClick: (p: ProposalV5) => void;
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
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterTargetBlock, setFilterTargetBlock] = useState<TargetBlockFilter>('all');

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  // ── Count badge theo từng tab ────────────────────────────────────────────
  const tabCounts = useMemo(() => {
    const c: Record<TabKey, number> = {
      all: 0,
      mine: 0,
      pending_me: 0,
      dang_xem_xet: 0,
      ycbs: 0,
      da_duyet: 0,
      chuyen_dieu_phoi: 0,
      qua_sla: 0,
    };
    for (const p of proposals) {
      const tabs = tabsContaining(p);
      for (const t of tabs) c[t] += 1;
      if (p.creatorUid === currentUserUid) c.mine += 1;
      if (
        isCurrentApproverMe(p, currentUserUid) &&
        (p.status === 'da_gui' || p.status === 'dang_xem_xet' || p.status === 'yeu_cau_bo_sung')
      ) {
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
        if (
          !(p.status === 'da_gui' || p.status === 'dang_xem_xet' || p.status === 'yeu_cau_bo_sung')
        )
          return false;
      }
      if (tab !== 'all' && tab !== 'mine' && tab !== 'pending_me') {
        const tabs = tabsContaining(p);
        if (!tabs.includes(tab)) return false;
      }
      // Filters
      if (filterKind !== 'all' && p.kind !== filterKind) return false;
      if (!priorityMatches(p, filterPriority)) return false;
      if (!scopeMatchesTargetBlock(p, filterTargetBlock)) return false;
      // Keyword
      if (kw) {
        const hay = `${p.title} ${p.code} ${p.creatorName}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [proposals, tab, filterKind, filterPriority, filterTargetBlock, keyword, currentUserUid]);

  // Reset page khi filter đổi
  useEffect(() => {
    setPage(1);
  }, [tab, filterKind, filterPriority, filterTargetBlock, keyword]);

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

      {/* ── Filter row (V5: search · kind · priority · target block) ────────── */}
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
            <option key={k} value={k}>
              {PROPOSAL_KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-emerald-500"
        >
          <option value="all">Tất cả ưu tiên</option>
          {PRIORITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={filterTargetBlock}
          onChange={(e) => setFilterTargetBlock(e.target.value as TargetBlockFilter)}
          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-emerald-500"
        >
          <option value="all">Tất cả phạm vi</option>
          <option value="KD">Khối Kinh doanh</option>
          <option value="VP">Khối Văn phòng</option>
          <option value="both">Cả 2 / Liên khối</option>
        </select>
      </div>

      {/* ── Bảng 11 cột ─────────────────────────────────────────────────────── */}
      <section className="rounded-xl bg-white border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr className="text-left border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                <th className="px-3 py-2.5">Mã</th>
                <th className="px-3 py-2.5">Tiêu đề</th>
                <th className="px-3 py-2.5">Loại</th>
                <th className="px-3 py-2.5">Người tạo</th>
                <th className="px-3 py-2.5">Phạm vi ảnh hưởng</th>
                <th className="px-3 py-2.5">Người duyệt hiện tại</th>
                <th className="px-3 py-2.5 text-right">Giá trị</th>
                <th className="px-3 py-2.5">SLA</th>
                <th className="px-3 py-2.5">Trạng thái</th>
                <th className="px-3 py-2.5">Sau duyệt</th>
                <th className="px-1 py-2.5 text-center">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-sm text-slate-500">
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

        {/* ── Pagination footer (giữ V3) ────────────────────────────────────── */}
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
              <span className="font-semibold text-slate-800 tabular-nums">{filtered.length}</span>
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
              {Array.from({ length: totalPage })
                .slice(0, 7)
                .map((_, i) => {
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
              {totalPage > 7 && <span className="text-slate-400 px-1">…{totalPage}</span>}
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
                onChange={(e) => {
                  setPerPage(Number(e.target.value));
                  setPage(1);
                }}
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
// Row component
// ──────────────────────────────────────────────────────────────────────────────
interface RowProps {
  p: ProposalV5;
  currentUserUid: string;
  currentUserRole: string;
  onRowClick: (p: ProposalV5) => void;
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
  const urgent = isUrgent(p.priority);

  // Avatar initials (2 ký tự cuối)
  const initials =
    (currStep?.name ?? '?')
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

  // Phạm vi ảnh hưởng — V5 multi-select chip list
  const scopes = getAffectedScopes(p);
  const visibleScopes = scopes.slice(0, 2);
  const extraCount = scopes.length - visibleScopes.length;

  // Sau duyệt badge
  const postApproval = getPostApproval(p);

  // Visibility các action
  const showApprove = canApprove(p, currentUserUid);
  const showApproveAndCoord = canApproveAndCreateCoord(p, currentUserUid, currentUserRole);
  const showClose = canClose(p, currentUserUid, currentUserRole);
  const highlightApproveCoord = p.status === 'da_phe_duyet';

  function emit(a: ActionKey) {
    setMenuOpen(false);
    onAction?.(a, p.id);
  }

  return (
    <tr
      onClick={() => onRowClick(p)}
      className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer ${
        overdue ? 'bg-rose-50/40' : ''
      }`}
    >
      {/* Mã */}
      <td className="px-3 py-2.5 text-[10px] text-slate-400 tabular-nums whitespace-nowrap">
        {p.code}
      </td>

      {/* Tiêu đề + badge Khẩn */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 max-w-[280px]">
          <span className="font-medium text-slate-800 truncate" title={p.title}>
            {p.title}
          </span>
          {urgent && (
            <span
              className="inline-flex items-center gap-0.5 shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 ring-1 ring-rose-200"
              title="Ưu tiên khẩn cấp"
            >
              <Flame size={10} /> Khẩn
            </span>
          )}
        </div>
      </td>

      {/* Loại */}
      <td className="px-3 py-2.5">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ring-1 ${
            PROPOSAL_KIND_COLOR[p.kind] ?? 'bg-slate-100 text-slate-700 ring-slate-200'
          }`}
        >
          {PROPOSAL_KIND_LABEL[p.kind]}
        </span>
      </td>

      {/* Người tạo */}
      <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{p.creatorName}</td>

      {/* Phạm vi ảnh hưởng — chip list + "+N đơn vị" */}
      <td className="px-3 py-2.5">
        {scopes.length === 0 ? (
          <span className="text-slate-400 text-[12px]">—</span>
        ) : (
          <div className="flex items-center gap-1 flex-wrap max-w-[220px]">
            {visibleScopes.map((s, i) => (
              <span
                key={`${s.type}-${s.id}-${i}`}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 ring-1 ring-slate-200 truncate max-w-[100px]"
                title={s.label}
              >
                {s.label}
              </span>
            ))}
            {extraCount > 0 && (
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                title={scopes
                  .slice(2)
                  .map((s) => s.label)
                  .join(', ')}
              >
                +{extraCount} đơn vị
              </span>
            )}
          </div>
        )}
      </td>

      {/* Người duyệt hiện tại */}
      <td className="px-3 py-2.5">
        {currStep ? (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center justify-center shrink-0">
              {initials}
            </div>
            <span
              className="text-slate-700 text-[12px] truncate max-w-[140px]"
              title={currStep.name}
            >
              {currStep.name}
            </span>
          </div>
        ) : (
          <span className="text-slate-400 text-[12px]">—</span>
        )}
      </td>

      {/* Giá trị */}
      <td
        className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap ${
          (p.estimatedCost ?? 0) > 50_000_000 ? 'text-rose-600 font-semibold' : 'text-slate-700'
        }`}
      >
        {formatVNDRaw(p.estimatedCost)}
      </td>

      {/* SLA */}
      <td className={`px-3 py-2.5 whitespace-nowrap text-[12px] ${slaCls}`}>{slaLabel}</td>

      {/* Trạng thái */}
      <td className="px-3 py-2.5">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
            PROPOSAL_STATUS_COLOR[p.status] ?? 'bg-slate-100 text-slate-700'
          }`}
        >
          {PROPOSAL_STATUS_LABEL[p.status]}
        </span>
      </td>

      {/* Sau duyệt */}
      <td className="px-3 py-2.5">
        {postApproval.kind === 'none' ? (
          <span className="text-slate-400 text-[12px]">—</span>
        ) : (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ring-1 ${postApproval.cls}`}
            title={
              postApproval.taskCode
                ? `Đã chuyển điều phối: ${postApproval.taskCode}`
                : postApproval.label
            }
          >
            {postApproval.label}
          </span>
        )}
      </td>

      {/* Hành động */}
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
            className="absolute right-2 top-9 z-20 w-60 bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-left text-[13px]"
          >
            <MenuItem icon={Eye} label="Xem chi tiết" onClick={() => emit('view')} />
            {showApprove && (
              <>
                <MenuItem
                  icon={ThumbsUp}
                  label="Duyệt"
                  onClick={() => emit('approve')}
                  cls="text-emerald-700"
                />
                <MenuItem
                  icon={XCircle}
                  label="Từ chối"
                  onClick={() => emit('reject')}
                  cls="text-rose-700"
                />
                <MenuItem
                  icon={RotateCcw}
                  label="Yêu cầu bổ sung"
                  onClick={() => emit('request_revision')}
                  cls="text-amber-700"
                />
              </>
            )}
            {showApproveAndCoord && (
              <MenuItem
                icon={ArrowRightCircle}
                label="Duyệt & Tạo điều phối"
                onClick={() => emit('approve_and_create_coord')}
                cls={
                  highlightApproveCoord
                    ? 'text-white bg-emerald-600 hover:bg-emerald-700 font-semibold'
                    : 'text-emerald-700'
                }
                highlight={highlightApproveCoord}
              />
            )}
            {showClose && (
              <MenuItem
                icon={Archive}
                label="Đóng hồ sơ"
                onClick={() => emit('close')}
                cls="text-slate-600"
              />
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  cls,
  highlight,
}: {
  icon: any;
  label: string;
  onClick: () => void;
  cls?: string;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 ${
        highlight ? '' : 'hover:bg-slate-50'
      } ${cls ?? 'text-slate-700'}`}
    >
      <Icon size={14} /> {label}
    </button>
  );
}

export default DexuatTable;
