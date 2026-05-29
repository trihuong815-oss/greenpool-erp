// Phase 11 — Shared helpers cho /api/proposals/* routes.
// Tránh duplicate `asScope` + `serialize` ở 5 file route.

import type { Block, ProposalForScope } from './proposals-scope';

export const PROPOSAL_LIMITS = {
  TITLE: 200,
  DESC: 5000,
  NOTES: 1000,
  REASON: 1000,
  ATTACHMENTS: 20,
} as const;

export const VALID_PROPOSAL_BLOCK: ReadonlySet<Block> = new Set(['KD', 'VP', 'all']);

// Convert raw Firestore doc → ProposalForScope (subset for permission check)
export function asProposalScope(d: Record<string, unknown>): ProposalForScope {
  return {
    creatorId: String(d.creatorId ?? ''),
    branchId: (d.branchId ?? null) as string | null,
    departmentId: (d.departmentId ?? null) as string | null,
    block: ((d.block ?? 'all') as Block),
    status: d.status as ProposalForScope['status'],
    approverRole: String(d.approverRole ?? ''),
  };
}

// Generic Firestore doc serialize — convert Timestamp → ISO string.
// Spread vào `id` đầu tiên để key 'id' luôn ổn định.
export function serializeProposal(id: string, data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { id };
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && typeof (v as { toDate?: () => Date }).toDate === 'function') {
      out[k] = (v as { toDate: () => Date }).toDate().toISOString();
    } else {
      out[k] = v;
    }
  }
  return out;
}
