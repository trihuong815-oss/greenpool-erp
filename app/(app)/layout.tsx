import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/Sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Lấy profile + role
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role_code, facility_id, roles(name)')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h1 className="text-xl font-bold mb-2">Tài khoản chưa được cấu hình</h1>
          <p className="text-sm text-slate-600">
            Tài khoản <strong>{user.email}</strong> chưa có hồ sơ (profile) hoặc vai trò.
            Admin cần tạo record trong bảng <code>profiles</code> với <code>role_code</code> phù hợp.
          </p>
        </div>
      </div>
    );
  }

  const roleName = (profile as any).roles?.name || profile.role_code;

  return (
    <div className="min-h-screen flex">
      <Sidebar
        userName={profile.full_name}
        userRole={roleName}
        roleCode={profile.role_code}
      />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
