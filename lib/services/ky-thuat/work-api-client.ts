// Client wrapper cho /api/ky-thuat/work (techWork collection — unified)
// kind: 'task' | 'report' | 'proposal'

export type WorkKind = 'task' | 'report' | 'proposal';
export type WorkStatus = 'open' | 'in_progress' | 'done' | 'cancelled' | 'pending_approval' | 'approved' | 'rejected';
export type Specialization = 'HT' | 'XLN';
export type ProposalType = 'expense' | 'professional';
export type ReportType = 'checklist' | 'incident';

export interface WorkItem {
  id: string;
  kind: WorkKind;
  branchId: string;
  title: string;
  description?: string;
  status: WorkStatus;
  createdAt: string;
  createdBy: string;
  createdByName: string;
  createdByRole: string;
  updatedAt?: string;

  // task — multi-assignee canonical từ 2026-06-01 (legacy: assigneeId/assigneeName)
  assigneeIds?: string[];
  assigneeNames?: string[];
  assigneeId?: string | null;     // legacy read-only
  assigneeName?: string;          // legacy read-only
  priority?: 'low' | 'normal' | 'high';
  specialization?: Specialization | null;
  dueDate?: string | null;
  completedAt?: string;

  // report
  reportType?: ReportType;
  checklistData?: Record<string, any> | null;
  attachments?: string[];

  // proposal
  proposalType?: ProposalType;
  expenseAmount?: number;
  approvalNotes?: string;
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: string;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const body = await res.json(); if (body?.error) msg = body.error; } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const workApi = {
  async list(filter?: { kind?: WorkKind; branchId?: string; status?: WorkStatus }): Promise<WorkItem[]> {
    const qs = new URLSearchParams();
    if (filter?.kind) qs.set('kind', filter.kind);
    if (filter?.branchId) qs.set('branchId', filter.branchId);
    if (filter?.status) qs.set('status', filter.status);
    const url = `/api/ky-thuat/work${qs.toString() ? '?' + qs.toString() : ''}`;
    return (await jsonOrThrow<{ rows: WorkItem[] }>(await fetch(url, { cache: 'no-store' }))).rows;
  },

  async createTask(payload: {
    branchId: string;
    title: string;
    description?: string;
    assigneeIds: string[];
    assigneeNames: string[];
    priority?: 'low' | 'normal' | 'high';
    specialization?: Specialization | null;
    dueDate?: string | null;
  }): Promise<{ id: string }> {
    return jsonOrThrow<{ ok: true; id: string }>(await fetch('/api/ky-thuat/work', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'task', ...payload }),
    }));
  },

  async createReport(payload: {
    branchId: string;
    title: string;
    description?: string;
    reportType?: ReportType;
    checklistData?: Record<string, any> | null;
    attachments?: string[];
  }): Promise<{ id: string }> {
    return jsonOrThrow<{ ok: true; id: string }>(await fetch('/api/ky-thuat/work', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'report', ...payload }),
    }));
  },

  async createProposal(payload: {
    branchId: string;
    title: string;
    description?: string;
    proposalType: ProposalType;
    expenseAmount?: number;
  }): Promise<{ id: string }> {
    return jsonOrThrow<{ ok: true; id: string }>(await fetch('/api/ky-thuat/work', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'proposal', ...payload }),
    }));
  },

  async updateTaskStatus(id: string, status: WorkStatus): Promise<void> {
    await jsonOrThrow<{ ok: true }>(await fetch('/api/ky-thuat/work', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'status_change', status }),
    }));
  },

  async approveProposal(id: string, approvalNotes?: string): Promise<void> {
    await jsonOrThrow<{ ok: true }>(await fetch('/api/ky-thuat/work', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'approve', approvalNotes }),
    }));
  },

  async rejectProposal(id: string, approvalNotes?: string): Promise<void> {
    await jsonOrThrow<{ ok: true }>(await fetch('/api/ky-thuat/work', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'reject', approvalNotes }),
    }));
  },

  async remove(id: string): Promise<void> {
    await jsonOrThrow<{ ok: true }>(await fetch(`/api/ky-thuat/work?id=${encodeURIComponent(id)}`, { method: 'DELETE' }));
  },
};
