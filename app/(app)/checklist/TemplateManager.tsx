'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Save, X, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface RoleRef { code: string; name: string; block_id: string | null; tier: number }

interface Template {
  id: string;
  role_label: string;
  block_id: string;
  active: boolean;
  created_at: string;
}

interface Item {
  id: string;
  template_id: string;
  content: string;
  sort_order: number;
}

interface Props {
  userRole: string;
  userBlock: 'KD' | 'VP' | 'all';
  roles: RoleRef[];
}

export function TemplateManager({ userBlock, roles }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [items, setItems] = useState<Record<string, Item[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleRoles = roles.filter(r => userBlock === 'all' || r.block_id === userBlock);

  async function refresh() {
    setLoading(true);
    let q = supabase
      .from('checklist_templates')
      .select('id, role_label, block_id, active, created_at')
      .order('created_at', { ascending: false });
    if (userBlock !== 'all') q = q.eq('block_id', userBlock);
    const { data, error: e } = await q;
    if (e) setError(e.message);
    setTemplates((data || []) as Template[]);
    setLoading(false);
  }

  async function loadItems(templateId: string) {
    if (items[templateId]) return;
    const { data } = await supabase
      .from('checklist_items')
      .select('*')
      .eq('template_id', templateId)
      .order('sort_order');
    setItems(prev => ({ ...prev, [templateId]: (data || []) as Item[] }));
  }

  useEffect(() => { refresh(); }, [userBlock]);

  useEffect(() => {
    if (selectedId) loadItems(selectedId);
  }, [selectedId]);

  async function createTemplate(payload: { role_code: string }) {
    const role = roles.find(r => r.code === payload.role_code);
    if (!role || !role.block_id) {
      setError('Vai trò không hợp lệ');
      return;
    }
    const { data, error: e } = await supabase
      .from('checklist_templates')
      .insert({
        role_label: role.name,
        block_id: role.block_id,
        active: true,
      })
      .select('id, role_label, block_id, active, created_at')
      .single();
    if (e) {
      setError(e.message);
      return;
    }
    setTemplates(prev => [data as Template, ...prev]);
    setShowCreate(false);
    setSelectedId((data as Template).id);
  }

  async function toggleActive(t: Template) {
    const { error: e } = await supabase
      .from('checklist_templates')
      .update({ active: !t.active })
      .eq('id', t.id);
    if (e) { setError(e.message); return; }
    setTemplates(prev => prev.map(x => x.id === t.id ? { ...x, active: !x.active } : x));
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Xoá template này? Tất cả items và logs cũng sẽ bị xoá.')) return;
    const { error: e } = await supabase.from('checklist_templates').delete().eq('id', id);
    if (e) { setError(e.message); return; }
    setTemplates(prev => prev.filter(t => t.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  async function addItem(templateId: string, content: string) {
    const current = items[templateId] || [];
    const sort_order = current.length;
    const { data, error: e } = await supabase
      .from('checklist_items')
      .insert({ template_id: templateId, content, sort_order })
      .select()
      .single();
    if (e) { setError(e.message); return; }
    setItems(prev => ({ ...prev, [templateId]: [...current, data as Item] }));
  }

  async function updateItem(item: Item, content: string) {
    const { error: e } = await supabase
      .from('checklist_items')
      .update({ content })
      .eq('id', item.id);
    if (e) { setError(e.message); return; }
    setItems(prev => ({
      ...prev,
      [item.template_id]: (prev[item.template_id] || []).map(x => x.id === item.id ? { ...x, content } : x),
    }));
  }

  async function deleteItem(item: Item) {
    if (!confirm('Xoá ý này?')) return;
    const { error: e } = await supabase.from('checklist_items').delete().eq('id', item.id);
    if (e) { setError(e.message); return; }
    setItems(prev => ({
      ...prev,
      [item.template_id]: (prev[item.template_id] || []).filter(x => x.id !== item.id),
    }));
  }

  const selected = templates.find(t => t.id === selectedId) || null;
  const selectedItems = selectedId ? (items[selectedId] || []) : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="card-title">Templates {userBlock !== 'all' && `(Khối ${userBlock})`}</div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-800 text-white text-sm rounded hover:bg-slate-700"
          >
            <Plus size={14} /> Thêm
          </button>
        </div>

        {error && (
          <div className="mb-3 p-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-slate-500 py-4 text-center">Đang tải…</div>
        ) : templates.length === 0 ? (
          <div className="text-sm text-slate-400 italic py-6 text-center">
            Chưa có template nào. Bấm "+ Thêm" để tạo.
          </div>
        ) : (
          <div className="space-y-1">
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left p-3 rounded-lg border transition ${
                  selectedId === t.id
                    ? 'bg-slate-100 border-slate-300'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-slate-800 truncate">{t.role_label}</div>
                    <div className="text-xs text-slate-500 mt-0.5 truncate">
                      Khối {t.block_id}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-400 mt-0.5" />
                </div>
                <div className="flex gap-1 mt-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${t.block_id === 'KD' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {t.block_id}
                  </span>
                  {!t.active && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                      Tạm tắt
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        {!selected ? (
          <div className="py-12 text-center text-slate-400">
            <div className="text-4xl mb-3">👈</div>
            <p className="text-sm">Chọn template ở cột trái để xem/sửa các ý</p>
          </div>
        ) : (
          <TemplateEditor
            template={selected}
            items={selectedItems}
            onToggleActive={() => toggleActive(selected)}
            onDelete={() => deleteTemplate(selected.id)}
            onAddItem={(c) => addItem(selected.id, c)}
            onUpdateItem={updateItem}
            onDeleteItem={deleteItem}
          />
        )}
      </div>

      {showCreate && (
        <CreateTemplateModal
          roles={visibleRoles}
          onCancel={() => setShowCreate(false)}
          onCreate={createTemplate}
        />
      )}
    </div>
  );
}

function TemplateEditor({
  template, items, onToggleActive, onDelete, onAddItem, onUpdateItem, onDeleteItem,
}: {
  template: Template;
  items: Item[];
  onToggleActive: () => void;
  onDelete: () => void;
  onAddItem: (content: string) => void;
  onUpdateItem: (item: Item, content: string) => void;
  onDeleteItem: (item: Item) => void;
}) {
  const [newItem, setNewItem] = useState('');

  function handleAdd() {
    const t = newItem.trim();
    if (!t) return;
    onAddItem(t);
    setNewItem('');
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4 pb-3 border-b">
        <div>
          <div className="font-bold text-lg text-slate-800">{template.role_label}</div>
          <div className="text-xs text-slate-500 mt-1">
            Khối {template.block_id}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onToggleActive}
            className={`px-3 py-1.5 text-xs rounded border ${
              template.active
                ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            {template.active ? 'Tạm tắt' : 'Bật lại'}
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1.5 text-xs rounded border bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100"
          >
            <Trash2 size={14} className="inline" /> Xoá template
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-sm text-slate-400 italic py-4 text-center bg-slate-50 rounded">
            Chưa có ý nào. Thêm ý ở dưới.
          </div>
        ) : (
          items.map((item, idx) => (
            <ItemRow
              key={item.id}
              item={item}
              index={idx + 1}
              onUpdate={(c) => onUpdateItem(item, c)}
              onDelete={() => onDeleteItem(item)}
            />
          ))
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <input
          type="text"
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="VD: Kiểm tra phao cứu hộ, dây cứu hộ trước ca trực"
          className="flex-1 px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400"
        />
        <button
          onClick={handleAdd}
          disabled={!newItem.trim()}
          className="px-4 py-2 bg-slate-800 text-white text-sm rounded hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus size={14} className="inline" /> Thêm ý
        </button>
      </div>
    </div>
  );
}

function ItemRow({ item, index, onUpdate, onDelete }: {
  item: Item; index: number; onUpdate: (c: string) => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.content);

  function save() {
    const t = draft.trim();
    if (t && t !== item.content) onUpdate(t);
    setEditing(false);
  }

  return (
    <div className="flex items-center gap-2 p-2 rounded border border-slate-100 hover:bg-slate-50 group">
      <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-xs flex items-center justify-center font-semibold flex-shrink-0">
        {index}
      </div>
      {editing ? (
        <>
          <input
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' ? save() : e.key === 'Escape' && setEditing(false)}
            autoFocus
            className="flex-1 px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:border-slate-500"
          />
          <button onClick={save} className="text-emerald-600 hover:text-emerald-800" title="Lưu">
            <Save size={16} />
          </button>
          <button onClick={() => { setDraft(item.content); setEditing(false); }} className="text-slate-400 hover:text-slate-600" title="Huỷ">
            <X size={16} />
          </button>
        </>
      ) : (
        <>
          <div
            className="flex-1 text-sm text-slate-700 cursor-pointer"
            onClick={() => setEditing(true)}
          >
            {item.content}
          </div>
          <button
            onClick={onDelete}
            className="text-slate-300 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition"
            title="Xoá"
          >
            <Trash2 size={16} />
          </button>
        </>
      )}
    </div>
  );
}

function CreateTemplateModal({ roles, onCancel, onCreate }: {
  roles: RoleRef[];
  onCancel: () => void;
  onCreate: (payload: { role_code: string }) => void;
}) {
  const [roleCode, setRoleCode] = useState(roles[0]?.code || '');

  function submit() {
    if (!roleCode) return;
    onCreate({ role_code: roleCode });
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b flex items-center justify-between">
          <div className="font-bold text-lg text-slate-800">Tạo template mới</div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Áp dụng cho vai trò</label>
            <select
              value={roleCode}
              onChange={e => setRoleCode(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400"
            >
              {roles.map(r => (
                <option key={r.code} value={r.code}>
                  {r.name} ({r.code}) — {r.block_id}
                </option>
              ))}
            </select>
            <div className="text-xs text-slate-500 mt-2">
              Tên template sẽ lấy theo tên vai trò. Một vai trò có thể có nhiều template — phân biệt bằng các ý bên trong.
            </div>
          </div>
        </div>
        <div className="p-5 border-t flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded border border-slate-200 hover:bg-slate-50">
            Huỷ
          </button>
          <button
            onClick={submit}
            disabled={!roleCode}
            className="px-4 py-2 bg-slate-800 text-white text-sm rounded hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Tạo template
          </button>
        </div>
      </div>
    </div>
  );
}
