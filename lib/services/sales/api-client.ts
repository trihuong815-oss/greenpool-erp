// Client-side wrappers cho /api/sales/*

export interface SaleListItem {
  id: string;
  branchId: string;
  amount: number;
  paymentMethod: string;
  type: string;
  status: string;
  source: string;
  customerName: string;
  customerPhone?: string;
  packageId?: string | null;
  saleStaffId?: string;
  notes?: string | null;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BranchReport {
  branchId: string;
  totalAmount: number;
  totalLeads: number;
  totalClosed: number;
  closeRate: number;
  sources: Record<string, { leads: number; closed: number; revenue: number }>;
  byMonth: { month: number; amount: number; closed: number }[];
}

export interface SystemReport {
  period: { year: number; month: number | null };
  branches: BranchReport[];
  system: { totalAmount: number; totalLeads: number; totalClosed: number; closeRate: number };
}

export interface SaleDetailRow {
  saleStaffId: string;
  saleName: string;
  totalAmount: number;
  totalLeads: number;
  totalClosed: number;
  sources: Record<string, { leads: number; closed: number; revenue: number }>;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const body = await res.json(); if (body?.error) msg = body.error; } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const salesApi = {
  async list(filter: { branchId?: string; from?: string; to?: string; source?: string; status?: string } = {}): Promise<SaleListItem[]> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(filter)) if (v) qs.set(k, v);
    const url = `/api/sales${qs.toString() ? '?' + qs.toString() : ''}`;
    const data = await jsonOrThrow<{ rows: SaleListItem[] }>(await fetch(url, { cache: 'no-store' }));
    return data.rows;
  },

  async create(payload: Partial<SaleListItem>): Promise<SaleListItem> {
    const res = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload }),
    });
    const data = await jsonOrThrow<{ sale: SaleListItem }>(res);
    return data.sale;
  },

  async update(id: string, patch: Partial<SaleListItem>): Promise<SaleListItem> {
    const res = await fetch(`/api/sales/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patch }),
    });
    const data = await jsonOrThrow<{ sale: SaleListItem }>(res);
    return data.sale;
  },

  async delete(id: string): Promise<void> {
    await jsonOrThrow<{ ok: true }>(await fetch(`/api/sales/${encodeURIComponent(id)}`, { method: 'DELETE' }));
  },

  async branchReport(params: { year?: number; month?: number } = {}): Promise<SystemReport> {
    const qs = new URLSearchParams();
    if (params.year) qs.set('year', String(params.year));
    if (params.month) qs.set('month', String(params.month));
    const url = `/api/sales/reports/branch${qs.toString() ? '?' + qs.toString() : ''}`;
    return jsonOrThrow<SystemReport>(await fetch(url, { cache: 'no-store' }));
  },

  async saleDetail(params: { branchId: string; year?: number; month?: number }): Promise<{ branchId: string; rows: SaleDetailRow[] }> {
    const qs = new URLSearchParams({ branchId: params.branchId });
    if (params.year) qs.set('year', String(params.year));
    if (params.month) qs.set('month', String(params.month));
    return jsonOrThrow<{ branchId: string; rows: SaleDetailRow[] }>(
      await fetch(`/api/sales/reports/sale-detail?${qs.toString()}`, { cache: 'no-store' })
    );
  },
};
