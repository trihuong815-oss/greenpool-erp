'use client';

// ============================================================
// TODO Phase 5E (full): Admin UI quản lý mẫu checklist
// ------------------------------------------------------------
// File này hiện chỉ cung cấp chức năng tạo/sửa template cơ bản
// được carry-over từ MVP cũ. Phase 5E full cần hoàn thiện:
//   1. Tạo/sửa/tắt (active=false) mẫu checklist không xoá data
//      đã submit (giữ FK on delete cascade, hoặc soft-delete).
//   2. Chọn cơ sở áp dụng (facilities multi-select). Hiện chưa
//      có cột facility_ids[] trên checklist_templates — cân nhắc
//      bảng nối checklist_template_facilities (template_id, facility_id).
//   3. Chọn bộ phận áp dụng (department_id) — đã có cột.
//   4. Chọn ca / chu kỳ (shift_type + checklist_type) — đã có cột.
//   5. Chọn giờ thực hiện (scheduled_time) / hạn nộp (deadline_time)
//      — đã có cột.
//   6. Thêm / sửa / xoá item trong template (checklist_template_items)
//      bằng UI inline. Phải hỗ trợ kéo-thả sắp xếp.
//   7. Đánh dấu item bắt buộc (is_required), cần ghi chú (requires_note),
//      cần upload (requires_file) — đã có cột.
//   8. Versioning: khi sửa template đã có instance đang dùng, tạo
//      bản version mới (giữ id cũ readonly hoặc tạo template_id mới
//      và clone items). Tránh đổi nội dung mục đã được tick/duyệt.
//   9. Permission: Admin/CEO/GĐ Khối/QLCS/TP có scope khác nhau —
//      tận dụng RLS policy "Templates: managers write" (migration 005).
//   10. Audit log riêng cho thao tác template (create_template,
//       update_template, archive_template). Hiện audit_log mới
//       check constraint: cần mở rộng action enum tương tự
//       migration 024.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Save, X, ChevronRight, Paperclip, AlertCircle, MessageSquare, Search } from 'lucide-react';
import { checklistApi } from '@/lib/services/checklist/api-client';
import {
  SHIFT_OPTIONS, SHIFT_LABEL, EVIDENCE_OPTIONS, CHECKLIST_TYPE_OPTIONS, CHECKLIST_TYPE_LABEL,
  type RoleRef, type Department, type ChecklistTemplate, type ChecklistItem,
} from './helpers';

interface Props {
  userRole: string;
  roles: RoleRef[];
  departments: Department[];
}

function userScope(role: string): { block: 'KD' | 'VP' | 'all'; dept: string | null } {
  if (role === 'CEO' || role === 'ADMIN') return { block: 'all', dept: null };
  if (role === 'GD_KD') return { block: 'KD', dept: null };
  if (role === 'GD_VP') return { block: 'VP', dept: null };
  if (role.startsWith('QLCS_')) return { block: 'KD', dept: null };
  // TP_KT → KT, TP_DT → DT...
  if (role.startsWith('TP_KT')) return { block: 'KD', dept: 'KT' };
  if (role.startsWith('TP_DT')) return { block: 'KD', dept: 'DT' };
  if (role.startsWith('TP_MKT')) return { block: 'KD', dept: 'MKT' };
  if (role === 'TIBAN_TT') return { block: 'KD', dept: 'TTNB' };
  if (role.startsWith('TP_GS')) return { block: 'VP', dept: 'GS' };
  if (role.startsWith('TP_KE')) return { block: 'VP', dept: 'KE' };
  if (role.startsWith('TP_NS')) return { block: 'VP', dept: 'NS' };
  return { block: 'all', dept: null };
}

const SHIFT_ORDER: Record<string, number> = {
  morning: 1, afternoon: 2, evening: 3, night: 4, allday: 5,
};
const TYPE_ORDER: Record<string, number> = {
  opening: 1, handover: 2, closing: 3, incident: 4, custom: 5,
};

