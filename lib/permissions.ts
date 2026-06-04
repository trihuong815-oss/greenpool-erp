// ============================================
// Green Pool ERP — RBAC & Permissions
// Logic phân quyền giống prototype, áp dụng phía client
// (Supabase RLS đảm bảo phía server)
// ============================================

export type RoleCode = string;
export type FacilityId = 'HM' | 'TK' | 'CTT' | '24' | 'TT';

/** Roles có toàn quyền hệ thống — bypass mọi scope check. ADMIN là role IT/quản trị viên hệ thống. */
export const TOP_ADMIN_CODES: ReadonlySet<string> = new Set(['CEO', 'ADMIN']);
export function isTopAdmin(roleCode: string): boolean {
  return TOP_ADMIN_CODES.has(roleCode);
}

// Ma trận menu — vai trò nào thấy module nào
export const MENU_PERMISSIONS: Record<string, string[]> = {
  // 'doanh-so/packages' — admin + QLCS (gói của cơ sở mình).
  // 'quan-ly-sale' — CHỈ admin (CEO/GD_KD/GD_VP) — thêm/tắt/đổi tên NV_SALE per branch.
  // 'quan-ly-cong-viec' — admin + mọi manager (QLCS/TP/TT) để lên lịch + theo dõi công việc trong scope của mình.
  // 'cong-viec-ca-nhan' — Không gian làm việc cá nhân (Phase 9). Chỉ cấp quản lý+.
  ADMIN:     ['dashboard','tin-nhan','doanh-so','doanh-so/nhap','doanh-so/packages','checklist-v2','quy-trinh','giao-viec','quan-ly-cong-viec','quan-ly-sale','sodo','luong','bao-cao','daotao','mkt','users','ky-thuat','cong-viec-ca-nhan','bao-mat'],
  CEO:       ['dashboard','tin-nhan','doanh-so','doanh-so/nhap','doanh-so/packages','checklist-v2','quy-trinh','giao-viec','quan-ly-cong-viec','quan-ly-sale','sodo','luong','bao-cao','daotao','mkt','users','ky-thuat','cong-viec-ca-nhan','bao-mat'],
  GD_KD:     ['dashboard','tin-nhan','doanh-so','doanh-so/nhap','doanh-so/packages','checklist-v2','quy-trinh','giao-viec','quan-ly-cong-viec','quan-ly-sale','sodo','luong','bao-cao','daotao','mkt','users','ky-thuat','cong-viec-ca-nhan','bao-mat'],
  GD_VP:     ['dashboard','tin-nhan','checklist-v2','quy-trinh','giao-viec','quan-ly-cong-viec','quan-ly-sale','sodo','luong','bao-cao','ky-thuat','cong-viec-ca-nhan','bao-mat'],

  // QLCS_* — KHÔNG thấy `luong`, `doanh-so/packages` (quản trị gói catalog), `users` (theo spec 2026-05-27)
  QLCS_HM:   ['dashboard','tin-nhan','doanh-so','doanh-so/nhap','checklist-v2','quy-trinh','giao-viec','quan-ly-cong-viec','sodo','bao-cao','daotao','mkt','ky-thuat','cong-viec-ca-nhan','bao-mat'],
  QLCS_TK:   ['dashboard','tin-nhan','doanh-so','doanh-so/nhap','checklist-v2','quy-trinh','giao-viec','quan-ly-cong-viec','sodo','bao-cao','daotao','mkt','ky-thuat','cong-viec-ca-nhan','bao-mat'],
  QLCS_CTT:  ['dashboard','tin-nhan','doanh-so','doanh-so/nhap','checklist-v2','quy-trinh','giao-viec','quan-ly-cong-viec','sodo','bao-cao','daotao','mkt','ky-thuat','cong-viec-ca-nhan','bao-mat'],
  QLCS_24NCT:['dashboard','tin-nhan','doanh-so','doanh-so/nhap','checklist-v2','quy-trinh','giao-viec','quan-ly-cong-viec','sodo','bao-cao','daotao','mkt','ky-thuat','cong-viec-ca-nhan','bao-mat'],
  QLCS_TT:   ['dashboard','tin-nhan','doanh-so','doanh-so/nhap','checklist-v2','quy-trinh','giao-viec','quan-ly-cong-viec','sodo','bao-cao','daotao','mkt','ky-thuat','cong-viec-ca-nhan','bao-mat'],

  TP_KT:     ['dashboard','tin-nhan','checklist-v2','quy-trinh','giao-viec','quan-ly-cong-viec','bao-cao','ky-thuat','cong-viec-ca-nhan','bao-mat'],
  // Phó phòng KT (Hệ thống / Xử lý nước) — xem toàn module ky-thuat, không xem doanh số.
  // Phó phòng KT — chỉ dùng giao-viec / báo-cáo / đề-xuất trong /ky-thuat module.
  // Module /giao-viec chính (vận hành) KHÔNG hiện cho khối KT (anh chốt 2026-06-01).
  PP_HT:     ['dashboard','tin-nhan','checklist-v2','quy-trinh','quan-ly-cong-viec','bao-cao','ky-thuat','cong-viec-ca-nhan','bao-mat'],
  PP_XLN:    ['dashboard','tin-nhan','checklist-v2','quy-trinh','quan-ly-cong-viec','bao-cao','ky-thuat','cong-viec-ca-nhan','bao-mat'],
  // Kỹ thuật viên cơ sở (Hệ thống / Xử lý nước) — chỉ xem ky-thuat scope cơ sở của mình.
  // Convention: KT_HT_HM, KT_HT_TK,... và KT_XLN_HM,... khớp QLCS_*. Permission scope ở backend.
  KT_HT_HM:    ['dashboard','tin-nhan','ky-thuat','bao-mat'],
  KT_HT_TK:    ['dashboard','tin-nhan','ky-thuat','bao-mat'],
  KT_HT_CTT:   ['dashboard','tin-nhan','ky-thuat','bao-mat'],
  KT_HT_24NCT: ['dashboard','tin-nhan','ky-thuat','bao-mat'],
  KT_HT_TT:    ['dashboard','tin-nhan','ky-thuat','bao-mat'],
  KT_XLN_HM:    ['dashboard','tin-nhan','ky-thuat','bao-mat'],
  KT_XLN_TK:    ['dashboard','tin-nhan','ky-thuat','bao-mat'],
  KT_XLN_CTT:   ['dashboard','tin-nhan','ky-thuat','bao-mat'],
  KT_XLN_24NCT: ['dashboard','tin-nhan','ky-thuat','bao-mat'],
  KT_XLN_TT:    ['dashboard','tin-nhan','ky-thuat','bao-mat'],
  TP_DT:     ['dashboard','tin-nhan','quy-trinh','giao-viec','quan-ly-cong-viec','bao-cao','daotao','cong-viec-ca-nhan','bao-mat'],
  TP_MKT:    ['dashboard','tin-nhan','quy-trinh','giao-viec','quan-ly-cong-viec','bao-cao','mkt','cong-viec-ca-nhan','bao-mat'],
  TIBAN_TT:  ['dashboard','tin-nhan','quy-trinh','giao-viec','quan-ly-cong-viec','bao-cao','cong-viec-ca-nhan','bao-mat'],
  TP_GS:     ['dashboard','tin-nhan','quy-trinh','giao-viec','quan-ly-cong-viec','bao-cao','sodo','cong-viec-ca-nhan','bao-mat'],
  TP_KE:     ['dashboard','tin-nhan','quy-trinh','giao-viec','quan-ly-cong-viec','bao-cao','luong','cong-viec-ca-nhan','bao-mat'],
  TP_NS:     ['dashboard','tin-nhan','quy-trinh','giao-viec','quan-ly-cong-viec','bao-cao','luong','sodo','cong-viec-ca-nhan','bao-mat'],

  // Phase 12.8 (2026-06-04): /giao-viec chỉ dành cho TP/QLCS/GD/CEO/Chủ tịch (theo tài liệu anh chốt).
  // NV/GV/TT_DT bị ẩn menu này. Họ vẫn dùng tin-nhan + bao-mat + module nghiệp vụ riêng.
  TT_DT:     ['dashboard','tin-nhan','quy-trinh','quan-ly-cong-viec','bao-cao','bao-mat'],
  GV_CB:     ['dashboard','tin-nhan','quy-trinh','bao-mat'],
  GV_NC:     ['dashboard','tin-nhan','quy-trinh','bao-mat'],
  NV_SALE:   ['dashboard','tin-nhan','bao-mat'],
  NV_SALE_PT:['dashboard','tin-nhan','bao-mat'],
  NV_CH:     ['dashboard','tin-nhan','bao-mat'],
};

