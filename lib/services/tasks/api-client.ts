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
  | 'pending_approval'   // chá» duyá»t (single hoáº·c multi-step theo approvalChain)
  | 'pending'            // sáºµn sÃ ng lÃ m (ÄÃ£ qua háº¿t chain duyá»t)
  | 'in_progress'        // Äang lÃ m (recipient set kÃ¨m expectedCompletionDate)
  | 'requested_revision' // recipient yÃªu cáº§u creator bá» sung
  | 'done'               // hoÃ n thÃ nh
  | 'rejected'           // bá» tá»« chá»i á» báº¥t ká»³ bÆ°á»c duyá»t nÃ o
  | 'cancelled';         // creator huá»·
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
// 'general' = legacy/migrated task (chÆ°a phÃ¢n loáº¡i proposal/assignment) â chá» tá»n táº¡i
// trong data ÄÃ£ backfill, KHÃNG cho táº¡o má»i á» UI/API.
export type TaskKind = 'proposal' | 'assignment' | 'general';

export interface Task {
  id: string;
  kind: TaskKind;             // 'proposal' = Äá» xuáº¥t | 'assignment' = Giao viá»c
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
  /** ÄÆ¡n vá» phá»i há»£p â phÃ²ng ban tham gia thá»±c hiá»n (khÃ´ng pháº£i ngÆ°á»i chá»u trÃ¡ch nhiá»m chÃ­nh) */
  collaboratorDeptIds?: string[];
  /** ÄÆ¡n vá» phá»i há»£p â cÆ¡ sá» tham gia thá»±c hiá»n */
  collaboratorFacilityIds?: string[];
  /** TiÃªu Äá»/Má»¥c tiÃªu cÃ´ng viá»c (bá» sung cho description ngáº¯n) */
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
  // ââ Äá» xuáº¥t (kind='proposal') v2 â anh chá»t 2026-05-30 ââââââââââââââââ
  /** Ná»i dung Äá» xuáº¥t: tÃ i chÃ­nh (kÃ¨m financialGroup + estimatedCost) hoáº·c váº­n hÃ nh */
  proposalType?: ProposalType | null;
  /** NhÃ³m chi (chá» tÃ i chÃ­nh): thÆ°á»ng xuyÃªn (khÃ´ng cáº§n duyá»t) / chi khÃ¡c */
  financialGroup?: FinancialGroup | null;
  /** Chi phÃ­ dá»± kiáº¿n (VND) â báº¯t buá»c vá»i tÃ i chÃ­nh + chi_khac; quyáº¿t Äá»nh cÃ³ cáº§n duyá»t hay khÃ´ng (> 5tr â cáº§n) */
  estimatedCost?: number | null;
  /** Recipient nháº­p khi chuyá»n in_progress: dá»± kiáº¿n hoÃ n thÃ nh */
  expectedCompletionDate?: string | null;
  /** Chuá»i role cáº§n duyá»t theo thá»© tá»±. [] = khÃ´ng cáº§n duyá»t. ['GD_KD'] = 1 cáº¥p. ['GD_KD','GD_VP'] = cross-block 2 cáº¥p */
  approvalChain?: string[];
  /** Lá»ch sá»­ cÃ¡c bÆ°á»c duyá»t ÄÃ£ hoÃ n thÃ nh */
  approvalsCompleted?: ApprovalStep[];
  /** Role cáº§n duyá»t tiáº¿p theo (cho UI hiá»n thá»). null khi chain done hoáº·c chÆ°a start. */
  currentApprover?: string | null;
  /** Lá»ch sá»­ yÃªu cáº§u bá» sung tá»« recipient â creator (lÆ°u Äá» track) */
  revisionRequests?: RevisionRequest[];
  /** Role label tiáº¿ng Viá»t â UI dÃ¹ng Äá» render chain (vd "GiÃ¡m Äá»c Khá»i KD") */
  approvalChainLabels?: Record<string, string>;
  // ââ Nháº¯c viá»c (Phase Mock-Frame-3 2026-06-12) ââââââââââââââââââââââââ
  /** ISO string khi creator/admin báº¥m "Nháº¯c viá»c" gáº§n nháº¥t */
  lastNudgeAt?: string | null;
  lastNudgeBy?: string | null;
  lastNudgeByName?: string | null;
  /** Äáº¿m tá»ng láº§n ÄÃ£ nháº¯c trÃªn task nÃ y */
  nudgeCount?: number;
  // ââ Mock-Frame-7 (2026-06-12) â bÃ n giao + nhiá»m vá»¥ phá»i há»£p ââ
  /** Káº¿t quáº£ bÃ n giao dá»± kiáº¿n (output cá»¥ thá», khÃ¡c `goal` = má»¥c tiÃªu/intent) */
  expectedDeliverable?: string | null;
  /** MÃ´ táº£ nhiá»m vá»¥ riÃªng cho má»i ÄÆ¡n vá» phá»i há»£p.
   *  Key format: "dept:<id>" hoáº·c "facility:<id>". */
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

/** Map role â label tiáº¿ng Viá»t cho UI chain. */
export const ROLE_LABEL_VN: Record<string, string> = {
  GD_KD: 'GiÃ¡m Äá»c Khá»i Kinh doanh',
  GD_VP: 'GiÃ¡m Äá»c Khá»i VÄn phÃ²ng',
  CEO: 'Chá»§ tá»ch / CEO',
  ADMIN: 'Quáº£n trá» há» thá»ng',
  TP_KE: 'TrÆ°á»ng phÃ²ng Káº¿ toÃ¡n',
  TP_NS: 'TrÆ°á»ng phÃ²ng NhÃ¢n sá»±',
  TP_KT: 'TrÆ°á»ng phÃ²ng Ká»¹ thuáº­t',
  TP_DT: 'TrÆ°á»ng phÃ²ng ÄÃ o táº¡o',
  TP_MKT: 'TrÆ°á»ng phÃ²ng Marketing',
  TP_GS: 'TrÆ°á»ng phÃ²ng GiÃ¡m sÃ¡t',
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
  tai_chinh: 'TÃ i chÃ­nh',
  van_hanh: 'Váº­n hÃ nh',
};
export const FINANCIAL_GROUP_LABEL: Record<FinancialGroup, string> = {
  chi_thuong_xuyen: 'Chi hoáº¡t Äá»ng thÆ°á»ng xuyÃªn',
  chi_khac: 'Chi khÃ¡c (mua sáº¯m, sá»­a chá»¯a, Äáº§u tÆ°...)',
};
/** NgÆ°á»¡ng tá»± quyáº¿t: chi khÃ¡c â¤ giÃ¡ trá» nÃ y â QLCS tá»± quyáº¿t, khÃ´ng cáº§n GÄ duyá»t */
export const AUTO_APPROVE_THRESHOLD = 5_000_000;

export interface TaskCreate {
  kind: TaskKind;              // báº¯t buá»c: Äá» xuáº¥t hay giao viá»c
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
  // Äá» xuáº¥t v2 (kind='proposal'): báº¯t buá»c proposalType.
  // Náº¿u tai_chinh: báº¯t buá»c financialGroup; náº¿u chi_khac thÃ¬ estimatedCost báº¯t buá»c (server validate).
  proposalType?: ProposalType | null;
  financialGroup?: FinancialGroup | null;
  estimatedCost?: number | null;
  // Phase 12.5 (2026-06-03): chuá»i UID ngÆ°á»i duyá»t theo thá»© tá»± (chá» dÃ¹ng cho kind='proposal').
  // Empty/undefined = khÃ´ng cáº§n duyá»t â Äi tháº³ng pending. Server force assignee=creator.
  approverUserIds?: string[];
  // Mock-Frame-7 (2026-06-12): output cá»¥ thá» bÃ n giao + nhiá»m vá»¥ riÃªng cho má»i collaborator
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
  downloadUrl?: string;       // chá» cÃ³ khi list (signed read URL)
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

