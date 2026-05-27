// Service layer cho module Quản lý công việc cá nhân.
// PRIVACY CRITICAL: tất cả op CRUD trên personalTasks/personalLearning/aiAssistantLogs
// BẮT BUỘC check ownerId === caller.uid. KHÔNG có bypass cho admin/CEO.
//
// Audit log: ghi action nhưng KHÔNG lưu nội dung task (chỉ id + title) để giữ riêng tư.

import 'server-only';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'todo' | 'doing' | 'done' | 'overdue' | 'cancelled';
export type TaskCategory = 'daily' | 'weekly' | 'project' | 'personal' | 'learning';

export const VALID_PRIORITY: ReadonlySet<TaskPriority> = new Set(['low', 'medium', 'high', 'urgent']);
export const VALID_STATUS: ReadonlySet<TaskStatus> = new Set(['todo', 'doing', 'done', 'overdue', 'cancelled']);
export const VALID_CATEGORY: ReadonlySet<TaskCategory> = new Set(['daily', 'weekly', 'project', 'personal', 'learning']);

export interface PersonalTaskDoc {
  ownerId: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: string | null;     // YYYY-MM-DD
  reminderAt?: string | null;  // ISO
  category: TaskCategory;
  deleted: boolean;
  deletedAt?: Date | null;
  deletedBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Throw nếu task không tồn tại HOẶC không phải của owner. KHÔNG leak existence. */
export async function getOwnedTaskOr404(taskId: string, ownerId: string): Promise<{ ref: FirebaseFirestore.DocumentReference; data: PersonalTaskDoc }> {
  const db = getFirebaseAdminDb();
  const ref = db.collection(COLLECTIONS.PERSONAL_TASKS).doc(taskId);
  const snap = await ref.get();
  // Cùng response cho missing + not-owner — chống enumerate
  if (!snap.exists) {
    const err = new Error('Không tìm thấy');
    (err as any).status = 404;
    throw err;
  }
  const data = snap.data() as PersonalTaskDoc;
  if (data.ownerId !== ownerId) {
    const err = new Error('Không tìm thấy'); // không tiết lộ
    (err as any).status = 404;
    throw err;
  }
  if (data.deleted) {
    const err = new Error('Không tìm thấy');
    (err as any).status = 404;
    throw err;
  }
  return { ref, data };
}

interface AuditMeta {
  userId: string;
  actorName: string;
  actorRole: string;
}

/** Audit log — chỉ ghi id + title (KHÔNG ghi description/details để giữ riêng tư). */
export async function auditPersonalTask(
  action: 'create_personal_task' | 'update_personal_task' | 'delete_personal_task',
  taskId: string,
  title: string,
  meta: AuditMeta,
): Promise<void> {
  await writeAuditLog({
    action,
    module: 'users',  // dùng module 'users' để hợp với AuditModule type hiện có
    userId: meta.userId,
    branchId: null,
    before: null,
    after: { taskId, title },
    actorName: meta.actorName,
    actorRole: meta.actorRole,
    source: 'api',
  });
}

// ════════════ JOURNAL ════════════

export type JournalMood = 'great' | 'good' | 'ok' | 'tired' | 'stressed';
export const VALID_MOOD: ReadonlySet<JournalMood> = new Set(['great', 'good', 'ok', 'tired', 'stressed']);

export interface PersonalJournalDoc {
  ownerId: string;
  date: string;  // YYYY-MM-DD — 1 entry/day/user
  /** Sections — tự do bỏ trống bất kỳ */
  didToday?: string;
  challenges?: string;
  learned?: string;
  tomorrow?: string;
  /** Cảm nhận tổng */
  mood?: JournalMood | null;
  /** Ghi chú tự do thêm */
  freeNote?: string;
  createdAt: Date;
  updatedAt: Date;
  deleted: boolean;
  deletedAt?: Date | null;
}

export async function getOwnedJournalOr404(entryId: string, ownerId: string) {
  const db = getFirebaseAdminDb();
  const ref = db.collection(COLLECTIONS.PERSONAL_JOURNAL).doc(entryId);
  const snap = await ref.get();
  if (!snap.exists) { const e = new Error('Không tìm thấy'); (e as any).status = 404; throw e; }
  const data = snap.data() as PersonalJournalDoc;
  if (data.ownerId !== ownerId || data.deleted) { const e = new Error('Không tìm thấy'); (e as any).status = 404; throw e; }
  return { ref, data };
}

// ════════════ HABITS ════════════

export type HabitFrequency = 'daily' | 'weekdays' | 'weekly';
export type HabitCategory = 'work' | 'health' | 'mindset' | 'learning' | 'personal';
export const VALID_HABIT_FREQ: ReadonlySet<HabitFrequency> = new Set(['daily', 'weekdays', 'weekly']);
export const VALID_HABIT_CAT: ReadonlySet<HabitCategory> = new Set(['work', 'health', 'mindset', 'learning', 'personal']);

export interface PersonalHabitDoc {
  ownerId: string;
  title: string;
  description?: string;
  category: HabitCategory;
  frequency: HabitFrequency;
  color: string;        // hex / tailwind hue (vd. emerald, cyan, rose)
  icon?: string | null; // tên lucide icon
  startDate: string;    // YYYY-MM-DD
  /** Map YYYY-MM-DD → true. Firestore document size sufficient for ~5 năm 1 thói quen */
  completions: Record<string, boolean>;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
  deleted: boolean;
  deletedAt?: Date | null;
}

export async function getOwnedHabitOr404(habitId: string, ownerId: string) {
  const db = getFirebaseAdminDb();
  const ref = db.collection(COLLECTIONS.PERSONAL_HABITS).doc(habitId);
  const snap = await ref.get();
  if (!snap.exists) { const e = new Error('Không tìm thấy'); (e as any).status = 404; throw e; }
  const data = snap.data() as PersonalHabitDoc;
  if (data.ownerId !== ownerId || data.deleted) { const e = new Error('Không tìm thấy'); (e as any).status = 404; throw e; }
  return { ref, data };
}

/** Tính current streak (chuỗi ngày liên tiếp tính tới hôm nay/qua) + longest streak. */
export function calcStreak(completions: Record<string, boolean>): { current: number; longest: number; total: number } {
  const sortedDates = Object.keys(completions).filter((d) => completions[d]).sort();
  const total = sortedDates.length;
  if (sortedDates.length === 0) return { current: 0, longest: 0, total: 0 };

  // Longest
  let longest = 1, run = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1] + 'T00:00:00Z');
    const cur = new Date(sortedDates[i] + 'T00:00:00Z');
    const diff = Math.round((cur.getTime() - prev.getTime()) / 86_400_000);
    if (diff === 1) { run++; longest = Math.max(longest, run); }
    else { run = 1; }
  }

  // Current: đếm ngược từ hôm nay (cho phép bỏ qua "hôm nay chưa làm" → tính từ hôm qua)
  const today = new Date();
  let cur = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (completions[key]) cur++;
    else if (i > 0) break;
    // i=0 (hôm nay) không completed → vẫn check ngày hôm qua
  }
  return { current: cur, longest, total };
}

