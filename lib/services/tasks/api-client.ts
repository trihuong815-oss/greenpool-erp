// Client wrapper cho /api/tasks (Phase 7).

// ==================== PHASE DIEU PHOI v2 (2026-06-12) ====================
// Cross-Functional Coordination System — thay the "Nhiem vu / Giao viec"

/** Loai dieu phoi */
export type CoordType =
  | 'dieu-phoi'   // Dieu phoi chinh — can phan cong nhieu don vi
  | 'ho-tro'      // Ho tro — don vi khac ho tro co so/phong
  | 'de-xuat'     // De xuat len tren hoac ngang cap
  | 'phe-duyet'   // Can phe duyet tu GD/CEO
  | 'canh-bao';   // Canh bao / escalation

/** Pham vi dieu phoi */
export type CoordScope =
  | 'noi-bo-phong'  // Noi bo phong ban
  | 'noi-bo-khoi'   // Noi bo khoi (KD hoac VP)
  | 'lien-khoi'     // Lien khoi KD <-> VP
  | 'lien-co-so'    // Lien co so (nhieu branch)
  | 'du-an';        // Du an / project da co so

/** Trang thai 8 buoc moi — thay the TaskStatus cu */
export type CoordStatus =
  | 'khoi-tao'        // Vua tao, chua gui
  | 'tiep-nhan'       // Don vi chu tri xac nhan tiep nhan
  | 'dang-xu-ly'      // Dang trong qua trinh xu ly
  | 'dang-phoi-hop'   // Co don vi phoi hop dang thuc hien
  | 'cho-phan-hoi'    // Dang cho mot don vi phoi hop tra loi
  | 'cho-phe-duyet'   // Can phe duyet tu GD/CEO
  | 'hoan-thanh'      // Xong
  | 'dong-ho-so';     // Dong + archive

/** Trang thai rieng cua tung don vi phoi hop */
export type CollabUnitStatus =
  | 'chua-tiep-nhan'  // Chua xem
  | 'dang-thuc-hien'  // Dang lam
  | 'hoan-thanh'      // Xong
  | 'tu-choi';        // Khong the thuc hien

/** Don vi phoi hop — per-unit collaboration with explicit waiting-for */
export interface CollabUnit {
  unitId: string;          // dept ID hoac facility ID
  unitType: 'dept' | 'facility';
  unitName: string;        // ten hien thi
  ownerId: string;         // uid nguoi phu trach
  ownerName: string;       // ten nguoi phu trach
  ownerRole: string;       // role code (de hien thi chuc danh)
  assignment: string;      // Noi dung can ho tro (vi du: "Thiet ke banner tuyen sinh")
  deliverable: string;     // Ket qua can ban giao (vi du: "Banner hoan chinh 3 size")
  dueDate: string | null;  // Deadline rieng (ISO date)
  status: CollabUnitStatus;
  statusUpdatedAt?: string;
  statusUpdatedBy?: string;
  note?: string;           // Ghi chu them
}

/** Waiting-for engine — ai dang giu viec, dang cho gi, da cho bao lau */
export interface WaitingFor {
  unitId: string;      // dept hoac facility ID
  unitName: string;    // "TP Marketing"
  content: string;     // "Banner tuyen sinh he 2026"
  since: string;       // ISO timestamp khi bat dau cho
  daysWaiting?: number; // computed: so ngay
}

// ==========================================================================


export type Block = 'KD' | 'VP';
export type TaskStatus =
  | 'pending_approval'   // chờ duyệt (single hoặc multi-step theo approvalChain)
  | 'pending'            // sẵn sàng làm (đã qua hết chain duyệt)
  | 'in_progress'        // đang làm (recipient set kèm expectedCompletionDate)
  | 'requested_revision' // recipient yêu cầu creator bổ sung
  | 'done'               // hoàn thành
  | 'rejected'           // bị từ chối ở bất kỳ bước duyệt nào
  | 'cancelled';         // creator huá»·
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
// 'general' = legacy/migrated task (chưa phân loại proposal/assignment) — chỉ tồn tại
// trong data đã backfill, KHÔNG cho tạo mới ở UI/API.
export type TaskKind = 'proposal' | 'assignment' | 'general';

