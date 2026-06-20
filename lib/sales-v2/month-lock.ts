// Milestone 2.1 PR-1 (2026-06-20) — Foundation helper khoá kỳ tháng × cơ sở.
// CHƯA enforce trong API mutation nào ở PR-1. PR-3 sẽ wire middleware
// assertMonthNotLocked() vào tx POST/PATCH/DELETE.
//
// DocId pattern: `${branchId}_${month}` (vd 'HM_2026-06') — deterministic,
// idempotent get-or-create.
//
// Quyền (PR-3 enforce):
//   - Lock: TP_KE / CEO / CHU_TICH / ADMIN
//   - Unlock: same + bắt buộc reason non-empty (audit + noti CEO/CHU_TICH)
//   - Read state: mọi role trong sales-v2 (để UI hiện badge 🔒)
//
// Fail-safe: nếu Firestore lỗi khi check isMonthLocked() → trả false (default
// unlocked). Tránh false-positive block mutation. Server logs warning để debug.

import 'server-only';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import type { BranchId } from '@/lib/types/branches';
import { isBranchId, BRANCH_BY_ID } from '@/lib/branches';
import type {
  MonthLockState,
  SalesMonthLockDoc,
  SalesMonthUnlockEntry,
} from '@/lib/types/sales-audit';

/** DocId deterministic — dùng cho get/set/update. */
export function monthLockDocId(branchId: BranchId, month: string): string {
  return `${branchId}_${month}`;
}

/** Validate month format 'YYYY-MM'. */
export function isValidMonth(month: string): boolean {
  return /^\d{4}-\d{2}$/.test(month);
}

/** Đọc state lock của 1 (branchId, month). Trả null nếu doc chưa tồn tại
 *  (chưa từng lock) — caller hiểu là unlocked. */