export function TemplateConfig({ userRole, roles, departments }: Props) {
  const scope = useMemo(() => userScope(userRole), [userRole]);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [items, setItems] = useState<Record<string, ChecklistItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter state — mặc định chỉ hiện template đang active để giấu template cũ đã archive
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('active');

  const visibleRoles = roles.filter(r => scope.block === 'all' || r.block_id === scope.block);
  const visibleDepts = departments.filter(d =>
    (scope.block === 'all' || d.block_id === scope.block) &&
    (!scope.dept || d.id === scope.dept)
  );

  // Filtered templates (apply search + filters)
  const filteredTemplates = useMemo(() => {
    const s = search.trim().toLowerCase();
    return templates.filter(t => {
      if (s) {
        const haystack = `${t.name || ''} ${t.role_label} ${t.checklist_group || ''}`.toLowerCase();
        if (!haystack.includes(s)) return false;
      }
      if (filterRole !== 'all') {
        const code = t.assigned_role_code || t.role_label;
        if (code !== filterRole && t.role_label !== filterRole) return false;
      }
      if (filterType !== 'all' && (t.checklist_type || 'custom') !== filterType) return false;
      if (filterStatus === 'active' && !t.active) return false;
      if (filterStatus === 'inactive' && t.active) return false;
      return true;
    });
  }, [templates, search, filterRole, filterType, filterStatus]);

  // Group 2 cấp: Bộ phận → Ca → Templates
  const departmentById = useMemo(() => {
    const m: Record<string, Department> = {};
    departments.forEach(d => { m[d.id] = d; });
    return m;
  }, [departments]);

  function shiftLabelOf(shift: string | null | undefined): string {
    if (shift === 'morning') return 'Ca sáng';
    if (shift === 'afternoon') return 'Ca chiều';
    if (shift === 'evening') return 'Ca tối';
    if (shift === 'night') return 'Ca đêm';
    return 'Cả ngày';
  }

  type ShiftGroup = { shiftKey: string; shiftLabel: string; shiftOrder: number; templates: ChecklistTemplate[] };
  type DeptGroup = { deptKey: string; deptLabel: string; deptId: string | null; blockId: string | null; shifts: ShiftGroup[] };

  const groupedTemplates = useMemo<DeptGroup[]>(() => {
    // Bước 1: gom theo (deptKey, shiftKey)
    const flat: Record<string, Record<string, ChecklistTemplate[]>> = {};
    filteredTemplates.forEach(t => {
      const dept = t.department_id ? departmentById[t.department_id] : null;
      const deptKey = dept ? `D:${dept.id}` : `R:${t.role_label || t.assigned_role_code || '—'}`;
      const shiftKey = t.shift_type || 'allday';
      ((flat[deptKey] ||= {})[shiftKey] ||= []).push(t);
    });

    // Bước 2: build cấu trúc và sort
    const depts: DeptGroup[] = Object.entries(flat).map(([deptKey, byShift]) => {
      const first = Object.values(byShift)[0][0];
      const dept = first.department_id ? departmentById[first.department_id] : null;
      const deptLabel = dept ? `Bộ phận ${dept.name}` : (first.role_label || '— Chưa gắn bộ phận —');

      const shifts: ShiftGroup[] = Object.entries(byShift).map(([shiftKey, tpls]) => {
        // Sort templates trong shift theo checklist_type_order + scheduled_time
        tpls.sort((a, b) => {
          const ya = TYPE_ORDER[a.checklist_type || 'custom'] || 99;
          const yb = TYPE_ORDER[b.checklist_type || 'custom'] || 99;
          if (ya !== yb) return ya - yb;
          const ta = a.scheduled_time || '99:99';
          const tb = b.scheduled_time || '99:99';
          return ta.localeCompare(tb);
        });
        return {
          shiftKey,
          shiftLabel: shiftLabelOf(shiftKey),
          shiftOrder: SHIFT_ORDER[shiftKey] || 99,
          templates: tpls,
        };
      }).sort((a, b) => a.shiftOrder - b.shiftOrder);

      return {
        deptKey,
        deptLabel,
        deptId: dept?.id || null,
        blockId: first.block_id,
        shifts,
      };
    });

    // Sort depts: AS trước LT, sau đó alpha
    const DEPT_ORDER: Record<string, number> = { 'D:AS': 1, 'D:LT': 2 };
    depts.sort((a, b) => {
      const oa = DEPT_ORDER[a.deptKey] ?? 99;
      const ob = DEPT_ORDER[b.deptKey] ?? 99;
      if (oa !== ob) return oa - ob;
      return a.deptLabel.localeCompare(b.deptLabel, 'vi');
    });

    return depts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTemplates, departmentById]);

  // Unique role codes from templates (for filter dropdown)
  const templateRoles = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ code: string; label: string }> = [];
    templates.forEach(t => {
      const code = t.assigned_role_code || t.role_label;
      if (!seen.has(code)) {
        seen.add(code);
        out.push({ code, label: t.role_label });
      }
    });
    return out.sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  }, [templates]);

  useEffect(() => { refresh(); }, [userRole]);
  useEffect(() => { if (selectedId) loadItems(selectedId); }, [selectedId]);

  async function refresh() {
    setLoading(true);
    try {
      const filter: { block?: string; dept?: string } = {};
      if (scope.block !== 'all') filter.block = scope.block;
      if (scope.dept) filter.dept = scope.dept;
      const rows = await checklistApi.listTemplates(filter);
      setTemplates(rows as unknown as ChecklistTemplate[]);
    } catch (e: any) {
      setError(e?.message ?? 'Load templates lỗi');
    } finally {
      setLoading(false);
    }
  }

  async function loadItems(templateId: string) {
    if (items[templateId]) return;
    try {
      const rows = await checklistApi.listTemplateItems(templateId);
      setItems(prev => ({ ...prev, [templateId]: rows as ChecklistItem[] }));
    } catch (e: any) {
      setError(e?.message ?? 'Load items lỗi');
    }
  }

  async function createTemplate(p: TemplatePayload) {
    const role = roles.find(r => r.code === p.assigned_role_code);
    if (!role || !role.block_id) { setError('Vai trò không hợp lệ'); return; }
    const payload = {
      name: p.name || role.name,
      role_label: role.name,
      block_id: role.block_id,
      active: true,
      assigned_role_code: p.assigned_role_code,
      reviewer_role_code: p.reviewer_role_code || null,
      department_id: p.department_id || null,
      shift_type: p.shift_type,
      checklist_type: p.checklist_type,
      facility_scope: p.facility_scope,
      checklist_group: p.checklist_group || null,
      evidence_type: p.evidence_type,
      scheduled_time: p.scheduled_time || null,
      deadline_time: p.deadline_time || null,
    };
    try {
      const created = await checklistApi.createTemplate(payload);
      setTemplates(prev => [created as unknown as ChecklistTemplate, ...prev]);
      setShowCreate(false);
      setSelectedId(created.id);
    } catch (e: any) {
      setError(e?.message ?? 'Tạo template lỗi');
    }
  }

  async function updateTemplate(id: string, patch: Partial<ChecklistTemplate>) {
    try {
      const updated = await checklistApi.updateTemplate(id, patch as Record<string, unknown>);
      setTemplates(prev => prev.map(t => t.id === id ? (updated as unknown as ChecklistTemplate) : t));
    } catch (e: any) {
      setError(e?.message ?? 'Cập nhật template lỗi');
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Xoá template? Items và logs liên quan cũng bị xoá.')) return;
    try {
      await checklistApi.deleteTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (e: any) {
      setError(e?.message ?? 'Xoá template lỗi');
    }
  }

  async function addItem(templateId: string, content: string) {
    try {
      const created = await checklistApi.createTemplateItem(templateId, content);
      setItems(prev => ({
        ...prev,
        [templateId]: [...(prev[templateId] || []), created as ChecklistItem],
      }));
    } catch (e: any) {
      setError(e?.message ?? 'Thêm item lỗi');
    }
  }

  async function updateItem(item: ChecklistItem, patch: Partial<ChecklistItem>) {
    try {
      await checklistApi.updateTemplateItem(item.template_id, item.id, patch as Record<string, unknown>);
      setItems(prev => ({
        ...prev,
        [item.template_id]: (prev[item.template_id] || []).map(x => x.id === item.id ? { ...x, ...patch } : x),
      }));
    } catch (e: any) {
      setError(e?.message ?? 'Cập nhật item lỗi');
    }
  }

  async function deleteItem(item: ChecklistItem) {
    if (!confirm('Xoá ý này?')) return;
    try {
      await checklistApi.deleteTemplateItem(item.template_id, item.id);
      setItems(prev => ({
        ...prev,
        [item.template_id]: (prev[item.template_id] || []).filter(x => x.id !== item.id),
      }));
    } catch (e: any) {
      setError(e?.message ?? 'Xoá item lỗi');
    }
  }

  // Departments management modal
  const [showDeptModal, setShowDeptModal] = useState(false);

  async function deleteDepartment(deptId: string, deptName: string) {
    if (!confirm(`Xoá bộ phận "${deptName}"?
Lưu ý: nếu có template/instance đang gắn bộ phận này, việc xoá sẽ bị chặn.`)) return;
    try {
      await checklistApi.deleteDepartment(deptId);
      window.location.reload();
    } catch (e: any) {
      setError(e?.message ?? 'Xoá bộ phận lỗi');
    }
  }

  const selected = templates.find(t => t.id === selectedId) || null;
  const selectedItems = selectedId ? (items[selectedId] || []) : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="card-title">
            Templates <span className="text-xs font-normal text-slate-500">({filteredTemplates.length}/{templates.length})</span>
            {scope.block !== 'all' && <span className="text-xs font-normal text-slate-500"> · {scope.block}{scope.dept ? `/${scope.dept}` : ''}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowDeptModal(true)}
              className="px-3 py-1.5 text-sm border rounded hover:bg-slate-50">
              Quản lý bộ phận
            </button>
            <button onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-800 text-white text-sm rounded hover:bg-slate-700">
            <Plus size={14} /> Thêm
          </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="space-y-2 mb-3 pb-3 border-b">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-2.5 text-slate-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Tìm tên mẫu, vai trò, nhóm…"
              className="w-full pl-7 pr-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
              className="px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:border-slate-400">
              <option value="all">Mọi vai trò</option>
              {templateRoles.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:border-slate-400">
              <option value="all">Mọi loại</option>
              {CHECKLIST_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as typeof filterStatus)}
            className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:border-slate-400">
            <option value="all">Mọi trạng thái</option>
            <option value="active">Đang hoạt động</option>
            <option value="inactive">Tạm tắt</option>
          </select>
        </div>

        {error && (
          <div className="mb-3 p-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded">{error}</div>
        )}

        {showDeptModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowDeptModal(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b flex items-center justify-between">
                <div className="font-bold">Quản lý bộ phận</div>
                <button onClick={() => setShowDeptModal(false)} className="text-slate-500">Đóng</button>
              </div>
              <div className="p-4">
                <div className="text-sm text-slate-600 mb-3">Danh sách bộ phận (Xoá an toàn nếu không còn template gắn)</div>
                <div className="space-y-2">
                  {departments.map(d => (
                    <div key={d.id} className="flex items-center justify-between p-2 border rounded">
                      <div>
                        <div className="font-medium">{d.name}</div>
                        <div className="text-xs text-slate-500">{d.id} · {d.block_id}</div>
                      </div>
                      <div>
                        <button onClick={() => deleteDepartment(d.id, d.name)}
                          className="px-3 py-1.5 text-sm bg-rose-50 border border-rose-200 text-rose-700 rounded hover:bg-rose-100">
                          Xoá
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-sm text-slate-500 py-4 text-center">Đang tải…</div>
        ) : templates.length === 0 ? (
          <div className="text-sm text-slate-400 italic py-6 text-center">Chưa có template. Bấm "+ Thêm".</div>
        ) : filteredTemplates.length === 0 ? (
          <div className="text-sm text-slate-400 italic py-6 text-center">Không có template khớp bộ lọc.</div>
        ) : (
          <div className="space-y-4">
            {groupedTemplates.map(dept => {
              const totalInDept = dept.shifts.reduce((a, s) => a + s.templates.length, 0);
              return (
                <section key={dept.deptKey}>
                  <div className="flex items-center justify-between mb-2 px-1 pb-1.5 border-b-2 border-slate-300">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-bold text-slate-900">{dept.deptLabel}</div>
                      <span className="text-xs text-slate-500">({totalInDept})</span>
                      {dept.blockId && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${dept.blockId === 'KD' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {dept.blockId}
                        </span>
                      )}
                      {dept.deptId && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{dept.deptId}</span>}
                    </div>
                  </div>
                  <div className="space-y-3 ml-2">
                    {dept.shifts.map(shift => (
                      <div key={shift.shiftKey}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                            {shift.shiftLabel}
                          </div>
                          <span className="text-[10px] text-slate-400">({shift.templates.length})</span>
                        </div>
                        <div className="space-y-1">
                          {shift.templates.map(t => (
                            <TemplateChip key={t.id}
                              template={t}
                              selected={selectedId === t.id}
                              onClick={() => setSelectedId(t.id)} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        {!selected ? (
          <div className="py-12 text-center text-slate-400">
            <div className="text-4xl mb-3">👈</div>
            <p className="text-sm">Chọn template để xem/sửa</p>
          </div>
        ) : (
          <Editor template={selected} items={selectedItems}
            roles={visibleRoles} departments={visibleDepts}
            onUpdate={(patch) => updateTemplate(selected.id, patch)}
            onDelete={() => deleteTemplate(selected.id)}
            onAddItem={(c) => addItem(selected.id, c)}
            onUpdateItem={updateItem}
            onDeleteItem={deleteItem} />
        )}
      </div>

      {showCreate && (
        <CreateModal roles={visibleRoles} departments={visibleDepts}
          onCancel={() => setShowCreate(false)} onCreate={createTemplate} />
      )}
    </div>
  );
}

function TemplateChip({ template, selected, onClick }: {
  template: ChecklistTemplate;
  selected: boolean;
  onClick: () => void;
}) {
  const typeMeta = template.checklist_type ? CHECKLIST_TYPE_LABEL[template.checklist_type] : null;
  const shift = template.shift_type && template.shift_type !== 'allday' ? SHIFT_LABEL[template.shift_type] : null;
  return (
    <button onClick={onClick}
      className={`w-full text-left p-2.5 rounded-lg border transition flex items-center gap-2 ${
        selected ? 'bg-slate-100 border-slate-400 shadow-sm' : 'bg-white border-slate-200 hover:bg-slate-50'
      }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {typeMeta && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${typeMeta.cls}`}>
              {typeMeta.emoji} {typeMeta.label}
            </span>
          )}
          {!template.active && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-500">Tạm tắt</span>
          )}
        </div>
        <div className="font-medium text-sm text-slate-800 mt-1 truncate">
          {template.name || template.role_label}
        </div>
        <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-2">
          {shift && <span>{shift}</span>}
          {template.scheduled_time && <span className="text-amber-700">▶ {template.scheduled_time.slice(0,5)}</span>}
          {template.deadline_time && <span className="text-rose-700">⏰ {template.deadline_time.slice(0,5)}</span>}
        </div>
      </div>
      <ChevronRight size={14} className="text-slate-400 flex-shrink-0" />
    </button>
  );
}

interface TemplatePayload {
  name: string;
  assigned_role_code: string;
  reviewer_role_code: string | null;
  department_id: string | null;
  shift_type: string;
  checklist_type: string;
  facility_scope: string;
  scheduled_time: string | null;
  checklist_group: string;
  evidence_type: string;
  deadline_time: string | null;
}

function Editor({ template, items, roles, departments, onUpdate, onDelete, onAddItem, onUpdateItem, onDeleteItem }: {
  template: ChecklistTemplate;
  items: ChecklistItem[];
  roles: RoleRef[];
  departments: Department[];
  onUpdate: (patch: Partial<ChecklistTemplate>) => void;
  onDelete: () => void;
  onAddItem: (c: string) => void;
  onUpdateItem: (item: ChecklistItem, patch: Partial<ChecklistItem>) => void;
  onDeleteItem: (item: ChecklistItem) => void;
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
        <div className="flex-1">
          <div className="font-bold text-lg text-slate-800">{template.name || template.role_label}</div>
          <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-2">
            <span>Khối {template.block_id}</span>
            {template.checklist_type && CHECKLIST_TYPE_LABEL[template.checklist_type] && (
              <span className={`px-1.5 py-0.5 rounded ${CHECKLIST_TYPE_LABEL[template.checklist_type].cls}`}>
                {CHECKLIST_TYPE_LABEL[template.checklist_type].label}
              </span>
            )}
            {template.scheduled_time && <span>▶ {template.scheduled_time.slice(0,5)}</span>}
            <span>Áp dụng: {template.facility_scope === 'all' ? 'Toàn hệ thống' : 'Cơ sở cụ thể'}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onUpdate({ active: !template.active })}
            className={`px-3 py-1.5 text-xs rounded border ${
              template.active
                ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
            }`}>
            {template.active ? 'Tạm tắt' : 'Bật lại'}
          </button>
          <button onClick={onDelete}
            className="px-3 py-1.5 text-xs rounded border bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100">
            <Trash2 size={14} className="inline" /> Xoá
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <Field label="Tên mẫu">
          <input type="text" defaultValue={template.name || ''}
            onBlur={e => e.target.value !== (template.name || '') && onUpdate({ name: e.target.value || null })}
            placeholder="VD: Lễ tân — Đầu ca sáng"
            className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400" />
        </Field>
        <Field label="Loại checklist">
          <select value={template.checklist_type || 'custom'}
            onChange={e => onUpdate({ checklist_type: e.target.value })}
            className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400">
            {CHECKLIST_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Phạm vi cơ sở">
          <select value={template.facility_scope || 'all'}
            onChange={e => onUpdate({ facility_scope: e.target.value })}
            className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400">
            <option value="all">Toàn hệ thống</option>
            <option value="specific">Cơ sở cụ thể</option>
          </select>
        </Field>
        <Field label="Phòng/bộ phận">
          <select value={template.department_id || ''}
            onChange={e => onUpdate({ department_id: e.target.value || null })}
            className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400">
            <option value="">— Không gắn phòng —</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Ca làm việc">
          <select value={template.shift_type || 'allday'}
            onChange={e => onUpdate({ shift_type: e.target.value })}
            className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400">
            {SHIFT_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Giờ thực hiện">
          <input type="time" defaultValue={template.scheduled_time?.slice(0,5) || ''}
            onBlur={e => e.target.value !== (template.scheduled_time?.slice(0,5) || '') && onUpdate({ scheduled_time: e.target.value || null })}
            className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400" />
        </Field>
        <Field label="Hạn nộp (giờ)">
          <input type="time" defaultValue={template.deadline_time?.slice(0,5) || ''}
            onBlur={e => e.target.value !== (template.deadline_time?.slice(0,5) || '') && onUpdate({ deadline_time: e.target.value || null })}
            className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400" />
        </Field>
        <Field label="Nhóm checklist">
          <input type="text" defaultValue={template.checklist_group || ''}
            onBlur={e => e.target.value !== (template.checklist_group || '') && onUpdate({ checklist_group: e.target.value || null })}
            placeholder="VD: An toàn / Vận hành / Bàn giao"
            className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400" />
        </Field>
        <Field label="Loại bằng chứng">
          <select value={template.evidence_type || 'none'}
            onChange={e => onUpdate({ evidence_type: e.target.value })}
            className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400">
            {EVIDENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Người duyệt (vai trò)">
          <select value={template.reviewer_role_code || ''}
            onChange={e => onUpdate({ reviewer_role_code: e.target.value || null })}
            className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400">
            <option value="">— Không cần duyệt —</option>
            {roles.filter(r => r.tier <= 5).map(r =>
              <option key={r.code} value={r.code}>{r.name}</option>)}
          </select>
        </Field>
      </div>

      <div className="text-xs font-semibold text-slate-600 mb-2">Các ý kiểm tra ({items.length}) · đề xuất 5-8 ý</div>
      <div className="space-y-1">
        {items.length === 0 ? (
          <div className="text-sm text-slate-400 italic py-4 text-center bg-slate-50 rounded">Chưa có ý.</div>
        ) : items.map((item, idx) => (
          <ItemRow key={item.id} item={item} index={idx + 1}
            onUpdateContent={(c) => onUpdateItem(item, { content: c })}
            onToggleRequiresFile={() => onUpdateItem(item, { requires_file: !item.requires_file })}
            onToggleRequired={() => onUpdateItem(item, { is_required: !item.is_required })}
            onToggleRequiresNote={() => onUpdateItem(item, { requires_note: !item.requires_note })}
            onDelete={() => onDeleteItem(item)} />
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <input type="text" value={newItem}
          onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Thêm ý mới…"
          className="flex-1 px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400" />
        <button onClick={handleAdd} disabled={!newItem.trim()}
          className="px-4 py-2 bg-slate-800 text-white text-sm rounded hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed">
          <Plus size={14} className="inline" /> Thêm
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

function ItemRow({ item, index, onUpdateContent, onToggleRequiresFile, onToggleRequired, onToggleRequiresNote, onDelete }: {
  item: ChecklistItem;
  index: number;
  onUpdateContent: (c: string) => void;
  onToggleRequiresFile: () => void;
  onToggleRequired: () => void;
  onToggleRequiresNote: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.content);

  function save() {
    const t = draft.trim();
    if (t && t !== item.content) onUpdateContent(t);
    setEditing(false);
  }

  return (
    <div className="flex items-center gap-2 p-2 rounded border border-slate-100 hover:bg-slate-50 group">
      <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-xs flex items-center justify-center font-semibold flex-shrink-0">{index}</div>
      {editing ? (
        <>
          <input type="text" value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' ? save() : e.key === 'Escape' && setEditing(false)}
            autoFocus
            className="flex-1 px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:border-slate-500" />
          <button onClick={save} className="text-emerald-600 hover:text-emerald-800"><Save size={16} /></button>
          <button onClick={() => { setDraft(item.content); setEditing(false); }} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </>
      ) : (
        <>
          <div className="flex-1 text-sm text-slate-700 cursor-pointer" onClick={() => setEditing(true)}>
            {item.content}
            <span className="ml-2 inline-flex gap-1 flex-wrap">
              {item.is_required && <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">Bắt buộc</span>}
              {item.requires_file && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                  <Paperclip size={10} className="inline" /> Cần file
                </span>
              )}
              {item.requires_note && <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800">Cần ghi chú</span>}
            </span>
          </div>
          <button onClick={onToggleRequired}
            className={`p-1 rounded ${item.is_required ? 'text-rose-600 bg-rose-50' : 'text-slate-300 hover:text-rose-500'}`}
            title={item.is_required ? 'Bỏ bắt buộc' : 'Đặt bắt buộc'}>
            <AlertCircle size={14} />
          </button>
          <button onClick={onToggleRequiresFile}
            className={`p-1 rounded ${item.requires_file ? 'text-amber-600 bg-amber-50' : 'text-slate-300 hover:text-amber-500'}`}
            title={item.requires_file ? 'Bỏ yêu cầu file' : 'Yêu cầu file/ảnh'}>
            <Paperclip size={14} />
          </button>
          <button onClick={onToggleRequiresNote}
            className={`p-1 rounded ${item.requires_note ? 'text-indigo-600 bg-indigo-50' : 'text-slate-300 hover:text-indigo-500'}`}
            title={item.requires_note ? 'Bỏ yêu cầu ghi chú' : 'Yêu cầu ghi chú'}>
            <MessageSquare size={14} />
          </button>
          <button onClick={onDelete}
            className="text-slate-300 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition">
            <Trash2 size={16} />
          </button>
        </>
      )}
    </div>
  );
}

function CreateModal({ roles, departments, onCancel, onCreate }: {
  roles: RoleRef[];
  departments: Department[];
  onCancel: () => void;
  onCreate: (p: TemplatePayload) => void;
}) {
  const [name, setName] = useState('');
  const [assignedRoleCode, setAssignedRoleCode] = useState(roles[0]?.code || '');
  const [reviewerRoleCode, setReviewerRoleCode] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [checklistType, setChecklistType] = useState('opening');
  const [shiftType, setShiftType] = useState('morning');
  const [facilityScope, setFacilityScope] = useState('all');
  const [group, setGroup] = useState('');
  const [evidenceType, setEvidenceType] = useState('none');
  const [scheduledTime, setScheduledTime] = useState('');
  const [deadlineTime, setDeadlineTime] = useState('');

  function submit() {
    if (!assignedRoleCode) return;
    onCreate({
      name: name.trim(),
      assigned_role_code: assignedRoleCode,
      reviewer_role_code: reviewerRoleCode || null,
      department_id: departmentId || null,
      shift_type: shiftType,
      checklist_type: checklistType,
      facility_scope: facilityScope,
      checklist_group: group,
      evidence_type: evidenceType,
      scheduled_time: scheduledTime || null,
      deadline_time: deadlineTime || null,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b flex items-center justify-between">
          <div className="font-bold text-lg text-slate-800">Tạo template checklist</div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Tên mẫu *">
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="VD: Lễ tân — Đầu ca sáng"
              className="w-full px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400" />
          </Field>
          <Field label="Loại checklist *">
            <select value={checklistType} onChange={e => setChecklistType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400">
              {CHECKLIST_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Áp dụng cho vai trò *">
            <select value={assignedRoleCode} onChange={e => setAssignedRoleCode(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400">
              {roles.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="Người duyệt (cấp trên)">
            <select value={reviewerRoleCode} onChange={e => setReviewerRoleCode(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400">
              <option value="">— Không cần duyệt —</option>
              {roles.filter(r => r.tier <= 5).map(r =>
                <option key={r.code} value={r.code}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="Phạm vi cơ sở">
            <select value={facilityScope} onChange={e => setFacilityScope(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400">
              <option value="all">Toàn hệ thống</option>
              <option value="specific">Cơ sở cụ thể</option>
            </select>
          </Field>
          <Field label="Phòng/bộ phận">
            <select value={departmentId} onChange={e => setDepartmentId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400">
              <option value="">— Không gắn phòng —</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Ca làm việc">
            <select value={shiftType} onChange={e => setShiftType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400">
              {SHIFT_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Giờ thực hiện">
            <input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400" />
          </Field>
          <Field label="Hạn nộp (giờ)">
            <input type="time" value={deadlineTime} onChange={e => setDeadlineTime(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400" />
          </Field>
          <Field label="Nhóm checklist">
            <input type="text" value={group} onChange={e => setGroup(e.target.value)}
              placeholder="An toàn / Vận hành / Bàn giao…"
              className="w-full px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400" />
          </Field>
          <Field label="Loại bằng chứng mặc định">
            <select value={evidenceType} onChange={e => setEvidenceType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400">
              {EVIDENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
        </div>
        <div className="p-5 border-t flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded border border-slate-200 hover:bg-slate-50">Huỷ</button>
          <button onClick={submit} disabled={!assignedRoleCode}
            className="px-4 py-2 bg-slate-800 text-white text-sm rounded hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed">
            Tạo template
          </button>
        </div>
      </div>
    </div>
  );
}