export interface Task {
  id: string;
  kind: TaskKind;             // 'proposal' = Đề xuất | 'assignment' = Giao việc
  title: string;
  description: string;
  createdBy: string;
  createdByName: string;
  createdByRole: string;
  createdByBlock: Block | 'all';
  createdAt: string;          // ISO
  assigneeBlock: Block;
  assigneeDeptId: string | null;
  assigneeFacilityId: string | null;
  assigneeUserIds: string[];
  /** Đơn vị phối hợp — phòng ban tham gia thực hiện (không phải người chịu trách nhiệm chính) */
  collaboratorDeptIds?: string[];
  /** Đơn vị phối hợp — cơ sở tham gia thực hiện */
  collaboratorFacilityIds?: string[];
  /** Tiêu đề/Mục tiêu công việc (bổ sung cho description ngắn) */
  goal?: string | null;
  crossBlock: boolean;
  status: TaskStatus;
  approvalRequiredFrom: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  progressPct: number;
  updatedAt: string;
  updatedBy: string;
  // ── Đề xuất (kind='proposal') v2 — anh chốt 2026-05-30 ────────────────
  /** Nội dung đề xuất: tài chính (kèm financialGroup + estimatedCost) hoặc vận hành */
  proposalType?: ProposalType | null;
  /** Nhóm chi (chỉ tài chính): thường xuyên (không cần duyệt) / chi khác */
  financialGroup?: FinancialGroup | null;
  /** Chi phí dự kiến (VND) — bắt buộc với tài chính + chi_khac; quyết định có cần duyệt hay không (> 5tr → cần) */
  estimatedCost?: number | null;
  /** Recipient nhập khi chuyển in_progress: dự kiến hoàn thành */
  expectedCompletionDate?: string | null;
  /** Chuỗi role cần duyệt theo thứ tự. [] = không cần duyệt. ['GD_KD'] = 1 cấp. ['GD_KD','GD_VP'] = cross-block 2 cấp */
  approvalChain?: string[];
  /** Lịch sử các bước duyệt đã hoàn thành */
  approvalsCompleted?: ApprovalStep[];
  /** Role cần duyệt tiếp theo (cho UI hiển thị). null khi chain done hoặc chưa start. */
  currentApprover?: string | null;
  /** Lịch sử yêu cầu bổ sung từ recipient → creator (lưu để track) */
  revisionRequests?: RevisionRequest[];
  /** Role label tiếng Việt — UI dùng để render chain (vd "Giám đốc Khối KD") */
  approvalChainLabels?: Record<string, string>;
  // ── Nhắc việc (Phase Mock-Frame-3 2026-06-12) ────────────────────────
  /** ISO string khi creator/admin bấm "Nhắc việc" gần nhất */
  lastNudgeAt?: string | null;
  lastNudgeBy?: string | null;
  lastNudgeByName?: string | null;
  /** Đếm tổng lần đã nhắc trên task này */
  nudgeCount?: number;
  // ── Mock-Frame-7 (2026-06-12) — bàn giao + nhiệm vụ phối hợp ──
  /** Kết quả bàn giao dự kiến (output cụ thể, khác `goal` = mục tiêu/intent) */
  expectedDeliverable?: string | null;
  /** Mô tả nhiệm vụ riêng cho mỗi đơn vị phối hợp.
   *  Key format: "dept:<id>" hoặc "facility:<id>". */
  collaboratorRoles?: Record<string, string>;
  // ========== DIEU PHOI v2 fields ==========
  /** Loai dieu phoi (v2) */
  coordType?: CoordType;
  /** Pham vi dieu phoi (v2) */
  coordScope?: CoordScope;
  /** Trang thai v2 (8 buoc) — dung song song status cu trong transition period */
  coordStatus?: CoordStatus;
  /** Danh sach don vi phoi hop voi thong tin day du (v2) */
  collabUnits?: CollabUnit[];
  /** Waiting-for engine — ai dang giu viec */
  waitingFor?: WaitingFor | null;
  /** Ket qua ban giao cuoi cung (owner dien khi done) */
  finalDeliverable?: string | null;
}