export async function getMonthLock(
  branchId: BranchId,
  month: string,
): Promise<SalesMonthLockDoc | null> {
  if (!isBranchId(branchId) || !isValidMonth(month)) return null;
  try {
    const db = getFirebaseAdminDb();
    const snap = await db.collection(COLLECTIONS.SALES_MONTH_LOCKS)
      .doc(monthLockDocId(branchId, month))
      .get();
    if (!snap.exists) return null;
    return snap.data() as SalesMonthLockDoc;
  } catch (err) {
    console.warn('[month-lock] getMonthLock fail (fallback null):', {
      branchId, month,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Compact state cho UI — không cần exposure unlockHistory.
 *  Fail-safe: lỗi → unlocked. */
export async function getMonthLockState(
  branchId: BranchId,
  month: string,
): Promise<MonthLockState> {
  const doc = await getMonthLock(branchId, month);
  if (!doc) return { locked: false, lockedByName: null, lockedAt: null };
  return {
    locked: doc.locked,
    lockedByName: doc.locked ? doc.lockedByName : null,
    lockedAt: doc.locked ? doc.lockedAt : null,
  };
}

/** Check nhanh: tháng + cơ sở có đang locked không.
 *  Fail-safe: lỗi → false (KHÔNG block mutation).
 *  PR-3 sẽ dùng helper này trong middleware assertMonthNotLocked(). */
export async function isMonthLocked(
  branchId: BranchId,
  month: string,
): Promise<boolean> {
  const doc = await getMonthLock(branchId, month);
  return doc?.locked === true;
}

// ─── Mutation helpers — PR-3 sẽ wire vào API. PR-1 chỉ export sẵn. ────────

export interface LockMonthInput {
  branchId: BranchId;
  month: string;
  actorUid: string;
  actorName: string;
  actorRole: string;
}

export interface UnlockMonthInput extends LockMonthInput {
  /** BẮT BUỘC non-empty. Caller validate trước khi gọi. */
  reason: string;
}

/** Khoá 1 (branchId, month). Idempotent: nếu đã locked thì update lockedBy + Time
 *  (acceptable — gần giống re-lock). Caller chịu trách nhiệm permission check trước.
 *
 *  Trả về doc state sau khi lock. Throw nếu Firestore lỗi (vì lock là action quan trọng,
 *  KHÔNG fail-soft như audit log). */
export async function lockMonth(input: LockMonthInput): Promise<SalesMonthLockDoc> {
  if (!isBranchId(input.branchId)) throw new Error(`branchId không hợp lệ: ${input.branchId}`);
  if (!isValidMonth(input.month)) throw new Error(`month không hợp lệ (YYYY-MM): ${input.month}`);

  const db = getFirebaseAdminDb();
  const ref = db.collection(COLLECTIONS.SALES_MONTH_LOCKS)
    .doc(monthLockDocId(input.branchId, input.month));
  const now = Timestamp.now();

  // Firestore transaction: atomic read + write tránh race condition 2 admin cùng lock.
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? (snap.data() as SalesMonthLockDoc) : null;
    const next: SalesMonthLockDoc = {
      branchId: input.branchId,
      month: input.month,
      locked: true,
      lockedAt: now,
      lockedBy: input.actorUid,
      lockedByName: input.actorName,
      lockedByRole: input.actorRole,
      unlockHistory: existing?.unlockHistory ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    // Mark last unlock entry là relocked nếu có
    if (existing?.unlockHistory?.length) {
      const last = next.unlockHistory[next.unlockHistory.length - 1];
      if (last && last.relocked === false) {
        last.relocked = true;
        last.relockedAt = now;
      }
    }
    tx.set(ref, next);
    return next;
  });
  return result;
}

/** Mở khoá — đòi reason. Caller chịu trách nhiệm validate reason non-empty +
 *  permission check trước. Idempotent: nếu đã unlocked thì append history mới
 *  (acceptable — caller có thể muốn ghi nhận attempt). */
export async function unlockMonth(input: UnlockMonthInput): Promise<SalesMonthLockDoc> {
  if (!isBranchId(input.branchId)) throw new Error(`branchId không hợp lệ: ${input.branchId}`);
  if (!isValidMonth(input.month)) throw new Error(`month không hợp lệ: ${input.month}`);
  if (!input.reason?.trim()) throw new Error('Mở khoá bắt buộc nhập lý do');

  const db = getFirebaseAdminDb();
  const ref = db.collection(COLLECTIONS.SALES_MONTH_LOCKS)
    .doc(monthLockDocId(input.branchId, input.month));
  const now = Timestamp.now();

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? (snap.data() as SalesMonthLockDoc) : null;
    const unlockEntry: SalesMonthUnlockEntry = {
      unlockedAt: now,
      unlockedBy: input.actorUid,
      unlockedByName: input.actorName,
      unlockedByRole: input.actorRole,
      reason: input.reason.trim(),
      relocked: false,
      relockedAt: null,
    };
    const next: SalesMonthLockDoc = {
      branchId: input.branchId,
      month: input.month,
      locked: false,
      // Giữ snapshot last-lock metadata để audit ai khoá trước đó
      lockedAt: existing?.lockedAt ?? null,
      lockedBy: existing?.lockedBy ?? null,
      lockedByName: existing?.lockedByName ?? null,
      lockedByRole: existing?.lockedByRole ?? null,
      unlockHistory: [...(existing?.unlockHistory ?? []), unlockEntry],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    tx.set(ref, next);
    return next;
  });
  return result;
}

// ─── Middleware helper — PR-3 sẽ wire vào tx mutation API ─────────────────

/** M2.1 PR-3B (2026-06-20): message format theo spec user — dùng branchName từ
 *  BRANCH_BY_ID, hướng dẫn user liên hệ TP_Kế toán hoặc Ban điều hành. */
export class MonthLockedError extends Error {
  constructor(public branchId: BranchId, public month: string, public lockedByName: string | null) {
    const branchName = BRANCH_BY_ID[branchId]?.name ?? branchId;
    const suffix = lockedByName ? ` (Khoá bởi ${lockedByName})` : '';
    super(
      `Kỳ doanh số tháng ${month} của cơ sở ${branchName} đã được khoá. ` +
      `Bạn không thể chỉnh sửa dữ liệu tháng này. ` +
      `Vui lòng liên hệ TP_Kế toán hoặc Ban điều hành nếu cần mở khoá.${suffix}`
    );
    this.name = 'MonthLockedError';
  }
}

/** Throw MonthLockedError nếu (branchId, month) đang locked. Caller dùng try/catch
 *  trong API mutation → trả 403 response.
 *
 *  PR-3B wired vào 8 mutation API. Pattern dùng (caller side):
 *    try {
 *      await assertMonthNotLockedIfEnabled(batch.branchId, batch.month, uid, role);
 *    } catch (err) {
 *      if (err instanceof MonthLockedError) {
 *        return NextResponse.json({ error: err.message }, { status: 403 });
 *      }
 *      throw err;
 *    }
 */
export async function assertMonthNotLocked(branchId: BranchId, month: string): Promise<void> {
  const state = await getMonthLockState(branchId, month);
  if (state.locked) {
    throw new MonthLockedError(branchId, month, state.lockedByName);
  }
}

/** M2.1 PR-3B (2026-06-20) — Wrapper kiểm flag + assert. Caller-friendly.
 *
 *  Nếu feature flag `SALES_V2_MONTH_LOCK` OFF cho user → no-op (không check DB,
 *  không tốn read). Nếu ON → check lock state + throw MonthLockedError nếu locked.
 *
 *  Fail-safe: flag check fail → coi như OFF (return không throw). Tránh false-positive
 *  block mutation khi feature-flag service lỗi.
 */
export async function assertMonthNotLockedIfEnabled(
  branchId: BranchId,
  month: string,
  uid: string,
  roleCode: string,
): Promise<void> {
  let flagEnabled = false;
  try {
    const { isFlagEnabled } = await import('@/lib/feature-flags/server');
    flagEnabled = await isFlagEnabled('SALES_V2_MONTH_LOCK', uid, roleCode);
  } catch (err) {
    console.warn('[month-lock] flag check fail (fallback OFF):', err);
    return;
  }
  if (!flagEnabled) return;
  await assertMonthNotLocked(branchId, month);
}
