// Phase 11 — Client gọi proposal API. Đặt fetch path + serialize body chuẩn.

export type ProposalStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type ProposalCategory = 'mua_sam' | 'sua_chua' | 'tuyen_dung' | 'marketing' | 'dao_tao' | 'dau_tu' | 'khac';
export type ProposalBlock = 'KD' | 'VP' | 'all';
export type TaskBlock = 'KD' | 'VP';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Proposal {
  id: string;
  title: string;
  description: string;
  category: ProposalCategory;
  branchId: string | null;
  departmentId: string | null;
  block: ProposalBlock;
  approverRole: string;
  estimatedCost: number | null;
  currency: 'VND';
  attachments: Array<{ name: string; url: string; size: number; uploadedAt?: string }>;
  status: ProposalStatus;
  approverId: string | null;
  approverName: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  decidedAt: string | null;
  generatedTaskId: string | null;
  generatedTaskStatus?: string;
  creatorId: string;
  creatorName: string;
  creatorRole: string;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  approverNotes?: string;
}

interface CreateProposalInput {
  title: string;
  description: string;
  category: ProposalCategory;
  block: ProposalBlock;
  approverRole: string;
  branchId?: string | null;
  departmentId?: string | null;
  estimatedCost?: number | null;
  attachments?: Proposal['attachments'];
}

interface ApproveProposalInput {
  assigneeUserIds: string[];
  assigneeBlock: TaskBlock;
  assigneeDeptId?: string | null;
  assigneeFacilityId?: string | null;
  dueDate: string;        // YYYY-MM-DD
  priority: TaskPriority;
  approverNotes?: string;
}

async function jfetch(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Lỗi ${res.status}`);
  return data;
}

export const proposalsApi = {
  async list(filter?: { status?: ProposalStatus; branchId?: string; category?: ProposalCategory }): Promise<Proposal[]> {
    const qs = new URLSearchParams();
    if (filter?.status) qs.set('status', filter.status);
    if (filter?.branchId) qs.set('branchId', filter.branchId);
    if (filter?.category) qs.set('category', filter.category);
    const data = await jfetch(`/api/proposals?${qs.toString()}`);
    return (data.rows ?? []) as Proposal[];
  },
  async get(id: string): Promise<Proposal> {
    const data = await jfetch(`/api/proposals/${id}`);
    return data.proposal as Proposal;
  },
  async create(input: CreateProposalInput): Promise<Proposal> {
    const data = await jfetch('/api/proposals', { method: 'POST', body: JSON.stringify(input) });
    return data.proposal as Proposal;
  },
  async update(id: string, patch: Partial<CreateProposalInput>): Promise<void> {
    await jfetch(`/api/proposals/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  async remove(id: string): Promise<void> {
    await jfetch(`/api/proposals/${id}`, { method: 'DELETE' });
  },
  async submit(id: string): Promise<void> {
    await jfetch(`/api/proposals/${id}/submit`, { method: 'POST' });
  },
  async approve(id: string, input: ApproveProposalInput): Promise<{ taskId: string; warning: string | null }> {
    return await jfetch(`/api/proposals/${id}/approve`, { method: 'POST', body: JSON.stringify(input) });
  },
  async reject(id: string, rejectedReason: string): Promise<void> {
    await jfetch(`/api/proposals/${id}/reject`, { method: 'POST', body: JSON.stringify({ rejectedReason }) });
  },
};

// Task completion (Phase 11 new workflow)
export const tasksCompletionApi = {
  async submitCompletion(taskId: string, completionReport: string, completionAttachments?: Array<{ name: string; url: string; size: number }>): Promise<void> {
    await jfetch(`/api/tasks/${taskId}/submit-completion`, {
      method: 'POST',
      body: JSON.stringify({ completionReport, completionAttachments }),
    });
  },
  async approveCompletion(taskId: string, decision: 'approve' | 'reject', approverNotes?: string): Promise<void> {
    await jfetch(`/api/tasks/${taskId}/approve-completion`, {
      method: 'POST',
      body: JSON.stringify({ decision, approverNotes }),
    });
  },
};

// Labels tiếng Việt
export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: 'Nháp',
  submitted: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
};
export const PROPOSAL_CATEGORY_LABEL: Record<ProposalCategory, string> = {
  mua_sam: 'Mua sắm',
  sua_chua: 'Sửa chữa',
  tuyen_dung: 'Tuyển dụng',
  marketing: 'Marketing',
  dao_tao: 'Đào tạo',
  dau_tu: 'Đầu tư',
  khac: 'Khác',
};
export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Thấp', normal: 'Bình thường', high: 'Cao', urgent: 'Khẩn cấp',
};
