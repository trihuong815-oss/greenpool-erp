// V7 Promo (2026-06-18) — Service helpers cho chương trình khuyến mãi.

import 'server-only';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import type { BranchId } from '@/lib/types/branches';
import type {
  SalesProgram, ApprovalStep, ProgramStatus, PromoType, PromoSnapshot,
} from '@/lib/types/sales-program';

function tsToIso(v: unknown): string {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return new Date(v).toISOString();
  return new Date().toISOString();
}
function tsToIsoOrNull(v: unknown): string | null {
  if (v == null) return null;
  return tsToIso(v);
}

export function serializeProgram(id: string, raw: Record<string, any>): SalesProgram {
  const steps: ApprovalStep[] = Array.isArray(raw.approvalSteps)
    ? raw.approvalSteps.map((s: any) => ({
        approverId: String(s?.approverId ?? ''),
        approverName: String(s?.approverName ?? ''),
        action: s?.action === 'rejected' ? 'rejected' : 'approved',
        timestamp: tsToIso(s?.timestamp),
        reason: s?.reason ?? null,
      }))
    : [];
  return {
    id,
    name: String(raw.name ?? ''),
    description: String(raw.description ?? ''),
    month: String(raw.month ?? ''),
    branchId: raw.branchId as BranchId,
    branchName: String(raw.branchName ?? ''),
    packageIds: Array.isArray(raw.packageIds) ? raw.packageIds.map(String) : [],
    packageNames: Array.isArray(raw.packageNames) ? raw.packageNames.map(String) : [],
    promoType: raw.promoType as PromoType,
    promoValue: Number(raw.promoValue ?? 0),
    promoCode: raw.promoCode ?? null,
    status: (raw.status as ProgramStatus) ?? 'draft',
    createdBy: String(raw.createdBy ?? ''),
    createdByName: String(raw.createdByName ?? ''),
    createdByRole: String(raw.createdByRole ?? ''),
    createdAt: tsToIso(raw.createdAt),
    submittedAt: tsToIsoOrNull(raw.submittedAt),
    approverChain: Array.isArray(raw.approverChain) ? raw.approverChain.map(String) : [],
    approverChainNames: Array.isArray(raw.approverChainNames) ? raw.approverChainNames.map(String) : [],
    currentApprover: raw.currentApprover ?? null,
    approvalSteps: steps,
    rejectedReason: raw.rejectedReason ?? null,
    configuredBy: raw.configuredBy ?? null,
    configuredByName: raw.configuredByName ?? null,
    configuredAt: tsToIsoOrNull(raw.configuredAt),
    pausedBy: raw.pausedBy ?? null,
    pausedAt: tsToIsoOrNull(raw.pausedAt),
    pauseReason: raw.pauseReason ?? null,
    usageCount: Number(raw.usageCount ?? 0),
    totalDiscount: Number(raw.totalDiscount ?? 0),
    totalBonusSessions: Number(raw.totalBonusSessions ?? 0),
    totalBonusDays: Number(raw.totalBonusDays ?? 0),
    updatedAt: tsToIso(raw.updatedAt),
  };
}

/** Build approver chain [GD_KD_uid, GD_VP_uid] — query users active của 2 role chính.
 *  Nếu thiếu role (vd chưa có GD_VP) → chain rút ngắn còn 1.
 *  Nếu không có ai cả → throw.
 *
 *  Field names trong users collection (verified 2026-06-18 qua inspect-users-schema):
 *    - `roleId` (camelCase, KHÔNG phải role_code snake_case)
 *    - `status` ('active' / 'inactive', KHÔNG phải is_active boolean)
 *    - `displayName` (camelCase)
 *    - doc.id = uid (không lưu field uid riêng) */
