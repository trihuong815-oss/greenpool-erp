// ============================================
// Green Pool ERP — TypeScript Types
// ============================================

export type FacilityId = 'HM' | 'TK' | 'CTT' | '24' | 'TT';
export type BlockId = 'KD' | 'VP';
export type DeptId = 'KT' | 'DT' | 'MKT' | 'TTNB' | 'GS' | 'KE' | 'NS';

export interface Facility {
  id: FacilityId;
  name: string;
  color: string;
  address: string;
}

export interface Block {
  id: BlockId;
  name: string;
  color: string;
}

export interface Department {
  id: DeptId;
  name: string;
  block_id: BlockId;
  color: string;
}

export interface Role {
  code: string;
  name: string;
  tier: number;
  block_id?: BlockId;
  dept_id?: DeptId;
  facility_id?: FacilityId;
  is_qlcs: boolean;
  is_tp: boolean;
  parent_role?: string;
}

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  role_code: string;
  facility_id?: FacilityId;
  is_probation: boolean;
  avatar_url?: string;
  active: boolean;
}

export interface ProfileWithRole {
  id: string;
  full_name: string;
  role_code: string;
  facility_id: FacilityId | null;
  roles: { name: string } | null;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  assignee_id?: string;
  from_id?: string;
  facility_id?: FacilityId;
  dept_id?: DeptId;
  status: 'pending' | 'in_progress' | 'completed' | 'rejected';
  priority: 'low' | 'medium' | 'high';
  deadline?: string;
  created_at: string;
}

export interface Proposal {
  id: string;
  title: string;
  description?: string;
  from_id?: string;
  facility_id?: FacilityId;
  dept_id?: DeptId;
  proposal_type: 'up' | 'peer' | 'cross-bloc';
  status: 'pending' | 'in_approval' | 'approved' | 'rejected' | 'in_execution' | 'completed';
  priority: 'low' | 'medium' | 'high';
  final_assignee_id?: string;
  created_at: string;
}

export interface ProposalApproval {
  id: string;
  proposal_id: string;
  approver_role: string;
  step_order: number;
  status: 'pending' | 'approved' | 'rejected';
  note?: string;
  approved_at?: string;
}

export interface MonthlyProgress {
  facility_id: FacilityId;
  period_year: number;
  period_month: number;
  target_million: number;
  actual_million: number;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  link?: string;
  link_tab?: string;
  related_id?: string;
  is_read: boolean;
  created_at: string;
}

export interface Procedure {
  id: string;
  dept_id: DeptId;
  title: string;
  description?: string;
  active: boolean;
  versions?: ProcedureVersion[];
}

export interface ProcedureVersion {
  id: string;
  procedure_id: string;
  version: number;
  file_name: string;
  file_url?: string;
  file_size: number;
  change_note?: string;
  uploaded_by?: string;
  uploaded_at: string;
}
