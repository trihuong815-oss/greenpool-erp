'use client';

// /de-xuat V6 — DexuatTable (OVERWRITE SIMPLIFIED)
// SPEC V6 chốt 2026-06-12:
//   - 7 tabs (bỏ "Quá hạn" V5 — SLA chỉ là filter visual trên cột SLA)
//   - Filter row GỌN: search + select Loại (BỎ priority + target block filter V5)
//   - Bảng 8 cột theo SPEC V6:
//        Mã · Tên đề xuất · Loại · Người tạo · Người duyệt hiện tại · SLA · Trạng thái · Hành động
//     (BỎ cột "Phạm vi ảnh hưởng" + "Giá trị" + "Sau duyệt" của V5)
//   - Dropdown 4 mục SPEC V6:
//        Xem chi tiết · Duyệt · Duyệt & Tạo điều phối (nổi bật emerald)
//        · Từ chối / Yêu cầu bổ sung / Đóng hồ sơ (tùy quyền)
//   - SLA: compute như V5
//   - Pagination footer giữ pattern V5
// Tái sử dụng ProposalV5 (alias Proposal) + label/color maps trong ./types.
// KHÔNG đụng /giao-viec /dieu-phoi /doanh-so /checklist.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Inbox,
  FilePlus2,
  UserCheck,
  Clock,
  AlertCircle,
  CheckCircle2,
  Send,
  MoreHorizontal,
  Eye,
  ThumbsUp,
  XCircle,
  RotateCcw,
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
  NATURE_META,
  type ProposalKind,
  type ProposalV5,
  type ApproverStep,
} from './types';

// ──────────────────────────────────────────────────────────────────────────────
// Tabs V6 — 7 tabs (bỏ "Quá hạn" V5)
// PR-PROPOSAL-RESTRUCTURE (2026-06-27): export TabKey để ProposalSnapshot
// map cell→tab khi click.
// ──────────────────────────────────────────────────────────────────────────────
export type TabKey =
  | 'all'
  | 'mine'
  | 'pending_me'
  | 'dang_xem_xet'
  | 'ycbs'
  | 'da_duyet'
  | 'chuyen_dieu_phoi';

