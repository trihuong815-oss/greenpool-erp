// PR-CASH1B (2026-06-23) — Permission helpers cho dailyCashflowReports.

import type { Firestore } from 'firebase-admin/firestore';
import type { DailyCashflowReportDoc, ReportSentTo } from './cashflow-report-types';
import { COLLECTIONS } from '@/lib/firebase/collections';

const TOP_READ_ROLES: ReadonlySet<string> = new Set([
  'CEO', 'CHU_TICH', 'ADMIN', 'GD_KD', 'GD_VP', 'TP_KE', 'TP_GS', 'THU_QUY',
]);

function isQLCS(roleCode: string): boolean {
  return roleCode.startsWith('QLCS_');
}

/** Submit báo cáo: chỉ NV_KE branch mình. KHÔNG mở QLCS/TP_KE bấm thay (chốt #1). */
export function canSubmitDailyCashflowReport(
  roleCode: string | null | undefined,
  callerBranchId: string | null,
  targetBranchId: string,
): boolean {
  if (!roleCode) return false;
  if (roleCode === 'ADMIN') return true;
  if (!callerBranchId) return false;
  if (roleCode !== 'NV_KE') return false;
  return callerBranchId === targetBranchId;
}

/** Read báo cáo:
 *  - Top + THU_QUY + TP_GS: all
 *  - NV_KE + QLCS: branch mình */
export function canReadDailyCashflowReport(
  roleCode: string | null | undefined,
  callerBranchId: string | null,
  report: Pick<DailyCashflowReportDoc, 'branchId'>,
): boolean {
  if (!roleCode) return false;
  if (TOP_READ_ROLES.has(roleCode)) return true;
  if (roleCode === 'NV_KE' || isQLCS(roleCode)) {
    return callerBranchId === report.branchId;
  }
  return false;
}

/** Check báo cáo (TP_KE đánh dấu "Đã kiểm tra"). */
export function canCheckDailyCashflowReport(
  roleCode: string | null | undefined,
  report: Pick<DailyCashflowReportDoc, 'status'>,
): boolean {
  if (!roleCode) return false;
  if (roleCode !== 'TP_KE' && roleCode !== 'ADMIN') return false;
  // Chỉ check khi status = submitted hoặc sent
  return report.status === 'submitted' || report.status === 'sent';
}

/** Return báo cáo: TP_KE + ADMIN. */
export function canReturnDailyCashflowReport(
  roleCode: string | null | undefined,
  report: Pick<DailyCashflowReportDoc, 'status'>,
): boolean {
  if (!roleCode) return false;
  if (roleCode !== 'TP_KE' && roleCode !== 'ADMIN') return false;
  // Có thể return từ submitted/sent/checked
  return ['submitted', 'sent', 'checked'].includes(report.status);
}

/** Lock báo cáo: defer PR-CASH1E. PR-CASH1B chỉ ADMIN allowed stub. */
export function canLockDailyCashflowReport(
  roleCode: string | null | undefined,
): boolean {
  if (!roleCode) return false;
  return roleCode === 'ADMIN' || roleCode === 'TP_KE';
}

/** Branch filter cho list query. */
export function getReportBranchScope(
  roleCode: string | null | undefined,
  callerBranchId: string | null,
): { allBranches: boolean; branchId: string | null } {
  if (!roleCode) return { allBranches: false, branchId: null };
  if (TOP_READ_ROLES.has(roleCode)) return { allBranches: true, branchId: null };
  if (roleCode === 'NV_KE' || isQLCS(roleCode)) {
    return { allBranches: false, branchId: callerBranchId };
  }
  return { allBranches: false, branchId: null };
}

/** Resolve sentTo recipients qua users collection.
 *  THU_QUY = all active THU_QUY user
 *  Accounting = TP_KE (+ TP_KT nếu tồn tại role)
 *  Supervision = TP_GS
 *  Leadership = CEO + CHU_TICH + GD_VP + GD_KD (chốt #6 — KHÔNG include ADMIN)
 *
 *  Resolve snapshot lúc submit. KHÔNG re-resolve sau (sentTo stale = acceptable).
 *  PR-CASH2 có thể dynamic. */
export async function getReportRecipients(
  db: Firestore,
  _targetBranchId: string,    // unused PR đầu (THU_QUY all system per chốt #5)
): Promise<ReportSentTo> {
  const recipients: ReportSentTo = {
    treasurerUserIds: [],
    accountingManagerUserIds: [],
    supervisionUserIds: [],
    leadershipUserIds: [],
  };

  try {
    // users.roleId field per Phase 4 migration
    // Active = status='active' (default), inactive users skip
    const snap = await db.collection(COLLECTIONS.USERS)
      .where('roleId', 'in', [
        'THU_QUY',
        'TP_KE',
        'TP_GS',
        'CEO', 'CHU_TICH', 'GD_VP', 'GD_KD',
      ])
      .get();

    for (const doc of snap.docs) {
      const d = doc.data() ?? {};
      // Skip disabled accounts nếu có flag
      if (d.status === 'inactive' || d.disabled === true) continue;
      const role = String(d.roleId ?? '');
      const uid = doc.id;
      switch (role) {
        case 'THU_QUY':   recipients.treasurerUserIds.push(uid); break;
        case 'TP_KE':     recipients.accountingManagerUserIds.push(uid); break;
        case 'TP_GS':     recipients.supervisionUserIds.push(uid); break;
        case 'CEO':
        case 'CHU_TICH':
        case 'GD_VP':
        case 'GD_KD':     recipients.leadershipUserIds.push(uid); break;
      }
    }
  } catch (err) {
    // Fail-soft: nếu users collection query fail, trả empty arrays
    console.warn('[finance/getReportRecipients] users query failed:', (err as Error)?.message);
  }

  return recipients;
}
