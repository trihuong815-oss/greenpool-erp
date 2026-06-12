'use client';

// Modal tạo đề xuất V2 — theo SPEC anh chốt 2026-06-12:
//   - 7 trạng thái: nháp → đã gửi → đang xem xét → yêu cầu bổ sung → đã phê duyệt → từ chối → chuyển điều phối
//   - 3 luồng chuẩn (preset): từ QLCS · nhân sự · tài chính
//   - Người tạo CHỌN chuỗi người duyệt (dynamic list, có nút "Thêm cấp duyệt")
//   - 2 action: "Lưu nháp" (nhap) · "Gửi duyệt" (da_gui)

import { useState } from 'react';
import { X, Plus, Trash2, FileText, Users, Coins, Sparkles, Paperclip } from 'lucide-react';

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

export interface ApproverDraft {
  id: string;
  uid: string;       // user id (empty nếu chưa chọn)
  name: string;      // denormalized
  role: string;      // denormalized role label/code
}

export interface CreateProposalPayload {
  title: string;
  description: string;
  kind: ProposalKind;
  estimatedCost: number | null;
  deadline: string;          // YYYY-MM-DD optional
  approverChain: ApproverDraft[];
  attachments: string[];     // placeholder V1
  status: 'nhap' | 'da_gui'; // user chọn lưu nháp hay gửi luôn
}

interface UserOption {
  id: string;
  name: string;
  roleId: string;
}

interface PresetChain {
  key: string;
  label: string;
  roleIds: string[]; // tìm theo roleId
}

interface CreateProposalModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: CreateProposalPayload) => void;
  users?: UserOption[]; // optional — nếu thiếu sẽ dùng input free-text
}

// ─────────────────────────────────────────────────────────────────────────────
// Labels & presets
// ─────────────────────────────────────────────────────────────────────────────

const KIND_OPTIONS: { key: ProposalKind; label: string; icon: any }[] = [
  { key: 'tai_chinh', label: 'Tài chính', icon: Coins },
  { key: 'nhan_su',   label: 'Nhân sự',   icon: Users },
  { key: 'van_hanh',  label: 'Vận hành',  icon: Sparkles },
  { key: 'co_so',     label: 'Cơ sở',     icon: FileText },
  { key: 'khac',      label: 'Khác',      icon: FileText },
];

