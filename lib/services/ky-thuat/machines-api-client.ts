// Client wrapper cho /api/ky-thuat/{machines, machine-runs}

export type MachineType = 'loc' | 'nhiet';
export type CttSubArea = 'indoor' | 'outdoor' | 'kid';

export interface Machine {
  id: string;
  branchId: string;
  subArea?: CttSubArea | null;  // chỉ CTT
  name: string;
  type: MachineType;
  standardCapacity: number;
  capacityUnit: string;
  sortOrder: number;
  active: boolean;
}

export interface MachineRun {
  id: string;
  branchId: string;
  machineSubArea?: CttSubArea | null;  // denorm từ machine.subArea (chỉ CTT)
  year: number;
  month: number;
  day: number;
  date: string;
  machineId: string;
  machineName: string;
  machineType: MachineType;
  hoursRun: number;
  notes?: string | null;
  createdBy?: string;
  updatedByName?: string;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const body = await res.json(); if (body?.error) msg = body.error; } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const machinesApi = {
  async list(branchId?: string): Promise<Machine[]> {
    const url = `/api/ky-thuat/machines${branchId ? '?branchId=' + encodeURIComponent(branchId) : ''}`;
    return (await jsonOrThrow<{ rows: Machine[] }>(await fetch(url, { cache: 'no-store' }))).rows;
  },
  async create(payload: { branchId: string; name: string; type: MachineType; standardCapacity: number; capacityUnit?: string; sortOrder?: number; subArea?: CttSubArea }): Promise<{ id: string }> {
    return jsonOrThrow<{ ok: true; id: string }>(await fetch('/api/ky-thuat/machines', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }));
  },
  async update(id: string, patch: Partial<Pick<Machine, 'name' | 'standardCapacity' | 'capacityUnit' | 'sortOrder' | 'active' | 'subArea'>>): Promise<void> {
    await jsonOrThrow<{ ok: true }>(await fetch('/api/ky-thuat/machines', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...patch }),
    }));
  },
  async remove(id: string): Promise<void> {
    await jsonOrThrow<{ ok: true }>(await fetch(`/api/ky-thuat/machines?id=${encodeURIComponent(id)}`, { method: 'DELETE' }));
  },
};

export const machineRunsApi = {
  async list(filter: { year: number; branchId?: string; month?: number }): Promise<MachineRun[]> {
    const qs = new URLSearchParams({ year: String(filter.year) });
    if (filter.branchId) qs.set('branchId', filter.branchId);
    if (filter.month) qs.set('month', String(filter.month));
    return (await jsonOrThrow<{ rows: MachineRun[] }>(await fetch(`/api/ky-thuat/machine-runs?${qs.toString()}`, { cache: 'no-store' }))).rows;
  },
  async bulkUpsert(entries: Array<{ branchId: string; date: string; machineId: string; machineName?: string; machineType?: MachineType; hoursRun: number; notes?: string }>): Promise<{ written: number; deleted: number }> {
    return jsonOrThrow<{ ok: true; written: number; deleted: number }>(await fetch('/api/ky-thuat/machine-runs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries }),
    }));
  },
};