export async function buildApproverChain(): Promise<{ uids: string[]; names: string[] }> {
  const db = getFirebaseAdminDb();
  const snap = await db.collection(COLLECTIONS.USERS)
    .where('roleId', 'in', ['GD_KD', 'GD_VP'])
    .get();
  const byRole: Record<string, Array<{ uid: string; name: string }>> = { GD_KD: [], GD_VP: [] };
  snap.forEach((d) => {
    const data = d.data();
    if (data.status && data.status !== 'active') return;
    // V6.4 audit fix: exclude IT/ADMIN có flag excludeFromBusinessNoti
    if (data.excludeFromBusinessNoti === true) return;
    const role = String(data.roleId);
    if (role !== 'GD_KD' && role !== 'GD_VP') return;
    byRole[role].push({
      uid: d.id, // doc.id chính là uid
      name: String(data.displayName ?? data.email ?? ''),
    });
  });
  // V7 audit fix (2026-06-18): YÊU CẦU đủ CẢ GD_KD VÀ GD_VP — không silent rút ngắn.
  // Spec anh chốt: chương trình KM phải qua 2 cấp duyệt. Thiếu cấp nào → block submit.
  const missing: string[] = [];
  if (!byRole.GD_KD[0]) missing.push('GD_KD');
  if (!byRole.GD_VP[0]) missing.push('GD_VP');
  if (missing.length > 0) {
    throw new Error(
      `Hệ thống chưa có người đảm nhiệm role ${missing.join(' và ')} để duyệt — báo Admin cập nhật user.`
    );
  }
  const chain: Array<{ uid: string; name: string }> = [byRole.GD_KD[0], byRole.GD_VP[0]];
  return { uids: chain.map((c) => c.uid), names: chain.map((c) => c.name) };
}

/** Resolve danh sách package thật cho program — fallback rỗng nếu không tồn tại. */
export async function resolvePackageNames(packageIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (packageIds.length === 0) return result;
  const db = getFirebaseAdminDb();
  // Firestore IN max 10 → chunk
  for (let i = 0; i < packageIds.length; i += 10) {
    const chunk = packageIds.slice(i, i + 10);
    const refs = chunk.map((id) => db.collection(COLLECTIONS.PACKAGES).doc(id));
    const docs = await db.getAll(...refs);
    docs.forEach((d, idx) => {
      if (d.exists) {
        const name = String(d.data()?.name ?? '');
        result.set(chunk[idx], name);
      }
    });
  }
  return result;
}

/** Resolve nhiều program theo id list — dùng khi POST tx có promoIds. */
export async function getProgramsByIds(programIds: string[]): Promise<SalesProgram[]> {
  if (programIds.length === 0) return [];
  const db = getFirebaseAdminDb();
  const refs = programIds.map((id) => db.collection(COLLECTIONS.SALES_PROGRAMS).doc(id));
  const docs = await db.getAll(...refs);
  const out: SalesProgram[] = [];
  docs.forEach((d) => {
    if (d.exists) out.push(serializeProgram(d.id, d.data() ?? {}));
  });
  return out;
}

/** Snapshot 1 program thành PromoSnapshot ghi vào tx doc (immutable). */
export function toSnapshot(p: SalesProgram): PromoSnapshot {
  return {
    id: p.id,
    code: p.promoCode ?? '',
    name: p.name,
    type: p.promoType,
    value: p.promoValue,
  };
}

/** Hiện tại theo VN timezone YYYY-MM */
export function currentMonthVN(): string {
  const ms = Date.now() + 7 * 3600 * 1000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ─── M2.1 PR-5 (2026-06-20) — Deadline helpers ─────────────────────────────

/** Compute deadline ISO cho program.month — ngày 25/MM 23:59:59 VN (UTC+7).
 *  Convention: program tháng N có hạn nộp 25/N (cùng tháng).
 *  Trả ISO UTC string để compare với Date.now() trực tiếp. */
export function computeDeadlineIso(month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) return '';
  const [yStr, mStr] = month.split('-');
  // 25/MM/YYYY 23:59:59 VN = 16:59:59 UTC cùng ngày
  // Dùng ISO format trực tiếp, +07:00 offset
  return `${yStr}-${mStr}-25T23:59:59+07:00`;
}

/** Check program tháng X đã quá hạn nộp (25/X 23:59:59 VN) tính tới `now`.
 *  Default now = Date.now(). */
export function isPastDeadline(month: string, now: Date = new Date()): boolean {
  const isoDeadline = computeDeadlineIso(month);
  if (!isoDeadline) return false;
  return now.getTime() > new Date(isoDeadline).getTime();
}

/** Ngày trong tháng VN (1-31) từ Date hiện tại — dùng cho cron switch D-2/D/D+1. */
export function dayOfMonthVN(now: Date = new Date()): number {
  const ms = now.getTime() + 7 * 3600 * 1000;
  return new Date(ms).getUTCDate();
}
