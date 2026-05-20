'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import type { FacilityId } from '@/lib/types';

interface RoleRef { code: string; name: string; block_id: string | null; tier: number }

interface Props {
  userId: string;
  userRole: string;
  userFacility: FacilityId | null;
  roles: RoleRef[];
}

interface Template {
  id: string;
  role_label: string;
  block_id: string;
  active: boolean;
}

interface Item { id: string; template_id: string; content: string; sort_order: number }

interface Log {
  id: string;
  template_id: string | null;
  item_id: string | null;
  user_id: string | null;
  date_completed: string;
  is_done: boolean;
  note: string | null;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TodayChecklist({ userId, userRole, userFacility, roles }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [itemsByTemplate, setItemsByTemplate] = useState<Record<string, Item[]>>({});
  const [logsByItem, setLogsByItem] = useState<Record<string, Log>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = todayStr();
  const userRoleName = useMemo(
    () => roles.find(r => r.code === userRole)?.name || '',
    [userRole, roles]
  );

  useEffect(() => {
    if (!userRoleName) { setLoading(false); return; }
    load();
  }, [userRoleName]);

  async function load() {
    setLoading(true);
    setError(null);

    const { data: tpls, error: te } = await supabase
      .from('checklist_templates')
      .select('id, role_label, block_id, active')
      .eq('role_label', userRoleName)
      .eq('active', true);
    if (te) { setError(te.message); setLoading(false); return; }
    const templates = (tpls || []) as Template[];
    setTemplates(templates);

    if (templates.length === 0) { setLoading(false); return; }

    const templateIds = templates.map(t => t.id);
    const { data: items, error: ie } = await supabase
      .from('checklist_items')
      .select('id, template_id, content, sort_order')
      .in('template_id', templateIds)
      .order('sort_order');
    if (ie) { setError(ie.message); setLoading(false); return; }

    const itemsMap: Record<string, Item[]> = {};
    (items || []).forEach(it => {
      const i = it as Item;
      (itemsMap[i.template_id] ||= []).push(i);
    });
    setItemsByTemplate(itemsMap);

    const { data: logs, error: le } = await supabase
      .from('checklist_logs')
      .select('id, template_id, item_id, user_id, date_completed, is_done, note')
      .eq('user_id', userId)
      .eq('date_completed', today)
      .in('template_id', templateIds);
    if (le) { setError(le.message); setLoading(false); return; }

    const logMap: Record<string, Log> = {};
    (logs || []).forEach(l => {
      const log = l as Log;
      if (log.item_id) logMap[log.item_id] = log;
    });
    setLogsByItem(logMap);

    setLoading(false);
  }

  async function toggleItem(template: Template, item: Item) {
    const existing = logsByItem[item.id];
    const wantsDone = !(existing?.is_done ?? false);
    const isToday = existing?.date_completed === today;

    if (existing && isToday) {
      const { error: e } = await supabase
        .from('checklist_logs')
        .update({ is_done: wantsDone })
        .eq('id', existing.id);
      if (e) { setError(e.message); return; }
      setLogsByItem(prev => ({ ...prev, [item.id]: { ...existing, is_done: wantsDone } }));
    } else {
      const payload = {
        template_id: template.id,
        item_id: item.id,
        user_id: userId,
        facility_id: userFacility,
        date_completed: today,
        is_done: wantsDone,
      };
      const { data, error: e } = await supabase
        .from('checklist_logs')
        .insert(payload)
        .select()
        .single();
      if (e) { setError(e.message); return; }
      setLogsByItem(prev => ({ ...prev, [item.id]: data as Log }));
    }
  }

  const summary = useMemo(() => {
    let total = 0;
    let done = 0;
    templates.forEach(t => {
      const items = itemsByTemplate[t.id] || [];
      total += items.length;
      items.forEach(it => {
        const log = logsByItem[it.id];
        if (log?.is_done && log.date_completed === today) done++;
      });
    });
    return { total, done, pct: total > 0 ? (done / total) * 100 : 0 };
  }, [templates, itemsByTemplate, logsByItem, today]);

  if (loading) {
    return <div className="card text-center py-12 text-slate-500">Đang tải checklist…</div>;
  }

  if (error) {
    return (
      <div className="card text-rose-700 bg-rose-50 border border-rose-200">
        <div className="font-semibold mb-1">Lỗi tải dữ liệu</div>
        <div className="text-sm">{error}</div>
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="card text-center py-12">
        <div className="text-4xl mb-3">📋</div>
        <div className="font-bold text-slate-800 mb-1">
          Chưa có checklist cho vai trò {userRoleName || userRole}
        </div>
        <div className="text-sm text-slate-500">
          Nhờ GĐ Khối / CEO tạo template phù hợp ở tab <strong>Quản lý template</strong>.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card bg-gradient-to-r from-slate-800 to-slate-700 text-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider opacity-80">Tiến độ hôm nay</div>
            <div className="text-3xl font-bold mt-1">
              {summary.done}/{summary.total}
              <span className="text-base font-normal ml-2 opacity-80">
                ({summary.pct.toFixed(0)}%)
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs opacity-80">Ngày</div>
            <div className="font-semibold">{new Date().toLocaleDateString('vi-VN')}</div>
          </div>
        </div>
        <div className="mt-3 h-2 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-400 transition-all"
            style={{ width: `${summary.pct}%` }}
          />
        </div>
      </div>

      {templates.map(t => {
        const items = itemsByTemplate[t.id] || [];
        const doneCount = items.filter(it => {
          const log = logsByItem[it.id];
          return log?.is_done && log.date_completed === today;
        }).length;

        return (
          <div key={t.id} className="card">
            <div className="flex items-center justify-between mb-3 pb-3 border-b">
              <div>
                <div className="font-bold text-slate-800">{t.role_label}</div>
                <div className="text-xs text-slate-500 mt-0.5">Khối {t.block_id}</div>
              </div>
              <div className="text-sm font-semibold text-slate-600">
                {doneCount}/{items.length}
              </div>
            </div>

            {items.length === 0 ? (
              <div className="text-sm text-slate-400 italic py-3 text-center">
                Template chưa có ý nào.
              </div>
            ) : (
              <div className="space-y-1">
                {items.map(item => {
                  const log = logsByItem[item.id];
                  const isDone = log?.is_done && log.date_completed === today;
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggleItem(t, item)}
                      className={`w-full flex items-start gap-3 p-2.5 rounded text-left transition ${
                        isDone ? 'bg-emerald-50 hover:bg-emerald-100' : 'hover:bg-slate-50'
                      }`}
                    >
                      {isDone ? (
                        <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <Circle size={20} className="text-slate-300 flex-shrink-0 mt-0.5" />
                      )}
                      <div className={`text-sm flex-1 ${isDone ? 'text-slate-600 line-through' : 'text-slate-800'}`}>
                        {item.content}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
