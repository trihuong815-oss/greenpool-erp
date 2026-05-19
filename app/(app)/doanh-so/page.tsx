import { createClient } from '@/lib/supabase/server';
import { Header } from '@/components/Header';
import { canAccessRoute, getVisibleFacilities, canSeeAllFacilities, isQLCS } from '@/lib/permissions';
import { redirect } from 'next/navigation';
import { formatVND } from '@/lib/utils';

export default async function DoanhSoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role_code, facility_id')
    .eq('id', user.id)
    .single();

  if (!profile || !canAccessRoute(profile.role_code, 'doanh-so')) {
    return (
      <div className="p-6">
        <div className="card text-center py-12">
          <div className="text-5xl mb-4">🔒</div>
          <div className="font-bold text-slate-800 text-lg">Không có quyền truy cập</div>
        </div>
      </div>
    );
  }

  const visibleFacs = getVisibleFacilities(profile.role_code);
  const { data: annualTargets } = await supabase.from('annual_targets').select('*').eq('period_year', 2026);
  const { data: monthlyProgress } = await supabase
    .from('monthly_progress').select('*').eq('period_year', 2026).in('facility_id', visibleFacs);
  const { data: facilities } = await supabase.from('facilities').select('*').in('id', visibleFacs);

  const totalActual = (monthlyProgress || []).reduce((a, r) => a + Number(r.actual_million || 0), 0);
  const totalTarget = (annualTargets || []).filter(t => visibleFacs.includes(t.facility_id))
    .reduce((a, r) => a + Number(r.target_million || 0), 0);

  return (
    <>
      <Header
        title="Doanh số"
        subtitle={`Tổng hợp doanh thu — ${canSeeAllFacilities(profile.role_code) ? 'Toàn cụm' : 'Cơ sở của bạn'}`}
        userId={profile.id}
      />
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="kpi-card border-l-4 border-blue-700">
            <div className="kpi-label">Doanh thu YTD</div>
            <div className="kpi-value">{formatVND(totalActual)}</div>
            <div className="kpi-sub">Tổng năm 2026</div>
          </div>
          <div className="kpi-card border-l-4 border-amber-600">
            <div className="kpi-label">Mục tiêu năm</div>
            <div className="kpi-value">{formatVND(totalTarget)}</div>
            <div className="kpi-sub">Target 2026</div>
          </div>
          <div className="kpi-card border-l-4 border-emerald-700">
            <div className="kpi-label">% Hoàn thành</div>
            <div className="kpi-value">{totalTarget > 0 ? (totalActual/totalTarget*100).toFixed(1) : 0}<span className="text-lg">%</span></div>
            <div className="kpi-sub">Tiến độ mục tiêu năm</div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Doanh thu theo cơ sở (2026)</div>
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="text-left p-2">Cơ sở</th>
                <th className="text-right p-2">Doanh thu YTD (Tr)</th>
                <th className="text-right p-2">Target năm (Tr)</th>
                <th className="text-right p-2">% Đạt</th>
              </tr>
            </thead>
            <tbody>
              {(facilities || []).map(f => {
                const facActual = (monthlyProgress || [])
                  .filter(r => r.facility_id === f.id)
                  .reduce((a, r) => a + Number(r.actual_million || 0), 0);
                const facTarget = (annualTargets || []).find(t => t.facility_id === f.id)?.target_million || 0;
                const pct = Number(facTarget) > 0 ? (facActual/Number(facTarget)*100) : 0;
                return (
                  <tr key={f.id} className="border-b hover:bg-slate-50">
                    <td className="p-2 font-medium">{f.name}</td>
                    <td className="p-2 text-right">{facActual.toLocaleString()}</td>
                    <td className="p-2 text-right">{Number(facTarget).toLocaleString()}</td>
                    <td className={`p-2 text-right font-semibold ${pct >= 100 ? 'text-emerald-700' : pct >= 60 ? 'text-amber-700' : 'text-rose-700'}`}>
                      {pct.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-4 text-xs text-slate-500">
            💡 Module này sẽ được mở rộng với: biểu đồ ngang target vs đạt, tiến độ tháng, hiệu suất nhân sự sale, top gói...
          </div>
        </div>
      </div>
    </>
  );
}
