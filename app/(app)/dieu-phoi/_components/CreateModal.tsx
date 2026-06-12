'use client';

// ============================================================
// CreateModal V4 — /dieu-phoi
// Form 5 KHỐI theo SPEC V4 (2026-06):
//   1. Thông tin chung    : tiêu đề · mô tả · loại (7) · mức độ (2) · cấp độ (3) · deadline · nguồn (6)
//   2. Owner DUY NHẤT     : picker 2 cấp Khối → Role/User, hiển thị Khối/Đơn vị
//   3. Đơn vị phối hợp    : table dynamic — Đơn vị · Cần hỗ trợ · Deadline riêng · auto chip scope
//   4. Kết quả            : mục tiêu · kết quả cuối · KPI (collapsible bảng name+target)
//   5. Tùy chọn nâng cao  : file · tag · toggle yêu cầu duyệt → Người duyệt
//
// Footer: Huỷ · Lưu nháp (draft) · Tạo điều phối (khoi_tao)
// Tiếng Việt CÓ DẤU đầy đủ — không mojibake.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Paperclip,
  Tag as TagIcon,
} from 'lucide-react';
import { type Block, type BranchId, type DeptId, BLOCK_LABEL, BRANCH_LABEL, DEPT_LABEL } from './types';

// ────────────────────────────────────────────────────────────────────────────
// V4 Enums (self-contained để không phụ thuộc types.ts chưa migrate V4)
// ────────────────────────────────────────────────────────────────────────────
export type CoordTypeV4 =
  | 'van_hanh'
  | 'marketing'
  | 'dao_tao'
  | 'nhan_su'
  | 'ky_thuat'
  | 'tai_chinh'
  | 'du_an';

export type SeverityV4 = 'binh_thuong' | 'khan_cap';

export type CoordLevelV4 = 'thong_thuong' | 'quan_trong' | 'trong_diem';

export type CoordSourceV4 =
  | 'de_xuat'
  | 'hop'
  | 'kpi'
  | 'chi_dao_ceo'
  | 'phat_sinh'
  | 'khac';

export type CoordScopeAutoV4 = 'trong_khoi' | 'lien_khoi';

const COORD_TYPES_V4: { id: CoordTypeV4; label: string }[] = [
  { id: 'van_hanh',  label: 'Vận hành' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'dao_tao',   label: 'Đào tạo' },
  { id: 'nhan_su',   label: 'Nhân sự' },
  { id: 'ky_thuat',  label: 'Kỹ thuật' },
  { id: 'tai_chinh', label: 'Tài chính' },
  { id: 'du_an',     label: 'Dự án' },
];

const SEVERITIES_V4: { id: SeverityV4; label: string }[] = [
  { id: 'binh_thuong', label: 'Bình thường' },
  { id: 'khan_cap',    label: 'Khẩn cấp' },
];

const DEPT_IDS: DeptId[] = ['MKT', 'DT', 'KT', 'QLCS', 'NS', 'KE', 'GS'];
const BRANCH_IDS: BranchId[] = ['HM', 'NCT24', 'LD', 'TT', 'TK', 'CG'];
const BLOCKS: Block[] = ['KD', 'VP'];

// ────────────────────────────────────────────────────────────────────────────
// Payload V4 — export named
// ────────────────────────────────────────────────────────────────────────────
export interface CreateCollaboratorV4 {
  unitId: string;        // 'DEPT:KE' | 'BRANCH:HM'
  unitName: string;      // denormalized label
  supportContent: string;
  deadline: string;      // YYYY-MM-DD
}

export interface CreateKpiV4 {
  name: string;
  target: string;
}

export interface CreatePayloadV4 {
  // Khối 1
  title: string;
  description: string;
  type: CoordTypeV4;
  severity: SeverityV4;
  level: CoordLevelV4;
  source: CoordSourceV4;
  dueDate: string;                     // YYYY-MM-DD
  // Khối 2 — Owner duy nhất
  ownerUid: string;
  ownerName: string;
  ownerBlock: Block;
  ownerUnitId: string;                 // dept id (VP) hoặc branch id (KD)
  ownerUnitName: string;
  ownerRole: string;
  // Khối 3 — Phối hợp + scope auto
  collaborators: CreateCollaboratorV4[];
  scope: CoordScopeAutoV4;             // auto-detect từ Owner vs Collab
  // Khối 4 — Kết quả
  objective: string;
  finalDeliverable: string;
  kpis: CreateKpiV4[];
  // Khối 5 — Tùy chọn
  attachments: string[];               // V1 placeholder — chỉ lưu filename
  tags: string[];
  requireApproval: boolean;
  approverUid?: string;
  approverName?: string;
  // Meta
  status: 'draft' | 'khoi_tao';
  createdAt: string;                   // ISO
  createdByUid: string;
  createdByName: string;
}