// 3 preset chuỗi duyệt — theo SPEC mục "3 luồng chuẩn"
const PRESET_CHAINS: PresetChain[] = [
  { key: 'qlcs',     label: 'Đề xuất từ QLCS',  roleIds: ['TP_DT', 'GD_KD', 'CEO'] },
  { key: 'nhan_su',  label: 'Đề xuất nhân sự',  roleIds: ['TP_NS', 'GD_KD', 'CEO'] },
  { key: 'tai_chinh',label: 'Đề xuất tài chính',roleIds: ['TP_KE', 'GD_VP', 'CEO'] },
];

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

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function CreateProposalModal({ open, onClose, onCreate, users = [] }: CreateProposalModalProps) {
  // Section 1
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<ProposalKind | ''>('');
  const [estimatedCost, setEstimatedCost] = useState<string>('');
  const [deadline, setDeadline] = useState('');

  // Section 2 — Approval Chain
  const [approvers, setApprovers] = useState<ApproverDraft[]>([]);

  // Section 3 — Attachments (placeholder)
  const [attachments] = useState<string[]>([]);

  if (!open) return null;

  // ── Approver helpers ──────────────────────────────────────────────────────
  function addApprover() {
    setApprovers((prev) => [
      ...prev,
      { id: `a-${Date.now()}-${prev.length}`, uid: '', name: '', role: '' },
    ]);
  }

  function updateApprover(id: string, patch: Partial<ApproverDraft>) {
    setApprovers((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  function removeApprover(id: string) {
    setApprovers((prev) => prev.filter((a) => a.id !== id));
  }

  function applyPreset(preset: PresetChain) {
    // map từng roleId → user đầu tiên có roleId tương ứng (nếu có).
    // Nếu không có user phù hợp, vẫn tạo entry trống (uid='') với role denorm để người dùng tự chọn.
    const next: ApproverDraft[] = preset.roleIds.map((roleId, idx) => {
      const u = users.find((x) => x.roleId === roleId);
      return {
        id: `a-${Date.now()}-${idx}`,
        uid: u?.id ?? '',
        name: u?.name ?? '',
        role: roleId,
      };
    });
    setApprovers(next);
  }

  function selectApproverUser(approverId: string, userId: string) {
    const u = users.find((x) => x.id === userId);
    if (!u) {
      updateApprover(approverId, { uid: '', name: '', role: '' });
      return;
    }
    updateApprover(approverId, { uid: u.id, name: u.name, role: u.roleId });
  }

  // ── Reset / Close ─────────────────────────────────────────────────────────
  function resetForm() {
    setTitle('');
    setDescription('');
    setKind('');
    setEstimatedCost('');
    setDeadline('');
    setApprovers([]);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  // ── Validate & submit ─────────────────────────────────────────────────────
  function validate(): string | null {
    if (!title.trim()) return 'Vui lòng nhập tiêu đề đề xuất.';
    if (!kind) return 'Vui lòng chọn loại đề xuất.';
    if (approvers.length === 0) return 'Vui lòng thêm ít nhất một người duyệt.';
    const hasEmpty = approvers.some((a) => !a.uid && !a.name.trim());
    if (hasEmpty) return 'Có cấp duyệt chưa chọn người. Vui lòng kiểm tra lại chuỗi duyệt.';
    return null;
  }

  function buildPayload(status: 'nhap' | 'da_gui'): CreateProposalPayload {
    const costNum = estimatedCost.trim() ? Number(estimatedCost.replace(/[^\d.-]/g, '')) : NaN;
    return {
      title: title.trim(),
      description: description.trim(),
      kind: kind as ProposalKind,
      estimatedCost: Number.isFinite(costNum) ? costNum : null,
      deadline,
      approverChain: approvers.map((a) => ({ ...a, name: a.name.trim(), role: a.role.trim() })),
      attachments,
      status,
    };
  }

  function handleSaveDraft() {
    // Nháp: chỉ bắt buộc title; chuỗi duyệt có thể trống.
    if (!title.trim()) {
      alert('Vui lòng nhập tiêu đề đề xuất.');
      return;
    }
    if (!kind) {
      alert('Vui lòng chọn loại đề xuất.');
      return;
    }
    onCreate(buildPayload('nhap'));
    resetForm();
    onClose();
  }

  function handleSubmit() {
    const err = validate();
    if (err) {
      alert(err);
      return;
    }
    onCreate(buildPayload('da_gui'));
    resetForm();
    onClose();
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white rounded-t-xl z-10">
          <div>
            <h2 className="text-base font-bold text-slate-800">Tạo đề xuất mới</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Đề xuất là XIN QUYẾT ĐỊNH (mua máy, tuyển HLV, mở lớp, ngân sách...). Khi được duyệt, có thể chuyển thành điều phối.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* ── Section 1 — Thông tin đề xuất ─────────────────────────────── */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3 font-semibold">
              1. Thông tin đề xuất
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Tiêu đề <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="VD: Đề xuất mua máy lọc nước RO cho cơ sở 24 NCT"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Mô tả nội dung
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Mô tả ngắn gọn lý do, phương án, kỳ vọng kết quả..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Loại đề xuất <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {KIND_OPTIONS.map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setKind(key)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition ${
                        kind === key
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-400'
                      }`}
                    >
                      <Icon size={13} /> {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Chi phí dự kiến (VNĐ)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={estimatedCost}
                  onChange={(e) => setEstimatedCost(e.target.value)}
                  placeholder="VD: 12000000"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Deadline triển khai
                </label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>
          </section>

          {/* ── Section 2 — Người duyệt (Approval Chain) ─────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                2. Người duyệt (Chuỗi phê duyệt)
              </h3>
              <button
                type="button"
                onClick={addApprover}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200"
              >
                <Plus size={14} /> Thêm cấp duyệt
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mb-3">
              Chọn chuỗi người duyệt — đề xuất sẽ đi qua từng cấp theo thứ tự.
            </p>

            {/* Preset chips */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              <span className="text-[11px] text-slate-500 self-center mr-1">Mẫu nhanh:</span>
              {PRESET_CHAINS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
                >
                  {p.label}
                </button>
              ))}
            </div>

            {approvers.length === 0 ? (
              <div className="text-xs text-slate-500 italic px-3 py-4 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-center">
                Chưa có cấp duyệt. Bấm một mẫu nhanh ở trên hoặc &quot;+ Thêm cấp duyệt&quot;.
              </div>
            ) : (
              <ol className="space-y-2">
                {approvers.map((a, idx) => (
                  <li
                    key={a.id}
                    className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5"
                  >
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center mt-0.5">
                      {idx + 1}
                    </div>
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Người duyệt
                        </label>
                        {users.length > 0 ? (
                          <select
                            value={a.uid}
                            onChange={(e) => selectApproverUser(a.id, e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                          >
                            <option value="">
                              {a.role ? `-- Chọn người (gợi ý: ${ROLE_LABEL[a.role] ?? a.role}) --` : '-- Chọn người --'}
                            </option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name} {ROLE_LABEL[u.roleId] ? `· ${ROLE_LABEL[u.roleId]}` : `· ${u.roleId}`}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={a.name}
                            onChange={(e) => updateApprover(a.id, { name: e.target.value })}
                            placeholder="Nhập tên người duyệt"
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                          />
                        )}
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Chức vụ / Vai trò
                        </label>
                        <input
                          type="text"
                          value={ROLE_LABEL[a.role] ?? a.role}
                          onChange={(e) => updateApprover(a.id, { role: e.target.value })}
                          placeholder="VD: TP Đào tạo"
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-slate-50 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                          readOnly={!!a.uid}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeApprover(a.id)}
                      className="flex-shrink-0 p-1.5 rounded text-rose-600 hover:bg-rose-50 mt-4"
                      aria-label="Xoá"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* ── Section 3 — File đính kèm (placeholder V1) ───────────────── */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3 font-semibold">
              3. File đính kèm
            </h3>
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
              <Paperclip size={20} className="mx-auto text-slate-400 mb-1.5" />
              <p className="text-xs text-slate-500">
                Tính năng đính kèm file sẽ có ở phiên bản tiếp theo.
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Tạm thời mô tả tài liệu cần thiết trong phần &quot;Mô tả nội dung&quot;.
              </p>
            </div>
          </section>
        </div>

        {/* Footer — 2 action */}
        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2 bg-slate-50 rounded-b-xl sticky bottom-0">
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg"
          >
            Lưu nháp
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm"
          >
            Gửi duyệt
          </button>
        </div>
      </div>
    </div>
  );
}
