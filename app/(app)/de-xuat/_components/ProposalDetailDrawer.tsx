'use client';

// Drawer chi tiết đề xuất V3 — theo SPEC anh chốt 2026-05-31 (mở rộng từ V2):
//   - Drawer slide phải, rộng 720px (V2 là 640px)
//   - 9 trạng thái (thêm dong_y_nguyen_tac, dong_ho_so)
//   - 5 loại V3 (van_hanh, nhan_su, mkt_kd, tai_chinh, chien_luoc)
//   - 6 SECTION đầy đủ:
//       S1 Tóm tắt · S2 Hiện trạng/Vấn đề · S3 Nội dung · S4 Tác động ·
//       S5 Luồng duyệt (timeline + 4 nút) · S6 Sau duyệt (createCoordAfter)
//   - 4 nút quyết định: Duyệt · Đồng ý nguyên tắc · Yêu cầu bổ sung · Từ chối
//   - Footer: Tạo điều phối (nếu da_phe_duyet + createCoordAfter), Đóng hồ sơ
//   - Giữ tương thích export V2 (ProposalV2, ProposalApproverV2, ApproverStepStatus)
//     bằng cách MỞ RỘNG interface với field optional V3.

import { useState } from 'react';
import {
  X,
  Check,
  RotateCcw,
  XCircle,
  Clock,
  CheckCircle2,
  CircleDashed,
  Coins,
  Paperclip,
  ArrowRightCircle,
  ExternalLink,
  Equal,
  Archive,
  AlertTriangle,
  Users,
  Target,
  Lightbulb,
  ShieldAlert,
  Flag,
  Building2,
  History,
  FileText,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types V3 (mở rộng V2 — giữ tương thích)
// ─────────────────────────────────────────────────────────────────────────────

export type ProposalKind =
  | 'tai_chinh'
  | 'nhan_su'
  | 'van_hanh'
  | 'mkt_kd'
  | 'chien_luoc'
  // Giữ alias V2 để không vỡ caller cũ
  | 'co_so'
  | 'khac';

export type ProposalStatus =
  | 'nhap'
  | 'da_gui'
  | 'dang_xem_xet'
  | 'yeu_cau_bo_sung'
  | 'dong_y_nguyen_tac'   // ← MỚI V3
  | 'da_phe_duyet'
  | 'tu_choi'
  | 'chuyen_dieu_phoi'
  | 'dong_ho_so';         // ← MỚI V3

export type ApproverStepStatus =
  | 'cho_tiep'
  | 'dang_xem_xet'
  | 'da_duyet'
  | 'dong_y_nguyen_tac'   // ← MỚI V3
  | 'tu_choi'
  | 'yeu_cau_bo_sung';

export type ProposalPriority = 'thap' | 'thuong' | 'cao' | 'khan' | 'rat_khan';

export interface ProposalApproverV2 {
  id: string;
  uid: string;
  name: string;
  role: string;
  status: ApproverStepStatus;
  decidedAt?: string;
  note?: string;
}

export interface ProposalAttachment {
  id: string;
  name: string;
  url?: string;
}

export interface ProposalHistoryEntry {
  at: string;                      // ISO
  actorName: string;
  action: string;                  // "Tạo", "Gửi", "Mở xem", "Duyệt", ...
  note?: string;
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

  // ── Mở rộng V3 (tất cả optional để giữ tương thích V2) ──
  priority?: ProposalPriority;
  relatedBlock?: 'KD' | 'VP' | 'lien_khoi';
  relatedDept?: string;
  relatedBranch?: string;
  // S2 Hiện trạng / Vấn đề
  currentSituation?: string;
  problemStatement?: string;
  evidence?: string;
  // S3 Nội dung đề xuất
  proposedSolution?: string;
  scope?: string;
  expectedStartDate?: string;
  involvedUnits?: string[];
  // S4 Tác động dự kiến
  expectedBenefit?: string;
  riskIfNot?: string;
  riskIfDo?: string;
  neededHeadcount?: number;
  // S6 Sau duyệt
  createCoordAfter?: boolean;
  expectedOwner?: string;
  expectedCollaborators?: string[];
  expectedDeadline?: string;
  expectedDeliverable?: string;
  // SLA
  slaDeadline?: string;
  isOverdue?: boolean;
  // History
  history?: ProposalHistoryEntry[];
}

interface ProposalDetailDrawerProps {
  proposal: ProposalV2;
  currentUserUid: string;
  currentUserRole: string;
  onClose: () => void;
  onApprove: (proposalId: string, note?: string) => void;
  onReject: (proposalId: string, reason: string) => void;
  onRequestRevision: (proposalId: string, reason: string) => void;
  onConvertToCoord: (proposalId: string) => void;
  onOpenLinkedCoord?: (coordTaskId: string) => void;
  // ── Mở rộng V3 (optional) ──
  onAgreeInPrinciple?: (proposalId: string, note: string) => void;
  onCloseDossier?: (proposalId: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Labels & colors V3
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<ProposalStatus, string> = {
  nhap: 'Nháp',
  da_gui: 'Đã gửi',
  dang_xem_xet: 'Đang xem xét',
  yeu_cau_bo_sung: 'Yêu cầu bổ sung',
  dong_y_nguyen_tac: 'Đồng ý nguyên tắc',
  da_phe_duyet: 'Đã phê duyệt',
  tu_choi: 'Từ chối',
  chuyen_dieu_phoi: 'Chuyển điều phối',
  dong_ho_so: 'Đóng hồ sơ',
};

const STATUS_COLOR: Record<ProposalStatus, string> = {
  nhap: 'bg-slate-100 text-slate-700 ring-slate-200',
  da_gui: 'bg-amber-50 text-amber-700 ring-amber-200',
  dang_xem_xet: 'bg-sky-50 text-sky-700 ring-sky-200',
  yeu_cau_bo_sung: 'bg-orange-50 text-orange-700 ring-orange-200',
  dong_y_nguyen_tac: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  da_phe_duyet: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  tu_choi: 'bg-rose-50 text-rose-700 ring-rose-200',
  chuyen_dieu_phoi: 'bg-violet-50 text-violet-700 ring-violet-200',
  dong_ho_so: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const KIND_LABEL: Record<ProposalKind, string> = {
  tai_chinh: 'Đề xuất tài chính/mua sắm',
  nhan_su: 'Đề xuất nhân sự',
  van_hanh: 'Đề xuất vận hành',
  mkt_kd: 'Đề xuất Marketing/Kinh doanh',
  chien_luoc: 'Đề xuất chiến lược',
  co_so: 'Đề xuất Marketing/Kinh doanh',
  khac: 'Đề xuất chiến lược',
};

const KIND_COLOR: Record<ProposalKind, string> = {
  tai_chinh: 'bg-amber-50 text-amber-700 ring-amber-200',
  nhan_su: 'bg-violet-50 text-violet-700 ring-violet-200',
  van_hanh: 'bg-sky-50 text-sky-700 ring-sky-200',
  mkt_kd: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  chien_luoc: 'bg-rose-50 text-rose-700 ring-rose-200',
  co_so: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  khac: 'bg-rose-50 text-rose-700 ring-rose-200',
};

const PRIORITY_LABEL: Record<ProposalPriority, string> = {
  thap: 'Thấp',
  thuong: 'Thường',
  cao: 'Cao',
  khan: 'Khẩn',
  rat_khan: 'Rất khẩn',
};

const PRIORITY_COLOR: Record<ProposalPriority, string> = {
  thap: 'bg-slate-100 text-slate-700 ring-slate-200',
  thuong: 'bg-sky-50 text-sky-700 ring-sky-200',
  cao: 'bg-amber-50 text-amber-700 ring-amber-200',
  khan: 'bg-rose-50 text-rose-700 ring-rose-200',
  rat_khan: 'bg-rose-100 text-rose-800 ring-rose-300',
};

const BLOCK_LABEL: Record<'KD' | 'VP' | 'lien_khoi', string> = {
  KD: 'Khối Kinh doanh',
  VP: 'Khối Văn phòng',
  lien_khoi: 'Liên khối',
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
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatVnDateShort(yyyymmdd?: string): string {
  if (!yyyymmdd) return '—';
  try {
    return new Date(yyyymmdd).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return yyyymmdd;
  }
}

function formatVnd(n?: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('vi-VN') + ' đ';
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
  onConvertToCoord,
  onOpenLinkedCoord,
  onAgreeInPrinciple,
  onCloseDossier,
}: ProposalDetailDrawerProps) {
  void _currentUserRole;

  // 'idle' | 'approve' | 'in_principle' | 'revision' | 'reject'
  const [decisionMode, setDecisionMode] =
    useState<'idle' | 'approve' | 'in_principle' | 'revision' | 'reject'>('idle');
  const [decisionNote, setDecisionNote] = useState('');

  // ── Helpers ──────────────────────────────────────────────────────────────
  function isCurrentApprover(step: ProposalApproverV2): boolean {
    return step.uid === currentUserUid && step.status === 'dang_xem_xet';
  }

  const activeStep = proposal.approverChain.find((s) => s.status === 'dang_xem_xet');
  const userIsActiveApprover = !!activeStep && activeStep.uid === currentUserUid;

  const isApproved = proposal.status === 'da_phe_duyet';
  const isLinkedToCoord = !!proposal.linkedCoordTaskId;
  const userIsCreator = proposal.creatorUid === currentUserUid;

  const createCoordAfter = proposal.createCoordAfter !== false; // default true để giữ V2
  const canConvertToCoord =
    isApproved && !isLinkedToCoord && userIsCreator && createCoordAfter;

  const canCloseDossier =
    !!onCloseDossier &&
    (proposal.status === 'da_phe_duyet' ||
      proposal.status === 'tu_choi' ||
      proposal.status === 'chuyen_dieu_phoi') &&
    proposal.status !== ('dong_ho_so' as ProposalStatus);

  // ── Action handlers ──────────────────────────────────────────────────────
  function handleApproveDirect() {
    onApprove(proposal.id, decisionNote.trim() || undefined);
    setDecisionMode('idle');
    setDecisionNote('');
  }

  function handleConfirmDecision() {
    const trimmed = decisionNote.trim();
    if (decisionMode === 'reject') {
      if (!trimmed) {
        alert('Vui lòng nhập lý do từ chối.');
        return;
      }
      onReject(proposal.id, trimmed);
    } else if (decisionMode === 'revision') {
      if (!trimmed) {
        alert('Vui lòng nhập nội dung yêu cầu bổ sung.');
        return;
      }
      onRequestRevision(proposal.id, trimmed);
    } else if (decisionMode === 'in_principle') {
      if (!trimmed) {
        alert('Vui lòng nhập kế hoạch bổ sung kèm đồng ý nguyên tắc.');
        return;
      }
      if (onAgreeInPrinciple) {
        onAgreeInPrinciple(proposal.id, trimmed);
      } else {
        // Fallback: ghi note vào nhánh approve (caller cũ chưa có handler)
        onApprove(proposal.id, `[Đồng ý nguyên tắc] ${trimmed}`);
      }
    } else if (decisionMode === 'approve') {
      onApprove(proposal.id, trimmed || undefined);
    }
    setDecisionMode('idle');
    setDecisionNote('');
  }

  function cancelDecision() {
    setDecisionMode('idle');
    setDecisionNote('');
  }

  // ── Step icon & label ────────────────────────────────────────────────────
  function StepIcon({ status }: { status: ApproverStepStatus }) {
    if (status === 'da_duyet') return <CheckCircle2 size={18} className="text-emerald-600" />;
    if (status === 'dong_y_nguyen_tac') return <Equal size={18} className="text-emerald-600" />;
    if (status === 'dang_xem_xet') return <Clock size={18} className="text-amber-600" />;
    if (status === 'tu_choi') return <XCircle size={18} className="text-rose-600" />;
    if (status === 'yeu_cau_bo_sung') return <RotateCcw size={18} className="text-orange-600" />;
    return <CircleDashed size={18} className="text-slate-400" />;
  }

  function stepStatusLabel(status: ApproverStepStatus): string {
    switch (status) {
      case 'da_duyet': return '✓ Đã duyệt';
      case 'dong_y_nguyen_tac': return '≈ Đồng ý nguyên tắc';
      case 'dang_xem_xet': return 'Đang xem xét';
      case 'tu_choi': return '✗ Từ chối';
      case 'yeu_cau_bo_sung': return 'Yêu cầu bổ sung';
      case 'cho_tiep': return 'Chờ tiếp';
    }
  }

  function stepStatusChip(status: ApproverStepStatus): string {
    switch (status) {
      case 'da_duyet': return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
      case 'dong_y_nguyen_tac': return 'bg-emerald-50 text-emerald-700 ring-emerald-300';
      case 'dang_xem_xet': return 'bg-amber-50 text-amber-700 ring-amber-200';
      case 'tu_choi': return 'bg-rose-50 text-rose-700 ring-rose-200';
      case 'yeu_cau_bo_sung': return 'bg-orange-50 text-orange-700 ring-orange-200';
      case 'cho_tiep': return 'bg-slate-100 text-slate-600 ring-slate-200';
    }
  }

  // ── Section helper ───────────────────────────────────────────────────────
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
          {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
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
        <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</p>
        <p className="text-sm text-slate-800 break-words">{v}</p>
      </div>
    );
  }

  function Para({
    label,
    value,
    placeholder = 'Chưa cập nhật.',
  }: {
    label: string;
    value?: string;
    placeholder?: string;
  }) {
    return (
      <div>
        <p className="text-[11px] font-semibold text-slate-600 mb-1">{label}</p>
        <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
          {value && value.trim() ? value : (
            <span className="italic text-slate-400">{placeholder}</span>
          )}
        </p>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex justify-end" onClick={onClose}>
      <div
        className="bg-white w-full max-w-[720px] h-full shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header sticky ───────────────────────────────────────────── */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3 sticky top-0 bg-white z-10">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
              <span className="text-[11px] font-bold text-slate-500 tabular-nums tracking-wide">
                {proposal.code}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ring-1 ${STATUS_COLOR[proposal.status]}`}
              >
                {STATUS_LABEL[proposal.status]}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ring-1 ${KIND_COLOR[proposal.kind]}`}
              >
                {KIND_LABEL[proposal.kind]}
              </span>
              {proposal.priority && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ring-1 ${PRIORITY_COLOR[proposal.priority]}`}
                >
                  <Flag size={10} /> {PRIORITY_LABEL[proposal.priority]}
                </span>
              )}
              {proposal.isOverdue && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ring-1 bg-rose-50 text-rose-700 ring-rose-200">
                  <AlertTriangle size={10} /> Quá SLA
                </span>
              )}
            </div>
            <h2 className="text-base font-bold text-slate-900 leading-snug">{proposal.title}</h2>
            <p className="text-[11px] text-slate-500 mt-1">
              Người tạo:{' '}
              <span className="font-medium text-slate-700">{proposal.creatorName}</span>
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

        {/* ── Body ──────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

          {/* ═══ S1 — Tóm tắt ═══ */}
          <section>
            <SectionTitle icon={FileText} title="S1 · Tóm tắt" sub="Thông tin chung của đề xuất" />
            <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 grid grid-cols-2 gap-4">
              <Field label="Loại đề xuất" value={KIND_LABEL[proposal.kind]} />
              <Field
                label="Mức ưu tiên"
                value={proposal.priority ? PRIORITY_LABEL[proposal.priority] : '—'}
              />
              <Field label="Người tạo" value={proposal.creatorName} />
              <Field
                label="Vai trò"
                value={
                  proposal.creatorRole
                    ? ROLE_LABEL[proposal.creatorRole] ?? proposal.creatorRole
                    : '—'
                }
              />
              <Field
                label="Khối liên quan"
                value={proposal.relatedBlock ? BLOCK_LABEL[proposal.relatedBlock] : '—'}
              />
              <Field label="Phòng / Cơ sở" value={proposal.relatedBranch ?? proposal.relatedDept ?? '—'} />
              <Field label="Chi phí dự kiến" value={formatVnd(proposal.estimatedCost)} />
              <Field label="Ngày tạo" value={formatVnDate(proposal.createdAt)} />
              <Field label="Trạng thái" value={STATUS_LABEL[proposal.status]} />
              <Field
                label="Deadline / SLA"
                value={proposal.slaDeadline ? formatVnDate(proposal.slaDeadline) : formatVnDateShort(proposal.deadline)}
              />
            </div>
          </section>

          {/* ═══ S2 — Hiện trạng / Vấn đề ═══ */}
          <section>
            <SectionTitle
              icon={AlertTriangle}
              title="S2 · Hiện trạng / Vấn đề"
              sub="Mô tả tình hình hiện tại và vấn đề cần xử lý"
            />
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <Para label="Mô tả hiện trạng" value={proposal.currentSituation} />
              <Para label="Vấn đề cần giải quyết" value={proposal.problemStatement ?? proposal.description} />
              <Para label="Bằng chứng / Dữ liệu tham chiếu" value={proposal.evidence} />

              {proposal.attachments && proposal.attachments.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-[11px] font-semibold text-slate-600 mb-1.5">File đính kèm</p>
                  <ul className="space-y-1">
                    {proposal.attachments.map((f) => (
                      <li
                        key={f.id}
                        className="flex items-center gap-1.5 text-xs text-slate-700"
                      >
                        <Paperclip size={12} className="text-slate-400" />
                        {f.url ? (
                          <a
                            href={f.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-700 hover:underline"
                          >
                            {f.name}
                          </a>
                        ) : (
                          <span>{f.name}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          {/* ═══ S3 — Nội dung đề xuất ═══ */}
          <section>
            <SectionTitle
              icon={Lightbulb}
              title="S3 · Nội dung đề xuất"
              sub="Giải pháp · phạm vi · thời gian · đơn vị liên quan"
            />
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <Para label="Giải pháp đề xuất" value={proposal.proposedSolution ?? proposal.description} />
              <Para label="Phạm vi áp dụng" value={proposal.scope} />
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <p className="text-[11px] font-semibold text-slate-600 mb-1">
                    Thời gian triển khai mong muốn
                  </p>
                  <p className="text-sm text-slate-800">
                    {proposal.expectedStartDate
                      ? formatVnDateShort(proposal.expectedStartDate)
                      : formatVnDateShort(proposal.deadline)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-slate-600 mb-1">Đơn vị liên quan</p>
                  <p className="text-sm text-slate-800">
                    {proposal.involvedUnits && proposal.involvedUnits.length > 0 ? (
                      <span className="flex flex-wrap gap-1">
                        {proposal.involvedUnits.map((u, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-100 text-[11px] text-slate-700"
                          >
                            <Building2 size={9} /> {u}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="italic text-slate-400 text-xs">—</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ═══ S4 — Tác động dự kiến ═══ */}
          <section>
            <SectionTitle
              icon={Target}
              title="S4 · Tác động dự kiến"
              sub="Lợi ích · rủi ro · chi phí · nhân sự"
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 mb-1.5">
                  <Lightbulb size={12} /> Lợi ích kỳ vọng
                </div>
                <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {proposal.expectedBenefit?.trim() || (
                    <span className="italic text-slate-400">Chưa cập nhật.</span>
                  )}
                </p>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-700 mb-1.5">
                  <ShieldAlert size={12} /> Rủi ro nếu không làm
                </div>
                <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {proposal.riskIfNot?.trim() || (
                    <span className="italic text-slate-400">Chưa cập nhật.</span>
                  )}
                </p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 mb-1.5">
                  <AlertTriangle size={12} /> Rủi ro khi thực hiện
                </div>
                <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {proposal.riskIfDo?.trim() || (
                    <span className="italic text-slate-400">Chưa cập nhật.</span>
                  )}
                </p>
              </div>
              <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-700 mb-1">
                  <Coins size={12} /> Chi phí + Nhân sự
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <Coins size={12} className="text-slate-400" />
                  <span className="text-slate-500">Chi phí:</span>
                  <span className="font-semibold text-slate-800 tabular-nums">
                    {formatVnd(proposal.estimatedCost)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <Users size={12} className="text-slate-400" />
                  <span className="text-slate-500">Nhân sự cần:</span>
                  <span className="font-semibold text-slate-800 tabular-nums">
                    {proposal.neededHeadcount != null
                      ? `${proposal.neededHeadcount} người`
                      : '—'}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* ═══ S5 — Luồng duyệt (timeline + 4 nút) ═══ */}
          <section>
            <SectionTitle
              icon={CheckCircle2}
              title="S5 · Luồng duyệt"
              sub="Chuỗi người duyệt và quyết định"
            />
            {proposal.approverChain.length === 0 ? (
              <div className="text-xs text-slate-500 italic px-3 py-3 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-center">
                Chưa có chuỗi duyệt.
              </div>
            ) : (
              <ol className="relative space-y-3">
                {proposal.approverChain.map((step, idx) => {
                  const active = isCurrentApprover(step);
                  return (
                    <li
                      key={step.id}
                      className={`relative rounded-lg border p-3 ${
                        active
                          ? 'border-amber-300 bg-amber-50/40'
                          : step.status === 'da_duyet' || step.status === 'dong_y_nguyen_tac'
                            ? 'border-emerald-200 bg-emerald-50/30'
                            : step.status === 'tu_choi'
                              ? 'border-rose-200 bg-rose-50/30'
                              : step.status === 'yeu_cau_bo_sung'
                                ? 'border-orange-200 bg-orange-50/30'
                                : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="flex-shrink-0 flex flex-col items-center">
                          <div className="w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                            {idx + 1}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-800">{step.name}</span>
                            <span className="text-[11px] text-slate-500">
                              {ROLE_LABEL[step.role] ?? step.role}
                            </span>
                          </div>
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
                          </div>
                          {step.note && (
                            <div className="mt-2 px-2.5 py-1.5 rounded bg-white border border-slate-200 text-[12px] text-slate-700 italic">
                              &quot;{step.note}&quot;
                            </div>
                          )}

                          {/* Nếu currentUser là approver TẠI bước này → 4 nút action V3 */}
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
                                    onClick={() => setDecisionMode('in_principle')}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-white hover:bg-emerald-50 border border-emerald-300 rounded-lg"
                                  >
                                    <Equal size={13} /> Đồng ý nguyên tắc
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDecisionMode('revision')}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg"
                                  >
                                    <RotateCcw size={13} /> Yêu cầu bổ sung
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDecisionMode('reject')}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg"
                                  >
                                    <XCircle size={13} /> Từ chối
                                  </button>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <label className="block text-[11px] font-medium text-slate-600">
                                    {decisionMode === 'reject'
                                      ? 'Lý do từ chối'
                                      : decisionMode === 'revision'
                                        ? 'Nội dung yêu cầu bổ sung'
                                        : decisionMode === 'in_principle'
                                          ? 'Kế hoạch / điều kiện bổ sung'
                                          : 'Ghi chú (tuỳ chọn)'}
                                    {(decisionMode === 'reject' ||
                                      decisionMode === 'revision' ||
                                      decisionMode === 'in_principle') && (
                                      <span className="text-rose-500"> *</span>
                                    )}
                                  </label>
                                  <textarea
                                    value={decisionNote}
                                    onChange={(e) => setDecisionNote(e.target.value)}
                                    rows={3}
                                    placeholder={
                                      decisionMode === 'reject'
                                        ? 'VD: Chi phí vượt ngân sách quý, cần xem xét lại phương án...'
                                        : decisionMode === 'revision'
                                          ? 'VD: Bổ sung báo giá so sánh 3 nhà cung cấp...'
                                          : decisionMode === 'in_principle'
                                            ? 'VD: Đồng ý chủ trương, đề nghị bổ sung kế hoạch nhân sự chi tiết trước 30/06...'
                                            : 'Ghi chú thêm (nếu có)'
                                    }
                                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                                  />
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={handleConfirmDecision}
                                      className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg shadow-sm ${
                                        decisionMode === 'reject'
                                          ? 'text-white bg-rose-600 hover:bg-rose-700'
                                          : decisionMode === 'revision'
                                            ? 'text-white bg-amber-600 hover:bg-amber-700'
                                            : 'text-white bg-emerald-600 hover:bg-emerald-700'
                                      }`}
                                    >
                                      Xác nhận
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelDecision}
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
                <span className="font-medium text-slate-700">{activeStep.name}</span> ra quyết định.
              </p>
            )}
          </section>

          {/* ═══ S5b — Lịch sử xử lý ═══ */}
          {proposal.history && proposal.history.length > 0 && (
            <section>
              <SectionTitle
                icon={History}
                title="Lịch sử xử lý"
                sub="Toàn bộ thao tác trên đề xuất"
              />
              <ol className="space-y-1.5">
                {proposal.history.map((h, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-xs px-2.5 py-1.5 rounded bg-slate-50 border border-slate-200"
                  >
                    <span className="font-mono text-[10px] text-slate-400 mt-0.5 flex-shrink-0">
                      {formatVnDate(h.at)}
                    </span>
                    <span className="text-slate-700">
                      <span className="font-semibold">{h.actorName}</span>{' '}
                      <span className="text-slate-500">→</span>{' '}
                      <span className="font-medium">{h.action}</span>
                      {h.note && <span className="italic text-slate-600"> · "{h.note}"</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* ═══ S6 — Sau duyệt ═══ */}
          {proposal.createCoordAfter && (
            <section>
              <SectionTitle
                icon={ArrowRightCircle}
                title="S6 · Sau duyệt"
                sub="Kế hoạch chuyển sang điều phối"
              />
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 grid grid-cols-2 gap-4">
                <Field label="Owner dự kiến" value={proposal.expectedOwner ?? '—'} />
                <Field
                  label="Deadline dự kiến"
                  value={formatVnDateShort(proposal.expectedDeadline)}
                />
                <div className="col-span-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                    Đơn vị phối hợp
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {proposal.expectedCollaborators && proposal.expectedCollaborators.length > 0 ? (
                      proposal.expectedCollaborators.map((c, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-white border border-emerald-200 text-[11px] text-emerald-700"
                        >
                          <Users size={9} /> {c}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs italic text-slate-400">—</span>
                    )}
                  </div>
                </div>
                <div className="col-span-2">
                  <Para label="Kết quả bàn giao" value={proposal.expectedDeliverable} />
                </div>
              </div>
            </section>
          )}

          {/* ═══ Block — Đã chuyển điều phối ═══ */}
          {isLinkedToCoord && (
            <section>
              <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm text-violet-800">
                  <ArrowRightCircle size={16} className="flex-shrink-0" />
                  <span>
                    → Xem điều phối liên quan{' '}
                    <span className="font-semibold">
                      #{proposal.linkedCoordTaskCode ?? proposal.linkedCoordTaskId}
                    </span>
                  </span>
                </div>
                {onOpenLinkedCoord && proposal.linkedCoordTaskId && (
                  <button
                    type="button"
                    onClick={() => onOpenLinkedCoord(proposal.linkedCoordTaskId!)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-violet-700 bg-white border border-violet-200 hover:bg-violet-100 rounded-lg"
                  >
                    <ExternalLink size={12} /> Xem điều phối
                  </button>
                )}
              </div>
            </section>
          )}
        </div>

        {/* ── Footer sticky ─────────────────────────────────────────── */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 rounded-b-xl">
          {canConvertToCoord ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm font-semibold text-emerald-800 mb-1">
                🚀 Đề xuất đã duyệt — bấm Tạo điều phối để mở module Điều phối
              </p>
              <p className="text-xs text-emerald-700 mb-2.5">
                Điều phối mới sẽ tự động lấy tiêu đề, owner dự kiến, đơn vị phối hợp và
                deadline từ đề xuất này.
              </p>
              <div className="flex items-center justify-end gap-2 flex-wrap">
                {canCloseDossier && (
                  <button
                    type="button"
                    onClick={() => onCloseDossier && onCloseDossier(proposal.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg"
                  >
                    <Archive size={13} /> Đóng hồ sơ
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white rounded-lg"
                >
                  Để sau
                </button>
                <button
                  type="button"
                  onClick={() => onConvertToCoord(proposal.id)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm"
                >
                  <ArrowRightCircle size={14} /> Tạo điều phối từ đề xuất
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2 flex-wrap">
              {canCloseDossier && (
                <button
                  type="button"
                  onClick={() => onCloseDossier && onCloseDossier(proposal.id)}
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
          )}
        </div>
      </div>
    </div>
  );
}
