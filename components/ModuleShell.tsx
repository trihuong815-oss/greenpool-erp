import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { canAccessRoute } from '@/lib/permissions';
import { Header } from './Header';

interface ModuleShellProps {
  route: string;
  title: string;
  subtitle?: string;
  description: string;
  features: string[];
  emoji: string;
}

export async function ModuleShell({ route, title, subtitle, description, features, emoji }: ModuleShellProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role_code')
    .eq('id', user.id)
    .single();

  if (!profile || !canAccessRoute(profile.role_code, route)) {
    return (
      <>
        <Header title={title} userId={user.id} />
        <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">🔒</div>
            <div className="font-bold text-slate-800 text-lg mb-2">Không có quyền truy cập</div>
            <div className="text-sm text-slate-500">Vai trò <strong>{profile?.role_code || '—'}</strong> không bao gồm module này.</div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title={title} subtitle={subtitle} userId={profile.id} />
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        <div className="card max-w-3xl mx-auto">
          <div className="text-center py-8">
            <div className="text-6xl mb-4">{emoji}</div>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">{title}</h1>
            <p className="text-slate-600 mb-6">{description}</p>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left max-w-xl mx-auto">
              <div className="font-semibold text-amber-900 mb-2">🚧 Đang xây dựng — Phase 2</div>
              <p className="text-sm text-slate-700 mb-3">
                Module này đang được triển khai chi tiết. Logic và UI đã có sẵn trong prototype HTML, sẽ được chuyển sang Next.js + Supabase trong các phiên Cowork tiếp theo.
              </p>
              <div className="text-sm">
                <div className="font-semibold text-slate-800 mb-1">Chức năng dự kiến:</div>
                <ul className="space-y-1">
                  {features.map((f, i) => (
                    <li key={i} className="text-slate-600 flex items-start gap-2">
                      <span className="text-emerald-600">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-4 text-xs text-slate-400">
              Để test cấu trúc/UX module này, anh vào <strong>prototype HTML</strong> trong thư mục <code>GreenPool_ERP/</code> trên Desktop.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
