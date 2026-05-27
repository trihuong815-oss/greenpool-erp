import { canAccessRoute } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { AppTopBar } from './AppTopBar';

interface ModuleShellProps {
  route: string;
  title: string;
  subtitle?: string;
  description: string;
  features: string[];
  emoji: string;
}

export async function ModuleShell({ route, title, subtitle, description, features, emoji }: ModuleShellProps) {
  const { profile } = await requireAuthedProfile();

  if (!canAccessRoute(profile.roleCode, route)) {
    return (
      <>
        <AppTopBar title={title} />
        <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">🔒</div>
            <div className="font-bold text-slate-800 text-lg mb-2">Không có quyền truy cập</div>
            <div className="text-sm text-slate-500">Vai trò <strong>{profile.roleCode || '—'}</strong> không bao gồm module này.</div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <AppTopBar title={title} subtitle={subtitle} />
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        <div className="card max-w-3xl mx-auto">
          <div className="text-center py-8">
            <div className="text-6xl mb-4">{emoji}</div>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">{title}</h1>
            <p className="text-slate-600 mb-6">{description}</p>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left max-w-xl mx-auto">
              <div className="font-semibold text-amber-900 mb-2">🚧 Module sẽ được triển khai</div>
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
          </div>
        </div>
      </div>
    </>
  );
}
