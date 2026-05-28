// Trang Quản lý công việc cá nhân (Phase 1).
// Không gian RIÊNG TƯ — chỉ owner xem. Server-side render fetch dữ liệu của caller.

import { redirect } from 'next/navigation';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { canAccessRoute } from '@/lib/permissions';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { AppTopBar } from '@/components/AppTopBar';
import { PersonalWorkClient, type PersonalTaskRow } from './PersonalWorkClient';

export default async function CongViecCaNhanPage() {
  const { profile } = await requireAuthedProfile();

  if (!canAccessRoute(profile.roleCode, 'cong-viec-ca-nhan', profile.menuOverrides)) {
    redirect('/dashboard');
  }

  // Fetch tasks của chính caller (KHÔNG fetch của user khác)
  const db = getFirebaseAdminDb();
  let tasks: PersonalTaskRow[] = [];
  try {
    const snap = await db.collection(COLLECTIONS.PERSONAL_TASKS)
      .where('ownerId', '==', profile.id)
      .limit(200)
      .get();
    tasks = snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: d.id,
          title: String(x.title ?? ''),
          description: typeof x.description === 'string' ? x.description : '',
          priority: x.priority ?? 'medium',
          status: x.status ?? 'todo',
          dueDate: x.dueDate ?? null,
          scheduledTime: x.scheduledTime ?? null,
          reminderAt: x.reminderAt ?? null,
          category: x.category ?? 'personal',
          deleted: !!x.deleted,
          createdAt: x.createdAt?.toDate?.()?.toISOString() ?? '',
          updatedAt: x.updatedAt?.toDate?.()?.toISOString() ?? '',
        } as PersonalTaskRow;
      })
      .filter((r) => !r.deleted)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  } catch (e: any) {
    console.warn('[cong-viec-ca-nhan] fetch tasks:', e?.message);
  }

  return (
    <>
      <AppTopBar
        title="Công việc cá nhân"
        subtitle={`${profile.displayName} · không gian riêng tư`}
        icon="task"
      />
      <div className="flex-1 overflow-y-auto p-3 md:p-6 bg-slate-50">
        <PersonalWorkClient
          profile={{
            id: profile.id,
            email: profile.email,
            displayName: profile.displayName,
            roleCode: profile.roleCode,
            roleName: profile.roleName,
            branchName: profile.branchName,
            departmentName: profile.departmentName,
            avatarUrl: profile.avatarUrl,
            workSlogan: profile.workSlogan,
            positionTitle: profile.positionTitle,
          }}
          initialTasks={tasks}
        />
      </div>
    </>
  );
}
