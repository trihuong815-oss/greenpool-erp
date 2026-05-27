// Client wrapper cho /api/ky-thuat/chemicals

export type ChemicalType = 'clo' | 'axit';
export type CttSubArea = 'indoor' | 'outdoor' | 'kid';

export interface ChemicalEntry {
  id: string;
  branchId: string;
  subArea?: CttSubArea | null;  // chỉ CTT có giá trị; non-CTT = null
  year: number;
  month: number;
  day: number;
  date: string; // YYYY-MM-DD
  type: ChemicalType;
  amount: number;       // số nguyên/thập phân — clo: kg · axit: lít
  batch?: string | null;
  notes?: string | null;
  addedBy: string;
  addedByName: string;
  addedByRole?: string;
  addedAt: string;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const body = await res.json(); if (body?.error) msg = body.error; } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const chemicalsApi = {
  /** List theo year (+ optional branchId + month) */
  async list(filter: { year: number; branchId?: string; month?: number }): Promise<ChemicalEntry[]> {
    const qs = new URLSearchParams({ year: String(filter.year) });
    if (filter.branchId) qs.set('branchId', filter.branchId);
    if (filter.month) qs.set('month', String(filter.month));
    return (await jsonOrThrow<{ rows: ChemicalEntry[] }>(
      await fetch(`/api/ky-thuat/chemicals?${qs.toString()}`, { cache: 'no-store' }),
    )).rows;
  },

  async create(payload: {
    branchId: string;
    date: string;       // YYYY-MM-DD
    type: ChemicalType;
    amount: number;
    subArea?: CttSubArea;  // bắt buộc khi branchId === 'CTT'
    batch?: string;
    notes?: string;
  }): Promise<{ id: string }> {
    const res = await fetch('/api/ky-thuat/chemicals', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return jsonOrThrow<{ ok: true; id: string }>(res);
  },

  async remove(id: string): Promise<void> {
    await jsonOrThrow<{ ok: true }>(
      await fetch(`/api/ky-thuat/chemicals?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
    );
  },
};