  /** Phase 12 â Recipient (assignee) yÃªu cáº§u creator bá» sung. Status: pending|in_progress â requested_revision. */
  async requestRevision(id: string, message: string): Promise<{ ok: true }> {
    return jsonOrThrow<{ ok: true }>(
      await fetch(`/api/tasks/${id}/request-revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      }),
    );
  },

  /** Nháº¯c viá»c ngÆ°á»i Äang táº¯c. Cooldown 4h + threshold 24h (admin/GÄ bypass).
   *  Backend tá»± xÃ¡c Äá»nh target theo status (currentApprover hoáº·c assignee). */
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

  /** Multipart upload (server-side proxy, khÃ´ng cáº§n CORS bucket). */
  async uploadAttachment(id: string, file: File): Promise<void> {
    const form = new FormData();
    form.append('file', file);
    await jsonOrThrow<{ ok: true; path: string }>(
      await fetch(`/api/tasks/${id}/attachments`, {
        method: 'POST',
        body: form,
        // KHÃNG set Content-Type â browser tá»± add boundary cho multipart
      }),
    );
  },

  async deleteAttachment(id: string, path: string): Promise<{ ok: true }> {
    return jsonOrThrow<{ ok: true }>(
      await fetch(`/api/tasks/${id}/attachments?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
    );
  },
};
