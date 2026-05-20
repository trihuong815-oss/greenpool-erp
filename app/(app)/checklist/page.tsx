import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { canAccessRoute } from '@/lib/permissions';
import { Header } from '@/components/Header';
import { ChecklistClient } from './ChecklistClient';

export default async function ChecklistPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role_code, facility_id')
    .eq('id', user.id)
    .single();

  if (!profile || !canAccessRoute(profile.role_code, 'checklist')) {
    return (
      <>
        <Header title="Checklist vận hành" userId={user.id} />
        <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">🔒</div>
            <div className="font-bold text-slate-800 text-lg mb-2">Không có quyền truy cập</div>
          </div>
        </div>
      </>
    );
  }

  const { data: facilities } = await supabase.from('facilities').select('id, name, color');
  const { data: roles } = await supabase
    .from('roles')
    .select('code, name, block_id, tier')
    .order('tier');

  return (
    <>
      <Header
        title="Checklist vận hành"
        subtitle="Tạo template · Tick hôm nay · Theo dõi tuân thủ"
        userId={profile.id}
      />
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        <ChecklistClient
          userId={profile.id}
          userName={profile.full_name}
          userRole={profile.role_code}
          userFacility={profile.facility_id || null}
          facilities={facilities || []}
          roles={roles || []}
        />
      </div>
    </>
  );
}