// V6.5 Audit fix Phase A.3 (2026-06-15) — Issue 6.2: gộp 7 tab → 4 chính + 3 phụ
// (đồng bộ pattern Điều phối Phase 5.6) để giảm break layout 1200px.
const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'all',              label: 'Tất cả',              icon: Inbox },
  { key: 'mine',             label: 'Tôi tạo',             icon: FilePlus2 },
  { key: 'pending_me',       label: 'Chờ tôi duyệt',       icon: UserCheck },
  { key: 'dang_xem_xet',     label: 'Đang xem xét',        icon: Clock },
  { key: 'ycbs',             label: 'Cần bổ sung',         icon: AlertCircle },
  { key: 'da_duyet',         label: 'Đã duyệt',            icon: CheckCircle2 },
  { key: 'chuyen_dieu_phoi', label: 'Đã tạo điều phối',    icon: Send },
];
const PRIMARY_TAB_KEYS: TabKey[] = ['all', 'mine', 'pending_me', 'da_duyet'];
const SECONDARY_TAB_KEYS: TabKey[] = ['dang_xem_xet', 'ycbs', 'chuyen_dieu_phoi'];

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
  // V6.5 (2026-06-13) anh chốt: CHỈ GĐKD và GĐVP được tạo điều phối từ đề xuất đã duyệt.
  // Spec VIII — Đề xuất là nơi xin quyết định, Điều phối là nơi triển khai → 2 GĐ khối quản lý.
  const r = (role || '').toUpperCase();
  const isGdKhoi = r === 'GD_KD' || r === 'GD_VP';
  if (!isGdKhoi) return false;
  if (p.linkedCoordTaskId) return false; // đã tạo rồi, không cho tạo trùng
  if (p.status === 'da_phe_duyet') return true;
  // Cho phép tạo ở cấp duyệt cuối (1-click duyệt + tạo coord)
  if (canApprove(p, uid)) {
    const isLastStep = p.approverIdx >= p.approverChain.length - 1;
    return isLastStep;
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
// Props (V6)
// ──────────────────────────────────────────────────────────────────────────────
export type ActionKey =
  | 'view'
  | 'approve'
  | 'reject'
  | 'request_revision'
  | 'approve_and_create_coord'
  | 'resubmit'
  | 'close';

export interface DexuatTableProps {
  proposals: ProposalV5[];
  currentUserUid: string;
  currentUserRole: string;
  onRowClick: (p: ProposalV5) => void;
  onAction?: (action: ActionKey, id: string) => void;
  // PR-PROPOSAL-RESTRUCTURE (2026-06-27): external tab signal cho ProposalSnapshot
  // "Click cell" — parent set requestedTab + bump signal → useEffect setTab.
  // Mirror CoordinationTable.requestedTab+tabSignal pattern.
  requestedTab?: TabKey;
  tabSignal?: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────
function DexuatTable(props: DexuatTableProps) {
  const { proposals, currentUserUid, currentUserRole, onRowClick, onAction, requestedTab, tabSignal } = props;

  const [tab, setTab] = useState<TabKey>('all');
  // V6.5 Audit fix Phase A.3: tab phụ chỉ hiện khi user click "+ Lọc nâng cao"
  const [showAdvanced, setShowAdvanced] = useState(false);

  // PR-PROPOSAL-RESTRUCTURE (2026-06-27): nhận tab signal từ ProposalSnapshot.
  useEffect(() => {
    if (requestedTab) {
      setTab(requestedTab);
      // Nếu là tab phụ (SECONDARY) → tự mở "Lọc nâng cao" để tab visible.
      if (SECONDARY_TAB_KEYS.includes(requestedTab)) setShowAdvanced(true);
    }
  }, [requestedTab, tabSignal]);
  const [keyword, setKeyword] = useState('');
  const [filterKind, setFilterKind] = useState<'all' | ProposalKind>('all');

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

  // ── Filter pipeline (V6 GỌN) ─────────────────────────────────────────────
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
      // Filter loại
      if (filterKind !== 'all' && p.kind !== filterKind) return false;
      // Keyword
      if (kw) {
        const hay = `${p.title} ${p.code} ${p.creatorName}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [proposals, tab, filterKind, keyword, currentUserUid]);

  // Reset page khi filter đổi
  useEffect(() => {
    setPage(1);
  }, [tab, filterKind, keyword]);

  // V6.5 (2026-06-15) anh chốt: SORT MẶC ĐỊNH theo thời gian còn lại tăng dần
  // (giống bảng Điều phối). Quy tắc:
  //   • Đề xuất ở trạng thái kết thúc/đóng (da_phe_duyet/tu_choi/chuyen_dieu_phoi/dong_ho_so)
  //     → XUỐNG CUỐI (không còn cần action gấp).
  //   • 'nhap' (chưa gửi) → xuống cuối nhóm active (chưa vào chain, không có SLA).
  //   • Còn lại sort theo SLA remainingH ASC (ít giờ còn lại trước → ưu tiên duyệt gấp).
  //   • Quá hạn (remainingH < 0) → lên đầu (overdue càng lâu càng trước).
  //   • Cùng remainingH → createdAt ASC (cũ trước).
  const sorted = useMemo(() => {
    const terminal = (s: ProposalV5['status']) =>
      s === 'da_phe_duyet' || s === 'tu_choi' || s === 'chuyen_dieu_phoi' || s === 'dong_ho_so';
    return [...filtered].sort((a, b) => {
      const aT = terminal(a.status), bT = terminal(b.status);
      if (aT !== bT) return aT ? 1 : -1;
      // Nháp xuống cuối nhóm active
      const aDraft = a.status === 'nhap', bDraft = b.status === 'nhap';
      if (aDraft !== bDraft) return aDraft ? 1 : -1;
      // SLA remainingH ASC (null = +Infinity = sau cùng)
      const aSla = computeSLA(a);
      const bSla = computeSLA(b);
      const aRem = aSla ? aSla.remainingH : Number.POSITIVE_INFINITY;
      const bRem = bSla ? bSla.remainingH : Number.POSITIVE_INFINITY;
      if (aRem !== bRem) return aRem - bRem;
      // Fallback: createdAt ASC
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [filtered]);

  const totalPage = Math.max(1, Math.ceil(sorted.length / perPage));
  const safePage = Math.min(page, totalPage);
  const paged = useMemo(
    () => sorted.slice((safePage - 1) * perPage, safePage * perPage),
    [sorted, safePage, perPage],
  );

  return (
    <div className="space-y-3">
      {/* V6.5 Audit fix Phase A.3 (2026-06-15) — 4 tab chính luôn hiện + 3 tab phụ
          hiện inline khi active hoặc khi showAdvanced=true. Nút "+ Lọc nâng cao" toggle. */}
      {/* PR-PROPOSAL-RESTRUCTURE (2026-06-27): chuẩn hoá style nhất quán với
          CoordinationTable + TheoDoiPanel /dieu-phoi — emerald-600 border,
          text-xs font-medium, bỏ font-bold, count chip text-[11px] (đúng rule
          ≥12 exception meta), bỏ pill emerald-100 active (giữ slate-100 đồng nhất). */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0">
        {TABS.filter(({ key }) => PRIMARY_TAB_KEYS.includes(key) || SECONDARY_TAB_KEYS.includes(key) && (showAdvanced || tab === key)).map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          const badge = tabCounts[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon size={13} /> {label}
              {badge > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full bg-slate-100 text-slate-600 text-[11px] tabular-nums">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="ml-auto shrink-0 px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-emerald-700 transition"
          title={showAdvanced ? 'Ẩn lọc nâng cao' : 'Hiện lọc nâng cao'}
        >
          {showAdvanced ? '↑ Lọc nâng cao' : '+ Lọc nâng cao'}
        </button>
      </div>

      {/* ── Filter row GỌN V6: search + Loại ────────────────────────────────── */}
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
      </div>

      {/* ── Bảng 8 cột V6 ───────────────────────────────────────────────────── */}
      <section className="rounded-xl bg-white border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0 z-10">
              {/* V6.5 (2026-06-15) anh chốt: kẻ ô ngang + dọc đồng bộ với bảng Điều phối. */}
              <tr className="text-left border-b-2 border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider divide-x divide-slate-200">
                <th className="px-3 py-2.5">Mã</th>
                <th className="px-3 py-2.5">Tên đề xuất</th>
                <th className="px-3 py-2.5">Loại</th>
                <th className="px-3 py-2.5">Người tạo</th>
                {/* V6.5 (2026-06-14): Bỏ cột "Đơn vị liên quan" — duplicate với
                    "Đơn vị nhận" (recipientUnit) + "Lãnh đạo phê duyệt" (recipientLeader)
                    đã có trong drawer + mobile card. relatedUnits giữ deprecated cho data cũ. */}
                <th className="px-3 py-2.5">Tính chất</th>
                <th className="px-3 py-2.5">Người duyệt hiện tại</th>
                <th className="px-3 py-2.5">SLA</th>
                <th className="px-3 py-2.5">Trạng thái</th>
                <th className="px-1 py-2.5 text-center">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-sm text-slate-500">
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

        {/* ── Pagination footer (giữ pattern V5) ──────────────────────────── */}
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
// Row component (V6 — 8 cột)
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

  // Avatar initials (2 ký tự đầu của 2 từ cuối)
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

  // Visibility các action
  const showApprove = canApprove(p, currentUserUid);
  const showApproveAndCoord = canApproveAndCreateCoord(p, currentUserUid, currentUserRole);
  const showClose = canClose(p, currentUserUid, currentUserRole);
  const highlightApproveCoord = p.status === 'da_phe_duyet';
  // V6.4 (2026-06-12): creator có thể gửi lại đề xuất bị từ chối (server reset chain).
  const showResubmit = p.status === 'tu_choi' && p.creatorUid === currentUserUid;

  function emit(a: ActionKey) {
    setMenuOpen(false);
    onAction?.(a, p.id);
  }

  return (
    <tr
      onClick={() => onRowClick(p)}
      className={`hover:bg-emerald-50/60 cursor-pointer divide-x divide-slate-200 [&:nth-child(even)]:bg-slate-50/40 ${
        overdue ? 'bg-rose-50/40 hover:bg-rose-50/70' : ''
      }`}
    >
      {/* 1. Mã */}
      <td className="px-3 py-2.5 text-[10px] text-slate-400 tabular-nums whitespace-nowrap">
        {p.code}
      </td>

      {/* 2. Tên đề xuất */}
      <td className="px-3 py-2.5">
        <span
          className="font-medium text-slate-800 truncate block max-w-[300px]"
          title={p.title}
        >
          {p.title}
        </span>
      </td>

      {/* 3. Loại */}
      <td className="px-3 py-2.5">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ring-1 ${
            PROPOSAL_KIND_COLOR[p.kind] ?? 'bg-slate-100 text-slate-700 ring-slate-200'
          }`}
        >
          {PROPOSAL_KIND_LABEL[p.kind]}
        </span>
      </td>

      {/* 4. Người tạo (tên + role nhỏ) */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        <div className="flex flex-col leading-tight">
          <span className="text-slate-700 text-[13px]">{p.creatorName}</span>
          {p.creatorRole && (
            <span className="text-slate-400 text-[10px]">{p.creatorRole}</span>
          )}
        </div>
      </td>

      {/* V6.5 (2026-06-14): Xoá cell "Đơn vị liên quan" cùng cột header.
          relatedUnits đã deprecated — UI thay bằng "Đơn vị nhận" + "Lãnh đạo phê duyệt"
          ở drawer/mobile card. */}

      {/* 4c. V6.5 (2026-06-14): Tag tính chất — dùng NATURE_META hằng số chung 4 mặt. */}
      <td className="px-3 py-2.5">
        {(() => {
          // Fallback graceful: data cũ thiếu nature → suy từ unitsScope (legacy)
          const natureRaw = (p as any).nature as 'support' | 'governance' | undefined;
          const scopeOld = (p as any).unitsScope as 'trong_khoi' | 'lien_khoi' | undefined;
          const nature: 'support' | 'governance' | null = natureRaw
            ?? (scopeOld === 'lien_khoi' ? 'governance' : scopeOld === 'trong_khoi' ? 'support' : null);
          if (!nature) return <span className="text-slate-300 text-xs">—</span>;
          const m = NATURE_META[nature];
          return (
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ring-1 ${m.color}`}>
              {m.emoji} {m.shortLabel}
            </span>
          );
        })()}
      </td>

      {/* 5. V6.5: Đơn vị nhận + Lãnh đạo + Người duyệt hiện tại — gộp 1 cột */}
      <td className="px-3 py-2.5">
        <div className="text-[11px] space-y-0.5 max-w-[180px]">
          {(p as any).recipientUnitName && (
            <div className="truncate" title={`Đơn vị nhận: ${(p as any).recipientUnitName}`}>
              <span className="text-slate-400">Đơn vị nhận:</span>{' '}
              <span className="text-slate-700">{(p as any).recipientUnitName}</span>
            </div>
          )}
          {(p as any).nature === 'governance' && typeof (p as any).recipientLeaderName === 'string' && (p as any).recipientLeaderName.trim() && (
            <div className="truncate" title={`Lãnh đạo: ${(p as any).recipientLeaderName}`}>
              <span className="text-slate-400">Lãnh đạo:</span>{' '}
              <span className="text-slate-700 font-medium">{(p as any).recipientLeaderName}</span>
            </div>
          )}
          {/* V6.5 (2026-06-14): hasFinancial + estimatedCost cho governance (nhất quán với drawer + form) */}
          {(p as any).nature === 'governance' && (p as any).hasFinancial && (
            <div className="truncate" title="Có phát sinh tài chính">
              <span className="text-slate-400">TC:</span>{' '}
              <span className="text-amber-700 font-medium tabular-nums">
                {(p as any).estimatedCost > 0 ? '₫' + Number((p as any).estimatedCost).toLocaleString('vi-VN') : 'Chưa rõ giá trị'}
              </span>
            </div>
          )}
          {currStep ? (
            <div className="flex items-center gap-1.5 pt-0.5">
              <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold flex items-center justify-center shrink-0">
                {initials}
              </div>
              <span className="text-emerald-700 font-medium truncate text-[11px]" title={currStep.name}>
                {currStep.name}
              </span>
            </div>
          ) : (
            <div className="text-slate-400">— chờ —</div>
          )}
        </div>
      </td>

      {/* 6. SLA */}
      <td className={`px-3 py-2.5 whitespace-nowrap text-[12px] ${slaCls}`}>{slaLabel}</td>

      {/* 7. Trạng thái */}
      <td className="px-3 py-2.5">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
            PROPOSAL_STATUS_COLOR[p.status] ?? 'bg-slate-100 text-slate-700'
          }`}
        >
          {PROPOSAL_STATUS_LABEL[p.status]}
        </span>
      </td>

      {/* 8. Hành động — dropdown 4 mục V6 */}
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
              <MenuItem
                icon={ThumbsUp}
                label="Duyệt"
                onClick={() => emit('approve')}
                cls="text-emerald-700"
              />
            )}
            {showApproveAndCoord && (
              <MenuItem
                icon={ArrowRightCircle}
                label="Duyệt & Tạo điều phối"
                onClick={() => emit('approve_and_create_coord')}
                cls={
                  highlightApproveCoord
                    ? 'text-white bg-emerald-600 hover:bg-emerald-700 font-semibold'
                    : 'text-emerald-700 font-semibold'
                }
                highlight={highlightApproveCoord}
              />
            )}
            {showApprove && (
              <>
                <MenuItem
                  icon={RotateCcw}
                  label="Yêu cầu bổ sung"
                  onClick={() => emit('request_revision')}
                  cls="text-amber-700"
                />
                <MenuItem
                  icon={XCircle}
                  label="Từ chối"
                  onClick={() => emit('reject')}
                  cls="text-rose-700"
                />
              </>
            )}
            {showResubmit && (
              <MenuItem
                icon={RotateCcw}
                label="Gửi lại sau điều chỉnh"
                onClick={() => emit('resubmit')}
                cls="text-emerald-700 font-semibold"
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