// Role → khối mapping (single source of truth — tasks-scope/sales-scope import từ đây)
export const ROLE_BLOCK: Record<string, 'KD' | 'VP' | 'all'> = {
  ADMIN: 'all', CEO: 'all', GD_KD: 'KD', GD_VP: 'VP',
  // KD — Vận hành cơ sở
  QLCS_HM: 'KD', QLCS_TK: 'KD', QLCS_CTT: 'KD', QLCS_24NCT: 'KD', QLCS_TT: 'KD',
  NV_SALE: 'KD', NV_SALE_PT: 'KD', NV_CH: 'KD', NV_TV: 'KD', NV_LT: 'KD',
  TT_LT: 'KD', TT_AS: 'KD',
  // KD — phòng KT
  TP_KT: 'KD', PP_HT: 'KD', PP_XLN: 'KD',
  KT_HT_HM: 'KD', KT_HT_TK: 'KD', KT_HT_CTT: 'KD', KT_HT_24NCT: 'KD', KT_HT_TT: 'KD',
  KT_XLN_HM: 'KD', KT_XLN_TK: 'KD', KT_XLN_CTT: 'KD', KT_XLN_24NCT: 'KD', KT_XLN_TT: 'KD',
  // KD — phòng Đào tạo
  TP_DT: 'KD', PP_DT_CM: 'KD', PP_DT_TC: 'KD',
  TT_DT: 'KD', GV_CB: 'KD', GV_NC: 'KD', GV_TG: 'KD',
  // KD — phòng Marketing
  TP_MKT: 'KD', PP_MKT: 'KD',
  TT_CT: 'KD', TT_ED: 'KD', TT_TK: 'KD',
  NV_CT: 'KD', NV_ED: 'KD', NV_TK: 'KD',
  // VP — phòng Nhân sự (gồm cả Tiểu ban TTNB)
  TP_NS: 'VP', TIBAN_TT: 'VP', NV_TTNB: 'VP',
  // VP — phòng Giám sát + Kế toán
  TP_GS: 'VP', TP_KE: 'VP',
  NV_GS: 'VP', NV_KE: 'VP', NV_NS: 'VP',
};

