'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronDown, ChevronRight, Settings, ClipboardList, Clock4,
  AlertCircle, CheckCircle2, XCircle, History, FileText,
} from 'lucide-react';
import { canSeeAllFacilities, isTP } from '@/lib/permissions';
import { checklistApi } from '@/lib/services/checklist/api-client';
import { DetailModal } from './DetailModal';
import {
  STATUS_LABEL, SHIFT_LABEL, CHECKLIST_TYPE_LABEL,
  FACILITY_ORDER, SHIFT_ORDER, CHECKLIST_TYPE_ORDER,
  normalizeGroupKey, groupLabelByKey, groupOrderByKey,
  computeStats, applyFilter, EMPTY_FILTER, formatVNDate,
  canApproveAny, canManageTemplates, canViewStats, canTickInstance,
  getChecklistDisplayName, getShiftDisplay, getOperatorLabel, getGroupDisplay,
  getAuditActionMeta,
  type Facility, type Department,
  type ChecklistInstance, type ChecklistInstanceItem,
  type FilterState, type DashboardStats, type CardData, type RoleRef,
  type AuditLogRow,
} from './helpers';

interface Props {
  date: string;
  userId: string;
  userName: string;
  userRole: string;
  userFacility: string | null;
  userDepartment: string | null;
  userShift: string | null;
  isSharedShift: boolean;
  facilities: Facility[];
  roles: RoleRef[];
  departments: Department[];
  initialCards: CardData[];
  initialError: string | null;
}

