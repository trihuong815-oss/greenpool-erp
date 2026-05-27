// Client wrappers cho /api/leads + /api/lead-activities (Phase 6).
// salesApi đã có ở api-client.ts — file này bổ sung leads + activities + sales create new schema.

export interface Lead {
  id: string;
  inputSource: string;
  assignedSaleId: string;
  branchId: string;
  status: 'new' | 'contacted' | 'qualified' | 'closed_won' | 'closed_lost';
  customerName?: string;
  customerPhone?: string;
  crmLeadId?: string | null;
  crmCustomerId?: string | null;
  sourceSystem?: 'manual' | 'crm' | 'csv';
  syncedAt?: string | null;
  externalRef?: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface Activity {
  id: string;
  leadId: string;
  saleId: string;
  branchId: string;
  type: 'call' | 'meet' | 'message' | 'email' | 'note';
  content: string;
  nextFollowUpAt: string | null;
  createdAt: string;
  createdBy: string;
}

export interface NewSalePayload {
  leadId: string;
  packageId: string;
  packageName: string;
  amount: number;
  closeSource: string;
  saleBy: string;
  branchId: string;
  status: 'confirmed' | 'pending_payment' | 'refunded' | 'cancelled';
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const body = await res.json(); if (body?.error) msg = body.error; } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const leadsApi = {
  async list(filter: { branchId?: string; status?: string; inputSource?: string; from?: string; to?: string } = {}): Promise<Lead[]> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(filter)) if (v) qs.set(k, v);
    const url = `/api/leads${qs.toString() ? '?' + qs.toString() : ''}`;
    const data = await jsonOrThrow<{ rows: Lead[] }>(await fetch(url, { cache: 'no-store' }));
    return data.rows;
  },

  async create(payload: {
    inputSource: string; assignedSaleId: string; branchId: string;
    status: string; customerName?: string; customerPhone?: string;
  }): Promise<Lead> {
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload }),
    });
    return (await jsonOrThrow<{ lead: Lead }>(res)).lead;
  },

  async update(id: string, patch: Partial<Lead>): Promise<Lead> {
    const res = await fetch(`/api/leads/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patch }),
    });
    return (await jsonOrThrow<{ lead: Lead }>(res)).lead;
  },
};

export const activitiesApi = {
  async list(filter: { leadId?: string; branchId?: string } = {}): Promise<Activity[]> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(filter)) if (v) qs.set(k, v);
    const url = `/api/lead-activities${qs.toString() ? '?' + qs.toString() : ''}`;
    return (await jsonOrThrow<{ rows: Activity[] }>(await fetch(url, { cache: 'no-store' }))).rows;
  },

  async create(payload: {
    leadId: string; type: string; content: string; nextFollowUpAt?: string | null;
  }): Promise<Activity> {
    const res = await fetch('/api/lead-activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return (await jsonOrThrow<{ activity: Activity }>(res)).activity;
  },
};

export const salesPipelineApi = {
  async create(payload: NewSalePayload): Promise<{ id: string }> {
    const res = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload }),
    });
    const data = await jsonOrThrow<{ sale: { id: string } }>(res);
    return { id: data.sale.id };
  },
};

// Hardcoded packages catalog (chưa có collection `packages` riêng — Phase 7 có thể tách).
export const PACKAGES = [
  { id: 'pkg-3m',  name: 'Hội viên 3 tháng',  basePrice: 1_800_000 },
  { id: 'pkg-6m',  name: 'Hội viên 6 tháng',  basePrice: 3_300_000 },
  { id: 'pkg-12m', name: 'Hội viên 12 tháng', basePrice: 6_000_000 },
  { id: 'pkg-pt',  name: 'Gói PT 10 buổi',    basePrice: 4_500_000 },
];

export const SOURCES = ['MKT', 'Sale', 'Renew', 'Referral', 'Walk-in'] as const;
export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'closed_won', 'closed_lost'] as const;
export const ACTIVITY_TYPES = ['call', 'meet', 'message', 'email', 'note'] as const;
export const SALE_STATUSES = ['confirmed', 'pending_payment', 'refunded', 'cancelled'] as const;

// ============================================================================
// Phase 6.E — Sales Entries (bảng tổng nhập tay)
// ============================================================================

export type PeriodType = 'month' | 'day';

export interface SalesEntry {
  id: string;
  period: string;                     // '2025-01' or '2025-06-15'
  periodType: PeriodType;
  year: number;
  month: number;
  day?: number;
  branchId: string;
  saleId: string;
  saleName: string;
  source: typeof SOURCES[number];
  leads: number;
  closed: number;
  notClosed: number;
  // Legacy fields — vẫn có thể còn trong docs cũ, optional cho back-compat (không dùng).
  packages?: number;
  revenue?: number;
  sourceSystem: 'manual' | 'crm' | 'csv';
  updatedAt: string;
  updatedBy: string;
}

export interface SalesEntryUpsert {
  period: string;
  periodType: PeriodType;
  branchId: string;
  saleId: string;
  saleName: string;
  source: typeof SOURCES[number];
  leads: number;
  closed: number;
  notClosed: number;
}

export const entriesApi = {
  async list(filter: { period: string; periodType: PeriodType; branchId: string }): Promise<SalesEntry[]> {
    const qs = new URLSearchParams({
      period: filter.period,
      periodType: filter.periodType,
      branchId: filter.branchId,
    });
    const data = await jsonOrThrow<{ rows: SalesEntry[] }>(
      await fetch(`/api/sales-entries?${qs.toString()}`, { cache: 'no-store' })
    );
    return data.rows;
  },

  /** Cross-mode: fetch tất cả docs của (year, month, branch) — cả month-mode + day-mode. */
  async listMonth(filter: { year: number; month: number; branchId: string }): Promise<SalesEntry[]> {
    const qs = new URLSearchParams({
      year: String(filter.year),
      month: String(filter.month),
      branchId: filter.branchId,
    });
    const data = await jsonOrThrow<{ rows: SalesEntry[] }>(
      await fetch(`/api/sales-entries?${qs.toString()}`, { cache: 'no-store' })
    );
    return data.rows;
  },

  async bulkUpsert(entries: SalesEntryUpsert[]): Promise<{ written: number }> {
    const res = await fetch('/api/sales-entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries }),
    });
    return jsonOrThrow<{ written: number }>(res);
  },
};

// Build deterministic doc ID — phải khớp server.
export function buildEntryDocId(e: { periodType: PeriodType; period: string; branchId: string; saleId: string; source: string }): string {
  return `${e.periodType}_${e.period}_${e.branchId}_${e.saleId}_${e.source}`;
}
