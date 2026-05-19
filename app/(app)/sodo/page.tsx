import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { canAccessRoute } from '@/lib/permissions';
import { Header } from '@/components/Header';
import { OrgChartClient } from './OrgChartClient';
import type { Role, Profile } from '@/lib/types';

export default async function SoDoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role_code')
    .eq('id', user.id)
    .single();

  if (!profile || !canAccessRoute(profile.role_code, 'sodo')) {
    return (
      <>
        <Header title="Sơ đồ tổ chức" userId={user.id} />
        <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">🔒</div>
            <div className="font-bold text-slate-800 text-lg mb-2">Không có quyền truy cập</div>
          </div>
        </div>
      </>
    );
  }

  const { data: roles } = await supabase
    .from('roles')
    .select('code, name, tier, block_id, dept_id, facility_id, is_qlcs, is_tp, parent_role, description')
    .order('tier');

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email, role_code, facility_id, avatar_url, active')
    .eq('active', true);

  return (
    <>
      <Header
        title="Sơ đồ tổ chức"
        subtitle="42 vai trò × 6 tầng — click vai trò để xem chi tiết nhân sự"
        userId={profile.id}
      />
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        <OrgChartClient
          roles={(roles || []) as Role[]}
          profiles={(profiles || []) as Profile[]}
        />
      </div>
    </>
  );
}
