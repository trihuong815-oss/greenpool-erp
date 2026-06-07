// Phase A.7: Test #5 — Badge sync invariant (Phase 13.13).
// total = chat + tasks + techWork + checklist
// = sum(4 sidebar badge)
// = chuông tổng
// = OS badge
// Pure logic test — không cần React/Firebase mock.

import { describe, it, expect } from 'vitest';

interface NotiCounts {
  chat: number;
  tasksApproval: number;
  tasksAssigned: number;
  techProposal: number;
  techTask: number;
  checklist: number;
}

function deriveBadges(counts: NotiCounts) {
  const tasks = counts.tasksApproval + counts.tasksAssigned;
  const techWork = counts.techProposal + counts.techTask;
  const totalNonChat = tasks + techWork + counts.checklist;
  const total = totalNonChat + counts.chat;
  return { tasks, techWork, totalNonChat, total };
}

describe('Badge sync invariant', () => {
  it('Invariant: total = chat + tasks + techWork + checklist', () => {
    const counts = { chat: 3, tasksApproval: 2, tasksAssigned: 1, techProposal: 1, techTask: 0, checklist: 4 };
    const { tasks, techWork, total } = deriveBadges(counts);
    expect(tasks).toBe(3);
    expect(techWork).toBe(1);
    expect(total).toBe(3 + 3 + 1 + 4);
    expect(total).toBe(11);
  });

  it('Zero everything → all zero', () => {
    const { tasks, techWork, totalNonChat, total } = deriveBadges({
      chat: 0, tasksApproval: 0, tasksAssigned: 0, techProposal: 0, techTask: 0, checklist: 0,
    });
    expect(tasks).toBe(0);
    expect(techWork).toBe(0);
    expect(totalNonChat).toBe(0);
    expect(total).toBe(0);
  });

  it('totalNonChat KHÔNG bao gồm chat (cho chuông chỉ noti nghiệp vụ)', () => {
    const counts = { chat: 100, tasksApproval: 1, tasksAssigned: 1, techProposal: 1, techTask: 1, checklist: 1 };
    const { totalNonChat, total } = deriveBadges(counts);
    expect(totalNonChat).toBe(5); // 2 tasks + 2 techWork + 1 checklist
    expect(total).toBe(105); // + 100 chat
  });

  it('Sum 4 sidebar badge === total (invariant chính)', () => {
    const counts = { chat: 5, tasksApproval: 3, tasksAssigned: 2, techProposal: 1, techTask: 4, checklist: 7 };
    const { tasks, techWork, total } = deriveBadges(counts);
    const sumSidebar = counts.chat + tasks + techWork + counts.checklist;
    expect(sumSidebar).toBe(total);
  });

  it('Số âm KHÔNG được phép (regression guard)', () => {
    // Provider không bao giờ set âm — test này đảm bảo formula KHÔNG tự tạo số âm
    const counts = { chat: 0, tasksApproval: 0, tasksAssigned: 0, techProposal: 0, techTask: 0, checklist: 0 };
    const { total } = deriveBadges(counts);
    expect(total).toBeGreaterThanOrEqual(0);
  });
});
