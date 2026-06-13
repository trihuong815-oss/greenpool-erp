'use client';

// ─────────────────────────────────────────────────────────────────────────────
// ProposalDetailDrawer V6 — SIMPLIFIED theo SPEC chốt 2026-06-12
// Drawer slide phải, rộng 640px (nhỏ hơn V5 720px vì content gọn).
//
// 5 SECTION duy nhất:
//   S1 · Thông tin đề xuất       (6 cell: Mã / Tên / Loại / Người tạo / Trạng thái / Giá trị)
//   S2 · Nội dung đề xuất (Lý do) (textarea pre-wrap, border-left emerald)
//   S3 · File đính kèm            (list paperclip)
//   S4 · Luồng duyệt (timeline)   (4 NÚT: Duyệt · Từ chối · YCBS · Duyệt & Tạo điều phối)
//   S5 · Điều phối liên kết       (Đã có ĐP | Đã duyệt chưa tạo | Chưa có)
//
// V6 ĐÃ BỎ so với V5:
//   - S2 cũ (hiện trạng / vấn đề / bằng chứng)
//   - S3 cũ (giải pháp / scopeItems multi-select / decisionNeeded)
//   - S4 cũ (expectedBenefit / riskIfNot / expectedResult)
//   - Banner 5 câu hỏi / Accordion afterApproval
//   - Tag priority / source / liên khối ở header
//
// BACKWARD COMPAT:
//   - Vẫn nhận field cũ V5 (proposedSolution / description / scopeItems...) qua type
//     nhưng KHÔNG render — DeXuatClient adapter có thể giữ nguyên.
//   - Prop `onConvertToCoord` (V5) = alias của `onApproveAndCreateCoord` (V6).
//
// QUY TẮC V6 (tuân thủ):
//   - Tiếng Việt CÓ DẤU đầy đủ
//   - Tailwind only · default export
//   - Không đụng /dieu-phoi V4, không đụng module FROZEN
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import {
  X,
  Check,
  RotateCcw,
  XCircle,
  Clock,
  CheckCircle2,
  CircleDashed,
  Paperclip,
  ArrowRightCircle,
  ExternalLink,
  Archive,
  FileText,
  AlignLeft,
  Building2,
  GitBranch,
  Link2,
  Sparkles,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types V6 (giữ alias V5 để DeXuatClient không vỡ)
// ─────────────────────────────────────────────────────────────────────────────

export type ProposalKind =
  // V6.4 (2026-06-13) — 3 loại chính thức
  | 'van_hanh'
  | 'du_an'
  | 'cai_tien'
  // Alias V3
  | 'nhan_su'
  | 'mkt_kd'
  | 'tai_chinh'
  // Alias V2
  | 'co_so'
  | 'khac';

export type ProposalStatus =
  | 'nhap'
  | 'da_gui'
  | 'dang_xem_xet'
  | 'yeu_cau_bo_sung'
  | 'da_phe_duyet'
  | 'tu_choi'
  | 'chuyen_dieu_phoi'
  | 'dong_ho_so'
  // Alias V3 — V6 không sinh mới, giữ literal để compile không vỡ
  | 'dong_y_nguyen_tac';

export type ApproverStepStatus =
  | 'cho_tiep'
  | 'dang_xem_xet'
  | 'da_duyet'
  | 'tu_choi'
  | 'yeu_cau_bo_sung'
  | 'dong_y_nguyen_tac';

export type ProposalPriority =
  | 'binh_thuong'
  | 'quan_trong'
  | 'khan_cap'
  | 'thap'
  | 'thuong'
  | 'cao'
  | 'khan'
  | 'rat_khan'
  | 'low'
  | 'normal'
  | 'high'
  | 'urgent';

export interface ProposalApproverV2 {
  id: string;
  uid: string;
  name: string;
  role: string;
  status: ApproverStepStatus;
  decidedAt?: string;
  note?: string;
  reason?: string;
  slaHours?: number;
}

export interface ProposalAttachment {
  id: string;
  name: string;
  url?: string;
  size?: number;
}

export interface ProposalHistoryEntry {
  at: string;
  actorName: string;
  action: string;
  note?: string;
}

// V5 scope (giữ để DeXuatClient không vỡ — V6 KHÔNG render)
export type ProposalScopeKind = 'TP' | 'QLCS' | 'co_so' | 'khoi';
export interface ProposalScopeItem {
  kind: ProposalScopeKind;
  id: string;
  label: string;
}

export interface ProposalV2 {
  id: string;
  code: string;
  title: string;
  description: string;
  kind: ProposalKind;
  status: ProposalStatus;
  estimatedCost?: number | null;
  deadline?: string;
  creatorUid: string;
  creatorName: string;
  creatorRole?: string;
  createdAt: string;
  approverChain: ProposalApproverV2[];
  attachments?: ProposalAttachment[];
  linkedCoordTaskId?: string;
  linkedCoordTaskCode?: string;
  // V6.5 (2026-06-14): cấu hình quản trị
  nature?: 'support' | 'governance';
  recipientUnitName?: string;
  recipientLeaderName?: string;
  hasFinancial?: boolean;

  // ── Field V3/V5 (giữ để không vỡ caller — V6 không render) ──
  priority?: ProposalPriority;
  relatedBlock?: 'KD' | 'VP' | 'lien_khoi';
  relatedDept?: string;
  relatedBranch?: string;
  currentSituation?: string;
  problemStatement?: string;
  evidence?: string;
  proposedSolution?: string;
  scope?: string;
  expectedStartDate?: string;
  involvedUnits?: string[];
  expectedBenefit?: string;
  riskIfNot?: string;
  riskIfDo?: string;
  neededHeadcount?: number | string;
  createCoordAfter?: boolean;
  expectedOwner?: string;
  expectedCollaborators?: string[];
  expectedDeadline?: string;
  expectedDeliverable?: string;
  slaDeadline?: string;
  isOverdue?: boolean;
  history?: ProposalHistoryEntry[];
  scopeItems?: ProposalScopeItem[];
  autoRelatedBlocks?: ('KD' | 'VP')[];
  isCrossBlock?: boolean;
  decisionNeeded?: string;
  expectedResult?: string;
  source?:
    | 'phat_sinh'
    | 'kpi'
    | 'hop'
    | 'ceo_giao'
    | 'khach_hang_phan_anh'
    | 'khac';

  // ── V6 mới: lý do (= V5 problemStatement/description hợp nhất) ──
  reason?: string;
}

interface ProposalDetailDrawerProps {
  proposal: ProposalV2 | null;
  currentUserUid: string;
  currentUserRole: string;
  onClose: () => void;
  onApprove: (proposalId: string, note?: string) => void;
  onReject: (proposalId: string, reason: string) => void;
  onRequestRevision: (proposalId: string, reason: string) => void;
  /** V6: Duyệt & Tạo điều phối — 1 thao tác */
  onApproveAndCreateCoord?: (proposalId: string) => void;
  /** V5 alias — DeXuatClient cũ vẫn truyền tên này */
  onConvertToCoord?: (proposalId: string) => void;
  onOpenLinkedCoord?: (coordTaskId: string) => void;
  onCloseDossier?: (proposalId: string) => void;
  /** V6.2: mở modal sửa đề xuất với pre-fill */
  onEdit?: (proposalId: string) => void;
  /** V3 alias — không dùng ở V6 */
  onAgreeInPrinciple?: (proposalId: string, note: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Labels & colors V6
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<ProposalStatus, string> = {
  nhap: 'Nháp',
  da_gui: 'Đã gửi',
  dang_xem_xet: 'Đang xem xét',
  yeu_cau_bo_sung: 'Yêu cầu bổ sung',
  da_phe_duyet: 'Đã phê duyệt',
  tu_choi: 'Từ chối',
  chuyen_dieu_phoi: 'Đã tạo điều phối',
  dong_ho_so: 'Đóng hồ sơ',
  dong_y_nguyen_tac: 'Đồng ý nguyên tắc',
};

const STATUS_COLOR: Record<ProposalStatus, string> = {
  nhap: 'bg-slate-100 text-slate-700 ring-slate-200',
  da_gui: 'bg-amber-50 text-amber-700 ring-amber-200',
  dang_xem_xet: 'bg-sky-50 text-sky-700 ring-sky-200',
  yeu_cau_bo_sung: 'bg-orange-50 text-orange-700 ring-orange-200',
  da_phe_duyet: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  tu_choi: 'bg-rose-50 text-rose-700 ring-rose-200',
  chuyen_dieu_phoi: 'bg-violet-50 text-violet-700 ring-violet-200',
  dong_ho_so: 'bg-slate-100 text-slate-600 ring-slate-200',
  dong_y_nguyen_tac: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

const KIND_LABEL: Record<ProposalKind, string> = {
  van_hanh: 'Vận hành',
  du_an: 'Dự án',
  cai_tien: 'Cải tiến',
  // V3 alias (giữ vì union type ProposalKind có)
  nhan_su: 'Nhân sự',
  mkt_kd: 'Marketing/Kinh doanh',
  tai_chinh: 'Tài chính/Mua sắm',
  co_so: 'Cơ sở',
  khac: 'Khác',
};

const KIND_COLOR: Record<ProposalKind, string> = {
  van_hanh: 'bg-sky-50 text-sky-700 ring-sky-200',
  du_an: 'bg-violet-50 text-violet-700 ring-violet-200',
  cai_tien: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  // V3 alias
  nhan_su: 'bg-violet-50 text-violet-700 ring-violet-200',
  mkt_kd: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  tai_chinh: 'bg-amber-50 text-amber-700 ring-amber-200',
  co_so: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  khac: 'bg-slate-50 text-slate-700 ring-slate-200',
};

const ROLE_LABEL: Record<string, string> = {
  CEO: 'CEO',
  CHU_TICH: 'Chủ tịch',
  GD_KD: 'Giám đốc Kinh doanh',
  GD_VP: 'Giám đốc Văn phòng',
  QLCS: 'QLCS',
  TP_DT: 'TP Đào tạo',
  TP_NS: 'TP Nhân sự',
  TP_KE: 'TP Kế toán',
  TP_MKT: 'TP Marketing',
  TP_KT: 'TP Kỹ thuật',
  TP_GS: 'TP Giám sát',
};

function formatVnDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function formatVnd(n?: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('vi-VN') + ' đ';
}

function formatFileSize(bytes?: number): string {
  if (bytes == null || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ProposalDetailDrawer({
  proposal,
  currentUserUid,
  currentUserRole: _currentUserRole,
  onClose,
  onApprove,
  onReject,
  onRequestRevision,
  onApproveAndCreateCoord,
  onConvertToCoord,
  onOpenLinkedCoord,
  onCloseDossier,
  onEdit,
  onAgreeInPrinciple: _onAgreeInPrinciple,
}: ProposalDetailDrawerProps) {
  void _currentUserRole;
  void _onAgreeInPrinciple;

  // V6: chỉ còn 3 mode (BỎ in_principle, BỎ approve-with-note separate)
  // 'idle' | 'revision' | 'reject'
  const [decisionMode, setDecisionMode] =
    useState<'idle' | 'revision' | 'reject'>('idle');
  const [decisionNote, setDecisionNote] = useState('');

  if (!proposal) return null;

  // ── Resolve handler "Duyệt & Tạo điều phối" — V6 ưu tiên, fallback V5 alias ──
  const handleApproveAndCreate =
    onApproveAndCreateCoord ?? onConvertToCoord ?? null;

  // ── Active step & quyền duyệt ──
  function isCurrentApprover(step: ProposalApproverV2): boolean {
    return step.uid === currentUserUid && step.status === 'dang_xem_xet';
  }
  const activeStep = proposal.approverChain.find(
    (s) => s.status === 'dang_xem_xet'
  );
  const userIsActiveApprover =
    !!activeStep && activeStep.uid === currentUserUid;

  const isApproved = proposal.status === 'da_phe_duyet';
  const isLinkedToCoord = !!proposal.linkedCoordTaskId;

  // ── Resolve nội dung lý do: V6 reason → fallback V5 problem/desc ──
  const reasonContent =
    proposal.reason?.trim() ||
    proposal.problemStatement?.trim() ||
    proposal.description?.trim() ||
    '';

  // ── Đóng hồ sơ ──
  const canCloseDossier =
    !!onCloseDossier &&
    (proposal.status === 'da_phe_duyet' ||
      proposal.status === 'tu_choi' ||
      proposal.status === 'chuyen_dieu_phoi') &&
    proposal.status !== ('dong_ho_so' as ProposalStatus);

  // V6.2: quyền SỬA đề xuất
  //  - Creator: cho phép khi status='nhap' (chưa gửi) hoặc 'yeu_cau_bo_sung' (cần bổ sung)
  //  - ADMIN/CEO: cho phép mọi lúc TRỪ 'dong_ho_so'
  const isAdminOrCEO = _currentUserRole === 'ADMIN' || _currentUserRole === 'CEO';
  const isCreator = proposal.creatorUid === currentUserUid;
  const canEdit = !!onEdit && proposal.status !== ('dong_ho_so' as ProposalStatus) && (
    isAdminOrCEO || (isCreator && ['nhap', 'yeu_cau_bo_sung'].includes(proposal.status))
  );

  // ── Action handlers ──
  function handleApproveDirect() {
    onApprove(proposal!.id, undefined);
  }

  function handleConfirmNote() {
    const trimmed = decisionNote.trim();
    if (decisionMode === 'reject') {
      if (!trimmed) {
        alert('Vui lòng nhập lý do từ chối.');
        return;
      }
      onReject(proposal!.id, trimmed);
    } else if (decisionMode === 'revision') {
      if (!trimmed) {
        alert('Vui lòng nhập nội dung yêu cầu bổ sung.');
        return;
      }
      onRequestRevision(proposal!.id, trimmed);
    }
    setDecisionMode('idle');
    setDecisionNote('');
  }

  function cancelNote() {
    setDecisionMode('idle');
    setDecisionNote('');
  }

  function handleApproveAndCreateClick() {
    if (!handleApproveAndCreate) {
      alert('Chưa cấu hình "Duyệt & Tạo điều phối".');
      return;
    }
    const ok = window.confirm(
      'Phê duyệt đề xuất và TẠO ĐIỀU PHỐI mới?\n\n' +
        'Hệ thống sẽ chuyển trạng thái sang "Đã tạo điều phối" và mở /dieu-phoi.'
    );
    if (!ok) return;
    handleApproveAndCreate(proposal!.id);
  }

  // ── Step icon & label ──
  function StepIcon({ status }: { status: ApproverStepStatus }) {
    if (status === 'da_duyet' || status === 'dong_y_nguyen_tac')
      return <CheckCircle2 size={16} className="text-emerald-600" />;
    if (status === 'dang_xem_xet')
      return <Clock size={16} className="text-amber-600" />;
    if (status === 'tu_choi')
      return <XCircle size={16} className="text-rose-600" />;
    if (status === 'yeu_cau_bo_sung')
      return <RotateCcw size={16} className="text-orange-600" />;
    return <CircleDashed size={16} className="text-slate-400" />;
  }

  function stepStatusLabel(status: ApproverStepStatus): string {
    switch (status) {
      case 'da_duyet':
      case 'dong_y_nguyen_tac':
        return 'Đã duyệt';
      case 'dang_xem_xet':
        return 'Đang xem xét';
      case 'tu_choi':
        return 'Từ chối';
      case 'yeu_cau_bo_sung':
        return 'Yêu cầu bổ sung';
      case 'cho_tiep':
        return 'Chờ tiếp';
    }
  }

  function stepStatusChip(status: ApproverStepStatus): string {
    switch (status) {
      case 'da_duyet':
      case 'dong_y_nguyen_tac':
        return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
      case 'dang_xem_xet':
        return 'bg-amber-50 text-amber-700 ring-amber-200';
      case 'tu_choi':
        return 'bg-rose-50 text-rose-700 ring-rose-200';
      case 'yeu_cau_bo_sung':
        return 'bg-orange-50 text-orange-700 ring-orange-200';
      case 'cho_tiep':
        return 'bg-slate-100 text-slate-600 ring-slate-200';
    }
  }

  // ── Section helper ──
  function SectionTitle({
    icon: Icon,
    title,
    sub,
  }: {
    icon: any;
    title: string;
    sub?: string;
  }) {
    return (
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
          <Icon size={14} />
        </div>
        <div className="min-w-0">
          <h3 className="text-xs uppercase tracking-wider text-slate-700 font-bold">
            {title}
          </h3>
          {sub && (
            <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>
          )}
        </div>
      </div>
    );
  }

  function Field({
    label,
    value,
    placeholder = '—',
  }: {
    label: string;
    value?: string | number | null;
    placeholder?: string;
  }) {
    const v = value == null || value === '' ? placeholder : value;
    return (
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
          {label}
        </p>
        <p className="text-sm text-slate-800 break-words">{v}</p>
      </div>
    );
  }

  // ── Render ──
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex justify-end"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-[640px] h-full shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header sticky ───────────────────────────────────────── */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3 sticky top-0 bg-white z-10">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
              <span className="text-[11px] font-bold text-slate-500 tabular-nums tracking-wide">
                {proposal.code}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ring-1 ${KIND_COLOR[proposal.kind]}`}
              >
                {KIND_LABEL[proposal.kind]}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ring-1 ${STATUS_COLOR[proposal.status]}`}
              >
                {STATUS_LABEL[proposal.status]}
              </span>
            </div>
            <h2 className="text-base font-bold text-slate-900 leading-snug">
              {proposal.title}
            </h2>
            <p className="text-[11px] text-slate-500 mt-1">
              Người tạo:{' '}
              <span className="font-medium text-slate-700">
                {proposal.creatorName}
              </span>
              {proposal.creatorRole
                ? ` · ${ROLE_LABEL[proposal.creatorRole] ?? proposal.creatorRole}`
                : ''}
              {' · '}
              {formatVnDate(proposal.createdAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 flex-shrink-0"
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Body ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

          {/* ═══ S1 — Thông tin đề xuất ═══ */}
          <section>
            <SectionTitle
              icon={FileText}
              title="S1 · Thông tin đề xuất"
              sub="Thông tin chung của đề xuất"
            />
            <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Mã" value={proposal.code} />
              <Field label="Tên đề xuất" value={proposal.title} />
              <Field label="Loại" value={KIND_LABEL[proposal.kind]} />
              {/* V6.5 (2026-06-14): Tính chất đề xuất */}
              {proposal.nature && (
                <Field
                  label="Tính chất"
                  value={proposal.nature === 'governance' ? '⚙️ Đề xuất quản trị' : '🤝 Hỗ trợ công việc'}
                />
              )}
              <Field
                label="Người tạo"
                value={
                  proposal.creatorRole
                    ? `${proposal.creatorName} · ${ROLE_LABEL[proposal.creatorRole] ?? proposal.creatorRole}`
                    : proposal.creatorName
                }
              />
              <Field
                label="Trạng thái"
                value={STATUS_LABEL[proposal.status]}
              />
              {proposal.recipientUnitName && (
                <Field label="Đơn vị nhận" value={proposal.recipientUnitName} />
              )}
              {proposal.nature === 'governance' && proposal.recipientLeaderName && (
                <Field label="Lãnh đạo phê duyệt" value={proposal.recipientLeaderName} />
              )}
              {proposal.nature === 'governance' && (
                <Field
                  label="Có phát sinh TC"
                  value={proposal.hasFinancial ? 'Có' : 'Không'}
                />
              )}
              {proposal.estimatedCost != null && proposal.estimatedCost > 0 && (
                <Field
                  label="Giá trị dự kiến"
                  value={formatVnd(proposal.estimatedCost)}
                />
              )}
            </div>
          </section>

          {/* ═══ S2 — Nội dung đề xuất (Lý do) ═══ */}
          <section>
            <SectionTitle
              icon={AlignLeft}
              title="S2 · Nội dung đề xuất"
              sub="Lý do đề xuất / mô tả ngắn"
            />
            <div className="rounded-xl border border-slate-200 bg-white p-4 border-l-4 border-l-emerald-500">
              {reasonContent ? (
                <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {reasonContent}
                </p>
              ) : (
                <p className="text-sm italic text-slate-400">
                  Chưa cập nhật nội dung.
                </p>
              )}
            </div>
          </section>

          {/* ═══ S3 — File đính kèm ═══ */}
          <section>
            <SectionTitle
              icon={Paperclip}
              title="S3 · File đính kèm"
              sub="Tài liệu, hình ảnh, báo giá..."
            />
            {proposal.attachments && proposal.attachments.length > 0 ? (
              <ul className="space-y-1.5">
                {proposal.attachments.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white"
                  >
                    <Paperclip
                      size={14}
                      className="text-slate-400 flex-shrink-0"
                    />
                    {f.url ? (
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-emerald-700 hover:underline truncate flex-1"
                      >
                        {f.name}
                      </a>
                    ) : (
                      <span className="text-sm text-slate-700 truncate flex-1">
                        {f.name}
                      </span>
                    )}
                    {f.size != null && (
                      <span className="text-[11px] text-slate-400 tabular-nums flex-shrink-0">
                        {formatFileSize(f.size)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-xs text-slate-500 italic px-3 py-3 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-center">
                Không có file đính kèm.
              </div>
            )}
          </section>

          {/* ═══ S4 — Luồng duyệt (timeline + 4 nút) ═══ */}
          <section>
            <SectionTitle
              icon={GitBranch}
              title="S4 · Luồng duyệt"
              sub="Chuỗi người duyệt theo workflow"
            />
            {proposal.approverChain.length === 0 ? (
              <div className="text-xs text-slate-500 italic px-3 py-3 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-center">
                Chưa có chuỗi duyệt.
              </div>
            ) : (
              <ol className="space-y-3">
                {proposal.approverChain.map((step, idx) => {
                  const active = isCurrentApprover(step);
                  return (
                    <li
                      key={step.id}
                      className={`relative rounded-lg border p-3 ${
                        active
                          ? 'border-amber-300 bg-amber-50/40'
                          : step.status === 'da_duyet' ||
                              step.status === 'dong_y_nguyen_tac'
                            ? 'border-emerald-200 bg-emerald-50/30'
                            : step.status === 'tu_choi'
                              ? 'border-rose-200 bg-rose-50/30'
                              : step.status === 'yeu_cau_bo_sung'
                                ? 'border-orange-200 bg-orange-50/30'
                                : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        {/* Vòng tròn số + Avatar Building */}
                        <div className="flex-shrink-0 flex flex-col items-center gap-1">
                          <div className="w-7 h-7 rounded-full bg-white border border-slate-300 flex items-center justify-center text-xs font-bold text-slate-600 tabular-nums">
                            {idx + 1}
                          </div>
                          <div className="w-7 h-7 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                            <Building2
                              size={14}
                              className="text-emerald-700"
                            />
                          </div>
                        </div>

                        {/* Thông tin */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-800">
                              {step.name}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {ROLE_LABEL[step.role] ?? step.role}
                            </span>
                          </div>
                          {step.reason && (
                            <p className="text-[11px] text-slate-500 italic mt-0.5">
                              Lý do: {step.reason}
                            </p>
                          )}
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <StepIcon status={step.status} />
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ring-1 ${stepStatusChip(step.status)}`}
                            >
                              {stepStatusLabel(step.status)}
                            </span>
                            {step.decidedAt && (
                              <span className="text-[11px] text-slate-400">
                                · {formatVnDate(step.decidedAt)}
                              </span>
                            )}
                            {step.slaHours != null &&
                              step.status === 'dang_xem_xet' && (
                                <span className="text-[11px] text-amber-600">
                                  · SLA {step.slaHours}h
                                </span>
                              )}
                          </div>
                          {step.note && (
                            <div className="mt-2 px-2.5 py-1.5 rounded bg-white border border-slate-200 text-[12px] text-slate-700 italic">
                              &quot;{step.note}&quot;
                            </div>
                          )}

                          {/* ═══ 4 NÚT V6 ═══ */}
                          {active && (
                            <div className="mt-3 pt-3 border-t border-amber-200/60">
                              {decisionMode === 'idle' ? (
                                <div className="flex flex-wrap gap-1.5">
                                  <button
                                    type="button"
                                    onClick={handleApproveDirect}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm"
                                  >
                                    <Check size={13} /> Duyệt
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDecisionMode('reject')}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg"
                                  >
                                    <XCircle size={13} /> Từ chối
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDecisionMode('revision')
                                    }
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg"
                                  >
                                    <RotateCcw size={13} /> Yêu cầu bổ sung
                                  </button>
                                  {handleApproveAndCreate && (
                                    <button
                                      type="button"
                                      onClick={handleApproveAndCreateClick}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-lg shadow-md ring-1 ring-violet-300"
                                    >
                                      <Sparkles size={13} />
                                      Duyệt &amp; Tạo điều phối
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <label className="block text-[11px] font-medium text-slate-600">
                                    {decisionMode === 'reject'
                                      ? 'Lý do từ chối'
                                      : 'Nội dung yêu cầu bổ sung'}
                                    <span className="text-rose-500"> *</span>
                                  </label>
                                  <textarea
                                    value={decisionNote}
                                    onChange={(e) =>
                                      setDecisionNote(e.target.value)
                                    }
                                    rows={3}
                                    placeholder={
                                      decisionMode === 'reject'
                                        ? 'VD: Chi phí vượt ngân sách quý, cần xem xét lại phương án...'
                                        : 'VD: Bổ sung báo giá so sánh 3 nhà cung cấp...'
                                    }
                                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                                  />
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={handleConfirmNote}
                                      className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white rounded-lg shadow-sm ${
                                        decisionMode === 'reject'
                                          ? 'bg-rose-600 hover:bg-rose-700'
                                          : 'bg-amber-600 hover:bg-amber-700'
                                      }`}
                                    >
                                      Xác nhận
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelNote}
                                      className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                                    >
                                      Huỷ
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            {!userIsActiveApprover && activeStep && (
              <p className="text-[11px] text-slate-500 italic mt-2">
                Đang chờ{' '}
                <span className="font-medium text-slate-700">
                  {activeStep.name}
                </span>{' '}
                ra quyết định.
              </p>
            )}
          </section>

          {/* ═══ S5 — Điều phối liên kết ═══ */}
          <section>
            <SectionTitle
              icon={Link2}
              title="S5 · Điều phối liên kết"
              sub="Kết nối với module Điều phối"
            />

            {/* Case 1: Đã có ĐP */}
            {isLinkedToCoord && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-emerald-900">
                      Điều phối:{' '}
                      <span className="font-bold">
                        #
                        {proposal.linkedCoordTaskCode ??
                          proposal.linkedCoordTaskId}
                      </span>
                    </p>
                    <p className="text-[11px] text-emerald-700 mt-0.5">
                      Trạng thái: <em>đang xử lý</em>
                    </p>
                  </div>
                  {onOpenLinkedCoord && proposal.linkedCoordTaskId && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenLinkedCoord(proposal.linkedCoordTaskId!)
                      }
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-white border border-emerald-200 hover:bg-emerald-100 rounded-lg flex-shrink-0"
                    >
                      <ExternalLink size={12} /> Xem điều phối
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Case 2: Đã duyệt nhưng chưa tạo ĐP */}
            {isApproved && !isLinkedToCoord && (
              <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50/70 p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2
                      size={16}
                      className="text-emerald-600 flex-shrink-0"
                    />
                    <p className="text-sm font-semibold text-emerald-900">
                      Đã phê duyệt — chưa tạo điều phối
                    </p>
                  </div>
                  {handleApproveAndCreate && (
                    <button
                      type="button"
                      onClick={handleApproveAndCreateClick}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-lg shadow-md flex-shrink-0"
                    >
                      <ArrowRightCircle size={13} /> Tạo điều phối ngay
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Case 3: Không có gì */}
            {!isLinkedToCoord && !isApproved && (
              <div className="text-xs text-slate-500 italic px-3 py-3 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-center">
                Chưa có điều phối liên quan.
              </div>
            )}
          </section>
        </div>

        {/* ── Footer ────────────────────────────────────────────── */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50">
          <div className="flex items-center justify-end gap-2 flex-wrap">
            {canEdit && onEdit && (
              <button
                type="button"
                onClick={() => onEdit(proposal.id)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-sky-700 bg-white border border-sky-300 hover:bg-sky-50 rounded-lg"
              >
                ✎ Sửa đề xuất
              </button>
            )}
            {canCloseDossier && (
              <button
                type="button"
                onClick={() =>
                  onCloseDossier && onCloseDossier(proposal.id)
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg"
              >
                <Archive size={13} /> Đóng hồ sơ
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white rounded-lg"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
