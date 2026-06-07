// Fetch dữ liệu Kỹ thuật cho dashboard TP_KT/PP/ADMIN/CEO.
// Aggregate per (branchId × month) cho cả năm hiện tại.
//
// - chemicalEntries: tổng clo (kg), tổng axit (lít)
// - machineRuns: tổng giờ chạy + tổng công suất (standardCapacity × hoursRun) cho lọc + nhiệt
//
// Pure server — call từ page.tsx (RSC). Wrap try/catch để 1 fail không sập dashboard.

import 'server-only';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { canReadChemicalEntry, canReadMachine, isValidCttSubArea } from './../../../lib/firebase/ky-thuat-scope';
import type { CallerProfile } from './../../../lib/firebase/checklist-scope';

// Phase B.1: BRANCH_IDS single source of truth.
import { BRANCH_IDS } from '@/lib/branches';
const ALL_BRANCHES = BRANCH_IDS;
type BranchId = typeof ALL_BRANCHES[number];

export interface KyThuatBranchAgg {
  branchId: BranchId;
  cloByMonth:        number[];   // 12 phần tử — kg
  axitByMonth:       number[];   // 12 phần tử — lít
  locCapByMonth:     number[];   // 12 phần tử — kWh (kW × h)
  nhietCapByMonth:   number[];   // 12 phần tử — kWh
  locHoursByMonth:   number[];   // 12 phần tử — h
  nhietHoursByMonth: number[];   // 12 phần tử — h
  // Tổng năm
  cloTotal: number;
  axitTotal: number;
  locCapTotal: number;
  nhietCapTotal: number;
  locHoursTotal: number;
  nhietHoursTotal: number;
}

export interface KyThuatSummary {
  year: number;
  /** Theo từng cơ sở — luôn có đủ 5 (zero-fill nếu rỗng) */
  byBranch: KyThuatBranchAgg[];
  /** Tổng hệ thống — gộp 5 cơ sở */
  system: {
    cloByMonth: number[];
    axitByMonth: number[];
    locCapByMonth: number[];
    nhietCapByMonth: number[];
    cloTotal: number;
    axitTotal: number;
    locCapTotal: number;
    nhietCapTotal: number;
  };
}

function makeEmptyAgg(branchId: BranchId): KyThuatBranchAgg {
  return {
    branchId,
    cloByMonth: Array(12).fill(0),
    axitByMonth: Array(12).fill(0),
    locCapByMonth: Array(12).fill(0),
    nhietCapByMonth: Array(12).fill(0),
    locHoursByMonth: Array(12).fill(0),
    nhietHoursByMonth: Array(12).fill(0),
    cloTotal: 0,
    axitTotal: 0,
    locCapTotal: 0,
    nhietCapTotal: 0,
    locHoursTotal: 0,
    nhietHoursTotal: 0,
  };
}

