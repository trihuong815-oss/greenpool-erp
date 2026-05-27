// Tab 2 — Vận hành máy (lọc + nhiệt)
// View hierarchy:
//   Year view: 5 cơ sở × tổng giờ lọc + nhiệt
//   Branch view: 12 tháng × tổng giờ lọc + nhiệt + nút "Setup máy" (TP/PP) + danh sách máy
//   Month view (?month=): nhập + xem giờ chạy chi tiết theo ngày

import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import {
  kyThuatReadScope, canWriteMachineRun, canSetupMachines, canReadMachine,
  isValidCttSubArea,
} from '@/lib/firebase/ky-thuat-scope';
import { MayClient, type MachineAgg, type MachineSetup, type RunRow } from './MayClient';
import type { MachineType } from '@/lib/services/ky-thuat/machines-api-client';

const ALL_BRANCHES = ['HM', 'TK', 'CTT', '24', 'TT'] as const;
const BRANCH_LABELS: Record<string, string> = {
  HM:  'Green Pool Hoàng Mai',
  TK:  'Green Pool 20 Thuỵ Khuê',
  CTT: 'Green Pool Cung Thể Thao MĐ',
  '24':'Green Pool 24 NCT',
  TT:  'Green Pool Thanh Trì',
};

interface PageProps {
  searchParams: Promise<{ year?: string; branchId?: string; month?: string }>;
}

