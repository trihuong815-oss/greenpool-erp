// PR-7A (2026-06-22) — Permission helper cho /audit-history.
// Read-only allow list. PR-7A đầu tiên scope hẹp: top role + TP_KE + TP_GS.
// NV_KE / QLCS / Sale defer PR-7B (cần branch-scope filter chặt trước khi mở).

const AUDIT_HISTORY_READERS: ReadonlySet<string> = new Set([
  'ADMIN',
  'CEO',
  'CHU_TICH',
  'GD_KD',
  'GD_VP',
  'TP_KE',
  'TP_GS',
]);

/** Trả true nếu role được phép xem Audit History (PR-7A scope).
 *  Server-side check ở API route + page gate. Sidebar dùng showOnlyForRoles. */
export function canReadAuditHistory(roleCode: string | null | undefined): boolean {
  if (!roleCode) return false;
  return AUDIT_HISTORY_READERS.has(roleCode);
}

/** Export list cho sidebar showOnlyForRoles tránh duplicate. */
export const AUDIT_HISTORY_ROLES: ReadonlyArray<string> = Array.from(AUDIT_HISTORY_READERS);