export async function fetchKyThuatSummary(year: number, caller: CallerProfile): Promise<KyThuatSummary> {
  const db = getFirebaseAdminDb();
  const byBranch: Record<BranchId, KyThuatBranchAgg> = {} as Record<BranchId, KyThuatBranchAgg>;
  for (const b of ALL_BRANCHES) byBranch[b] = makeEmptyAgg(b);

  // Fetch 3 streams song song; mỗi stream có try/catch riêng.
  const [chemSnap, machinesSnap, runsSnap] = await Promise.all([
    db.collection(COLLECTIONS.CHEMICAL_ENTRIES).where('year', '==', year).get()
      .catch((e: any) => { console.warn('[KT] chemicals fetch', e?.message); return null; }),
    db.collection(COLLECTIONS.MACHINES).get()
      .catch((e: any) => { console.warn('[KT] machines fetch', e?.message); return null; }),
    db.collection(COLLECTIONS.MACHINE_RUNS).where('year', '==', year).get()
      .catch((e: any) => { console.warn('[KT] machine-runs fetch', e?.message); return null; }),
  ]);

  // 1. Chemicals — filter per entry theo canReadChemicalEntry (subArea + scope)
  if (chemSnap) {
    for (const d of chemSnap.docs) {
      const x = d.data();
      const bId = x.branchId as BranchId;
      const m = Number(x.month);
      const amt = Number(x.amount ?? 0);
      if (!byBranch[bId] || !(m >= 1 && m <= 12)) continue;
      const entrySubArea = isValidCttSubArea(x.subArea) ? x.subArea : null;
      if (!canReadChemicalEntry(caller, bId, entrySubArea)) continue;
      if (x.type === 'clo') {
        byBranch[bId].cloByMonth[m - 1] += amt;
        byBranch[bId].cloTotal += amt;
      } else if (x.type === 'axit') {
        byBranch[bId].axitByMonth[m - 1] += amt;
        byBranch[bId].axitTotal += amt;
      }
    }
  }

  // 2. Machines — build map machineId → standardCapacity, type, branchId
  const machineMeta = new Map<string, { capacity: number; type: 'loc' | 'nhiet'; branchId: BranchId }>();
  if (machinesSnap) {
    for (const d of machinesSnap.docs) {
      const x = d.data();
      const t = x.type as 'loc' | 'nhiet';
      const bId = x.branchId as BranchId;
      if ((t !== 'loc' && t !== 'nhiet') || !byBranch[bId]) continue;
      machineMeta.set(d.id, {
        capacity: Number(x.standardCapacity ?? 0),
        type: t,
        branchId: bId,
      });
    }
  }

  // 3. Machine runs — filter per run theo canReadMachine (machineSubArea)
  if (runsSnap) {
    for (const d of runsSnap.docs) {
      const x = d.data();
      const bId = x.branchId as BranchId;
      const m = Number(x.month);
      const hrs = Number(x.hoursRun ?? 0);
      const t = x.machineType as 'loc' | 'nhiet';
      if (!byBranch[bId] || !(m >= 1 && m <= 12) || (t !== 'loc' && t !== 'nhiet')) continue;
      const machineSubArea = isValidCttSubArea(x.machineSubArea) ? x.machineSubArea : null;
      if (!canReadMachine(caller, bId, machineSubArea)) continue;
      const meta = machineMeta.get(String(x.machineId));
      // Ưu tiên capacity denorm trên run (sau P3); fallback live từ machine.
      const cap = Number.isFinite(Number(x.capacity)) && Number(x.capacity) > 0
        ? Number(x.capacity)
        : (meta?.capacity ?? 0);
      const energy = cap * hrs;
      if (t === 'loc') {
        byBranch[bId].locHoursByMonth[m - 1] += hrs;
        byBranch[bId].locCapByMonth[m - 1] += energy;
        byBranch[bId].locHoursTotal += hrs;
        byBranch[bId].locCapTotal += energy;
      } else {
        byBranch[bId].nhietHoursByMonth[m - 1] += hrs;
        byBranch[bId].nhietCapByMonth[m - 1] += energy;
        byBranch[bId].nhietHoursTotal += hrs;
        byBranch[bId].nhietCapTotal += energy;
      }
    }
  }

  // System aggregate
  const system = {
    cloByMonth: Array(12).fill(0),
    axitByMonth: Array(12).fill(0),
    locCapByMonth: Array(12).fill(0),
    nhietCapByMonth: Array(12).fill(0),
    cloTotal: 0,
    axitTotal: 0,
    locCapTotal: 0,
    nhietCapTotal: 0,
  };
  for (const b of ALL_BRANCHES) {
    const a = byBranch[b];
    for (let i = 0; i < 12; i++) {
      system.cloByMonth[i]      += a.cloByMonth[i];
      system.axitByMonth[i]     += a.axitByMonth[i];
      system.locCapByMonth[i]   += a.locCapByMonth[i];
      system.nhietCapByMonth[i] += a.nhietCapByMonth[i];
    }
    system.cloTotal      += a.cloTotal;
    system.axitTotal     += a.axitTotal;
    system.locCapTotal   += a.locCapTotal;
    system.nhietCapTotal += a.nhietCapTotal;
  }

  return {
    year,
    byBranch: ALL_BRANCHES.map((b) => byBranch[b]),
    system,
  };
}