/** Map role → label tiếng Việt cho UI chain. */
export const ROLE_LABEL_VN: Record<string, string> = {
  GD_KD: 'Giám đốc Khối Kinh doanh',
  GD_VP: 'Giám đốc Khối Văn phòng',
  CEO: 'Chủ tịch / CEO',
  ADMIN: 'Quản trị hệ thống',
  TP_KE: 'Trưởng phòng Kế toán',
  TP_NS: 'Trưởng phòng Nhân sự',
  TP_KT: 'Trưởng phòng Kỹ thuật',
  TP_DT: 'Trưởng phòng Đào tạo',
  TP_MKT: 'Trưởng phòng Marketing',
  TP_GS: 'Trưởng phòng Giám sát',
};
export function roleLabelVN(role: string): string {
  return ROLE_LABEL_VN[role] ?? role;
}

export type ProposalType = 'tai_chinh' | 'van_hanh';
export type FinancialGroup = 'chi_thuong_xuyen' | 'chi_khac';

export interface ApprovalStep {
  role: string;
  uid: string;
  name: string;
  decidedAt: string;        // ISO
  decision: 'approved' | 'rejected';
  notes?: string;
}

export interface RevisionRequest {
  uid: string;
  name: string;
  requestedAt: string;      // ISO
  message: string;
}

export const PROPOSAL_TYPE_LABEL: Record<ProposalType, string> = {
  tai_chinh: 'Tài chính',
  van_hanh: 'Vận hành',
};
export const FINANCIAL_GROUP_LABEL: Record<FinancialGroup, string> = {
  chi_thuong_xuyen: 'Chi hoạt động thường xuyên',
  chi_khac: 'Chi khác (mua sắm, sửa chữa, đầu tư...)',
};
/** Ngưỡng tự quyết: chi khác ≤ giá trị này → QLCS tự quyết, không cần GĐ duyệt */
export const AUTO_APPROVE_THRESHOLD = 5_000_000;

export interface TaskCreate {
  kind: TaskKind;              // bắt buộc: đề xuất hay giao việc
  title: string;
  description: string;
  assigneeBlock: Block;
  assigneeDeptId?: string | null;
  assigneeFacilityId?: string | null;
  assigneeUserIds?: string[];
  collaboratorDeptIds?: string[];
  collaboratorFacilityIds?: string[];
  goal?: string | null;
  priority: TaskPriority;
  dueDate?: string | null;
  // Đề xuất v2 (kind='proposal'): bắt buộc proposalType.
  // Nếu tai_chinh: bắt buộc financialGroup; nếu chi_khac thì estimatedCost bắt buộc (server validate).
  proposalType?: ProposalType | null;
  financialGroup?: FinancialGroup | null;
  estimatedCost?: number | null;
  // Phase 12.5 (2026-06-03): chuỗi UID người duyệt theo thứ tự (chỉ dùng cho kind='proposal').
  // Empty/undefined = không cần duyệt → đi thẳng pending. Server force assignee=creator.
  approverUserIds?: string[];
  // Mock-Frame-7 (2026-06-12): output cụ thể bàn giao + nhiệm vụ riêng cho mỗi collaborator
  expectedDeliverable?: string | null;
  collaboratorRoles?: Record<string, string>;
  // ===== DIEU PHOI v2 =====
  coordType?: CoordType;
  coordScope?: CoordScope;
  collabUnits?: CollabUnit[];
  waitingFor?: WaitingFor | null;
  finalDeliverable?: string | null;
}

export interface TaskUpdate {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: string | null;
}

export interface TaskAttachment {
  path: string;
  fileName: string;
  mime: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
  uploadedByName: string;
  downloadUrl?: string;       // chỉ có khi list (signed read URL)
}

