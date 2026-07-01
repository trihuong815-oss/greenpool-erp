// PR-USER-HEALTH-VALIDATION (2026-07-01) — Single source of truth cho mọi role code
// canonical (whitelist). Áp dụng cho cả CREATE/UPDATE user gate + health-audit.
//
// Mục đích: chặn vĩnh viễn bug "QLCS_24 instead of QLCS_24NCT" và các typo
// tương tự. Trước đây create-user chỉ check `roles` collection exists → bất kỳ
// role doc nào tester tạo bằng tay (sai code) đều pass. Giờ phải khớp WHITELIST.
//
// Pure module — server-safe, client-safe. Không import server-only.

/**
 * 5 cơ sở canonical theo lib/branches.ts.
 * MUST match exactly. Suffix `24NCT` (không phải `24`) cho cơ sở số 24.
 */
export const CANONICAL_BRANCH_SUFFIXES = ['HM', 'TK', 'CTT', '24NCT', 'TT'] as const;
export type CanonicalBranchSuffix = typeof CANONICAL_BRANCH_SUFFIXES[number];

/**
 * Mapping branch suffix → branchId trong Firestore.
 * Lưu ý: 24NCT (role suffix) ↔ '24' (branch id) — historical naming.
 */
export const BRANCH_SUFFIX_TO_ID: Record<CanonicalBranchSuffix, string> = {
  HM: 'HM',
  TK: 'TK',
  CTT: 'CTT',
  '24NCT': '24',
  TT: 'TT',
};

/**
 * Reverse map: branchId → expected role suffix.
 * Dùng để gợi ý role code chính xác khi user chọn branch.
 */
export const BRANCH_ID_TO_SUFFIX: Record<string, CanonicalBranchSuffix> = {
  HM: 'HM',
  TK: 'TK',
  CTT: 'CTT',
  '24': '24NCT',
  TT: 'TT',
};

/**
 * Canonical role codes — WHITELIST đầy đủ.
 * Sync từ lib/permissions.ts MENU_PERMISSIONS keys.
 * KHÔNG có 'QLCS_24' (typo từng gặp). KHÔNG có legacy role codes.
 */
export const CANONICAL_ROLE_CODES = new Set<string>([
  // Top
  'ADMIN', 'CEO', 'CHU_TICH',
  // GĐ Khối
  'GD_KD', 'GD_VP',
  // Trưởng phòng
  'TP_KE', 'TP_GS', 'TP_DT', 'TP_VP', 'TP_KT', 'TP_MKT', 'TIBAN_TT',
  // Phó phòng KT
  'PP_HT', 'PP_XLN',
  // QLCS (5 cơ sở, suffix CHUẨN)
  'QLCS_HM', 'QLCS_TK', 'QLCS_CTT', 'QLCS_24NCT', 'QLCS_TT',
  // Kỹ thuật viên cơ sở
  'KT_HT_HM', 'KT_HT_TK', 'KT_HT_CTT', 'KT_HT_24NCT', 'KT_HT_TT',
  'KT_XLN_HM', 'KT_XLN_TK', 'KT_XLN_CTT', 'KT_XLN_24NCT', 'KT_XLN_TT',
  // Nhân viên
  'NV_KE', 'NV_SALE', 'NV_SALE_PT', 'NV_CH', 'NV_TV', 'NV_LT',
  'NV_DT', 'NV_VP', 'NV_MKT',
  // Special
  'KT_VP',
]);

/**
 * Roles yêu cầu branchId BẮT BUỘC + suffix khớp.
 * Pattern: code khớp `^(QLCS_|KT_HT_|KT_XLN_|NV_LT_|NV_TV_)<SUFFIX>$`
 */
const BRANCH_BOUND_PREFIXES = ['QLCS_', 'KT_HT_', 'KT_XLN_'];

/**
 * Suffix expected từ role code.
 * Returns null nếu role không phải branch-bound.
 */
export function getRoleBranchSuffix(roleCode: string): CanonicalBranchSuffix | null {
  for (const prefix of BRANCH_BOUND_PREFIXES) {
    if (roleCode.startsWith(prefix)) {
      const suffix = roleCode.slice(prefix.length);
      if ((CANONICAL_BRANCH_SUFFIXES as readonly string[]).includes(suffix)) {
        return suffix as CanonicalBranchSuffix;
      }
      return null;  // role có prefix nhưng suffix sai → bad code
    }
  }
  return null;  // không phải branch-bound role
}

