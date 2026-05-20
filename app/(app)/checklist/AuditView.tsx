'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { FacilityId } from '@/lib/types';

interface Facility { id: string; name: string; color: string }
interface RoleRef { code: string; name: string; block_id: string | null; tier: number }

interface Props {
  userRole: string;
  userFacility: FacilityId | null;
  facilities: Facility[];
  roles: RoleRef[];
}

interface Template {
  id: string;
  role_label: string;
  block_id: string;
}

interface ItemRef { id: string; template_id: string }
interface ProfileRef { id: string; full_name: string; role_code: string; facility_id: string | null }
interface LogRef { id: string; user_id: string | null; item_id: string | null; template_id: string | null; is_done: boolean; date_completed: string }

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function canSeeAllFacilities(role: string): boolean {
  return ['CEO', 'GD_KD', 'GD_VP', 'TP_GS', 'TP_NS'].includes(role);
}

export function AuditView({ userRole, userFacility, facilities, roles }: Props) {
  const [date, setDate] = useState(todayStr());
  const [facilityFilter, setFacilityFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [itemsByTemplate, setItemsByTemplate] = useState<Record<string, ItemRef[]>>({});
  const [profiles, setProfiles] = useState<ProfileRef[]>([]);
  const [logs, setLogs] = useState<LogRef[]>([]);

  const roleByName = useMemo(() => {
    const map: Record<string, RoleRef> = {};
    roles.forEach(r => { map[r.name] = r; });
    return map;
  }, [roles]);

  const visibleFacilities = useMemo(() => {
    if (canSeeAllFacilities(userRole)) return facilities;
    if (userRole.startsWith('QLCS_') && userFacility) {
      return facilities.filter(f => f.id === userFacility);
    }
    return facilities;
  }, [userRole, userFacility, facilities]);

  useEffect(() => {
    if (!canSeeAllFacilities(userRole) && userFacility) {
      setFacilityFilter(userFacility);
    }
  }, [userRole, userFacility]);

  useEffect(() => {
    load();
  }, [date, facilityFilter, userRole]);

  async function load() {
    setLoading(true);
    setError(null);

    const { data: tpls, error: te } = await supabase
      .from('checklist_templates')
      .select('id, role_label, block_id')
      .eq('active', true);
    if (te) { setError(te.message); setLoading(false); return; }
    const tplList = (tpls || []) as Template[];
    setTemplates(tplList);

    if (tplList.length === 0) { setLoading(false); return; }

    const tplIds = tplList.map(t => t.id);
    const { data: items, error: ie } = await supabase
      .from('checklist_items')
      .select('id, template_id')
      .in('template_id', tplIds);
    if (ie) { setError(ie.message); setLoading(false); return; }
    const itemsMap: Record<string, ItemRef[]> = {};
    (items || []).forEach(it => {
      const i = it as ItemRef;
      (itemsMap[i.template_id] ||= []).push(i);
    });
    setItemsByTemplate(itemsMap);

    const roleCodes = Array.from(new Set(
      tplList.map(t => roleByName[t.role_label]?.code).filter(Boolean)
    )) as string[];
    if (roleCodes.length === 0) { setProfiles([]); setLogs([]); setLoading(false); return; }

    let profQ = supabase
      .from('profiles')
      .select('id, full_name, role_code, facility_id')
      .in('role_code', roleCodes)
      .eq('active', true);
    if (facilityFilter !== 'all') profQ = profQ.eq('facility_id', facilityFilter);
    const { data: profs, error: pe } = await profQ;
    if (pe) { setError(pe.message); setLoading(false); return; }
    setProfiles((profs || []) as ProfileRef[]);

    const { data: lg, error: le } = await supabase
      .from('checklist_logs')
      .select('id, user_id, item_id, template_id, is_done, date_completed')
      .eq('date_completed', date)
      .eq('is_done', true)
      .in('template_id', tplIds);
    if (le) { setError(le.message); setLoading(false); return; }
    setLogs((lg || []) as LogRef[]);

    setLoading(false);
  }

  const rows = useMemo(() => {
    const out: Array<{
      template: Template;
      itemCount: number;
      profileRows: Array<{ profile: ProfileRef; done: number; total: number; pct: number }>;
      totalDone: number;
      totalExpected: number;
    }> = [];

    templates.forEach(t => {
      const items = itemsByTemplate[t.id] || [];
      const itemCount = items.length;
      const roleForTemplate = roleByName[t.role_label];
      const relevantProfiles = roleForTemplate
        ? profiles.filter(p => p.role_code === roleForTemplate.code)
        : [];
      if (relevantProfiles.length === 0 || itemCount === 0) return;

      const profileRows = relevantProfiles.map(p => {
        const done = logs.filter(l => l.user_id === p.id && l.template_id === t.id).length;
        const total = itemCount;
        return { profile: p, done, total, pct: total > 0 ? (done / total) * 100 : 0 };
      });

      const totalDone = profileRows.reduce((a, r) => a + r.done, 0);
      const totalExpected = profileRows.reduce((a, r) => a + r.total, 0);

      out.push({ template: t, itemCount, profileRows, totalDone, totalExpected });
    });

    return out;
  }, [templates, itemsByTemplate, profiles, logs, roleByName]);

  const overallPct = useMemo(() => {
    const totalDone = rows.reduce((a, r) => a + r.totalDone, 0);
    const totalExpected = rows.reduce((a, r) => a + r.totalExpected, 0);
    return totalExpected > 0 ? (totalDone / totalExpected) * 100 : 0;
  }, [rows]);

  function pctColor(pct: number): string {
    if (pct >= 90) return 'text-emerald-700 bg-emerald-50';
    if (pct >= 60) return 'text-amber-700 bg-amber-50';
    return 'text-rose-700 bg-rose-50';
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Ngày</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400"
            />
          </div>
          {canSeeAllFacilities(userRole) && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Cơ sở</label>
              <select
                value={facilityFilter}
                onChange={e => setFacilityFilter(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400"
              >
                <option value="all">Tất cả cơ sở</option>
                {visibleFacilities.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="ml-auto">
            <div className="text-xs font-semibold text-slate-600 mb-1">Tuân thủ tổng</div>
            <div className={`px-3 py-2 rounded font-bold text-lg ${pctColor(overallPct)}`}>
              {overallPct.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card text-center py-12 text-slate-500">Đang tải…</div>
      ) : error ? (
        <div className="card text-rose-700 bg-rose-50 border border-rose-200">
          <div className="font-semibold mb-1">Lỗi tải dữ liệu</div>
          <div className="text-sm">{error}</div>
        </div>
      ) : rows.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-4xl mb-3">📭</div>
          <div className="font-bold text-slate-800 mb-1">Không có dữ liệu</div>
          <div className="text-sm text-slate-500">
            Chưa có template hoạt động hoặc chưa có nhân viên nào thuộc các vai trò có template.
          </div>
        </div>
      ) : (
        rows.map(row => (
          <div key={row.template.id} className="card">
            <div className="flex items-center justify-between mb-3 pb-3 border-b">
              <div>
                <div className="font-bold text-slate-800">{row.template.role_label}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Khối {row.template.block_id} · {row.itemCount} ý · {row.profileRows.length} người
                </div>
              </div>
              <div className={`px-3 py-1.5 rounded font-semibold ${pctColor(row.totalExpected > 0 ? (row.totalDone / row.totalExpected) * 100 : 0)}`}>
                {row.totalDone}/{row.totalExpected}
                {row.totalExpected > 0 && (
                  <span className="text-xs ml-1">
                    ({((row.totalDone / row.totalExpected) * 100).toFixed(0)}%)
                  </span>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left p-2 font-semibold text-slate-600">Nhân viên</th>
                    <th className="text-center p-2 font-semibold text-slate-600">Cơ sở</th>
                    <th className="text-right p-2 font-semibold text-slate-600">Tiến độ</th>
                    <th className="text-right p-2 font-semibold text-slate-600 w-32">Tuân thủ</th>
                  </tr>
                </thead>
                <tbody>
                  {row.profileRows.map(pr => (
                    <tr key={pr.profile.id} className="border-b border-slate-100">
                      <td className="p-2 font-medium text-slate-800">{pr.profile.full_name}</td>
                      <td className="p-2 text-center text-slate-600">
                        {pr.profile.facility_id || '—'}
                      </td>
                      <td className="p-2 text-right text-slate-600 font-mono">
                        {pr.done}/{pr.total}
                      </td>
                      <td className={`p-2 text-right font-semibold ${pctColor(pr.pct).split(' ')[0]}`}>
                        {pr.pct.toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
