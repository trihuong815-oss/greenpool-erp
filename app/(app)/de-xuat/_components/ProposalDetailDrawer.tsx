'use client';

// Drawer chi tiết đề xuất V2 — theo SPEC anh chốt 2026-06-12:
//   - Header: code + title + chip status + chip kind
//   - Block "Tiến độ duyệt": timeline chuỗi approverChain, hiện 3 nút action nếu currentUser là approver tại bước hiện tại
//   - Block "Nội dung đề xuất"
//   - Block "Đã chuyển điều phối" nếu linkedCoordTaskId
//   - Footer: nếu da_phe_duyet + !linkedCoordTaskId + currentUser === creator → banner + nút "Tạo điều phối"

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
  CalendarDays,
  Paperclip,
  ArrowRightCircle,
  ExternalLink,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ProposalKind = 'tai_chinh' | 'nhan_su' | 'van_hanh' | 'co_so' | 'khac';
export type ProposalStatus =
  | 'nhap'
  | 'da_gui'
  | 'dang_xem_xet'
  | 'yeu_cau_bo_sung'
  | 'da_phe_duyet'
  | 'tu_choi'
  | 'chuyen_dieu_phoi';

export type ApproverStepStatus =
  | 'cho_tiep'         // chưa tới lượt
  | 'dang_xem_xet'     // đang ở bước này
  | 'da_duyet'         // đã duyệt qua
  | 'tu_choi'          // bước này từ chối
  | 'yeu_cau_bo_sung'; // bước này yêu cầu bổ sung

export interface ProposalApproverV2 {
  id: string;
  uid: string;
  name: string;
  role: string;
  status: ApproverStepStatus;
  decidedAt?: string;     // ISO
  note?: string;          // note kèm theo quyết định
}

export interface ProposalAttachment {
  id: string;
  name: string;
  url?: string;
}

export interface ProposalV2 {
  id: string;
  code: string;                        // DX-YYMMDD-####
  title: string;
  description: string;
  kind: ProposalKind;
  status: ProposalStatus;
  estimatedCost?: number | null;
  deadline?: string;                   // YYYY-MM-DD
  creatorUid: string;
  creatorName: string;
  creatorRole?: string;
  createdAt: string;                   // ISO
  approverChain: ProposalApproverV2[];
  attachments?: ProposalAttachment[];
  linkedCoordTaskId?: string;
  linkedCoordTaskCode?: string;
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
}

// ─────────────────────────────────────────────────────────────────────────────
// Labels & colors
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<ProposalStatus, string> = {
  nhap: 'Nháp',
  da_gui: 'Đã gửi',
  dang_xem_xet: 'Đang xem xét',
  yeu_cau_bo_sung: 'Yêu cầu bổ sung',
  da_phe_duyet: 'Đã phê duyệt',
  tu_choi: 'Từ chối',
  chuyen_dieu_phoi: 'Chuyển điều phối',
};

const STATUS_COLOR: Record<ProposalStatus, string> = {
  nhap: 'bg-slate-100 text-slate-700 ring-slate-200',
  da_gui: 'bg-sky-50 text-sky-700 ring-sky-200',
  dang_xem_xet: 'bg-amber-50 text-amber-700 ring-amber-200',
  yeu_cau_bo_sung: 'bg-orange-50 text-orange-700 ring-orange-200',
  da_phe_duyet: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  tu_choi: 'bg-rose-50 text-rose-700 ring-rose-200',
  chuyen_dieu_phoi: 'bg-violet-50 text-violet-700 ring-violet-200',
};

const KIND_LABEL: Record<ProposalKind, string> = {
  tai_chinh: 'Tài chính',
  nhan_su: 'Nhân sự',
  van_hanh: 'Vận hành',
  co_so: 'Cơ sở',
  khac: 'Khác',
};

const KIND_COLOR: Record<ProposalKind, string> = {
  tai_chinh: 'bg-amber-50 text-amber-700 ring-amber-200',
  nhan_su: 'bg-violet-50 text-violet-700 ring-violet-200',
  van_hanh: 'bg-sky-50 text-sky-700 ring-sky-200',
  co_so: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  khac: 'bg-slate-100 text-slate-700 ring-slate-200',
};

