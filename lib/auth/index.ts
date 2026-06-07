// Phase B.4 (2026-06-07): Barrel cho lib/auth/.
// Single import entry: import { can, isCEO, isAdmin } from '@/lib/auth';

export { can } from './can';
export type { Action, Resource } from './can';

export {
  isTopAdmin,
  isCEO,
  isAdminSystem,
  isGD,
  isTP,
  isQLCS,
  isWriteAdmin,
  canSeeAllFacilities,
  hasRole,
} from './roles';
export type { RoleCode } from './roles';
