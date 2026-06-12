'use client';

import { useState } from 'react';
import { X, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import {
  type CoordType,
  type CoordScope,
  type Priority,
  type Block,
  type BranchId,
  type DeptId,
  COORD_TYPE_LABEL,
  COORD_SCOPE_LABEL,
  PRIORITY_LABEL,
  BLOCK_LABEL,
  BRANCH_LABEL,
  DEPT_LABEL,
} from './types';

interface CreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreate?: (input: CreatePayload) => void;
}

interface CollaboratorDraft {
  id: string;
  unit: string;
  ownerName: string;
  supportContent: string;
  deliverable: string;
  deadline: string;
  status: 'chua_tiep_nhan' | 'dang_thuc_hien' | 'hoan_thanh';
}

export interface CreatePayload {
  title: string;
  description: string;
  type: CoordType | '';
  scope: CoordScope | '';
  priority: Priority;
  deadline: string;
  ownerBlock: Block | '';
  ownerUnit: string;
  ownerName: string;
  collaborators: CollaboratorDraft[];
  objective: string;
  finalDeliverable: string;
  approverName: string;
  approvalDeadline: string;
  approvalNote: string;
}

const COORD_TYPES: CoordType[] = ['dieu_phoi', 'ho_tro', 'de_xuat', 'phe_duyet', 'canh_bao'];
const COORD_SCOPES: CoordScope[] = ['noi_bo_phong', 'noi_bo_khoi', 'lien_khoi', 'lien_co_so', 'du_an'];
const PRIORITIES: Priority[] = ['low', 'normal', 'high'];
const BLOCKS: Block[] = ['KD', 'VP'];
const DEPT_IDS: DeptId[] = ['MKT', 'DT', 'KT', 'QLCS', 'NS', 'KE', 'GS'];
const BRANCH_IDS: BranchId[] = ['HM', 'NCT24', 'LD', 'TT', 'TK', 'CG'];

const COLLAB_STATUS_LABEL: Record<CollaboratorDraft['status'], string> = {
  chua_tiep_nhan: 'Chưa tiếp nhận',
  dang_thuc_hien: 'Đang thực hiện',
  hoan_thanh: 'Hoàn thành',
};