// Role → phòng mapping
export const ROLE_DEPT: Record<string, string> = {
  TP_KT: 'KT', TP_DT: 'DT', TP_MKT: 'MKT',
  TP_GS: 'GS', TP_KE: 'KE', TP_NS: 'NS', TIBAN_TT: 'NS',
  TT_DT: 'DT', GV_CB: 'DT', GV_NC: 'DT',
  // Phòng KT — 2 nhóm chuyên môn (HT = Hệ thống, XLN = Xử lý nước)
  PP_HT: 'KT', PP_XLN: 'KT',
  KT_HT_HM: 'KT', KT_HT_TK: 'KT', KT_HT_CTT: 'KT', KT_HT_24NCT: 'KT', KT_HT_TT: 'KT',
  KT_XLN_HM: 'KT', KT_XLN_TK: 'KT', KT_XLN_CTT: 'KT', KT_XLN_24NCT: 'KT', KT_XLN_TT: 'KT',
};

// Role → facility mapping (cho KT viên cơ sở — scope check ở backend ky-thuat)
export const KT_FACILITY: Record<string, FacilityId> = {
  KT_HT_HM: 'HM', KT_HT_TK: 'TK', KT_HT_CTT: 'CTT', KT_HT_24NCT: '24', KT_HT_TT: 'TT',
  KT_XLN_HM: 'HM', KT_XLN_TK: 'TK', KT_XLN_CTT: 'CTT', KT_XLN_24NCT: '24', KT_XLN_TT: 'TT',
};

