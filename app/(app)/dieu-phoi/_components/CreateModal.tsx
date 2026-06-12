'use client';

import { useMemo, useState } from 'react';
import { X, Plus, Trash2, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
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

// ────────────────────────────────────────────────────────────────────────────
// Public payload — đúng theo Design Doc Phase 2 (Điều phối V2)
// ────────────────────────────────────────────────────────────────────────────
export interface CreateCoordCollaboratorPayload {
  unitId: string;            // 'DEPT:KE' | 'BRANCH:HM'
  unitName: string;          // label đã denormalize
  responsibleName: string;   // Người phụ trách (V1 nhập tay, V2 user picker)
  supportContent: string;    // Nội dung cần hỗ trợ
  deliverable: string;       // Kết quả bàn giao
  deadline: string;          // YYYY-MM-DD
}

export interface CreateCoordPayload {
  title: string;
  description: string;
  type: CoordType;
  scope: CoordScope;
  priority: Priority;
  dueDate: string;                 // deadline tổng — YYYY-MM-DD
  ownerUid: string;                // BẮT BUỘC — id Owner duy nhất
  ownerName: string;
  ownerBlock: Block;
  ownerDeptId: string;             // dept id (VP) hoặc facility id (KD)
  collaborators: CreateCoordCollaboratorPayload[];
  objective: string;
  finalDeliverable: string;
  approverUid?: string;            // bắt buộc khi type=phe_duyet hoặc scope=lien_khoi
  approverName?: string;
}

// Tương thích ngược: vẫn export type CreatePayload alias
export type CreatePayload = CreateCoordPayload;

interface CreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreate?: (input: CreateCoordPayload) => void;
}

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────
const COORD_TYPES: CoordType[] = ['dieu_phoi', 'ho_tro', 'de_xuat', 'phe_duyet', 'canh_bao'];
const COORD_SCOPES: CoordScope[] = ['noi_bo_phong', 'lien_phong', 'lien_co_so', 'lien_khoi', 'chien_luoc'];
const PRIORITIES: Priority[] = ['low', 'normal', 'high'];
const BLOCKS: Block[] = ['KD', 'VP'];
const DEPT_IDS: DeptId[] = ['MKT', 'DT', 'KT', 'QLCS', 'NS', 'KE', 'GS'];
const BRANCH_IDS: BranchId[] = ['HM', 'NCT24', 'LD', 'TT', 'TK', 'CG'];

// Owner pool (mock V1 — V2 sẽ thay bằng users theo phòng/role)
interface OwnerOption {
  uid: string;
  name: string;
  role: string;        // 'TP_DT' | 'TP_KT' | 'QLCS' | 'GD_KD' | 'GD_VP' | ...
  block: Block;
  unitId: string;      // dept id (VP) hoặc branch id (KD)
}

const OWNER_POOL: OwnerOption[] = [
  // Khối KD — Cơ sở (QLCS)
  { uid: 'qlcs-hm',    name: 'QLCS Hoàng Mai',        role: 'QLCS', block: 'KD', unitId: 'HM' },
  { uid: 'qlcs-nct24', name: 'QLCS 24 NCT',           role: 'QLCS', block: 'KD', unitId: 'NCT24' },
  { uid: 'qlcs-ld',    name: 'QLCS Linh Đàm',         role: 'QLCS', block: 'KD', unitId: 'LD' },
  { uid: 'qlcs-tt',    name: 'QLCS Thanh Trì',        role: 'QLCS', block: 'KD', unitId: 'TT' },
  { uid: 'qlcs-tk',    name: 'QLCS Thụy Khuê',        role: 'QLCS', block: 'KD', unitId: 'TK' },
  { uid: 'qlcs-cg',    name: 'QLCS Cầu Giấy',         role: 'QLCS', block: 'KD', unitId: 'CG' },
  // Khối KD — TP
  { uid: 'tp-mkt',     name: 'TP Marketing',          role: 'TP_MKT', block: 'KD', unitId: 'MKT' },
  { uid: 'tp-dt',      name: 'TP Đào tạo',            role: 'TP_DT',  block: 'KD', unitId: 'DT' },
  { uid: 'tp-kt',      name: 'TP Kỹ thuật',           role: 'TP_KT',  block: 'KD', unitId: 'KT' },
  { uid: 'tp-qlcs',    name: 'TP QLCS',               role: 'TP_QLCS',block: 'KD', unitId: 'QLCS' },
  // Khối VP
  { uid: 'tp-ns',      name: 'TP Nhân sự',            role: 'TP_NS',  block: 'VP', unitId: 'NS' },
  { uid: 'tp-ke',      name: 'TP Kế toán',            role: 'TP_KE',  block: 'VP', unitId: 'KE' },
  { uid: 'tp-gs',      name: 'TP Giám sát',           role: 'TP_GS',  block: 'VP', unitId: 'GS' },
  // GĐ
  { uid: 'gd-kd',      name: 'Giám đốc Kinh doanh',   role: 'GD_KD',  block: 'KD', unitId: 'DT' },
  { uid: 'gd-vp',      name: 'Giám đốc Văn phòng',    role: 'GD_VP',  block: 'VP', unitId: 'NS' },
];