export function ChecklistClient(props: Props) {
  const {
    date, userId, userName, userRole, userFacility, userDepartment, userShift, isSharedShift,
    facilities, departments, roles,
    initialCards, initialError,
  } = props;

  // Tên vai trò để ghi vào audit log
  const userRoleName = useMemo(
    () => roles.find(r => r.code === userRole)?.name || userRole,
    [roles, userRole]
  );

  const router = useRouter();
  const [data, setData] = useState<CardData[]>(initialCards);
  const [error] = useState<string | null>(initialError);

  // Filter local (không gồm date — date là URL param)
  const [filter, setFilter] = useState<FilterState>({ ...EMPTY_FILTER, date });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  // Audit log của instance đang chọn (fetch khi selectedId đổi)
  const [auditLogs, setAuditLogs] = useState<Record<string, AuditLogRow[]>>({});
  // Mặc định mở tất cả facility ở cấp 1
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    initialCards.forEach(c => { if (c.instance.facility_id) s.add(c.instance.facility_id); });
    return s;
  });

  // Danh sách cơ sở để hiển thị trong FilterBar — scope theo role:
  //   • CEO / GĐ / GĐ_VP: thấy tất cả 5
  //   • TP / TIBAN_TT (chuyên môn HQ): thấy tất cả 5 cross-facility
  //   • Ai có facility_id (QLCS, TT, GV, NV...): chỉ cơ sở của mình
  const visibleFacilities = useMemo(() => {
    if (canSeeAllFacilities(userRole) || isTP(userRole)) return facilities;
    if (userFacility) return facilities.filter(f => f.id === userFacility);
    return facilities;
  }, [facilities, userRole, userFacility]);

  const facilityById = useMemo(() => {
    const m: Record<string, Facility> = {};
    facilities.forEach(f => { m[f.id] = f; });
    return m;
  }, [facilities]);

  const departmentById = useMemo(() => {
    const m: Record<string, Department> = {};
    departments.forEach(d => { m[d.id] = d; });
    return m;
  }, [departments]);

  // Khi đổi ngày trong filter → navigate (server re-fetch với scope mới)
  function changeDate(newDate: string) {
    if (newDate === date) return;
    setFilter(prev => ({ ...prev, date: newDate }));
    router.push(`/checklist?date=${encodeURIComponent(newDate)}`);
  }

  // Fetch audit log mỗi khi user chọn 1 instance khác / sau khi modal đóng (data đã đổi)
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    checklistApi.listAudit(selectedId)
      .then((rows) => {
        if (cancelled) return;
        setAuditLogs(prev => ({ ...prev, [selectedId]: rows as unknown as AuditLogRow[] }));
      })
      .catch((e) => {
        if (!cancelled) console.warn('[audit] fetch:', e.message);
      });
    return () => { cancelled = true; };
  }, [selectedId, modalOpen]);

  // Filtered cards (client-side filter sau khi RLS)
  const filteredCards = useMemo(
    () => {
      const insts = applyFilter(data.map(c => c.instance), filter);
      const idsAllowed = new Set(insts.map(i => i.id));
      return data.filter(c => idsAllowed.has(c.instance.id));
    },
    [data, filter]
  );

  const stats: DashboardStats = useMemo(
    () => computeStats(filteredCards.map(c => c.instance)),
    [filteredCards]
  );

  const tree = useMemo(() => buildTree(filteredCards, facilityById, departmentById), [filteredCards, facilityById, departmentById]);

  const selected = useMemo(
    () => filteredCards.find(c => c.instance.id === selectedId) || null,
    [filteredCards, selectedId]
  );

  function toggleExpand(key: string) {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  }

  function handleCardUpdate(next: { instance: ChecklistInstance; items: ChecklistInstanceItem[] }) {
    setData(prev => prev.map(c =>
      c.instance.id === next.instance.id
        ? { ...c, instance: next.instance, items: next.items }
        : c
    ));
  }

  // Show stats nếu role không phải shared_shift (per spec mục V.5)
  const showStats = !isSharedShift && canViewStats(userRole);

  return (
    <div className="space-y-4">
      {/* Top action bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-slate-500">
          Cập nhật: {formatVNDate(new Date().toISOString())} ·
          {' '}
          {filteredCards.length}/{data.length} checklist hiển thị
        </div>
        {canManageTemplates(userRole) && (
          <Link href="/checklist/templates"
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-white">
            <Settings size={14} /> Cấu hình mẫu
          </Link>
        )}
      </div>

      {/* Stats */}
      {showStats && <StatsCards stats={stats} />}

      {/* Filter */}
      <FilterBar filter={filter} setFilter={setFilter} onDateChange={changeDate}
        facilities={visibleFacilities} departments={departments}
        isSharedShift={isSharedShift} userFacility={userFacility} userDepartment={userDepartment} />

      {/* Error */}
      {error && (
        <div className="card text-rose-700 bg-rose-50 border border-rose-200 text-sm">{error}</div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ChecklistTree tree={tree}
            expanded={expanded} onToggle={toggleExpand}
            selectedId={selectedId} onSelect={setSelectedId} />
        </div>
        <div className="lg:col-span-1">
          <DetailPanel selected={selected}
            facility={selected?.instance.facility_id ? facilityById[selected.instance.facility_id] : undefined}
            department={selected?.instance.department_id ? departmentById[selected.instance.department_id] : undefined}
            auditLog={selectedId ? auditLogs[selectedId] : undefined}
            onOpenDetail={() => setModalOpen(true)} />
        </div>
      </div>

      {/* Detail modal */}
      {modalOpen && selected && (
        <DetailModal
          instance={selected.instance}
          template={selected.template}
          items={selected.items}
          userId={userId}
          userName={userName}
          userRoleName={userRoleName}
          facility={selected.instance.facility_id ? facilityById[selected.instance.facility_id] : undefined}
          department={selected.instance.department_id ? departmentById[selected.instance.department_id] : undefined}
          canSubmit={canTickInstance({
            status:         selected.instance.status,
            facility_id:    selected.instance.facility_id,
            department_id:  selected.instance.department_id,
            shift_type:     selected.instance.shift_type,
            assigned_to:    selected.instance.assigned_to,
            userId, userRole, userFacility, userDepartment, userShift,
            isSharedShift,
          })}
          canApprove={selected.instance.reviewer_id === userId || canApproveAny(userRole)}
          onClose={() => setModalOpen(false)}
          onUpdate={handleCardUpdate}
        />
      )}
    </div>
  );
}

// ============================================================
// Stats — 6 cards
// ============================================================

function StatsCards({ stats }: { stats: DashboardStats }) {
  const cards: Array<{ key: keyof DashboardStats; label: string; icon: React.ReactNode; cls: string }> = [
    { key: 'total',    label: 'Tổng checklist hôm nay', icon: <ClipboardList size={20} />,   cls: 'from-slate-700 to-slate-800 text-white' },
    { key: 'todo',     label: 'Cần làm',                icon: <FileText size={20} />,        cls: 'bg-amber-50 text-amber-900 border-amber-200' },
    { key: 'awaiting', label: 'Chờ duyệt',              icon: <Clock4 size={20} />,          cls: 'bg-blue-50 text-blue-900 border-blue-200' },
    { key: 'approved', label: 'Đã duyệt',               icon: <CheckCircle2 size={20} />,    cls: 'bg-emerald-50 text-emerald-900 border-emerald-200' },
    { key: 'failed',   label: 'Không đạt',              icon: <XCircle size={20} />,         cls: 'bg-rose-50 text-rose-900 border-rose-200' },
    { key: 'overdue',  label: 'Quá hạn',                icon: <AlertCircle size={20} />,     cls: 'bg-red-50 text-red-900 border-red-200' },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map(c => {
        const isHero = c.key === 'total';
        return (
          <div key={c.key}
            className={`rounded-xl p-3 ${isHero ? `bg-gradient-to-br ${c.cls}` : `border ${c.cls}`}`}>
            <div className={`flex items-center gap-2 text-xs ${isHero ? 'opacity-80' : ''}`}>
              {c.icon} {c.label}
            </div>
            <div className="text-3xl font-bold mt-1 leading-none">{stats[c.key]}</div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Filter bar
// ============================================================

interface FilterBarProps {
  filter: FilterState;
  setFilter: (f: FilterState) => void;
  onDateChange: (newDate: string) => void;
  facilities: Facility[];
  departments: Department[];
  isSharedShift: boolean;
  userFacility: string | null;
  userDepartment: string | null;
}

function FilterBar({ filter, setFilter, onDateChange, facilities, departments, isSharedShift, userFacility, userDepartment }: FilterBarProps) {
  // Sort facility theo nghiệp vụ
  const orderedFacilities = useMemo(() =>
    [...facilities].sort((a, b) =>
      (FACILITY_ORDER[a.id] || 99) - (FACILITY_ORDER[b.id] || 99)
    ),
    [facilities]
  );

  // Shared shift: lock filter facility/department theo profile
  const facilityLocked = isSharedShift && !!userFacility;
  const departmentLocked = isSharedShift && !!userDepartment;

  function update<K extends keyof FilterState>(k: K, v: FilterState[K]) {
    setFilter({ ...filter, [k]: v });
  }
  function reset() {
    setFilter({
      ...EMPTY_FILTER,
      date: filter.date, // giữ ngày
      facility: facilityLocked ? userFacility! : '',
      department: departmentLocked ? userDepartment! : '',
    });
  }

  return (
    <div className="card">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2 items-end">
        <SelectField label="Cơ sở" value={filter.facility} disabled={facilityLocked}
          onChange={v => update('facility', v)}
          options={[{ value: '', label: 'Tất cả' }, ...orderedFacilities.map(f => ({ value: f.id, label: f.name }))]} />

        <SelectField label="Bộ phận" value={filter.department} disabled={departmentLocked}
          onChange={v => update('department', v)}
          options={[{ value: '', label: 'Tất cả' }, ...departments.map(d => ({ value: d.id, label: d.name }))]} />

        <SelectField label="Ca/Chu kỳ" value={filter.shift} onChange={v => update('shift', v)}
          options={[
            { value: '', label: 'Tất cả' },
            { value: 'morning', label: 'Ca sáng' },
            { value: 'afternoon', label: 'Ca chiều' },
            { value: 'evening', label: 'Ca tối' },
            { value: 'night', label: 'Ca đêm' },
            { value: 'allday', label: 'Cả ngày' },
          ]} />

        <SelectField label="Loại checklist" value={filter.checklistType}
          onChange={v => update('checklistType', v)}
          options={[
            { value: '', label: 'Tất cả' },
            { value: 'opening', label: '🌅 Đầu ca' },
            { value: 'handover', label: '🔄 Giao ca' },
            { value: 'closing', label: '🌙 Cuối ca' },
            { value: 'incident', label: '⚠️ Sự cố' },
            { value: 'custom', label: '📋 Tuỳ chỉnh' },
          ]} />

        <SelectField label="Trạng thái" value={filter.status} onChange={v => update('status', v)}
          options={[
            { value: '', label: 'Tất cả' },
            { value: 'pending', label: 'Chưa làm' },
            { value: 'in_progress', label: 'Đang làm' },
            { value: 'submitted', label: 'Chờ duyệt' },
            { value: 'approved', label: 'Đã duyệt' },
            { value: 'rejected', label: 'Làm lại' },
            { value: 'overdue', label: 'Quá hạn' },
            { value: 'failed', label: 'Không đạt' },
          ]} />

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Ngày</label>
          <input type="date" value={filter.date}
            onChange={e => onDateChange(e.target.value)}
            className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm" />
        </div>

        <button onClick={reset}
          className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
          ↺ Đặt lại
        </button>
      </div>
    </div>
  );
}

function SelectField({ label, value, options, onChange, disabled }: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
        className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm disabled:bg-slate-100">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ============================================================
// Tree
// ============================================================

interface TreeRow {
  card: CardData;
}
interface TreeShift {
  key: string;       // shift_type
  label: string;     // "Ca sáng"
  order: number;
  rows: TreeRow[];
}
interface TreeGroup {
  key: string;       // normalized group key
  label: string;     // "Lễ tân", ...
  order: number;
  shifts: TreeShift[];
  count: number;
}
interface TreeFacility {
  id: string;
  label: string;
  order: number;
  groups: TreeGroup[];
  count: number;
}

function buildTree(
  cards: CardData[],
  facilityById: Record<string, Facility>,
  departmentById: Record<string, Department>,
): TreeFacility[] {
  const byFacility: Record<string, TreeFacility> = {};

  for (const c of cards) {
    const fid = c.instance.facility_id || '_no_facility';
    const fname = c.instance.facility_name || facilityById[fid]?.name || (fid === '_no_facility' ? 'Chưa gán cơ sở' : fid);
    const facility = (byFacility[fid] ||= {
      id: fid,
      label: fname,
      order: FACILITY_ORDER[fid] || 99,
      groups: [],
      count: 0,
    });

    const department = c.instance.department_id ? departmentById[c.instance.department_id] : null;
    const groupKey = department
      ? `D:${department.id}`
      : `G:${normalizeGroupKey(c.instance.checklist_group || c.template.checklist_group)}`;
    const groupLabel = department
      ? department.name
      : groupLabelByKey(normalizeGroupKey(c.instance.checklist_group || c.template.checklist_group));
    const groupOrder = department ? 0 : groupOrderByKey(normalizeGroupKey(c.instance.checklist_group || c.template.checklist_group));

    let group = facility.groups.find(g => g.key === groupKey);
    // If we're about to create a generic group (G:...), try to merge it
    // with an existing department group that has the same label to avoid duplicates
    if (!group && groupKey.startsWith('G:')) {
      const existingDept = facility.groups.find(g => g.key.startsWith('D:') && g.label === groupLabel);
      if (existingDept) group = existingDept;
    }

    if (!group) {
      group = {
        key: groupKey,
        label: groupLabel,
        order: groupOrder,
        shifts: [],
        count: 0,
      };
      facility.groups.push(group);
    }

    const shiftType = c.instance.shift_type || 'allday';
    let shift = group.shifts.find(s => s.key === shiftType);
    if (!shift) {
      shift = {
        key: shiftType,
        label: getShiftDisplay(shiftType, group.key),
        order: SHIFT_ORDER[shiftType] || 99,
        rows: [],
      };
      group.shifts.push(shift);
    }

    shift.rows.push({ card: c });
    group.count++;
    facility.count++;

    // Tránh "unused" warning
    void departmentById;
  }

  // Sort tất cả các cấp
  const out = Object.values(byFacility).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  for (const fac of out) {
    fac.groups.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
    for (const g of fac.groups) {
      g.shifts.sort((a, b) => a.order - b.order);
      for (const s of g.shifts) {
        s.rows.sort((a, b) => {
          const ta = CHECKLIST_TYPE_ORDER[a.card.instance.checklist_type || 'custom'] || 99;
          const tb = CHECKLIST_TYPE_ORDER[b.card.instance.checklist_type || 'custom'] || 99;
          if (ta !== tb) return ta - tb;
          const sa = a.card.instance.scheduled_at || '';
          const sb = b.card.instance.scheduled_at || '';
          return sa.localeCompare(sb);
        });
      }
    }
  }
  return out;
}

interface TreeProps {
  tree: TreeFacility[];
  expanded: Set<string>;
  onToggle: (key: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function ChecklistTree({ tree, expanded, onToggle, selectedId, onSelect }: TreeProps) {
  if (tree.length === 0) {
    return (
      <div className="card text-center py-12">
        <div className="text-4xl mb-3">📋</div>
        <div className="font-bold text-slate-800 mb-1">Không có checklist khớp bộ lọc</div>
        <div className="text-sm text-slate-500">Đổi ngày hoặc đặt lại bộ lọc.</div>
      </div>
    );
  }
  return (
    <div className="card p-0 overflow-hidden">
      {/* Header row */}
      <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-600 border-b">
        <div className="col-span-4">Checklist</div>
        <div className="col-span-1 text-center">Giờ</div>
        <div className="col-span-1 text-center">Hạn</div>
        <div className="col-span-2">Người thực hiện</div>
        <div className="col-span-2">Tiến độ</div>
        <div className="col-span-2 text-right pr-2">Trạng thái</div>
      </div>

      <div className="divide-y">
        {tree.map(fac => (
          <FacilityNode key={fac.id} fac={fac}
            expanded={expanded} onToggle={onToggle}
            selectedId={selectedId} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function FacilityNode({ fac, expanded, onToggle, selectedId, onSelect }: {
  fac: TreeFacility;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const key = fac.id;
  const isOpen = expanded.has(key);
  return (
    <div>
      <button onClick={() => onToggle(key)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-slate-50 hover:bg-slate-100 text-left">
        <div className="flex items-center gap-2">
          {isOpen ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronRight size={16} className="text-slate-500" />}
          <span className="font-bold text-slate-800 text-sm">📍 {fac.label}</span>
        </div>
        <span className="text-xs text-slate-500">{fac.count} checklist</span>
      </button>
      {isOpen && (
        <div>
          {fac.groups.map(g => (
            <GroupNode key={g.key} facId={fac.id} group={g}
              expanded={expanded} onToggle={onToggle}
              selectedId={selectedId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function GroupNode({ facId, group, expanded, onToggle, selectedId, onSelect }: {
  facId: string;
  group: TreeGroup;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const key = `${facId}|${group.key}`;
  const isOpen = expanded.has(key);
  return (
    <div className="border-t border-slate-100">
      <button onClick={() => onToggle(key)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 pl-7 hover:bg-slate-50 text-left">
        <div className="flex items-center gap-2">
          {isOpen ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
          <span className="font-semibold text-slate-700 text-sm">{group.label}</span>
        </div>
        <span className="text-xs text-slate-400">{group.count}</span>
      </button>
      {isOpen && (
        <div>
          {group.shifts.map(s => (
            <ShiftNode key={s.key} facId={facId} groupKey={group.key} shift={s}
              expanded={expanded} onToggle={onToggle}
              selectedId={selectedId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function ShiftNode({ facId, groupKey, shift, expanded, onToggle, selectedId, onSelect }: {
  facId: string;
  groupKey: string;
  shift: TreeShift;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const key = `${facId}|${groupKey}|${shift.key}`;
  const isOpen = expanded.has(key) || true; // Mở mặc định ở cấp ca
  return (
    <div className="border-t border-slate-100">
      <button onClick={() => onToggle(key)}
        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 pl-12 hover:bg-slate-50 text-left">
        <div className="flex items-center gap-2">
          {isOpen ? <ChevronDown size={12} className="text-slate-400" /> : <ChevronRight size={12} className="text-slate-400" />}
          <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">{shift.label}</span>
        </div>
        <span className="text-[10px] text-slate-400">{shift.rows.length}</span>
      </button>
      {isOpen && (
        <div>
          {shift.rows.map(row => (
            <RowItem key={row.card.instance.id} card={row.card}
              selected={selectedId === row.card.instance.id} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function RowItem({ card, selected, onSelect }: {
  card: CardData;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const inst = card.instance;
  const t = card.template;
  const s = STATUS_LABEL[inst.status];
  const totalItems = card.items.length;
  const checkedCount = card.items.filter(i => i.is_checked).length;
  const displayName = getChecklistDisplayName({
    checklist_group: inst.checklist_group ?? t.checklist_group,
    checklist_type:  inst.checklist_type,
    shift_type:      inst.shift_type,
    template_name:   t.name,
    role_label:      t.role_label,
  });
  const operator = getOperatorLabel({
    actual_operator_name:  inst.actual_operator_name,
    assigned_display_name: inst.assigned_display_name,
    checklist_group:       inst.checklist_group ?? t.checklist_group,
  });

  return (
    <button onClick={() => onSelect(inst.id)}
      className={`w-full grid grid-cols-12 gap-2 px-3 py-2 pl-16 text-left text-sm transition border-l-4
        ${selected ? 'bg-blue-50 border-l-blue-500' : 'border-l-transparent hover:bg-slate-50'}`}>
      <div className="col-span-4 min-w-0">
        <div className="font-medium text-slate-800 truncate" title={displayName}>
          {displayName}
        </div>
      </div>
      <div className="col-span-1 text-center text-xs text-slate-600">
        {t.scheduled_time ? t.scheduled_time.slice(0,5) : '—'}
      </div>
      <div className="col-span-1 text-center text-xs text-slate-600">
        {t.deadline_time ? t.deadline_time.slice(0,5) : '—'}
      </div>
      <div className="col-span-2 text-xs text-slate-700 truncate" title={operator}>{operator}</div>
      <div className="col-span-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all"
              style={{ width: `${totalItems > 0 ? (checkedCount/totalItems)*100 : 0}%` }} />
          </div>
          <div className="text-xs text-slate-700 w-9 text-right tabular-nums">{checkedCount}/{totalItems}</div>
        </div>
      </div>
      <div className="col-span-2 text-right">
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${s.cls}`}>{s.label}</span>
      </div>
    </button>
  );
}

// ============================================================
// Detail panel (right column)
// ============================================================

interface PanelProps {
  selected: CardData | null;
  facility?: Facility;
  department?: Department;
  auditLog?: AuditLogRow[];
  onOpenDetail: () => void;
}

function DetailPanel({ selected, facility, department, auditLog, onOpenDetail }: PanelProps) {
  if (!selected) {
    return (
      <div className="card text-center py-16 text-slate-500 text-sm">
        <History size={28} className="mx-auto mb-2 text-slate-300" />
        Chọn một checklist trong cây để xem chi tiết.
      </div>
    );
  }
  const inst = selected.instance;
  const t = selected.template;
  const s = STATUS_LABEL[inst.status];
  const totalItems = selected.items.length;
  const checkedCount = selected.items.filter(i => i.is_checked).length;
  const displayName = getChecklistDisplayName({
    checklist_group: inst.checklist_group ?? t.checklist_group,
    checklist_type:  inst.checklist_type,
    shift_type:      inst.shift_type,
    template_name:   t.name,
    role_label:      t.role_label,
  });
  const groupDisplay = getGroupDisplay(inst.checklist_group ?? t.checklist_group);
  const shiftDisplay = getShiftDisplay(inst.shift_type, inst.checklist_group ?? t.checklist_group);
  const operatorAccount = getOperatorLabel({
    actual_operator_name:  null, // tài khoản gán — không lấy operator thực tế ở đây
    assigned_display_name: inst.assigned_display_name,
    checklist_group:       inst.checklist_group ?? t.checklist_group,
  });

  return (
    <div className="card space-y-3 sticky top-0">
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${s.cls}`}>{s.label}</span>
          <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
            {groupDisplay}
          </span>
        </div>
        <div className="font-bold text-slate-800 text-lg leading-tight">
          {displayName}
        </div>
      </div>

      <div className="text-xs text-slate-700 space-y-1.5">
        <Row k="Cơ sở"            v={inst.facility_name || facility?.name || '—'} />
        <Row k="Bộ phận"          v={inst.department_name || department?.name || groupDisplay} />
        <Row k="Ca/Chu kỳ"        v={shiftDisplay} />
        <Row k="Nhóm"             v={groupDisplay} />
        <Row k="Giờ thực hiện"    v={t.scheduled_time ? t.scheduled_time.slice(0,5) : '—'} />
        <Row k="Hạn nộp"          v={t.deadline_time ? t.deadline_time.slice(0,5) : '—'} />
        <Row k="Tài khoản gán"    v={operatorAccount} />
        <Row k="Người thực hiện"  v={inst.actual_operator_name || '— (chưa nhập)'} />
        <Row k="Chức vụ"          v={inst.actual_operator_role || '— (chưa nhập)'} />
        <Row k="Người duyệt"      v={inst.reviewer_name ? `${inst.reviewer_name}${inst.reviewer_role ? ` (${inst.reviewer_role})` : ''}` : '—'} />
        {(inst.functional_reviewer_name || inst.functional_reviewer_role) && (
          <Row k="Theo dõi chuyên môn" v={`${inst.functional_reviewer_name || ''}${inst.functional_reviewer_role ? ` (${inst.functional_reviewer_role})` : ''}`} />
        )}
        <Row k="Tiến độ"          v={`${checkedCount}/${totalItems}`} />
        {inst.submitted_at && <Row k="Nộp lúc"  v={formatVNDate(inst.submitted_at)} />}
        {inst.approved_at  && <Row k="Duyệt lúc" v={formatVNDate(inst.approved_at)} />}
      </div>

      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 transition-all"
          style={{ width: `${totalItems > 0 ? (checkedCount/totalItems)*100 : 0}%` }} />
      </div>

      {inst.general_note && (
        <div className="text-xs p-2 bg-slate-50 border border-slate-200 rounded">
          <div className="font-semibold text-slate-600 mb-0.5">Ghi chú chung</div>
          <div className="text-slate-700 whitespace-pre-wrap">{inst.general_note}</div>
        </div>
      )}
      {inst.incident_report && (
        <div className="text-xs p-2 bg-amber-50 border border-amber-200 rounded">
          <div className="font-semibold text-amber-900 mb-0.5">⚠️ Sự cố</div>
          <div className="text-amber-900 whitespace-pre-wrap">{inst.incident_report}</div>
        </div>
      )}
      {inst.review_note && inst.status === 'rejected' && (
        <div className="text-xs p-2 bg-rose-50 border border-rose-200 rounded">
          <div className="font-semibold text-rose-800 mb-0.5">Lý do trả về</div>
          <div className="text-rose-800 whitespace-pre-wrap">{inst.review_note}</div>
        </div>
      )}

      <AuditTimeline auditLog={auditLog} />

      <button onClick={onOpenDetail}
        className="w-full mt-1 px-4 py-2.5 bg-slate-800 text-white text-sm font-semibold rounded-lg hover:bg-slate-700">
        🔍 Xem chi tiết checklist
      </button>

      {/* Mã nội bộ (debug). Mặc định ẩn. */}
      <details className="text-[10px] text-slate-400 mt-2">
        <summary className="cursor-pointer hover:text-slate-600 select-none">Mã nội bộ (debug)</summary>
        <div className="mt-1 font-mono break-all leading-tight space-y-0.5">
          <div>tpl: {t.name || '(no name)'}</div>
          <div>role: {t.role_label}</div>
          <div>inst: {inst.id}</div>
        </div>
      </details>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="text-slate-500 flex-shrink-0">{k}</div>
      <div className="text-slate-800 text-right break-words">{v}</div>
    </div>
  );
}

// ============================================================
// Audit timeline (Phase 5D)
// ============================================================
function AuditTimeline({ auditLog }: { auditLog?: AuditLogRow[] }) {
  // undefined = chưa fetch xong; [] = đã fetch nhưng không có log
  if (auditLog === undefined) {
    return (
      <div className="text-xs text-slate-400 italic mt-2 pt-3 border-t">
        Đang tải lịch sử…
      </div>
    );
  }
  if (auditLog.length === 0) {
    return (
      <div className="text-xs text-slate-400 italic mt-2 pt-3 border-t">
        🕒 Chưa có lịch sử xử lý
      </div>
    );
  }
  return (
    <div className="mt-2 pt-3 border-t">
      <div className="text-xs font-semibold text-slate-600 mb-2">
        🕒 Lịch sử xử lý ({auditLog.length})
      </div>
      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
        {auditLog.map(log => {
          const meta = getAuditActionMeta(log.action);
          const note = extractAuditNote(log);
          return (
            <div key={log.id} className="flex items-start gap-2 text-xs">
              <span className={`flex-shrink-0 inline-flex w-5 h-5 items-center justify-center rounded ${meta.cls}`}>
                {meta.emoji}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-800 truncate">
                  {meta.label}
                  {log.actor_name && (
                    <span className="font-normal text-slate-600"> · {log.actor_name}</span>
                  )}
                </div>
                {note && <div className="text-[11px] text-slate-600 truncate" title={note}>{note}</div>}
                <div className="text-[10px] text-slate-400">{formatVNDate(log.created_at)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Trích ghi chú ngắn từ details jsonb tùy action
function extractAuditNote(log: AuditLogRow): string {
  const d = log.details;
  if (!d) return '';
  switch (log.action) {
    case 'check_item':
    case 'uncheck_item':
      return (d.item_content as string) || '';
    case 'upload_file':
    case 'remove_file':
      return (d.file_name as string) || (d.item_content as string) || '';
    case 'reject':
      return (d.reason as string) || '';
    case 'approve':
      return (d.note as string) || '';
    case 'submit':
      return d.operator_name ? `Người thực hiện: ${d.operator_name}` : '';
    default:
      return '';
  }
}