/**
 * Role code này có bắt buộc branchId không?
 */
export function isRoleBranchBound(roleCode: string): boolean {
  return BRANCH_BOUND_PREFIXES.some((p) => roleCode.startsWith(p));
}

// ─── Validation API ─────────────────────────────────────────────────

export type ValidationIssue =
  | 'role-not-canonical'       // role_code không nằm trong whitelist
  | 'missing-role'             // role_code rỗng/null
  | 'qlcs-branch-mismatch'     // QLCS_HM nhưng branchId != 'HM'
  | 'kt-branch-mismatch'       // KT_HT_HM nhưng branchId != 'HM'
  | 'branch-required-missing'  // role yêu cầu branchId nhưng null
  | 'invalid-status';          // status không phải 'active'|'inactive'

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  /** Gợi ý sửa — text human-readable cho UI/log. */
  hints: string[];
}

export interface ValidateUserConfigInput {
  roleCode: string | null | undefined;
  branchId: string | null | undefined;
  status?: string | null | undefined;
}

/**
 * Validate config 1 user. Áp dụng cho cả create-user (incoming body) +
 * health-audit (scan existing docs) + repair endpoint.
 *
 * Pure function, server-safe + client-safe.
 */
export function validateUserConfig(input: ValidateUserConfigInput): ValidationResult {
  const issues: ValidationIssue[] = [];
  const hints: string[] = [];

  const roleCode = (input.roleCode ?? '').trim();
  const branchId = input.branchId ?? null;
  const status = input.status ?? null;

  // 1. Role code present
  if (!roleCode) {
    issues.push('missing-role');
    hints.push('User chưa có role_code → set roleId trong users/{uid} doc.');
  } else if (!CANONICAL_ROLE_CODES.has(roleCode)) {
    issues.push('role-not-canonical');
    // Try suggest fix for common typo
    if (roleCode === 'QLCS_24') {
      hints.push(`role_code='QLCS_24' SAI — phải dùng 'QLCS_24NCT' (cơ sở 24 Nguyễn Cơ Thạch).`);
    } else if (roleCode === 'KT_HT_24') {
      hints.push(`role_code='KT_HT_24' SAI — phải dùng 'KT_HT_24NCT'.`);
    } else if (roleCode === 'KT_XLN_24') {
      hints.push(`role_code='KT_XLN_24' SAI — phải dùng 'KT_XLN_24NCT'.`);
    } else {
      hints.push(`role_code='${roleCode}' không nằm trong whitelist canonical. Xem lib/auth/canonical-roles.ts.`);
    }
  } else {
    // 2. Branch-bound role MUST have matching branchId
    if (isRoleBranchBound(roleCode)) {
      const expectedSuffix = getRoleBranchSuffix(roleCode);
      if (!branchId) {
        issues.push('branch-required-missing');
        hints.push(`Role '${roleCode}' yêu cầu branchId — hiện rỗng/null.`);
      } else if (expectedSuffix !== null) {
        const expectedBranchId = BRANCH_SUFFIX_TO_ID[expectedSuffix];
        if (branchId !== expectedBranchId) {
          if (roleCode.startsWith('QLCS_')) issues.push('qlcs-branch-mismatch');
          else if (roleCode.startsWith('KT_')) issues.push('kt-branch-mismatch');
          hints.push(
            `Role '${roleCode}' yêu cầu branchId='${expectedBranchId}', hiện là '${branchId}'.`,
          );
        }
      }
    }
  }

  // 3. Status valid
  if (status !== null && status !== undefined && status !== 'active' && status !== 'inactive') {
    issues.push('invalid-status');
    hints.push(`status='${status}' không hợp lệ — phải là 'active' hoặc 'inactive'.`);
  }

  return {
    ok: issues.length === 0,
    issues,
    hints,
  };
}

/**
 * Strict version — throw error nếu invalid. Dùng cho gate trong CREATE/UPDATE
 * API (caller wrap try/catch).
 */
export class UserConfigInvalidError extends Error {
  constructor(public result: ValidationResult) {
    super(`Cấu hình user không hợp lệ: ${result.hints.join(' ')}`);
    this.name = 'UserConfigInvalidError';
  }
}

export function assertUserConfigValid(input: ValidateUserConfigInput): void {
  const result = validateUserConfig(input);
  if (!result.ok) throw new UserConfigInvalidError(result);
}