/**
 * Alias backward-compat: DieuPhoiClient V3 đang import `CreatePayload`.
 * Giữ alias = CreatePayloadV4 để không phá build legacy handler.
 */
export type CreatePayload = CreatePayloadV4;

// ────────────────────────────────────────────────────────────────────────────
// Owner pool + Approver pool (V1 mock — V2 sẽ lấy từ users collection)
// ────────────────────────────────────────────────────────────────────────────
interface OwnerOption {
  uid: string;
  name: string;
  role: string;
  block: Block;
  unitId: string;        // dept id (VP) hoặc branch id (KD)
}

const OWNER_POOL: OwnerOption[] = [
  // Khối KD — QLCS 6 cơ sở
  { uid: 'qlcs-hm',    name: 'QLCS Hoàng Mai',  role: 'QLCS',    block: 'KD', unitId: 'HM' },
  { uid: 'qlcs-nct24', name: 'QLCS 24 NCT',     role: 'QLCS',    block: 'KD', unitId: 'NCT24' },
  { uid: 'qlcs-ld',    name: 'QLCS Linh Đàm',   role: 'QLCS',    block: 'KD', unitId: 'LD' },
  { uid: 'qlcs-tt',    name: 'QLCS Thanh Trì',  role: 'QLCS',    block: 'KD', unitId: 'TT' },
  { uid: 'qlcs-tk',    name: 'QLCS Thụy Khuê',  role: 'QLCS',    block: 'KD', unitId: 'TK' },
  { uid: 'qlcs-cg',    name: 'QLCS Cầu Giấy',   role: 'QLCS',    block: 'KD', unitId: 'CG' },
  // Khối KD — TP
  { uid: 'tp-mkt',     name: 'TP Marketing',    role: 'TP_MKT',  block: 'KD', unitId: 'MKT' },
  { uid: 'tp-dt',      name: 'TP Đào tạo',      role: 'TP_DT',   block: 'KD', unitId: 'DT' },
  { uid: 'tp-kt',      name: 'TP Kỹ thuật',     role: 'TP_KT',   block: 'KD', unitId: 'KT' },
  { uid: 'tp-qlcs',    name: 'TP QLCS',         role: 'TP_QLCS', block: 'KD', unitId: 'QLCS' },
  // Khối VP
  { uid: 'tp-ns',      name: 'TP Nhân sự',      role: 'TP_NS',   block: 'VP', unitId: 'NS' },
  { uid: 'tp-ke',      name: 'TP Kế toán',      role: 'TP_KE',   block: 'VP', unitId: 'KE' },
  { uid: 'tp-gs',      name: 'TP Giám sát',     role: 'TP_GS',   block: 'VP', unitId: 'GS' },
  // GĐ
  { uid: 'gd-kd',      name: 'Giám đốc Kinh doanh', role: 'GD_KD', block: 'KD', unitId: 'DT' },
  { uid: 'gd-vp',      name: 'Giám đốc Văn phòng',  role: 'GD_VP', block: 'VP', unitId: 'NS' },
];

interface ApproverOption { uid: string; name: string; role: string }
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
// Helpers
// ────────────────────────────────────────────────────────────────────────────
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

/** Trả về Block (KD|VP) của đơn vị phối hợp dựa trên unitId. */
function unitBlock(unitId: string): Block | null {
  if (!unitId) return null;
  if (unitId.startsWith('BRANCH:')) return 'KD';
  if (!unitId.startsWith('DEPT:')) return null;
  const d = unitId.slice(5) as DeptId;
  // VP: NS · KE · GS — phần còn lại thuộc KD
  if (d === 'NS' || d === 'KE' || d === 'GS') return 'VP';
  return 'KD';
}