/** Tech specialization — Hệ thống (HT) hoặc Xử lý nước (XLN) */
export const KT_SPECIALIZATION: Record<string, 'HT' | 'XLN'> = {
  PP_HT: 'HT', PP_XLN: 'XLN',
  KT_HT_HM: 'HT', KT_HT_TK: 'HT', KT_HT_CTT: 'HT', KT_HT_24NCT: 'HT', KT_HT_TT: 'HT',
  KT_XLN_HM: 'XLN', KT_XLN_TK: 'XLN', KT_XLN_CTT: 'XLN', KT_XLN_24NCT: 'XLN', KT_XLN_TT: 'XLN',
};

/** Kỹ thuật module — admin level (TP_KT + GĐ Khối+ thấy toàn module) */
export function isTechAdmin(roleCode: string): boolean {
  return isTopAdmin(roleCode) || roleCode === 'GD_KD' || roleCode === 'GD_VP' || roleCode === 'TP_KT';
}

/** Kỹ thuật module — Phó phòng (xem hết nhưng theo specialization) */
export function isTechDeputy(roleCode: string): boolean {
  return roleCode === 'PP_HT' || roleCode === 'PP_XLN';
}

/** Kỹ thuật viên cơ sở */
export function isTechStaff(roleCode: string): boolean {
  return /^KT_(HT|XLN)_/.test(roleCode);
}

// Role → facility mapping (cho QLCS)
export const QLCS_FACILITY: Record<string, FacilityId> = {
  QLCS_HM: 'HM',
  QLCS_TK: 'TK',
  QLCS_CTT: 'CTT',
  QLCS_24NCT: '24',
  QLCS_TT: 'TT',
};

/** Quyền truy cập route — base từ role + override per user.
 *  override: { [route]: true (cho phép) | false (cấm) }. Missing → fallback role default. */
export function canAccessRoute(
  roleCode: string,
  route: string,
  overrides?: Record<string, boolean> | null,
): boolean {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, route)) {
    return !!overrides[route];
  }
  const allowed = MENU_PERMISSIONS[roleCode] || ['dashboard'];
  return allowed.includes(route);
}

/** Danh sách route hiệu lực sau khi merge role default + override (cho menu render). */
export function effectiveMenu(
  roleCode: string,
  overrides?: Record<string, boolean> | null,
): Set<string> {
  const base = new Set(MENU_PERMISSIONS[roleCode] || ['dashboard']);
  if (overrides) {
    for (const [route, allow] of Object.entries(overrides)) {
      if (allow) base.add(route);
      else base.delete(route);
    }
  }
  return base;
}

export function isQLCS(roleCode: string): boolean {
  return roleCode.startsWith('QLCS_');
}

export function isTP(roleCode: string): boolean {
  return roleCode.startsWith('TP_') || roleCode === 'TIBAN_TT';
}

export function canSeeAllFacilities(roleCode: string): boolean {
  return isTopAdmin(roleCode) || roleCode === 'GD_KD' || roleCode === 'GD_VP';
}

const ALL_FACILITIES: FacilityId[] = ['HM','TK','CTT','24','TT'];

function isFacilityId(x: unknown): x is FacilityId {
  return typeof x === 'string' && (ALL_FACILITIES as string[]).includes(x);
}

// Scope cơ sở:
//   • Admin (CEO/GĐ/GĐ_VP) → toàn bộ 5
//   • TP/TIBAN_TT (chuyên môn HQ) → toàn bộ 5 (cross-facility)
//   • Ai có facility_id (QLCS, TT, GV, NV...) → chỉ cơ sở của mình
//   • Còn lại → rỗng
export function getVisibleFacilities(roleCode: string, facilityId?: string | null): FacilityId[] {
  if (canSeeAllFacilities(roleCode)) return ALL_FACILITIES;
  if (isTP(roleCode)) return ALL_FACILITIES;
  if (isFacilityId(facilityId)) return [facilityId];
  // Backwards-compat: QLCS không có facility_id → suy ra từ role code
  if (isQLCS(roleCode) && QLCS_FACILITY[roleCode]) return [QLCS_FACILITY[roleCode]];
  return [];
}