// Người duyệt (TP/GĐ/CEO) — V1 mock
interface ApproverOption {
  uid: string;
  name: string;
  role: string;
}
const APPROVER_POOL: ApproverOption[] = [
  { uid: 'tp-dt',  name: 'TP Đào tạo',          role: 'TP' },
  { uid: 'tp-kt',  name: 'TP Kỹ thuật',         role: 'TP' },
  { uid: 'tp-mkt', name: 'TP Marketing',        role: 'TP' },
  { uid: 'tp-ns',  name: 'TP Nhân sự',          role: 'TP' },
  { uid: 'tp-ke',  name: 'TP Kế toán',          role: 'TP' },
  { uid: 'gd-kd',  name: 'Giám đốc Kinh doanh', role: 'GD' },
  { uid: 'gd-vp',  name: 'Giám đốc Văn phòng',  role: 'GD' },
  { uid: 'ceo',    name: 'CEO',                 role: 'CEO' },
];

// ────────────────────────────────────────────────────────────────────────────
// Local types
// ────────────────────────────────────────────────────────────────────────────
interface CollaboratorDraft {
  id: string;
  unitId: string;             // 'DEPT:KE' | 'BRANCH:HM'
  responsibleName: string;
  supportContent: string;
  deliverable: string;
  deadline: string;
  status: 'chua_tiep_nhan';   // default cố định khi tạo
}