const ROLE_LABEL: Record<string, string> = {
  CEO: 'CEO',
  GD_KD: 'Giám đốc Kinh doanh',
  GD_VP: 'Giám đốc Văn phòng',
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
}: ProposalDetailDrawerProps) {
  // currentUserRole reserved cho check phân quyền chi tiết ở phiên bản sau
  void _currentUserRole;

  // ── State quyết định ─────────────────────────────────────────────────────
  // 'idle' | 'approve' | 'revision' | 'reject'
  const [decisionMode, setDecisionMode] = useState<'idle' | 'approve' | 'revision' | 'reject'>('idle');
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
  const canConvertToCoord = isApproved && !isLinkedToCoord && userIsCreator;

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

  // ── Step icon ────────────────────────────────────────────────────────────
  function StepIcon({ status }: { status: ApproverStepStatus }) {
    if (status === 'da_duyet') return <CheckCircle2 size={18} className="text-emerald-600" />;
    if (status === 'dang_xem_xet') return <Clock size={18} className="text-amber-600" />;
    if (status === 'tu_choi') return <XCircle size={18} className="text-rose-600" />;
    if (status === 'yeu_cau_bo_sung') return <RotateCcw size={18} className="text-orange-600" />;
    return <CircleDashed size={18} className="text-slate-400" />;
  }

  function stepStatusLabel(status: ApproverStepStatus): string {
    switch (status) {
      case 'da_duyet': return 'Đã duyệt';
      case 'dang_xem_xet': return 'Đang xem xét';
      case 'tu_choi': return 'Từ chối';
      case 'yeu_cau_bo_sung': return 'Yêu cầu bổ sung';
      case 'cho_tiep': return 'Chờ tiếp';
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex justify-end" onClick={onClose}>
      <div
        className="bg-white w-full max-w-[640px] h-full shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5">
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
            </div>
            <h2 className="text-base font-bold text-slate-900 leading-snug">{proposal.title}</h2>
            <p className="text-[11px] text-slate-500 mt-1">
              Người tạo: <span className="font-medium text-slate-700">{proposal.creatorName}</span>
              {proposal.creatorRole ? ` · ${ROLE_LABEL[proposal.creatorRole] ?? proposal.creatorRole}` : ''}
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

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Block — Tiến độ duyệt */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3 font-semibold">
              Tiến độ duyệt
            </h3>
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
                          : step.status === 'da_duyet'
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
                          <div className="flex items-center gap-1.5 mt-1">
                            <StepIcon status={step.status} />
                            <span className="text-[11px] font-medium text-slate-700">
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

                          {/* Nếu currentUser là approver TẠI bước này → 3 nút action */}
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
                                        : 'Ghi chú (tuỳ chọn)'}
                                    {(decisionMode === 'reject' || decisionMode === 'revision') && (
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
                Đang chờ <span className="font-medium text-slate-700">{activeStep.name}</span> ra quyết định.
              </p>
            )}
          </section>

          {/* Block — Nội dung đề xuất */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3 font-semibold">
              Nội dung đề xuất
            </h3>
            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2.5">
              {proposal.description ? (
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {proposal.description}
                </p>
              ) : (
                <p className="text-xs text-slate-400 italic">Không có mô tả.</p>
              )}
              <div className="grid grid-cols-2 gap-2.5 pt-2.5 border-t border-slate-100">
                <div className="flex items-center gap-1.5 text-xs">
                  <Coins size={13} className="text-slate-400" />
                  <span className="text-slate-500">Chi phí:</span>
                  <span className="font-semibold text-slate-800 tabular-nums">
                    {formatVnd(proposal.estimatedCost)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <CalendarDays size={13} className="text-slate-400" />
                  <span className="text-slate-500">Deadline:</span>
                  <span className="font-semibold text-slate-800">
                    {formatVnDateShort(proposal.deadline)}
                  </span>
                </div>
              </div>
              {proposal.attachments && proposal.attachments.length > 0 && (
                <div className="pt-2.5 border-t border-slate-100">
                  <p className="text-[11px] font-medium text-slate-500 mb-1.5">File đính kèm</p>
                  <ul className="space-y-1">
                    {proposal.attachments.map((f) => (
                      <li key={f.id} className="flex items-center gap-1.5 text-xs text-slate-700">
                        <Paperclip size={12} className="text-slate-400" />
                        {f.url ? (
                          <a href={f.url} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">
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

          {/* Block — Đã chuyển điều phối */}
          {isLinkedToCoord && (
            <section>
              <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm text-violet-800">
                  <ArrowRightCircle size={16} className="flex-shrink-0" />
                  <span>
                    Đã chuyển thành điều phối{' '}
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
                    <ExternalLink size={12} /> Xem
                  </button>
                )}
              </div>
            </section>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 rounded-b-xl">
          {canConvertToCoord ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm font-semibold text-emerald-800 mb-1">
                Đề xuất đã phê duyệt
              </p>
              <p className="text-xs text-emerald-700 mb-2.5">
                Tạo điều phối từ đề xuất này? Điều phối mới sẽ tự động lấy tiêu đề và đơn vị thực thi từ đề xuất.
              </p>
              <div className="flex items-center justify-end gap-2">
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
                  <ArrowRightCircle size={14} /> Tạo điều phối
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2">
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