export function getMyFacility(roleCode: string, facilityId?: string | null): FacilityId | null {
  if (isFacilityId(facilityId)) return facilityId;
  if (isQLCS(roleCode)) return QLCS_FACILITY[roleCode] ?? null;
  return null;
}

export function getMyDepartment(roleCode: string): string | null {
  return ROLE_DEPT[roleCode] || null;
}

// ============================================================
// Checklist scope — quyết định phạm vi dữ liệu được fetch
// Áp dụng server-side trong page.tsx; RLS là lớp bảo vệ cuối.
// ============================================================
export interface ChecklistScope {
  // null = không restrict ở field này; [] = empty result.
  facilityIds: string[] | null;
  departmentIds: string[] | null;
  shiftTypes: string[] | null;
}

export function getChecklistScope(args: {
  roleCode: string;
  facilityId: string | null;
  departmentId: string | null;
  shiftAssignment: string | null;
  isSharedShift: boolean;
}): ChecklistScope {
  const { roleCode, facilityId, departmentId, shiftAssignment, isSharedShift } = args;

  // Tài khoản checklist ca (shared shift): khoá 3 chiều
  if (isSharedShift) {
    return {
      facilityIds: facilityId ? [facilityId] : [],
      departmentIds: departmentId ? [departmentId] : [],
      shiftTypes: shiftAssignment ? [shiftAssignment] : [],
    };
  }

  // Admin / CEO / GĐ Khối: xem toàn bộ (block boundary để RLS xử lý)
  if (isTopAdmin(roleCode) || roleCode === 'GD_KD' || roleCode === 'GD_VP') {
    return { facilityIds: null, departmentIds: null, shiftTypes: null };
  }

  // QLCS: chỉ cơ sở của mình
  if (isQLCS(roleCode)) {
    return {
      facilityIds: facilityId ? [facilityId] : [],
      departmentIds: null,
      shiftTypes: null,
    };
  }

  // TP / Tiểu ban / phụ trách chuyên môn: theo dept, mọi cơ sở
  if (isTP(roleCode)) {
    return {
      facilityIds: null,
      departmentIds: departmentId ? [departmentId] : [],
      shiftTypes: null,
    };
  }

  // Nhân viên (NV/GV/TT/PP) có facility_id → restrict vào cơ sở của mình.
  // RLS vẫn lọc tiếp theo assigned_to/role, nhưng UI không leak data cơ sở khác.
  if (facilityId) {
    return { facilityIds: [facilityId], departmentIds: null, shiftTypes: null };
  }
  // Không có facility_id (vd. nhân viên HQ chưa được gán) → để RLS xử lý.
  return { facilityIds: null, departmentIds: null, shiftTypes: null };
}

// Áp scope vào một supabase query builder. Hoạt động với cả server
// và client supabase client (đều có .eq/.in cùng signature).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SBQuery = any;
export function applyChecklistScopeToQuery(query: SBQuery, scope: ChecklistScope): SBQuery {
  let q = query;
  // facility
  if (scope.facilityIds !== null) {
    if (scope.facilityIds.length === 0) {
      q = q.eq('facility_id', '__never_match__');
    } else if (scope.facilityIds.length === 1) {
      q = q.eq('facility_id', scope.facilityIds[0]);
    } else {
      q = q.in('facility_id', scope.facilityIds);
    }
  }
  // department
  if (scope.departmentIds !== null) {
    if (scope.departmentIds.length === 0) {
      q = q.eq('department_id', '__never_match__');
    } else if (scope.departmentIds.length === 1) {
      q = q.eq('department_id', scope.departmentIds[0]);
    } else {
      q = q.in('department_id', scope.departmentIds);
    }
  }
  // shift_type
  if (scope.shiftTypes !== null) {
    if (scope.shiftTypes.length === 0) {
      q = q.eq('shift_type', '__never_match__');
    } else if (scope.shiftTypes.length === 1) {
      q = q.eq('shift_type', scope.shiftTypes[0]);
    } else {
      q = q.in('shift_type', scope.shiftTypes);
    }
  }
  return q;
}