export interface TaskComment {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  body: string;
  kind: 'comment' | 'status_change' | 'approval' | 'rejection' | 'created';
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export type TaskListMode = 'assigned' | 'created' | 'pending_approval' | 'all';

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const b = await res.json(); if (b?.error) msg = b.error; } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const tasksApi = {
  async list(filter: { mode: TaskListMode; status?: TaskStatus; kind?: TaskKind; q?: string }): Promise<Task[]> {
    const qs = new URLSearchParams();
    qs.set('mode', filter.mode);
    if (filter.status) qs.set('status', filter.status);
    if (filter.kind) qs.set('kind', filter.kind);
    if (filter.q) qs.set('q', filter.q);
    return (await jsonOrThrow<{ rows: Task[] }>(
      await fetch(`/api/tasks?${qs.toString()}`, { cache: 'no-store' }),
    )).rows;
  },

  async get(id: string): Promise<Task> {
    return (await jsonOrThrow<{ task: Task }>(
      await fetch(`/api/tasks/${id}`, { cache: 'no-store' }),
    )).task;
  },

  async create(input: TaskCreate): Promise<{ id: string }> {
    return jsonOrThrow<{ id: string }>(
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    );
  },

  async update(id: string, patch: TaskUpdate): Promise<{ ok: true }> {
    return jsonOrThrow<{ ok: true }>(
      await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    );
  },

  async approve(id: string, comment?: string): Promise<{ ok: true }> {
    return jsonOrThrow<{ ok: true }>(
      await fetch(`/api/tasks/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment }),
      }),
    );
  },

  async reject(id: string, reason: string): Promise<{ ok: true }> {
    return jsonOrThrow<{ ok: true }>(
      await fetch(`/api/tasks/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      }),
    );
  },

  async updateStatus(
    id: string,
    input: { status: TaskStatus; progressPct?: number; comment?: string; expectedCompletionDate?: string },
  ): Promise<{ ok: true }> {
    return jsonOrThrow<{ ok: true }>(
      await fetch(`/api/tasks/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    );
  },

  /** Phase 12 — Recipient (assignee) yêu cầu creator bổ sung. Status: pending|in_progress → requested_revision. */
  async requestRevision(id: string, message: string): Promise<{ ok: true }> {
    return jsonOrThrow<{ ok: true }>(
      await fetch(`/api/tasks/${id}/request-revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      }),
    );
  },

  /** Nhắc việc người đang tắc. Cooldown 4h + threshold 24h (admin/GĐ bypass).
   *  Backend tự xác định target theo status (currentApprover hoặc assignee). */
  async nudge(id: string, message?: string): Promise<{ ok: true; stuckHours: number }> {
    return jsonOrThrow<{ ok: true; stuckHours: number }>(
      await fetch(`/api/tasks/${id}/nudge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message ?? '' }),
      }),
    );
  },

  async listComments(id: string): Promise<TaskComment[]> {
    return (await jsonOrThrow<{ rows: TaskComment[] }>(
      await fetch(`/api/tasks/${id}/comments`, { cache: 'no-store' }),
    )).rows;
  },

  async comment(id: string, body: string): Promise<{ id: string }> {
    return jsonOrThrow<{ id: string }>(
      await fetch(`/api/tasks/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      }),
    );
  },

  async delete(id: string): Promise<{ ok: true }> {
    return jsonOrThrow<{ ok: true }>(
      await fetch(`/api/tasks/${id}`, { method: 'DELETE' }),
    );
  },

  // ---- Attachments ----
  async listAttachments(id: string): Promise<TaskAttachment[]> {
    return (await jsonOrThrow<{ rows: TaskAttachment[] }>(
      await fetch(`/api/tasks/${id}/attachments`, { cache: 'no-store' }),
    )).rows;
  },

  /** Multipart upload (server-side proxy, không cần CORS bucket). */
  async uploadAttachment(id: string, file: File): Promise<void> {
    const form = new FormData();
    form.append('file', file);
    await jsonOrThrow<{ ok: true; path: string }>(
      await fetch(`/api/tasks/${id}/attachments`, {
        method: 'POST',
        body: form,
        // KHÔNG set Content-Type — browser tự add boundary cho multipart
      }),
    );
  },

  async deleteAttachment(id: string, path: string): Promise<{ ok: true }> {
    return jsonOrThrow<{ ok: true }>(
      await fetch(`/api/tasks/${id}/attachments?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
    );
  },
};
