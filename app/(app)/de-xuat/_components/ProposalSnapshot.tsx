'use client';

// PR-PROPOSAL-RESTRUCTURE (2026-06-27): TIER 2 SNAPSHOT cho /de-xuat.
// Mirror DispatchSnapshot (/dieu-phoi) — 4 cell action-required dùng
// <SegmentSummary> với onClick filter table sub-tab.
//
// Bỏ 3 cell historical khỏi SegmentSummary 7 cell cũ:
//   • "Đã phê duyệt"      — đã xong, có tab "Đã duyệt" trong table
//   • "Đã tạo điều phối"  — đã xong, có tab "Đã tạo điều phối" trong table
//   • "Từ chối"           — kết thúc, lookup historical qua filter Loại nếu cần
//
// 4 cell action-required còn lại:
//   1. Chờ tôi duyệt   — current approver = user, status pending
//   2. Đang xem xét    — proposal đang trong chuỗi duyệt (≥1 approver đã duyệt)
//   3. Cần bổ sung     — bị YCBS, người tạo cần sửa
//   4. Quá hạn         — SLA expired theo role approver hiện tại

import { SegmentSummary } from '@/components/ui/StatCard';
import type { ProposalV6 as DashboardProposalV6 } from './dashboard-types';

export type ProposalSnapshotKey =
  | 'pending_me' | 'dang_xem_xet' | 'ycbs' | 'overdue';

interface Props {
  proposals: DashboardProposalV6[];
  currentUserUid: string;
  currentUserRole: string;
  onSelectCell?: (key: ProposalSnapshotKey) => void;
  activeKey?: ProposalSnapshotKey | null;
}

// ─── SLA helpers (copy từ DexuatDashboard) ──────────────────────────────
const SLA_HOURS_TABLE: Record<string, number> = { TP: 48, GD: 72, CEO: 96, CT: 96, YCBS: 48 };

function getSlaHoursForStep(step?: string): number {
  if (!step) return 48;
  const s = step.toUpperCase();
  if (s.includes('CEO')) return SLA_HOURS_TABLE.CEO;
  if (s.includes('CT') || s.includes('CHU_TICH')) return SLA_HOURS_TABLE.CT;
  if (s.includes('GD') || s.includes('GĐ')) return SLA_HOURS_TABLE.GD;
  return SLA_HOURS_TABLE.TP;
}

function isPending(status: string): boolean {
  return status === 'da_gui' || status === 'dang_xem_xet' || status === 'yeu_cau_bo_sung';
}

function getApproverToken(item: unknown): string | undefined {
  if (!item) return undefined;
  if (typeof item === 'string') return item;
  const obj = item as { uid?: string; roleCode?: string };
  if (obj.uid) return `user:${obj.uid}`;
  if (obj.roleCode) return `role:${obj.roleCode}`;
  return undefined;
}

function parseApprover(token?: string): { kind: 'user' | 'role' | 'unknown'; value: string } {
  if (!token) return { kind: 'unknown', value: '' };
  if (token.startsWith('user:')) return { kind: 'user', value: token.slice(5) };
  if (token.startsWith('role:')) return { kind: 'role', value: token.slice(5) };
  return { kind: 'unknown', value: token };
}

function isCurrentApprover(p: DashboardProposalV6, uid: string, role: string): boolean {
  if (!isPending(p.status)) return false;
  const token = getApproverToken(p.approverChain?.[p.approverIdx]);
  const cur = parseApprover(token);
  if (cur.kind === 'user') return cur.value === uid;
  if (cur.kind === 'role') return cur.value === role;
  return false;
}

function isOverdue(p: DashboardProposalV6, nowMs: number): boolean {
  if (!isPending(p.status)) return false;
  const token = getApproverToken(p.approverChain?.[p.approverIdx]);
  const slaH = getSlaHoursForStep(token);
  const fromIso = p.updatedAt || p.createdAt;
  const from = new Date(fromIso).getTime();
  if (!Number.isFinite(from)) return false;
  return (nowMs - from) / 3_600_000 > slaH;
}

export default function ProposalSnapshot({
  proposals, currentUserUid, currentUserRole, onSelectCell, activeKey,
}: Props) {
  const nowMs = Date.now();

  let pendingMe = 0;
  let dangXemXet = 0;
  let ycbs = 0;
  let overdue = 0;

  for (const p of proposals) {
    if (isCurrentApprover(p, currentUserUid, currentUserRole)) pendingMe += 1;
    if (p.status === 'dang_xem_xet') dangXemXet += 1;
    if (p.status === 'yeu_cau_bo_sung') ycbs += 1;
    if (isOverdue(p, nowMs)) overdue += 1;
  }

  const cells: Array<{
    key: ProposalSnapshotKey; label: string; n: number;
    tone?: 'default' | 'warning' | 'danger';
  }> = [
    { key: 'pending_me',   label: 'Chờ tôi duyệt',  n: pendingMe,   tone: 'warning' },
    { key: 'dang_xem_xet', label: 'Đang xem xét',   n: dangXemXet,  tone: 'default' },
    { key: 'ycbs',         label: 'Cần bổ sung',    n: ycbs,        tone: 'warning' },
    { key: 'overdue',      label: 'Quá hạn',        n: overdue,     tone: 'danger'  },
  ];

  return (
    <SegmentSummary
      items={cells.map((c) => ({
        n: c.n,
        label: c.label,
        tone: c.tone,
        onClick: onSelectCell && c.n > 0 ? () => onSelectCell(c.key) : undefined,
        active: activeKey === c.key,
        title: c.n === 0 ? 'Không có đề xuất' : `Lọc danh sách: ${c.label}`,
      }))}
    />
  );
}