/** Tự xác định scope V4 từ Owner block và danh sách collab block. */
function detectScope(ownerBlock: Block | null, collabBlocks: (Block | null)[]): CoordScopeAutoV4 {
  if (!ownerBlock) return 'trong_khoi';
  const hasOther = collabBlocks.some((b) => b && b !== ownerBlock);
  return hasOther ? 'lien_khoi' : 'trong_khoi';
}

// ────────────────────────────────────────────────────────────────────────────
// Local draft types
// ────────────────────────────────────────────────────────────────────────────
interface CollaboratorDraft {
  id: string;
  unitId: string;
  supportContent: string;
  deadline: string;
}

interface KpiDraft {
  id: string;
  name: string;
  target: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────
interface CreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreate?: (input: CreatePayloadV4) => void;
  /** V6.2: nếu set → modal vào CHẾ ĐỘ SỬA — pre-fill từ task này, submit gọi onUpdate. */
  initialTask?: any | null;
  /** V6.2 callback khi cập nhật (mode='edit'). */
  onUpdate?: (taskId: string, input: CreatePayloadV4) => void;
  currentUserUid?: string;
  currentUserName?: string;
  currentUserRole?: string;
  currentUserBlock?: Block;
}

export default function CreateModal({
  open,
  onClose,
  onCreate,
  initialTask,
  onUpdate,
  currentUserUid = '',
  currentUserName = '',
  currentUserBlock,
}: CreateModalProps) {
  const isEditMode = !!initialTask;
  // ── Khối 1 — Thông tin chung
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<CoordTypeV4 | ''>('');
  const [severity, setSeverity] = useState<SeverityV4>('binh_thuong');
  // V6.1 (anh chốt 2026-06-12): bỏ "Cấp độ điều phối" + "Nguồn" khỏi form
  // (trùng ý nghĩa với "Mức độ"). Giữ field type với default ngầm cho backward compat.
  const level: CoordLevelV4 = 'thong_thuong';
  const source: CoordSourceV4 = 'khac';
  const [dueDate, setDueDate] = useState('');

  // ── Khối 2 — Owner
  const [ownerBlock, setOwnerBlock] = useState<Block | ''>(currentUserBlock ?? '');
  const [ownerUid, setOwnerUid] = useState('');

  // ── Khối 3 — Đơn vị phối hợp
  const [collaborators, setCollaborators] = useState<CollaboratorDraft[]>([]);

  // ── Khối 4 — Kết quả
  const [objective, setObjective] = useState('');
  const [finalDeliverable, setFinalDeliverable] = useState('');
  const [showKpi, setShowKpi] = useState(false);
  const [kpis, setKpis] = useState<KpiDraft[]>([]);

  // ── Khối 5 — Tùy chọn
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [requireApproval, setRequireApproval] = useState(false);
  const [approverUid, setApproverUid] = useState('');

  // ── Errors inline
  const [errors, setErrors] = useState<Record<string, string>>({});

  const ownerOptions = useMemo(
    () => OWNER_POOL.filter((o) => !ownerBlock || o.block === ownerBlock),
    [ownerBlock],
  );
  const selectedOwner = useMemo(
    () => OWNER_POOL.find((o) => o.uid === ownerUid) ?? null,
    [ownerUid],
  );

  const scope: CoordScopeAutoV4 = useMemo(
    () =>
      detectScope(
        selectedOwner?.block ?? null,
        collaborators.map((c) => unitBlock(c.unitId)),
      ),
    [selectedOwner, collaborators],
  );

  // V6.2: pre-fill state khi mở mode 'edit'.
  // Reset khi open && có initialTask khác id trước → tránh dirty state khi mở
  // detail nhiều task khác nhau liên tiếp.
  useEffect(() => {
    if (!open || !initialTask) return;
    const t = initialTask;
    setTitle(t.title ?? '');
    setDescription(t.description ?? t.reason ?? '');
    setType((t.type as CoordTypeV4) || (t.coordType as CoordTypeV4) || '');
    setSeverity((t.severity as SeverityV4) || 'binh_thuong');
    setDueDate(t.dueDate ?? '');
    // Owner
    if (t.ownerUid || t.assigneeUserIds?.[0]) {
      const uid = t.ownerUid ?? t.assigneeUserIds[0];
      setOwnerUid(uid);
    }
    if (t.ownerBlock) setOwnerBlock(t.ownerBlock as Block);
    // Collaborators (tái tạo từ collaboratorDeptIds/FacilityIds + roles)
    const draft: CollaboratorDraft[] = [];
    const roles = t.collaboratorRoles ?? {};
    let idx = 0;
    // Format unitId PHẢI dùng UPPERCASE prefix `DEPT:` / `BRANCH:` để khớp
    // select option value. Lowercase 'dept:'/'facility:' chỉ dùng cho KEY của
    // collaboratorRoles trên server.
    for (const d of (t.collaboratorDeptIds ?? [])) {
      draft.push({
        id: `prefill-d-${idx++}`,
        unitId: `DEPT:${d}`,
        responsibleName: '',
        supportContent: roles[`dept:${d}`] ?? '',
        deadline: t.dueDate ?? '',
      } as CollaboratorDraft);
    }
    for (const f of (t.collaboratorFacilityIds ?? [])) {
      draft.push({
        id: `prefill-f-${idx++}`,
        unitId: `BRANCH:${f}`,
        responsibleName: '',
        supportContent: roles[`facility:${f}`] ?? '',
        deadline: t.dueDate ?? '',
      } as CollaboratorDraft);
    }
    setCollaborators(draft);
    // Kết quả
    setObjective(t.objective ?? t.goal ?? '');
    setFinalDeliverable(t.finalDeliverable ?? t.expectedDeliverable ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTask?.id]);

  if (!open) return null;

  // ── Collab handlers
  function addCollaborator() {
    setCollaborators((prev) => [
      ...prev,
      { id: `c-${Date.now()}-${prev.length}`, unitId: '', supportContent: '', deadline: '' },
    ]);
  }
  function updateCollaborator(id: string, patch: Partial<CollaboratorDraft>) {
    setCollaborators((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function removeCollaborator(id: string) {
    setCollaborators((prev) => prev.filter((c) => c.id !== id));
  }

  // ── KPI handlers
  function addKpi() {
    setKpis((prev) => [...prev, { id: `k-${Date.now()}-${prev.length}`, name: '', target: '' }]);
  }
  function updateKpi(id: string, patch: Partial<KpiDraft>) {
    setKpis((prev) => prev.map((k) => (k.id === id ? { ...k, ...patch } : k)));
  }
  function removeKpi(id: string) {
    setKpis((prev) => prev.filter((k) => k.id !== id));
  }

  // ── Tag handlers
  function pushTag() {
    const t = tagInput.trim();
    if (!t) return;
    if (tags.includes(t)) {
      setTagInput('');
      return;
    }
    setTags((prev) => [...prev, t]);
    setTagInput('');
  }
  function removeTag(t: string) {
    setTags((prev) => prev.filter((x) => x !== t));
  }

  // ── Reset
  function resetForm() {
    setTitle('');
    setDescription('');
    setType('');
    setSeverity('binh_thuong');
    setDueDate('');
    setOwnerBlock(currentUserBlock ?? '');
    setOwnerUid('');
    setCollaborators([]);
    setObjective('');
    setFinalDeliverable('');
    setShowKpi(false);
    setKpis([]);
    setShowAdvanced(false);
    setAttachments([]);
    setTagInput('');
    setTags([]);
    setRequireApproval(false);
    setApproverUid('');
    setErrors({});
  }
  function handleClose() {
    resetForm();
    onClose();
  }

  // ── Validate (chỉ áp dụng khi bấm "Tạo điều phối")
  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (title.trim().length < 3) e.title = 'Tiêu đề phải có ít nhất 3 ký tự.';
    if (!type) e.type = 'Vui lòng chọn loại công việc.';
    if (!severity) e.severity = 'Vui lòng chọn mức độ.';
    if (!dueDate) e.dueDate = 'Vui lòng chọn deadline tổng.';
    if (!ownerUid || !selectedOwner) e.ownerUid = 'Vui lòng chọn Owner duy nhất.';
    if (collaborators.length === 0) {
      e.collaborators = 'Phải có ít nhất 1 đơn vị phối hợp.';
    } else {
      collaborators.forEach((c, idx) => {
        if (!c.unitId)                e[`collab-${idx}-unit`]     = 'Chọn đơn vị.';
        if (!c.supportContent.trim()) e[`collab-${idx}-content`]  = 'Nhập cần hỗ trợ.';
        if (!c.deadline)              e[`collab-${idx}-deadline`] = 'Chọn deadline riêng.';
      });
    }
    if (!objective.trim())        e.objective         = 'Vui lòng nhập mục tiêu công việc.';
    if (!finalDeliverable.trim()) e.finalDeliverable  = 'Vui lòng nhập kết quả bàn giao.';
    if (requireApproval && !approverUid) e.approverUid = 'Đã bật yêu cầu duyệt — vui lòng chọn người duyệt.';
    return e;
  }

  // ── Build payload chung cho Lưu nháp & Tạo
  function buildPayload(status: 'draft' | 'khoi_tao'): CreatePayloadV4 | null {
    if (!selectedOwner) return null;
    const approver = requireApproval && approverUid
      ? APPROVER_POOL.find((a) => a.uid === approverUid)
      : undefined;
    return {
      title: title.trim(),
      description: description.trim(),
      type: type as CoordTypeV4,
      severity,
      level,
      source: source,
      dueDate,
      ownerUid: selectedOwner.uid,
      ownerName: selectedOwner.name,
      ownerBlock: selectedOwner.block,
      ownerUnitId: selectedOwner.unitId,
      ownerUnitName: selectedOwner.block === 'KD'
        ? (BRANCH_LABEL[selectedOwner.unitId as BranchId] ?? DEPT_LABEL[selectedOwner.unitId as DeptId] ?? selectedOwner.unitId)
        : (DEPT_LABEL[selectedOwner.unitId as DeptId] ?? selectedOwner.unitId),
      ownerRole: selectedOwner.role,
      collaborators: collaborators.map((c) => ({
        unitId: c.unitId,
        unitName: unitLabel(c.unitId),
        supportContent: c.supportContent.trim(),
        deadline: c.deadline,
      })),
      scope,
      objective: objective.trim(),
      finalDeliverable: finalDeliverable.trim(),
      kpis: kpis
        .filter((k) => k.name.trim() || k.target.trim())
        .map((k) => ({ name: k.name.trim(), target: k.target.trim() })),
      attachments,
      tags,
      requireApproval,
      approverUid: approver?.uid,
      approverName: approver?.name,
      status,
      createdAt: new Date().toISOString(),
      createdByUid: currentUserUid,
      createdByName: currentUserName,
    };
  }

  function saveDraft() {
    // Lưu nháp: chỉ yêu cầu tối thiểu tiêu đề
    if (title.trim().length < 3) {
      setErrors({ title: 'Lưu nháp vẫn cần Tiêu đề ≥ 3 ký tự.' });
      return;
    }
    // Nếu chưa có Owner → fallback createdBy + ownerUnitId rỗng
    const draftPayload: CreatePayloadV4 = (selectedOwner
      ? buildPayload('draft')
      : {
          title: title.trim(),
          description: description.trim(),
          type: (type || 'van_hanh') as CoordTypeV4,
          severity,
          level,
          source: (source || 'khac') as CoordSourceV4,
          dueDate,
          ownerUid: currentUserUid,
          ownerName: currentUserName,
          ownerBlock: (currentUserBlock ?? 'KD') as Block,
          ownerUnitId: '',
          ownerUnitName: '',
          ownerRole: '',
          collaborators: collaborators.map((c) => ({
            unitId: c.unitId,
            unitName: unitLabel(c.unitId),
            supportContent: c.supportContent.trim(),
            deadline: c.deadline,
          })),
          scope,
          objective: objective.trim(),
          finalDeliverable: finalDeliverable.trim(),
          kpis: kpis
            .filter((k) => k.name.trim() || k.target.trim())
            .map((k) => ({ name: k.name.trim(), target: k.target.trim() })),
          attachments,
          tags,
          requireApproval,
          status: 'draft',
          createdAt: new Date().toISOString(),
          createdByUid: currentUserUid,
          createdByName: currentUserName,
        }) as CreatePayloadV4;
    if (isEditMode && initialTask?.id) {
      onUpdate?.(initialTask.id, draftPayload);
    } else {
      onCreate?.(draftPayload);
    }
    resetForm();
    onClose();
  }

  function submit() {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) {
      if (e.approverUid) setShowAdvanced(true);
      return;
    }
    const payload = buildPayload('khoi_tao');
    if (!payload) return;
    if (isEditMode && initialTask?.id) {
      onUpdate?.(initialTask.id, payload);
    } else {
      onCreate?.(payload);
    }
    resetForm();
    onClose();
  }

  // ── Khối 5 file pick (placeholder — chỉ lưu tên file, V2 sẽ upload Storage)
  function onPickFiles(ev: React.ChangeEvent<HTMLInputElement>) {
    const files = ev.target.files;
    if (!files) return;
    const names: string[] = [];
    for (let i = 0; i < files.length; i++) names.push(files[i].name);
    setAttachments((prev) => [...prev, ...names]);
    ev.target.value = '';
  }
  function removeAttachment(name: string) {
    setAttachments((prev) => prev.filter((a) => a !== name));
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
            <h2 className="text-base font-bold text-slate-800">
              {isEditMode ? 'Sửa điều phối' : 'Tạo điều phối mới'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isEditMode
                ? `Đang sửa: ${initialTask?.code ?? ''} · ${initialTask?.title ?? ''}`
                : 'Form 5 khối · Owner duy nhất chịu KPI cuối cùng · scope tự xác định'}
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
        <div className="px-5 py-4 space-y-6 max-h-[72vh] overflow-y-auto">
          {/* ── KHỐI 1 — Thông tin chung ─────────────────────────────────── */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3 font-semibold">
              1. Thông tin chung
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {/* Tiêu đề */}
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
                    errors.title
                      ? 'border-rose-400 focus:ring-1 focus:ring-rose-400'
                      : 'border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                  }`}
                />
                {errors.title && <p className="text-[11px] text-rose-600 mt-1">{errors.title}</p>}
              </div>

              {/* Mô tả ngắn */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Mô tả ngắn</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Mô tả ngắn gọn nội dung điều phối"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                />
              </div>

              {/* Loại công việc — 7 chip */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Loại công việc <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {COORD_TYPES_V4.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setType(t.id)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                        type === t.id
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-400'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                {errors.type && <p className="text-[11px] text-rose-600 mt-1">{errors.type}</p>}
              </div>

              {/* Mức độ — 2 chip (Bình thường / Khẩn cấp - rose) */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Mức độ <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {SEVERITIES_V4.map((s) => {
                    const active = severity === s.id;
                    const isUrgent = s.id === 'khan_cap';
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSeverity(s.id)}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                          active
                            ? isUrgent
                              ? 'bg-rose-600 text-white border-rose-600'
                              : 'bg-emerald-600 text-white border-emerald-600'
                            : isUrgent
                              ? 'bg-white text-rose-700 border-rose-300 hover:border-rose-500'
                              : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-400'
                        }`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Deadline tổng */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Deadline tổng <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={`w-full px-3 py-2 text-sm rounded-lg border outline-none ${
                    errors.dueDate
                      ? 'border-rose-400 focus:ring-1 focus:ring-rose-400'
                      : 'border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                  }`}
                />
                {errors.dueDate && <p className="text-[11px] text-rose-600 mt-1">{errors.dueDate}</p>}
              </div>

            </div>
          </section>

          {/* ── KHỐI 2 — Owner DUY NHẤT ─────────────────────────────────── */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-2 font-semibold">
              2. Owner (DUY NHẤT)
            </h3>
            <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
              <AlertCircle size={14} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Chỉ <strong>1 Owner duy nhất</strong> chịu KPI cuối cùng. Owner nhận deadline tổng, không chia sẻ trách nhiệm.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Cấp 1: Khối */}
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
              </div>

              {/* Cấp 2: Role/User */}
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
                      const unitLbl = o.block === 'KD'
                        ? BRANCH_LABEL[o.unitId as BranchId] ?? DEPT_LABEL[o.unitId as DeptId] ?? o.unitId
                        : DEPT_LABEL[o.unitId as DeptId] ?? o.unitId;
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
                              {o.role} · {unitLbl}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
                {errors.ownerUid && <p className="text-[11px] text-rose-600 mt-1">{errors.ownerUid}</p>}
              </div>

              {/* Hiển thị tóm tắt sau khi chọn */}
              {selectedOwner && (
                <div className="col-span-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
                  <p className="text-xs text-emerald-800">
                    <strong>Khối:</strong> {BLOCK_LABEL[selectedOwner.block]} ·{' '}
                    <strong>Đơn vị:</strong>{' '}
                    {selectedOwner.block === 'KD'
                      ? BRANCH_LABEL[selectedOwner.unitId as BranchId] ?? DEPT_LABEL[selectedOwner.unitId as DeptId] ?? selectedOwner.unitId
                      : DEPT_LABEL[selectedOwner.unitId as DeptId] ?? selectedOwner.unitId}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* ── KHỐI 3 — Đơn vị phối hợp ─────────────────────────────────── */}
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
              Hệ thống tự lấy người phụ trách đơn vị phối hợp. Mỗi đơn vị 3 trường:{' '}
              <strong>Đơn vị · Cần hỗ trợ · Deadline riêng</strong>.
            </p>

            {/* Chip scope auto */}
            {selectedOwner && collaborators.length > 0 && (
              <div className="mb-2">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                    scope === 'lien_khoi'
                      ? 'bg-violet-50 text-violet-700 border-violet-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}
                >
                  Phạm vi: {scope === 'lien_khoi' ? 'Liên khối' : 'Trong khối'}
                </span>
              </div>
            )}

            {collaborators.length === 0 && (
              <div
                className={`text-xs italic px-3 py-4 rounded-lg border border-dashed text-center ${
                  errors.collaborators
                    ? 'border-rose-300 bg-rose-50 text-rose-700'
                    : 'border-slate-200 bg-slate-50 text-slate-500'
                }`}
              >
                {errors.collaborators ?? 'Chưa có đơn vị phối hợp. Bấm "+ Thêm đơn vị phối hợp" để thêm.'}
              </div>
            )}

            <div className="space-y-2">
              {collaborators.map((c, idx) => (
                <div key={c.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <div className="grid grid-cols-12 gap-2 items-start">
                    {/* Đơn vị */}
                    <div className="col-span-4">
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Đơn vị <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={c.unitId}
                        onChange={(e) => updateCollaborator(c.id, { unitId: e.target.value })}
                        className={`w-full px-2 py-1.5 text-xs rounded-lg border bg-white outline-none ${
                          errors[`collab-${idx}-unit`]
                            ? 'border-rose-400'
                            : 'border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                        }`}
                      >
                        <option value="">-- Chọn đơn vị --</option>
                        <optgroup label="Phòng ban">
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
                    {/* Cần hỗ trợ */}
                    <div className="col-span-5">
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Cần hỗ trợ <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={c.supportContent}
                        onChange={(e) => updateCollaborator(c.id, { supportContent: e.target.value })}
                        placeholder="VD: Thiết kế banner tuyển sinh"
                        className={`w-full px-2 py-1.5 text-xs rounded-lg border bg-white outline-none ${
                          errors[`collab-${idx}-content`]
                            ? 'border-rose-400'
                            : 'border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                        }`}
                      />
                      {errors[`collab-${idx}-content`] && (
                        <p className="text-[10px] text-rose-600 mt-0.5">{errors[`collab-${idx}-content`]}</p>
                      )}
                    </div>
                    {/* Deadline riêng */}
                    <div className="col-span-2">
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Deadline <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={c.deadline}
                        onChange={(e) => updateCollaborator(c.id, { deadline: e.target.value })}
                        className={`w-full px-2 py-1.5 text-xs rounded-lg border bg-white outline-none ${
                          errors[`collab-${idx}-deadline`]
                            ? 'border-rose-400'
                            : 'border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                        }`}
                      />
                      {errors[`collab-${idx}-deadline`] && (
                        <p className="text-[10px] text-rose-600 mt-0.5">{errors[`collab-${idx}-deadline`]}</p>
                      )}
                    </div>
                    {/* Delete */}
                    <div className="col-span-1 flex justify-end pt-5">
                      <button
                        type="button"
                        onClick={() => removeCollaborator(c.id)}
                        className="p-1.5 rounded text-rose-600 hover:bg-rose-50"
                        aria-label="Xoá"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── KHỐI 4 — Kết quả ────────────────────────────────────────── */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3 font-semibold">
              4. Kết quả
            </h3>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Mục tiêu công việc <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  rows={2}
                  placeholder="VD: Mở lớp học hè quy mô 60 học viên trong tháng 7"
                  className={`w-full px-3 py-2 text-sm rounded-lg border outline-none resize-none ${
                    errors.objective
                      ? 'border-rose-400'
                      : 'border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                  }`}
                />
                {errors.objective && <p className="text-[11px] text-rose-600 mt-1">{errors.objective}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Kết quả bàn giao cuối cùng <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={finalDeliverable}
                  onChange={(e) => setFinalDeliverable(e.target.value)}
                  rows={2}
                  placeholder="VD: Báo cáo tổng kết khoá hè + danh sách học viên + doanh thu thực thu"
                  className={`w-full px-3 py-2 text-sm rounded-lg border outline-none resize-none ${
                    errors.finalDeliverable
                      ? 'border-rose-400'
                      : 'border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                  }`}
                />
                {errors.finalDeliverable && (
                  <p className="text-[11px] text-rose-600 mt-1">{errors.finalDeliverable}</p>
                )}
              </div>

              {/* KPI collapsible */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowKpi((v) => !v)}
                  className="w-full flex items-center justify-between text-xs font-medium text-slate-700 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100"
                >
                  <span>KPI cần đạt (tuỳ chọn)</span>
                  {showKpi ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {showKpi && (
                  <div className="mt-2 space-y-2">
                    {kpis.map((k, idx) => (
                      <div key={k.id} className="grid grid-cols-12 gap-2 items-start">
                        <input
                          type="text"
                          value={k.name}
                          onChange={(e) => updateKpi(k.id, { name: e.target.value })}
                          placeholder={`Tên KPI #${idx + 1}`}
                          className="col-span-6 px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                        />
                        <input
                          type="text"
                          value={k.target}
                          onChange={(e) => updateKpi(k.id, { target: e.target.value })}
                          placeholder="Mục tiêu (VD: 60 học viên)"
                          className="col-span-5 px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => removeKpi(k.id)}
                          className="col-span-1 p-1.5 rounded text-rose-600 hover:bg-rose-50 justify-self-end"
                          aria-label="Xoá KPI"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addKpi}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200"
                    >
                      <Plus size={14} />
                      Thêm KPI
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ── KHỐI 5 — Tùy chọn nâng cao (accordion) ──────────────────── */}
          <section>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="w-full flex items-center justify-between text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3 hover:text-slate-700"
            >
              <span>5. Tùy chọn nâng cao</span>
              {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>

            {showAdvanced && (
              <div className="space-y-4">
                {/* File đính kèm */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    File đính kèm
                  </label>
                  <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-emerald-400">
                    <Paperclip size={14} />
                    Chọn file
                    <input type="file" multiple onChange={onPickFiles} className="hidden" />
                  </label>
                  {attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {attachments.map((a) => (
                        <span
                          key={a}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-[11px] text-slate-700 border border-slate-200"
                        >
                          {a}
                          <button
                            type="button"
                            onClick={() => removeAttachment(a)}
                            className="p-0.5 rounded text-rose-600 hover:bg-rose-50"
                            aria-label="Bỏ file"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Tag */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Tag</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500">
                      <TagIcon size={14} className="text-slate-400" />
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            pushTag();
                          }
                        }}
                        placeholder="Nhập tag rồi Enter"
                        className="flex-1 text-xs outline-none bg-transparent"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={pushTag}
                      className="px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200"
                    >
                      Thêm
                    </button>
                  </div>
                  {tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {tags.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] border border-emerald-200"
                        >
                          {t}
                          <button
                            type="button"
                            onClick={() => removeTag(t)}
                            className="p-0.5 rounded text-rose-600 hover:bg-rose-50"
                            aria-label="Xoá tag"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Toggle yêu cầu duyệt */}
                <div>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={requireApproval}
                      onChange={(e) => {
                        setRequireApproval(e.target.checked);
                        if (!e.target.checked) setApproverUid('');
                      }}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-xs text-slate-700">
                      Yêu cầu duyệt kết quả khi hoàn thành
                    </span>
                  </label>
                  {requireApproval && (
                    <div className="mt-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Người duyệt kết quả <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={approverUid}
                        onChange={(e) => setApproverUid(e.target.value)}
                        className={`w-full px-3 py-2 text-sm rounded-lg border bg-white outline-none ${
                          errors.approverUid
                            ? 'border-rose-400'
                            : 'border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
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
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Footer — 3 nút: Huỷ · Lưu nháp · Tạo điều phối */}
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
            onClick={saveDraft}
            className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg"
          >
            Lưu nháp
          </button>
          <button
            type="button"
            onClick={submit}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700"
          >
            {isEditMode ? 'Lưu thay đổi' : 'Tạo điều phối'}
          </button>
        </div>
      </div>
    </div>
  );
}
