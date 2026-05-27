// Client wrapper cho /api/sales-targets

export type TargetLeadSource = 'MKT' | 'Sale' | 'Renew' | 'Referral' | 'Walk-in';
export type LeadTargets = Record<TargetLeadSource, number[]>;   // 12 numbers/source

export type StaffTargets = Record<string, number[]>; // saleId → 12 numbers (VND)

export interface SalesTarget {
  id: string;
  year: number;
  branchId: string;
  yearTarget: number;                  // server-computed = sum(monthTargets)
  monthTargets: number[] | null;       // 12 doanh số per tháng (VND)
  yearLeadTarget: number;              // server-computed = sum tất cả leadTargets
  leadTargets: LeadTargets | null;     // per source × 12 months
  staffTargets: StaffTargets | null;   // per sale × 12 months (QLCS-set)
  updatedAt: string;
}

export interface SalesTargetUpsert {
  year: number;
  branchId: string;
  monthTargets?: number[];             // 12 numbers (VND) — admin only
  leadTargets?: Partial<LeadTargets>;  // per source × 12 months — admin only
  staffTargets?: StaffTargets;         // per sale × 12 months — admin OR QLCS branch mình
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const body = await res.json(); if (body?.error) msg = body.error; } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const targetsApi = {
  async list(year: number): Promise<SalesTarget[]> {
    return (await jsonOrThrow<{ rows: SalesTarget[] }>(
      await fetch(`/api/sales-targets?year=${year}`, { cache: 'no-store' }),
    )).rows;
  },
  async bulkUpsert(entries: SalesTargetUpsert[]): Promise<{ written: number }> {
    const res = await fetch('/api/sales-targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries }),
    });
    return jsonOrThrow<{ written: number }>(res);
  },
};