function unitLabel(unitId: string): string {
  if (!unitId) return '';
  if (unitId.startsWith('DEPT:')) {
    const d = unitId.slice(5) as DeptId;
    return DEPT_LABEL[d] ?? d;
  }
  if (unitId.startsWith('BRANCH:')) {
    const b = unitId.slice(7) as BranchId;
    return BRANCH_LABEL[b] ?? b;
  }
  return unitId;
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────
export default function CreateModal({ open, onClose, onCreate }: CreateModalProps) {
  // Section 1 — Thông tin chung
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<CoordType | ''>('');
  const [scope, setScope] = useState<CoordScope | ''>('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [deadline, setDeadline] = useState('');

  // Section 2 — Owner (DUY NHẤT)
  const [ownerBlock, setOwnerBlock] = useState<Block | ''>('');
  const [ownerUid, setOwnerUid] = useState('');

  // Section 3 — Đơn vị phối hợp
  const [collaborators, setCollaborators] = useState<CollaboratorDraft[]>([]);

  // Section 4 — Mục tiêu + Kết quả
  const [objective, setObjective] = useState('');
  const [finalDeliverable, setFinalDeliverable] = useState('');

  // Section 5 — Luồng duyệt
  const [showApproval, setShowApproval] = useState(false);
  const [approverUid, setApproverUid] = useState('');

  // Errors hiển thị inline
  const [errors, setErrors] = useState<Record<string, string>>({});

  const ownerOptions = useMemo(
    () => OWNER_POOL.filter((o) => !ownerBlock || o.block === ownerBlock),
    [ownerBlock],
  );
  const selectedOwner = useMemo(
    () => OWNER_POOL.find((o) => o.uid === ownerUid) ?? null,
    [ownerUid],
  );

  // Approval bắt buộc khi type=phe_duyet hoặc scope=lien_khoi
  const approvalMandatory = type === 'phe_duyet' || scope === 'lien_khoi';

  if (!open) return null;

  function addCollaborator() {
    setCollaborators((prev) => [
      ...prev,
      {
        id: `c-${Date.now()}-${prev.length}`,
        unitId: '',
        responsibleName: '',
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
    setOwnerUid('');
    setCollaborators([]);
    setObjective('');
    setFinalDeliverable('');
    setShowApproval(false);
    setApproverUid('');
    setErrors({});
  }
  function handleClose() {
    resetForm();
    onClose();
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (title.trim().length < 3) e.title = 'Tiêu đề phải có ít nhất 3 ký tự.';
    if (!type) e.type = 'Vui lòng chọn loại điều phối.';
    if (!scope) e.scope = 'Vui lòng chọn phạm vi điều phối.';
    if (!priority) e.priority = 'Vui lòng chọn mức độ ưu tiên.';
    if (!deadline) e.deadline = 'Vui lòng chọn deadline tổng.';
    if (!ownerBlock) e.ownerBlock = 'Vui lòng chọn Khối của Owner.';
    if (!ownerUid) e.ownerUid = 'Vui lòng chọn DUY NHẤT 1 Owner chịu KPI.';
    if (collaborators.length === 0) {
      e.collaborators = 'Phải có ít nhất 1 đơn vị phối hợp.';
    } else {
      collaborators.forEach((c, idx) => {
        if (!c.unitId)          e[`collab-${idx}-unit`]      = 'Chọn đơn vị.';
        if (!c.responsibleName.trim()) e[`collab-${idx}-resp`] = 'Nhập người phụ trách.';
        if (!c.supportContent.trim()) e[`collab-${idx}-content`] = 'Nhập nội dung cần hỗ trợ.';
        if (!c.deliverable.trim())    e[`collab-${idx}-deliv`]   = 'Nhập kết quả bàn giao.';
        if (!c.deadline)              e[`collab-${idx}-deadline`]= 'Chọn deadline riêng.';
      });
    }
    if (approvalMandatory && !approverUid) {
      e.approverUid = 'Loại/Phạm vi này bắt buộc chọn người duyệt cấp cuối.';
    }
    return e;
  }

  function submit() {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) {
      // Mở section duyệt nếu lỗi nằm ở đó
      if (e.approverUid) setShowApproval(true);
      return;
    }
    if (!selectedOwner) return;

    const approver = approverUid ? APPROVER_POOL.find((a) => a.uid === approverUid) : undefined;

    const payload: CreateCoordPayload = {
      title: title.trim(),
      description: description.trim(),
      type: type as CoordType,
      scope: scope as CoordScope,
      priority,
      dueDate: deadline,
      ownerUid: selectedOwner.uid,
      ownerName: selectedOwner.name,
      ownerBlock: selectedOwner.block,
      ownerDeptId: selectedOwner.unitId,
      collaborators: collaborators.map((c) => ({
        unitId: c.unitId,
        unitName: unitLabel(c.unitId),
        responsibleName: c.responsibleName.trim(),
        supportContent: c.supportContent.trim(),
        deliverable: c.deliverable.trim(),
        deadline: c.deadline,
      })),
      objective: objective.trim(),
      finalDeliverable: finalDeliverable.trim(),
      approverUid: approver?.uid,
      approverName: approver?.name,
    };
    onCreate?.(payload);
    resetForm();
    onClose();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────────
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
              Khởi tạo điều phối liên khối · phòng ban · cơ sở (1 Owner duy nhất chịu KPI cuối cùng)
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
              1. Thông tin chung
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
                  className={`w-full px-3 py-2 text-sm rounded-lg border outline-none ${
                    errors.title ? 'border-rose-400 focus:ring-1 focus:ring-rose-400' : 'border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                  }`}
                />
                {errors.title && <p className="text-[11px] text-rose-600 mt-1">{errors.title}</p>}
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Mô tả</label>
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
                {errors.type && <p className="text-[11px] text-rose-600 mt-1">{errors.type}</p>}
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
                {errors.scope && <p className="text-[11px] text-rose-600 mt-1">{errors.scope}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Mức độ ưu tiên <span className="text-rose-500">*</span>
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
                  Deadline tổng <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className={`w-full px-3 py-2 text-sm rounded-lg border outline-none ${
                    errors.deadline ? 'border-rose-400 focus:ring-1 focus:ring-rose-400' : 'border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                  }`}
                />
                {errors.deadline && <p className="text-[11px] text-rose-600 mt-1">{errors.deadline}</p>}
              </div>
            </div>
          </section>

          {/* Section 2 — Owner DUY NHẤT */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-2 font-semibold">
              2. Owner (DUY NHẤT)
            </h3>
            <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
              <AlertCircle size={14} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Mỗi điều phối chỉ có <strong>1 Owner duy nhất</strong> chịu KPI cuối cùng.
                Owner là người nhận deadline tổng, không thể chia sẻ trách nhiệm.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Khối Owner <span className="text-rose-500">*</span>
                </label>
                <div className="flex gap-1.5">
                  {BLOCKS.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => {
                        setOwnerBlock(b);
                        setOwnerUid('');
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
                {errors.ownerBlock && <p className="text-[11px] text-rose-600 mt-1">{errors.ownerBlock}</p>}
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Chọn Owner <span className="text-rose-500">*</span>
                  <span className="text-slate-400 font-normal"> (1 người — radio)</span>
                </label>
                {!ownerBlock ? (
                  <div className="text-xs text-slate-500 italic px-3 py-3 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    Vui lòng chọn Khối trước.
                  </div>
                ) : ownerOptions.length === 0 ? (
                  <div className="text-xs text-slate-500 italic px-3 py-3 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    Không có ứng viên nào trong Khối này.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-1">
                    {ownerOptions.map((o) => {
                      const active = ownerUid === o.uid;
                      return (
                        <label
                          key={o.uid}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition ${
                            active
                              ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500'
                              : 'bg-white border-slate-200 hover:border-emerald-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="ownerUid"
                            value={o.uid}
                            checked={active}
                            onChange={() => setOwnerUid(o.uid)}
                            className="text-emerald-600 focus:ring-emerald-500"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-800 truncate">{o.name}</div>
                            <div className="text-[10px] text-slate-500 truncate">
                              {o.role} · {o.block === 'KD'
                                ? BRANCH_LABEL[o.unitId as BranchId] ?? DEPT_LABEL[o.unitId as DeptId] ?? o.unitId
                                : DEPT_LABEL[o.unitId as DeptId] ?? o.unitId}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
                {errors.ownerUid && <p className="text-[11px] text-rose-600 mt-1">{errors.ownerUid}</p>}
              </div>
            </div>
          </section>

          {/* Section 3 — Đơn vị phối hợp */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                3. Đơn vị phối hợp <span className="text-rose-500 normal-case">*</span>
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
            <p className="text-[11px] text-slate-500 mb-2">
              Mỗi đơn vị bắt buộc đủ <strong>5 trường</strong>: Đơn vị · Người phụ trách · Nội dung cần hỗ trợ · Kết quả bàn giao · Deadline riêng.
            </p>

            {collaborators.length === 0 && (
              <div className={`text-xs italic px-3 py-4 rounded-lg border border-dashed text-center ${
                errors.collaborators
                  ? 'border-rose-300 bg-rose-50 text-rose-700'
                  : 'border-slate-200 bg-slate-50 text-slate-500'
              }`}>
                {errors.collaborators ?? 'Chưa có đơn vị phối hợp. Bấm "+ Thêm đơn vị phối hợp" để thêm.'}
              </div>
            )}

            <div className="space-y-3">
              {collaborators.map((c, idx) => (
                <div key={c.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-700">
                      Đơn vị phối hợp #{idx + 1}
                      <span className="ml-2 text-[10px] font-normal text-slate-500">
                        Trạng thái mặc định: Chưa tiếp nhận
                      </span>
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
                        Đơn vị <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={c.unitId}
                        onChange={(e) => updateCollaborator(c.id, { unitId: e.target.value })}
                        className={`w-full px-2.5 py-1.5 text-xs rounded-lg border bg-white outline-none ${
                          errors[`collab-${idx}-unit`] ? 'border-rose-400' : 'border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                        }`}
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
                      {errors[`collab-${idx}-unit`] && (
                        <p className="text-[10px] text-rose-600 mt-0.5">{errors[`collab-${idx}-unit`]}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Người phụ trách <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={c.responsibleName}
                        onChange={(e) => updateCollaborator(c.id, { responsibleName: e.target.value })}
                        placeholder="VD: TP Marketing / Nguyễn Văn A"
                        className={`w-full px-2.5 py-1.5 text-xs rounded-lg border bg-white outline-none ${
                          errors[`collab-${idx}-resp`] ? 'border-rose-400' : 'border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                        }`}
                      />
                      {errors[`collab-${idx}-resp`] && (
                        <p className="text-[10px] text-rose-600 mt-0.5">{errors[`collab-${idx}-resp`]}</p>
                      )}
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Nội dung cần hỗ trợ <span className="text-rose-500">*</span>
                      </label>
                      <textarea
                        value={c.supportContent}
                        onChange={(e) => updateCollaborator(c.id, { supportContent: e.target.value })}
                        rows={2}
                        placeholder="VD: Thiết kế banner tuyển sinh khoá hè"
                        className={`w-full px-2.5 py-1.5 text-xs rounded-lg border bg-white outline-none resize-none ${
                          errors[`collab-${idx}-content`] ? 'border-rose-400' : 'border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                        }`}
                      />
                      {errors[`collab-${idx}-content`] && (
                        <p className="text-[10px] text-rose-600 mt-0.5">{errors[`collab-${idx}-content`]}</p>
                      )}
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Kết quả bàn giao <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={c.deliverable}
                        onChange={(e) => updateCollaborator(c.id, { deliverable: e.target.value })}
                        placeholder="VD: Banner hoàn chỉnh PSD + JPG"
                        className={`w-full px-2.5 py-1.5 text-xs rounded-lg border bg-white outline-none ${
                          errors[`collab-${idx}-deliv`] ? 'border-rose-400' : 'border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                        }`}
                      />
                      {errors[`collab-${idx}-deliv`] && (
                        <p className="text-[10px] text-rose-600 mt-0.5">{errors[`collab-${idx}-deliv`]}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Deadline riêng <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={c.deadline}
                        onChange={(e) => updateCollaborator(c.id, { deadline: e.target.value })}
                        className={`w-full px-2.5 py-1.5 text-xs rounded-lg border bg-white outline-none ${
                          errors[`collab-${idx}-deadline`] ? 'border-rose-400' : 'border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                        }`}
                      />
                      {errors[`collab-${idx}-deadline`] && (
                        <p className="text-[10px] text-rose-600 mt-0.5">{errors[`collab-${idx}-deadline`]}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Section 4 — Mục tiêu + Kết quả bàn giao cuối cùng */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3 font-semibold">
              4. Mục tiêu &amp; Kết quả bàn giao cuối cùng
            </h3>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Mục tiêu công việc
                </label>
                <textarea
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  rows={2}
                  placeholder="VD: Mở lớp học hè quy mô 60 học viên trong tháng 7"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Kết quả bàn giao cuối cùng
                </label>
                <textarea
                  value={finalDeliverable}
                  onChange={(e) => setFinalDeliverable(e.target.value)}
                  rows={2}
                  placeholder="VD: Báo cáo tổng kết khoá hè + danh sách học viên + doanh thu thực thu"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                />
              </div>
            </div>
          </section>

          {/* Section 5 — Luồng duyệt */}
          <section>
            <button
              type="button"
              onClick={() => setShowApproval((v) => !v)}
              className="w-full flex items-center justify-between text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3 hover:text-slate-700"
            >
              <span>
                5. Luồng duyệt {approvalMandatory ? (
                  <span className="text-rose-500 normal-case font-bold">* (bắt buộc với Loại/Phạm vi đã chọn)</span>
                ) : (
                  <span className="text-slate-400 normal-case font-normal">(tuỳ chọn)</span>
                )}
              </span>
              {showApproval || approvalMandatory ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>

            {(showApproval || approvalMandatory) && (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Người duyệt cấp cuối {approvalMandatory && <span className="text-rose-500">*</span>}
                </label>
                <select
                  value={approverUid}
                  onChange={(e) => setApproverUid(e.target.value)}
                  className={`w-full px-3 py-2 text-sm rounded-lg border bg-white outline-none ${
                    errors.approverUid ? 'border-rose-400' : 'border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                  }`}
                >
                  <option value="">-- Chọn người duyệt --</option>
                  <optgroup label="Trưởng phòng">
                    {APPROVER_POOL.filter((a) => a.role === 'TP').map((a) => (
                      <option key={a.uid} value={a.uid}>{a.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Giám đốc">
                    {APPROVER_POOL.filter((a) => a.role === 'GD').map((a) => (
                      <option key={a.uid} value={a.uid}>{a.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="CEO">
                    {APPROVER_POOL.filter((a) => a.role === 'CEO').map((a) => (
                      <option key={a.uid} value={a.uid}>{a.name}</option>
                    ))}
                  </optgroup>
                </select>
                {errors.approverUid && (
                  <p className="text-[11px] text-rose-600 mt-1">{errors.approverUid}</p>
                )}
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
