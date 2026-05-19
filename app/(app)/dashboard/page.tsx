import { createClient } from '@/lib/supabase/server';
import { Header } from '@/components/Header';
import { canSeeAllFacilities, isQLCS, getVisibleFacilities } from '@/lib/permissions';
import { DashboardContent } from './DashboardContent';

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role_code, facility_id, roles(name)')
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  const visibleFacilities = getVisibleFacilities(profile.role_code);
  const isAdmin = canSeeAllFacilities(profile.role_code);

  const { data: facilities } = await supabase.from('facilities').select('*');
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .in('facility_id', visibleFacilities.length > 0 ? visibleFacilities : ['__none__'])
    .neq('status', 'completed');

  return (
    <>
      <Header
        title="Dashboard"
        subtitle={`Tổng quan ${(profile as any).roles?.name || profile.role_code}`}
        userId={profile.id}
      />
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        <DashboardContent
          roleCode={profile.role_code}
          facilities={facilities || []}
          tasks={tasks || []}
          visibleFacilities={visibleFacilities}
          isAdmin={isAdmin}
        />
      </div>
    </>
  );
}