export default function CreateModal({ open, onClose, onCreate }: CreateModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<CoordType | ''>('');
  const [scope, setScope] = useState<CoordScope | ''>('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [deadline, setDeadline] = useState('');

  const [ownerBlock, setOwnerBlock] = useState<Block | ''>('');
  const [ownerUnit, setOwnerUnit] = useState('');
  const [ownerName, setOwnerName] = useState('');

  const [collaborators, setCollaborators] = useState<CollaboratorDraft[]>([]);

  const [objective, setObjective] = useState('');
  const [finalDeliverable, setFinalDeliverable] = useState('');

  const [showApproval, setShowApproval] = useState(false);
  const [approverName, setApproverName] = useState('');
  const [approvalDeadline, setApprovalDeadline] = useState('');
  const [approvalNote, setApprovalNote] = useState('');

  if (!open) return null;

  function addCollaborator() {
    setCollaborators((prev) => [
      ...prev,
      {
        id: `c-${Date.now()}-${prev.length}`,
        unit: '',
        ownerName: '',
        supportContent: '',
        deliverable: '',
        deadline: '',
        status: 'chua_tiep_nhan',
      },
    ]);
  }

  function updateCollaborator(id: string, patch: Partial<CollaboratorDraft>) {
    setCollaborators((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function removeCollaborator(id: string) {
    setCollaborators((prev) => prev.filter((c) => c.id !== id));
  }

  function resetForm() {
    setTitle('');
    setDescription('');
    setType('');
    setScope('');
    setPriority('normal');
    setDeadline('');
    setOwnerBlock('');
    setOwnerUnit('');
    setOwnerName('');
    setCollaborators([]);
    setObjective('');
    setFinalDeliverable('');
    setShowApproval(false);
    setApproverName('');
    setApprovalDeadline('');
    setApprovalNote('');
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function submit() {
    if (!title.trim()) {
      alert('Vui lòng nhập tiêu đề điều phối.');
      return;
    }
    if (!type) {
      alert('Vui lòng chọn loại điều phối.');
      return;
    }
    if (!scope) {
      alert('Vui lòng chọn phạm vi điều phối.');
      return;
    }
    if (!ownerName.trim()) {
      alert('Vui lòng nhập người chủ trì (owner).');
      return;
    }
    const payload: CreatePayload = {
      title: title.trim(),
      description: description.trim(),
      type,
      scope,
      priority,
      deadline,
      ownerBlock,
      ownerUnit,
      ownerName: ownerName.trim(),
      collaborators,
      objective: objective.trim(),
      finalDeliverable: finalDeliverable.trim(),
      approverName: approverName.trim(),
      approvalDeadline,
      approvalNote: approvalNote.trim(),
    };
    onCreate?.(payload);
    resetForm();
    onClose();
  }

  const ownerUnits = ownerBlock === 'KD' ? BRANCH_IDS : DEPT_IDS;
  const ownerUnitLabel = (id: string) =>
    ownerBlock === 'KD'
      ? BRANCH_LABEL[id as BranchId] ?? id
      : DEPT_LABEL[id as DeptId] ?? id;

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
            <h2 className="text-base font-bold text-slate-800">Tạo điều phối mới</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Khởi tạo một điều phối liên khối · phòng ban · cơ sở
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
          {/* Section 1 — Thông tin chung */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3 font-semibold">
              Thông tin chung
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
                  placeholder="VD: Mở lớp hè Linh Đàm"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Mô tả
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Mô tả ngắn gọn nội dung điều phối"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Loại điều phối <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {COORD_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                        type === t
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-400'
                      }`}
                    >
                      {COORD_TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Phạm vi <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {COORD_SCOPES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setScope(s)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                        scope === s
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-400'
                      }`}
                    >
                      {COORD_SCOPE_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Mức độ ưu tiên
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                        priority === p
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-400'
                      }`}
                    >
                      {PRIORITY_LABEL[p]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Deadline tổng
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

          {/* Section 2 — Chủ trì */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3 font-semibold">
              Chủ trì
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Khối chủ trì
                </label>
                <div className="flex gap-1.5">
                  {BLOCKS.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => {
                        setOwnerBlock(b);
                        setOwnerUnit('');
                      }}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                        ownerBlock === b
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-400'
                      }`}
                    >
                      Khối {BLOCK_LABEL[b]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Đơn vị chủ trì
                </label>
                <select
                  value={ownerUnit}
                  onChange={(e) => setOwnerUnit(e.target.value)}
                  disabled={!ownerBlock}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none bg-white disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">
                    {ownerBlock ? '-- Chọn đơn vị --' : 'Chọn khối trước'}
                  </option>
                  {ownerUnits.map((u) => (
                    <option key={u} value={u}>
                      {ownerUnitLabel(u)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Owner <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="VD: Nguyễn Văn A"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>
          </section>

          {/* Section 3 — Đơn vị phối hợp */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                Đơn vị phối hợp
              </h3>
              <button
                type="button"
                onClick={addCollaborator}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200"
              >
                <Plus size={14} />
                Thêm đơn vị phối hợp
              </button>
            </div>

            {collaborators.length === 0 && (
              <div className="text-xs text-slate-500 italic px-3 py-4 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-center">
                Chưa có đơn vị phối hợp. Bấm "+ Thêm đơn vị phối hợp" để thêm.
              </div>
            )}

            <div className="space-y-3">
              {collaborators.map((c, idx) => (
                <div
                  key={c.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-700">
                      Đơn vị phối hợp #{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeCollaborator(c.id)}
                      className="p-1 rounded text-rose-600 hover:bg-rose-50"
                      aria-label="Xoá"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Đơn vị
                      </label>
                      <select
                        value={c.unit}
                        onChange={(e) => updateCollaborator(c.id, { unit: e.target.value })}
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                      >
                        <option value="">-- Chọn đơn vị --</option>
                        <optgroup label="Phòng ban (VP)">
                          {DEPT_IDS.map((d) => (
                            <option key={`d-${d}`} value={`DEPT:${d}`}>
                              {DEPT_LABEL[d]}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Cơ sở (KD)">
                          {BRANCH_IDS.map((b) => (
                            <option key={`b-${b}`} value={`BRANCH:${b}`}>
                              {BRANCH_LABEL[b]}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Người phụ trách
                      </label>
                      <input
                        type="text"
                        value={c.ownerName}
                        onChange={(e) =>
                          updateCollaborator(c.id, { ownerName: e.target.value })
                        }
                        placeholder="Họ tên người phụ trách"
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Nội dung cần hỗ trợ
                      </label>
                      <input
                        type="text"
                        value={c.supportContent}
                        onChange={(e) =>
                          updateCollaborator(c.id, { supportContent: e.target.value })
                        }
                        placeholder="VD: Banner tuyển sinh"
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Kết quả bàn giao
                      </label>
                      <input
                        type="text"
                        value={c.deliverable}
                        onChange={(e) =>
                          updateCollaborator(c.id, { deliverable: e.target.value })
                        }
                        placeholder="VD: File thiết kế banner hoàn thiện"
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Deadline riêng
                      </label>
                      <input
                        type="date"
                        value={c.deadline}
                        onChange={(e) =>
                          updateCollaborator(c.id, { deadline: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Trạng thái riêng
                      </label>
                      <select
                        value={c.status}
                        onChange={(e) =>
                          updateCollaborator(c.id, {
                            status: e.target.value as CollaboratorDraft['status'],
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                      >
                        {(Object.keys(COLLAB_STATUS_LABEL) as CollaboratorDraft['status'][]).map(
                          (s) => (
                            <option key={s} value={s}>
                              {COLLAB_STATUS_LABEL[s]}
                            </option>
                          ),
                        )}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Section 4 — Kết quả cần đạt */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3 font-semibold">
              Kết quả cần đạt
            </h3>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Mục tiêu công việc
                </label>
                <input
                  type="text"
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  placeholder="VD: Mở lớp học hè quy mô 60 học viên"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Kết quả bàn giao cuối cùng
                </label>
                <input
                  type="text"
                  value={finalDeliverable}
                  onChange={(e) => setFinalDeliverable(e.target.value)}
                  placeholder="VD: Báo cáo tổng kết khoá học hè"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  File đính kèm
                </label>
                <div className="px-3 py-3 text-xs text-slate-500 italic rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center">
                  Chưa hỗ trợ V1
                </div>
              </div>
            </div>
          </section>

          {/* Section 5 — Luồng duyệt (collapsible) */}
          <section>
            <button
              type="button"
              onClick={() => setShowApproval((v) => !v)}
              className="w-full flex items-center justify-between text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3 hover:text-slate-700"
            >
              <span>Luồng duyệt (tuỳ chọn)</span>
              {showApproval ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {showApproval && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Người duyệt
                  </label>
                  <input
                    type="text"
                    value={approverName}
                    onChange={(e) => setApproverName(e.target.value)}
                    placeholder="VD: Phạm Thanh Tùng / CEO"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Hạn duyệt
                  </label>
                  <input
                    type="date"
                    value={approvalDeadline}
                    onChange={(e) => setApprovalDeadline(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Ghi chú duyệt
                  </label>
                  <textarea
                    value={approvalNote}
                    onChange={(e) => setApprovalNote(e.target.value)}
                    rows={2}
                    placeholder="Ghi chú dành cho người duyệt"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                  />
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2 bg-slate-50 rounded-b-xl">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={submit}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700"
          >
            Tạo điều phối
          </button>
        </div>
      </div>
    </div>
  );
}