// ════════════ GOALS ════════════

export type GoalCategory = 'work' | 'health' | 'learning' | 'finance' | 'family' | 'personal';
export type GoalStatus = 'active' | 'completed' | 'paused' | 'cancelled';
export const VALID_GOAL_CAT: ReadonlySet<GoalCategory> = new Set(['work', 'health', 'learning', 'finance', 'family', 'personal']);
export const VALID_GOAL_STATUS: ReadonlySet<GoalStatus> = new Set(['active', 'completed', 'paused', 'cancelled']);

export interface GoalMilestone {
  title: string;
  done: boolean;
  completedAt?: string | null;
}
export interface PersonalGoalDoc {
  ownerId: string;
  title: string;
  description?: string;
  category: GoalCategory;
  priority: 'low' | 'medium' | 'high';
  status: GoalStatus;
  targetDate?: string | null;
  progressPct: number;  // 0-100
  milestones: GoalMilestone[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date | null;
  deleted: boolean;
  deletedAt?: Date | null;
}

export async function getOwnedGoalOr404(goalId: string, ownerId: string) {
  const db = getFirebaseAdminDb();
  const ref = db.collection(COLLECTIONS.PERSONAL_GOALS).doc(goalId);
  const snap = await ref.get();
  if (!snap.exists) { const e = new Error('Không tìm thấy'); (e as any).status = 404; throw e; }
  const data = snap.data() as PersonalGoalDoc;
  if (data.ownerId !== ownerId || data.deleted) { const e = new Error('Không tìm thấy'); (e as any).status = 404; throw e; }
  return { ref, data };
}