export default async function MayPage({ searchParams }: PageProps) {
  const { profile } = await requireAuthedProfile();
  const sp = await searchParams;
  const year = sp.year && /^\d{4}$/.test(sp.year) ? Number(sp.year) : new Date().getFullYear();
  const branchId = sp.branchId && (ALL_BRANCHES as readonly string[]).includes(sp.branchId) ? sp.branchId : null;
  const month = sp.month && /^([1-9]|1[0-2])$/.test(sp.month) ? Number(sp.month) : null;

  const callerProfile = {
    uid: profile.id, role_code: profile.roleCode, facility_id: profile.branchId,
    department_id: profile.departmentId, shift_assignment: profile.shiftAssignment,
    is_shared_shift_account: profile.isSharedShiftAccount,
    sub_areas: profile.subAreas,
  };
  const scope = kyThuatReadScope(callerProfile);
  if (scope.branchIds && scope.branchIds.length === 0) {
    return <div className="p-6 text-center text-slate-500">Bạn chưa được gán cơ sở/quyền xem.</div>;
  }
  const visibleBranchIds: readonly string[] = scope.branchIds === null
    ? ALL_BRANCHES
    : (scope.branchIds.length > 0 ? scope.branchIds : []);
  if (branchId && !visibleBranchIds.includes(branchId)) {
    return <div className="p-6 text-center text-rose-600">Bạn không có quyền xem cơ sở này.</div>;
  }

  const db = getFirebaseAdminDb();

  // Fetch machine runs cho year (+ optional branch/month)
  let runQ: FirebaseFirestore.Query = db.collection(COLLECTIONS.MACHINE_RUNS).where('year', '==', year);
  if (branchId) runQ = runQ.where('branchId', '==', branchId);
  else if (scope.branchIds) {
    if (scope.branchIds.length === 1) runQ = runQ.where('branchId', '==', scope.branchIds[0]);
    else runQ = runQ.where('branchId', 'in', scope.branchIds.slice(0, 10));
  }
  if (month !== null) runQ = runQ.where('month', '==', month);
  const runSnap = await runQ.get();

  // Aggregate per (branch × type × month)
  const agg: Record<string, MachineAgg> = {};
  for (const b of visibleBranchIds) {
    agg[b] = {
      branchId: b,
      branchName: BRANCH_LABELS[b] ?? b,
      loc:   { total: 0, byMonth: Array(12).fill(0), totalCapacity: 0, byMonthCapacity: Array(12).fill(0) },
      nhiet: { total: 0, byMonth: Array(12).fill(0), totalCapacity: 0, byMonthCapacity: Array(12).fill(0) },
    };
  }

  // Khi viewing branch (12 tháng / chi tiết tháng) — cần lookup machine.standardCapacity để tính tổng công suất
  // = sum(standardCapacity × hoursRun) per (branch × type × month). Fetch 1 lần ở dưới (machines), trước khi loop runs.

  // Detail runs khi viewing branch+month
  const detailRuns: RunRow[] = [];
  // Pre-fetch machines của branch hiện tại 1 lần — dùng cho cả capacity lookup (server agg) và
  // machines list (UI). Khi không có branchId → bỏ qua (year view không cần).
  const machineCapacityById = new Map<string, { capacity: number; unit: string; subArea: 'indoor' | 'outdoor' | 'kid' | null; raw: Record<string, unknown> }>();
  if (branchId) {
    const mSnap0 = await db.collection(COLLECTIONS.MACHINES).where('branchId', '==', branchId).get();
    for (const d of mSnap0.docs) {
      const x = d.data();
      machineCapacityById.set(d.id, {
        capacity: Number(x.standardCapacity ?? 0),
        unit: x.capacityUnit ?? '',
        subArea: isValidCttSubArea(x.subArea) ? x.subArea : null,
        raw: x,
      });
    }
  }

  for (const d of runSnap.docs) {
    const x = d.data();
    const b = x.branchId;
    const m = Number(x.month);
    const hrs = Number(x.hoursRun ?? 0);
    const t = x.machineType as 'loc' | 'nhiet';
    if (!agg[b] || (t !== 'loc' && t !== 'nhiet') || !(m >= 1 && m <= 12)) continue;
    const machineSubArea = isValidCttSubArea(x.machineSubArea) ? x.machineSubArea : null;
    // KT_XLN_CTT chỉ thấy run của máy thuộc bể mình
    if (!canReadMachine(callerProfile, b, machineSubArea)) continue;
    agg[b][t].total += hrs;
    agg[b][t].byMonth[m - 1] += hrs;
    // Capacity sum chỉ tính khi đang xem branch cụ thể (đã có machineCapacityById)
    // Ưu tiên denorm run.capacity (snapshot tại thời điểm nhập); fallback live từ machines.
    const machineMeta = branchId === b ? machineCapacityById.get(x.machineId) : undefined;
    const runCap = Number.isFinite(Number(x.capacity)) && Number(x.capacity) > 0
      ? Number(x.capacity)
      : (machineMeta?.capacity ?? 0);
    if (runCap > 0) {
      const energy = runCap * hrs;
      agg[b][t].totalCapacity += energy;
      agg[b][t].byMonthCapacity[m - 1] += energy;
    }
    if (branchId && b === branchId && month && m === month) {
      detailRuns.push({
        id: d.id, branchId: b, date: x.date, day: x.day,
        machineId: x.machineId, machineName: x.machineName ?? '', machineType: t,
        hoursRun: hrs, notes: x.notes ?? null, updatedByName: x.updatedByName ?? '',
        capacity: runCap,
        capacityUnit: (typeof x.capacityUnit === 'string' && x.capacityUnit) ? x.capacityUnit : (machineMeta?.unit ?? ''),
      });
    }
  }
  detailRuns.sort((a, b) => a.date.localeCompare(b.date) || a.machineName.localeCompare(b.machineName, 'vi'));

  // Build machines list cho UI từ cache trên (đỡ 1 lần đọc Firestore)
  let machines: MachineSetup[] = [];
  if (branchId) {
    machines = Array.from(machineCapacityById.entries())
      .map(([id, meta]) => {
        const x = meta.raw;
        return {
          id, branchId,
          name: String(x.name ?? ''),
          type: x.type as MachineType,
          standardCapacity: meta.capacity,
          capacityUnit: meta.unit,
          sortOrder: Number(x.sortOrder ?? 0),
          active: x.active !== false,
          subArea: meta.subArea,
        };
      })
      // Filter cho KT_XLN_CTT — chỉ thấy máy ở bể mình
      .filter((m) => canReadMachine(callerProfile, branchId, m.subArea))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        return a.sortOrder - b.sortOrder;
      });
  }

  const aggList = visibleBranchIds.map((b) => agg[b]).filter(Boolean);
  const canWriteThisBranch = branchId ? canWriteMachineRun(callerProfile, branchId) : false;
  const canSetup = canSetupMachines(callerProfile);

  return (
    <MayClient
      year={year}
      branchId={branchId}
      month={month}
      branchName={branchId ? (BRANCH_LABELS[branchId] ?? branchId) : null}
      agg={aggList}
      machines={machines}
      detailRuns={detailRuns}
      canWriteThisBranch={canWriteThisBranch}
      canSetup={canSetup}
    />
  );
}
