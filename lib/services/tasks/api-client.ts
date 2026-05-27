// Client wrapper cho /api/tasks (Phase 7).

export type Block = 'KD' | 'VP';
export type TaskStatus =
  | 'pending_approval'   // chờ GĐ Khối nhận duyệt (cross-block)
  | 'pending'            // sẵn sàng làm
  | 'in_progress'        // đang làm
  | 'done'               // hoàn thành
  | 'rejected'           // GĐ Khối từ chối
  | 'cancelled';         // creator huỷ
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
}

export interface TaskCreate {
  kind: TaskKind;              // bắt buộc: đề xuất hay giao việc
  title: string;
  description: string;
  assigneeBlock: Block;
  assigneeDeptId?: string | null;
  assigneeFacilityId?: string | null;
  assigneeUserIds?: string[];
  priority: TaskPriority;
  dueDate?: string | null;
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
    input: { status: TaskStatus; progressPct?: number; comment?: string },
  ): Promise<{ ok: true }> {
    return jsonOrThrow<{ ok: true }>(
      await fetch(`/api/tasks/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
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
