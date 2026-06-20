// Phase C.2 (2026-06-07): Feature flag registry.
//
// Mục tiêu:
// - Dark launch: deploy code mới nhưng tắt UI cho production user.
// - Canary: bật cho 1 user/role nhỏ rồi mở rộng.
// - Kill switch: tắt nhanh feature lỗi mà không rollback toàn bộ deploy.
//
// Pattern:
// - Flag tĩnh khai báo ở đây (typed). Default value để fallback khi
//   Firestore chưa có doc → safe.
// - Runtime value đọc từ Firestore `featureFlags/<key>` doc với schema:
//     { enabled: boolean, allowList?: string[] (uids), allowRoles?: string[],
//       rolloutPercent?: number (0-100), updatedAt, updatedBy }
// - Helper isFlagEnabled(flag, uid, roleCode) eval theo thứ tự:
//     1. enabled === false → false (kill switch)
//     2. allowList.includes(uid) → true (canary uid)
//     3. allowRoles.includes(roleCode) → true (canary role)
//     4. rolloutPercent: hash(uid) % 100 < percent → true (percentage rollout)
//     5. enabled === true → true (full rollout)
//     6. else → false
//
// Server: load qua getFeatureFlag(key) (cached 60s).
// Client: pass từ server qua props (RSC pattern).

export interface FeatureFlagDef {
  /** Slug key — KHÔNG đổi sau khi đã ghi vào Firestore. */
  key: string;
  /** Mô tả ngắn (cho admin UI). */
  description: string;
  /** Default khi Firestore chưa có doc — phải SAFE (=== "feature OFF"). */
  defaultEnabled: boolean;
  /** Phase tag — để admin biết flag thuộc rollout nào. */
  tag?: string;
}

/** Registry tĩnh — KHÔNG dynamic, thêm flag mới = thêm entry. */
export const FEATURE_FLAGS: Record<string, FeatureFlagDef> = {
  CMD_K_PALETTE: {
    key: 'CMD_K_PALETTE',
    description: 'Cmd+K Spotlight palette (UI-3.1)',
    defaultEnabled: true,
    tag: 'ui-3',
  },
  KEYBOARD_SHORTCUTS: {
    key: 'KEYBOARD_SHORTCUTS',
    description: 'Global g+letter shortcuts (UI-3.2)',
    defaultEnabled: true,
    tag: 'ui-3',
  },
  BOTTOM_NAV: {
    key: 'BOTTOM_NAV',
    description: 'Mobile BottomNavBar (UI-2.1)',
    defaultEnabled: true,
    tag: 'ui-2',
  },

  // ─── M2.1 PR-1 (2026-06-20) — Sales V2 audit + lock + program deadline ───
  // KHÔNG kill switch nào ở PR-1 vì chưa wire. Đăng ký sẵn để PR-2/3/5 dùng.
  SALES_V2_AUDIT_LOG: {
    key: 'SALES_V2_AUDIT_LOG',
    description: 'Ghi audit log mọi mutation Doanh số V2 (PR-2 wire). Append-only, retention 10+ năm.',
    defaultEnabled: true,  // Safe — chỉ thêm log, không phá flow. Kill switch nếu Firestore lỗi storage.
    tag: 'sales-v2-m2.1',
  },
  SALES_V2_MONTH_LOCK: {
    key: 'SALES_V2_MONTH_LOCK',
    description: 'Khoá kỳ tháng × cơ sở. PR-3 wire middleware vào tx mutation.',
    defaultEnabled: false,  // OFF mặc định — rollout từng cơ sở qua allowList/allowRoles.
    tag: 'sales-v2-m2.1',
  },
  SALES_V2_QLCS_BADGE: {
    key: 'SALES_V2_QLCS_BADGE',
    description: 'Badge "QLCS hỗ trợ" + filter trong /doanh-so-v2/doi-chieu (PR-4).',
    defaultEnabled: true,  // UX only, no behavior change.
    tag: 'sales-v2-m2.1',
  },
  SALES_V2_PROGRAM_DEADLINE: {
    key: 'SALES_V2_PROGRAM_DEADLINE',
    description: 'UI deadline ngày 25 + soft warning + lateReason cho /chuong-trinh (PR-5).',
    defaultEnabled: true,
    tag: 'sales-v2-m2.1',
  },
  SALES_V2_PROGRAM_CRON: {
    key: 'SALES_V2_PROGRAM_CRON',
    description: 'Cron reminder/overdue/auto-expire cho sales programs (PR-5).',
    defaultEnabled: false,  // OFF mặc định — bật sau khi verify cron chạy đúng manual.
    tag: 'sales-v2-m2.1',
  },

  // Slot cho feature tương lai — thêm khi cần dark launch.
};

/** Runtime shape doc Firestore featureFlags/<key>. Optional fields = undefined. */
export interface FeatureFlagValue {
  enabled: boolean;
  allowList?: string[];
  allowRoles?: string[];
  /** 0-100. undefined = no rollout. */
  rolloutPercent?: number;
}

/**
 * Eval flag cho 1 user — deterministic.
 * @param value Firestore value hoặc undefined nếu doc chưa tồn tại.
 * @param def Static def (cho defaultEnabled fallback).
 * @param uid User uid (cho allowList + percentage).
 * @param roleCode Role code (cho allowRoles).
 */
export function evalFlag(
  value: FeatureFlagValue | undefined,
  def: FeatureFlagDef,
  uid: string,
  roleCode: string,
): boolean {
  // Doc chưa tồn tại → dùng default safe.
  if (!value) return def.defaultEnabled;

  // Kill switch ưu tiên cao nhất.
  if (value.enabled === false) return false;

  // Canary uid.
  if (value.allowList?.includes(uid)) return true;

  // Canary role.
  if (value.allowRoles?.includes(roleCode)) return true;

  // Percentage rollout — deterministic hash uid để user lặp lại nhận cùng quyết định.
  if (typeof value.rolloutPercent === 'number' && value.rolloutPercent > 0 && value.rolloutPercent < 100) {
    return hashPercent(uid) < value.rolloutPercent;
  }

  return value.enabled === true;
}

/** FNV-1a hash → percent 0-99. Deterministic per uid, no crypto needed. */
export function hashPercent(uid: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < uid.length; i++) {
    h ^= uid.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return Math.abs(h) % 100;
}
