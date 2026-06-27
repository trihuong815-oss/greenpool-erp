// PR-PROPOSAL-RESTRUCTURE (2026-06-27): shared types/constants/helpers cho 3 panel
// mới (ProposalSnapshot + ProposalIssuesPanel + ProposalPerformancePanel) sau khi
// extract từ DexuatDashboard.tsx (660 LOC).
//
// Giữ NGUYÊN shape của ProposalV6 (9 field cơ bản) + KIND_COLOR + KIND_LABEL.
// Adapter DeXuatClient → ProposalV6 không đổi.

export type ProposalKindV6 =
  // V6.4 (2026-06-13) anh chốt 3 loại form mới — đã verify 0 doc legacy trên Firestore.
  | 'van_hanh'
  | 'du_an'
  | 'cai_tien';

export type ProposalStatusV6 =
  | 'nhap'
  | 'da_gui'
  | 'dang_xem_xet'
  | 'yeu_cau_bo_sung'
  | 'da_phe_duyet'
  | 'da_tao_dieu_phoi'
  // Backward compat alias V5: chuyen_dieu_phoi === da_tao_dieu_phoi
  | 'chuyen_dieu_phoi'
  | 'dong_ho_so'
  | 'tu_choi';

export interface ApproverStepV6 {
  uid?: string;
  roleCode?: string;
  name: string;
  decidedAt?: string;
  decision?: 'approved' | 'rejected' | 'requested_revision';
  notes?: string;
}

export interface ProposalV6 {
  id: string;
  code: string;
  title: string;
  kind: ProposalKindV6;
  status: ProposalStatusV6;

  creatorUid: string;
  creatorName?: string;

  approverChain: Array<string | ApproverStepV6>;
  approverIdx: number;

  estimatedCost?: number;
  createdAt: string;
  updatedAt: string;

  // ─── Backward-compat fields V5 ──────────────────────────────────────
  priority?: string;
  scopeTargets?: Array<{ id: string; label: string; kind?: string }>;
  relatedBlocks?: Array<'KD' | 'VP'>;
  approverHistory?: ApproverStepV6[];
}

// ─── KIND meta — màu donut + label hiển thị ───────────────────────────
// Vận hành sky · Dự án violet · Cải tiến emerald
export const KIND_COLOR: Record<ProposalKindV6, string> = {
  van_hanh: '#0ea5e9',
  du_an:    '#8b5cf6',
  cai_tien: '#10b981',
};

export const KIND_LABEL: Record<ProposalKindV6, string> = {
  van_hanh: 'Vận hành',
  du_an:    'Dự án',
  cai_tien: 'Cải tiến',
};
