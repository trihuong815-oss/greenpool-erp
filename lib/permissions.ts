// ============================================
// Green Pool ERP — RBAC & Permissions
// Logic phân quyền giống prototype, áp dụng phía client
// (Supabase RLS đảm bảo phía server)
// ============================================

export type RoleCode = string;
export type FacilityId = 'HM' | 'TK' | 'CTT' | '24' | 'TT';

// Ma trận menu — vai trò nào thấy module nào
export const MENU_PERMISSIONS: Record<string, string[]> = {
  CEO:       ['dashboard','doanh-so','checklist','quy-trinh','giao-viec','sodo','luong','bao-cao','daotao','mkt','settings-packages'],
  GD_KD:     ['dashboard','doanh-so','checklist','quy-trinh','giao-viec','sodo','luong','bao-cao','daotao','mkt','settings-packages'],
  GD_VP:     ['dashboard',         'checklist','quy-trinh','giao-viec','sodo','luong','bao-cao'],

  QLCS_HM:   ['dashboard','doanh-so','checklist','quy-trinh','giao-viec','sodo','luong','bao-cao','daotao','mkt','settings-packages'],
  QLCS_TK:   ['dashboard','doanh-so','checklist','quy-trinh','giao-viec','sodo','luong','bao-cao','daotao','mkt','settings-packages'],
  QLCS_CTT:  ['dashboard','doanh-so','checklist','quy-trinh','giao-viec','sodo','luong','bao-cao','daotao','mkt','settings-packages'],
  QLCS_24NCT:['dashboard','doanh-so','checklist','quy-trinh','giao-viec','sodo','luong','bao-cao','daotao','mkt','settings-packages'],
  QLCS_TT:   ['dashboard','doanh-so','checklist','quy-trinh','giao-viec','sodo','luong','bao-cao','daotao','mkt','settings-packages'],

  TP_KT:     ['dashboard','checklist','quy-trinh','giao-viec','bao-cao'],
  TP_DT:     ['dashboard','checklist','quy-trinh','giao-viec','bao-cao','daotao'],
  TP_MKT:    ['dashboard','checklist','quy-trinh','giao-viec','bao-cao','mkt'],
  TIBAN_TT:  ['dashboard','checklist','quy-trinh','giao-viec','bao-cao'],
  TP_GS:     ['dashboard','checklist','quy-trinh','giao-viec','bao-cao','sodo'],
  TP_KE:     ['dashboard','checklist','quy-trinh','giao-viec','bao-cao','luong'],
  TP_NS:     ['dashboard','checklist','quy-trinh','giao-viec','bao-cao','luong','sodo'],

  TT_DT:     ['dashboard','checklist','quy-trinh','giao-viec','bao-cao'],
  GV_CB:     ['dashboard','checklist','quy-trinh','giao-viec'],
  GV_NC:     ['dashboard','checklist','quy-trinh','giao-viec'],
  NV_SALE:   ['dashboard','checklist','giao-viec'],
  NV_CH:     ['dashboard','checklist','giao-viec'],
};

// Role → khối mapping
export const ROLE_BLOCK: Record<string, 'KD' | 'VP' | 'all'> = {
  CEO: 'all', GD_KD: 'KD', GD_VP: 'VP',
  QLCS_HM: 'KD', QLCS_TK: 'KD', QLCS_CTT: 'KD', QLCS_24NCT: 'KD', QLCS_TT: 'KD',
  TP_KT: 'KD', TP_DT: 'KD', TP_MKT: 'KD', TIBAN_TT: 'KD',
  TP_GS: 'VP', TP_KE: 'VP', TP_NS: 'VP',
  TT_DT: 'KD', GV_CB: 'KD', GV_NC: 'KD', NV_SALE: 'KD', NV_CH: 'KD',
};

// Role → phòng mapping
export const ROLE_DEPT: Record<string, string> = {
  TP_KT: 'KT', TP_DT: 'DT', TP_MKT: 'MKT', TIBAN_TT: 'MKT',
  TP_GS: 'GS', TP_KE: 'KE', TP_NS: 'NS',
  TT_DT: 'DT', GV_CB: 'DT', GV_NC: 'DT',
};

// Role → facility mapping (cho QLCS)
export const QLCS_FACILITY: Record<string, FacilityId> = {
  QLCS_HM: 'HM',
  QLCS_TK: 'TK',
  QLCS_CTT: 'CTT',
  QLCS_24NCT: '24',
  QLCS_TT: 'TT',
};

export function canAccessRoute(roleCode: string, route: string): boolean {
  const allowed = MENU_PERMISSIONS[roleCode] || ['dashboard'];
  return allowed.includes(route);
}

export function isQLCS(roleCode: string): boolean {
  return roleCode.startsWith('QLCS_');
}

export function isTP(roleCode: string): boolean {
  return roleCode.startsWith('TP_') || roleCode === 'TIBAN_TT';
}

export function canSeeAllFacilities(roleCode: string): boolean {
  return ['CEO','GD_KD','GD_VP'].includes(roleCode);
}

export function getVisibleFacilities(roleCode: string): FacilityId[] {
  if (canSeeAllFacilities(roleCode)) return ['HM','TK','CTT','24','TT'];
  if (isQLCS(roleCode)) return [QLCS_FACILITY[roleCode]];
  if (isTP(roleCode)) return ['HM','TK','CTT','24','TT'];  // TP chuyên môn xem 5 CS
  return [];
}

export function getMyFacility(roleCode: string): FacilityId | null {
  if (isQLCS(roleCode)) return QLCS_FACILITY[roleCode];
  return null;
}

export function getMyDepartment(roleCode: string): string | null {
  return ROLE_DEPT[roleCode] || null;
}
