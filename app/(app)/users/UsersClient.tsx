'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, X, Search, UserPlus, Power, PowerOff, Edit3, Copy, RefreshCw, Eye, EyeOff, ListChecks, Shield } from 'lucide-react';
import { PermissionGrantPanel } from './PermissionGrantPanel';

interface Facility { id: string; name: string }
interface RoleRef { code: string; name: string; block_id: string | null; tier: number; dept_id?: string | null }

interface UserRow {
  id: string;
  email: string;
  created_at: string;
  full_name: string | null;
  phone: string | null;
  role_code: string | null;
  facility_id: string | null;
  is_probation: boolean;
  active: boolean;
  has_profile: boolean;
  menu_overrides: Record<string, boolean>;
}

interface DepartmentRef { id: string; name: string; block_id: string | null }

interface Props {
  currentUserId: string;
  currentUserRole: string;
  /** True khi user hiện tại là ADMIN — mở tab "Cấp quyền sử dụng". */
  isAdminUser: boolean;
  facilities: Facility[];
  roles: RoleRef[];
  departments: DepartmentRef[];
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return 'GP@' + s;
}

function rolesVisibleToCreator(creatorCode: string, creatorRole: RoleRef | undefined, all: RoleRef[]): RoleRef[] {
  if (!creatorRole) return [];
  return all.filter(r => {
    // CEO + ADMIN ở đỉnh — không bị giới hạn tier, thấy mọi role (bao gồm ADMIN, peer CEO)
    if (creatorCode === 'CEO' || creatorCode === 'ADMIN') return true;
    if (r.tier <= creatorRole.tier) return false;
    if (creatorCode === 'GD_KD') return r.block_id === 'KD';
    if (creatorCode === 'GD_VP') return r.block_id === 'VP';
    if (creatorCode.startsWith('QLCS_')) return r.block_id === 'KD';
    if (creatorCode.startsWith('TP_') || creatorCode === 'TIBAN_TT') {
      return r.dept_id === creatorRole.dept_id;
    }
    return false;
  });
}

function facilitiesVisibleToCreator(creatorCode: string, creatorFacility: string | null, all: Facility[]): Facility[] {
  if (['ADMIN','CEO','GD_KD','GD_VP'].includes(creatorCode)) return all;
  if (creatorCode.startsWith('QLCS_') && creatorFacility) return all.filter(f => f.id === creatorFacility);
  return all;
}

export function UsersClient({ currentUserId, currentUserRole, isAdminUser, facilities, roles, departments }: Props) {
  const [tab, setTab] = useState<'list' | 'permissions'>('list');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterFacility, setFilterFacility] = useState('all');
  const [filterDept, setFilterDept] = useState('all'); // Phase 13.9 (2026-06-05): filter phòng ban
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [tempPasswordShown, setTempPasswordShown] = useState<{ email: string; password: string } | null>(null);

  const creatorRole = useMemo(() => roles.find(r => r.code === currentUserRole), [roles, currentUserRole]);
  const currentUserFacility = useMemo(
    () => users.find(u => u.id === currentUserId)?.facility_id || null,
    [users, currentUserId]
  );

  const visibleRoles = useMemo(
    () => rolesVisibleToCreator(currentUserRole, creatorRole, roles),
    [currentUserRole, creatorRole, roles]
  );
  const visibleFacilities = useMemo(
    () => facilitiesVisibleToCreator(currentUserRole, currentUserFacility, facilities),
    [currentUserRole, currentUserFacility, facilities]
  );

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? 'Lỗi tải danh sách');
      setUsers((j.rows || []) as UserRow[]);
    } catch (e: any) {
      setError(e?.message ?? 'Lỗi tải danh sách');
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(u: UserRow) {
    if (u.id === currentUserId) {
      alert('Không thể tắt tài khoản của chính mình.');
      return;
    }
    const newActive = !u.active;
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(u.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newActive ? 'active' : 'inactive' }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j?.error ?? 'Lỗi cập nhật');
      }
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, active: newActive } : x));
    } catch (e: any) {
      setError(e?.message ?? 'Lỗi cập nhật');
    }
  }

  async function saveUser(payload: FormPayload, editingUid?: string): Promise<boolean> {
    setError(null);
    let res: Response;
    if (editingUid) {
      // Edit existing user → PATCH (key bằng uid, hỗ trợ đổi email an toàn)
      res = await fetch(`/api/admin/users/${encodeURIComponent(editingUid)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      // Create — vẫn dùng route cũ (tự sinh password tạm)
      res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    const result = await res.json();

    if (!res.ok) {
      setError(result.error || 'Có lỗi xảy ra.');
      return false;
    }

    if (result.temp_password) {
      setTempPasswordShown({ email: result.email, password: result.temp_password });
    }

    await load();
    return true;
  }

  // Phase 13.9 (2026-06-05): map role.code → dept_id để filter theo phòng ban
  const roleDeptMap = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const r of roles) m.set(r.code, r.dept_id ?? null);
    return m;
  }, [roles]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return users.filter(u => {
      if (s && !(u.email.toLowerCase().includes(s) || (u.full_name || '').toLowerCase().includes(s))) return false;
      if (filterRole !== 'all' && u.role_code !== filterRole) return false;
      if (filterFacility !== 'all' && u.facility_id !== filterFacility) return false;
      if (filterDept !== 'all') {
        const userDept = u.role_code ? roleDeptMap.get(u.role_code) ?? null : null;
        if (userDept !== filterDept) return false;
      }
      if (filterActive === 'active' && !u.active) return false;
      if (filterActive === 'inactive' && u.active) return false;
      return true;
    });
  }, [users, search, filterRole, filterFacility, filterDept, filterActive, roleDeptMap]);

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter(u => u.active).length,
    inactive: users.filter(u => !u.active).length,
  }), [users]);

  // ─────────── Nhóm theo 5 cấp tier ───────────
  // Tier 1-2 (CEO/GĐ) · Tier 3 (TP + QLCS) · Tier 4 (PP) · Tier 5 (Tổ trưởng) · Tier 6 (NV)
  // PR-USERS-NORMALIZE (2026-06-28): bỏ gradient + 5 màu khác nhau (amber/violet/
  // cyan/emerald/slate). Semantic màu chỉ dành cho TRẠNG THÁI nghiệp vụ, KHÔNG
  // dùng để phân biệt tier. Section header dùng bg-slate-50 đồng nhất + tier label
  // làm phân biệt thay vì màu.
  interface TierGroup { label: string; subtitle: string; minTier: number; maxTier: number }
  const TIER_GROUPS: TierGroup[] = [
    { label: 'Chủ tịch · Giám đốc & Chủ đầu tư', subtitle: 'Chủ tịch HĐQT · CEO · GĐ Khối', minTier: 1, maxTier: 2  },
    { label: 'Trưởng phòng & Quản lý',           subtitle: 'TP · QLCS',                      minTier: 3, maxTier: 3  },
    { label: 'Phó phòng',                        subtitle: 'PP',                              minTier: 4, maxTier: 4  },
    { label: 'Tổ trưởng',                        subtitle: 'TT',                              minTier: 5, maxTier: 5  },
    { label: 'Nhân viên',                        subtitle: 'NV · KTV · GV',                   minTier: 6, maxTier: 99 },
  ];

  const grouped = useMemo(() => {
    const map = new Map<number, UserRow[]>();
    for (const u of filtered) {
      const r = roles.find(r => r.code === u.role_code);
      const tier = r?.tier ?? 99;
      const groupIdx = TIER_GROUPS.findIndex(g => tier >= g.minTier && tier <= g.maxTier);
      const key = groupIdx === -1 ? TIER_GROUPS.length - 1 : groupIdx; // fallback nhân viên
      const arr = map.get(key) ?? [];
      arr.push(u);
      map.set(key, arr);
    }
    // Sort trong mỗi nhóm: CHU_TICH priority đầu (cao nhất, chủ đầu tư), sau đó tier asc rồi tên
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        // CHU_TICH luôn đầu (chủ đầu tư, quyền cao nhất)
        if (a.role_code === 'CHU_TICH' && b.role_code !== 'CHU_TICH') return -1;
        if (b.role_code === 'CHU_TICH' && a.role_code !== 'CHU_TICH') return 1;
        const ta = roles.find(r => r.code === a.role_code)?.tier ?? 99;
        const tb = roles.find(r => r.code === b.role_code)?.tier ?? 99;
        if (ta !== tb) return ta - tb;
        return (a.full_name ?? '').localeCompare(b.full_name ?? '', 'vi');
      });
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, roles]);

  return (
    <div className="space-y-4">
      {/* PR-USERS-NORMALIZE (2026-06-28): tab pill ring → underline emerald-600
          nhất quán workspace tab pattern 7 module trước. Bỏ badge "ADMIN"
          text-[10px] (vi phạm rule font ≥12) — Shield icon đã đủ semantic. */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        <TabBtn active={tab === 'list'} onClick={() => setTab('list')} icon={<ListChecks size={14} />} label="Danh sách người dùng" />
        {isAdminUser && (
          <TabBtn active={tab === 'permissions'} onClick={() => setTab('permissions')} icon={<Shield size={14} />} label="Cấp quyền sử dụng" />
        )}
      </div>

      {tab === 'permissions' && isAdminUser ? (
        <PermissionGrantPanel
          currentUserId={currentUserId}
          users={users}
          roles={roles}
          onSaved={load}
        />
      ) : (<>
      {/* PR-USERS-NORMALIZE (2026-06-28): 3 StatCard local (custom cls pastel) →
          SegmentSummary nhất quán pattern Snapshot 7 module trước. */}
      <SegmentSummary
        items={[
          { n: stats.total,    label: 'Tổng user',       tone: 'default' },
          { n: stats.active,   label: 'Đang hoạt động',  tone: 'success' },
          { n: stats.inactive, label: 'Đã tắt',          tone: 'default' },
        ]}
      />
      <div className="card">
        {/* Phase 13.16.4: mobile grid 2x2 cho select, search + button full-width riêng */}
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs font-semibold text-slate-600 mb-1">Tìm kiếm</span>
            <div className="relative">
              <Search size={14} className="absolute left-2 top-2.5 text-slate-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Tên hoặc email…"
                className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400" />
            </div>
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            <label className="block min-w-0">
              <span className="block text-xs font-semibold text-slate-600 mb-1">Vai trò</span>
              <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm">
                <option value="all">Tất cả</option>
                {roles.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
              </select>
            </label>
            <label className="block min-w-0">
              <span className="block text-xs font-semibold text-slate-600 mb-1">Cơ sở</span>
              <select value={filterFacility} onChange={e => setFilterFacility(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm">
                <option value="all">Tất cả</option>
                {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </label>
            <label className="block min-w-0">
              <span className="block text-xs font-semibold text-slate-600 mb-1">Phòng ban</span>
              <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm">
                <option value="all">Tất cả</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label className="block min-w-0">
              <span className="block text-xs font-semibold text-slate-600 mb-1">Trạng thái</span>
              <select value={filterActive} onChange={e => setFilterActive(e.target.value as typeof filterActive)}
                className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm">
                <option value="all">Tất cả</option>
                <option value="active">Đang hoạt động</option>
                <option value="inactive">Đã tắt</option>
              </select>
            </label>
          </div>
          {/* PR-USERS-NORMALIZE (2026-06-28): primary button slate-800 → emerald-600
              đồng bộ pattern primary action toàn app. */}
          <button onClick={() => setShowCreate(true)}
            className="w-full sm:w-auto sm:ml-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-md hover:bg-emerald-700 transition">
            <UserPlus size={14} /> Thêm người dùng
          </button>
        </div>
      </div>

      {error && (
        <div className="card text-rose-700 bg-rose-50 border border-rose-200">
          <div className="text-sm">{error}</div>
        </div>
      )}

      {loading ? (
        <div className="card text-center py-12 text-slate-500">Đang tải…</div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-4xl mb-3">👥</div>
          <div className="text-slate-500">
            {users.length === 0 ? 'Chưa có người dùng nào.' : 'Không có user nào khớp bộ lọc.'}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {TIER_GROUPS.map((g, idx) => {
            const list = grouped.get(idx) ?? [];
            if (list.length === 0) return null;
            return (
              <section key={g.label} className="rounded-lg overflow-hidden border border-slate-200 bg-white shadow-sm">
                {/* PR-USERS-NORMALIZE (2026-06-28): bỏ gradient + 5 màu khác nhau,
                    dùng solid bg-slate-50 đồng nhất. */}
                <header className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm text-slate-800">{g.label}</div>
                    <div className="text-[11px] text-slate-500">{g.subtitle}</div>
                  </div>
                  <span className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full bg-white text-slate-600 text-[11px] font-medium ring-1 ring-slate-200 tabular-nums">
                    {list.length}
                  </span>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr className="text-left">
                        <th className="p-2 font-semibold text-slate-600">Họ tên</th>
                        <th className="p-2 font-semibold text-slate-600">Email</th>
                        <th className="p-2 font-semibold text-slate-600">Vai trò</th>
                        <th className="p-2 font-semibold text-slate-600">Cơ sở</th>
                        <th className="p-2 font-semibold text-slate-600">Trạng thái</th>
                        <th className="p-2 font-semibold text-slate-600">Đăng ký</th>
                        <th className="p-2 w-32"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map(u => {
                        const role = roles.find(r => r.code === u.role_code);
                        const facility = facilities.find(f => f.id === u.facility_id);
                        return (
                          <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="p-2 font-medium text-slate-800">
                              {u.full_name || <span className="italic text-slate-400">(chưa đặt)</span>}
                              {u.is_probation && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Thử việc</span>}
                            </td>
                            <td className="p-2 text-slate-600">{u.email}</td>
                            <td className="p-2 text-slate-700 text-xs">
                              {role ? <>{role.name} <span className="text-slate-400">({u.role_code})</span></> : <span className="italic text-slate-400">—</span>}
                            </td>
                            <td className="p-2 text-slate-600 text-xs">{facility?.name || '—'}</td>
                            <td className="p-2">
                              {!u.has_profile ? (
                                <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">Chưa cấu hình</span>
                              ) : u.active ? (
                                <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">Hoạt động</span>
                              ) : (
                                <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">Đã tắt</span>
                              )}
                            </td>
                            <td className="p-2 text-slate-500 text-xs">
                              {new Date(u.created_at).toLocaleDateString('vi-VN')}
                            </td>
                            <td className="p-2">
                              <div className="flex gap-1 justify-end">
                                <button onClick={() => setEditing(u)}
                                  className="p-1.5 text-slate-500 hover:bg-slate-100 rounded" title="Sửa">
                                  <Edit3 size={14} />
                                </button>
                                {u.has_profile && u.id !== currentUserId && (
                                  <button onClick={() => toggleActive(u)}
                                    className={`p-1.5 rounded ${u.active ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                                    title={u.active ? 'Tắt tài khoản' : 'Bật lại'}>
                                    {u.active ? <PowerOff size={14} /> : <Power size={14} />}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {showCreate && (
        <UserFormModal
          title="Thêm người dùng"
          roles={visibleRoles} facilities={visibleFacilities}
          allRoles={roles}
          onCancel={() => setShowCreate(false)}
          onSubmit={async (p) => { const ok = await saveUser(p, undefined); if (ok) setShowCreate(false); }}
        />
      )}

      {editing && (
        <UserFormModal
          title="Sửa người dùng"
          initial={editing}
          roles={visibleRoles} facilities={visibleFacilities}
          allRoles={roles}
          onCancel={() => setEditing(null)}
          onSubmit={async (p) => { const ok = await saveUser(p, editing.id); if (ok) setEditing(null); }}
        />
      )}

      {tempPasswordShown && (
        <TempPasswordModal
          email={tempPasswordShown.email}
          password={tempPasswordShown.password}
          onClose={() => setTempPasswordShown(null)}
        />
      )}
      </>)}
    </div>
  );
}

// PR-USERS-NORMALIZE (2026-06-28): StatCard local deadcode sau khi convert
// 3 stat cell sang SegmentSummary. TabBtn nội bộ underline emerald-600 chuẩn.
import { SegmentSummary } from '@/components/ui/StatCard';

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'text-emerald-700 border-emerald-600'
          : 'text-slate-500 border-transparent hover:text-slate-800'
      }`}
    >
      {icon} {label}
    </button>
  );
}

interface FormPayload {
  email: string;
  full_name: string;
  role_code: string;
  facility_id: string | null;
  phone: string | null;
  is_probation: boolean;
  password?: string;
}

function UserFormModal({ title, initial, roles, facilities, allRoles, onCancel, onSubmit }: {
  title: string;
  initial?: UserRow;
  roles: RoleRef[];           // roles cho phép tạo
  facilities: Facility[];      // facilities cho phép gán
  allRoles: RoleRef[];         // tất cả roles (để hiện role cũ nếu sửa user cấp cao hơn)
  onCancel: () => void;
  onSubmit: (p: FormPayload) => void;
}) {
  const initialRole = initial?.role_code || roles[0]?.code || '';
  const [email, setEmail] = useState(initial?.email || '');
  const [fullName, setFullName] = useState(initial?.full_name || '');
  const [roleCode, setRoleCode] = useState(initialRole);
  const [facilityId, setFacilityId] = useState(initial?.facility_id || '');
  const [phone, setPhone] = useState(initial?.phone || '');
  const [isProbation, setIsProbation] = useState(initial?.is_probation || false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const editing = !!initial;

  // Khi sửa user, role hiện tại có thể nằm ngoài scope creator — vẫn hiện trong dropdown để giữ
  const roleOptions = useMemo(() => {
    if (!editing) return roles;
    const currentRole = allRoles.find(r => r.code === initial!.role_code);
    if (!currentRole) return roles;
    if (roles.some(r => r.code === currentRole.code)) return roles;
    return [currentRole, ...roles];
  }, [editing, initial, roles, allRoles]);

  function gen() {
    setPassword(generateTempPassword());
    setShowPassword(true);
  }

  async function submit() {
    if (!email.trim() || !fullName.trim() || !roleCode) return;
    setSubmitting(true);
    await onSubmit({
      email: email.trim().toLowerCase(),
      full_name: fullName.trim(),
      role_code: roleCode,
      facility_id: facilityId || null,
      phone: phone.trim() || null,
      is_probation: isProbation,
      password: password.trim() || undefined,
    });
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b flex items-center justify-between">
          <div className="font-bold text-lg text-slate-800">{title}</div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-3">
          <Field label="Email *">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400" />
            {editing && <div className="text-xs text-amber-700 mt-1">⚠️ Đổi email sẽ thay đổi cách user đăng nhập.</div>}
          </Field>
          <Field label="Họ tên *">
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400" />
          </Field>
          <Field label="Số điện thoại">
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="09xxxxxxxx"
              className="w-full px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400" />
          </Field>
          <Field label="Vai trò *">
            <select value={roleCode} onChange={e => setRoleCode(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400">
              {roleOptions.length === 0 && <option value="">— Không có vai trò trong phạm vi của bạn —</option>}
              {roleOptions.map(r => (
                <option key={r.code} value={r.code}>{r.name} ({r.code})</option>
              ))}
            </select>
            <div className="text-xs text-slate-500 mt-1">
              Chỉ được tạo vai trò có cấp thấp hơn mình.
            </div>
          </Field>
          <Field label="Cơ sở">
            <select value={facilityId} onChange={e => setFacilityId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400">
              <option value="">— Không gắn cơ sở —</option>
              {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
          <Field label={editing ? 'Đặt lại mật khẩu (tuỳ chọn)' : 'Mật khẩu tạm'}>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input type={showPassword ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={editing ? 'Để trống = không đổi mật khẩu' : 'Để trống để tự sinh'}
                  className="w-full px-3 py-2 pr-10 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400" />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-700">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <button type="button" onClick={gen}
                className="px-3 py-2 text-sm border border-slate-200 rounded hover:bg-slate-50 inline-flex items-center gap-1">
                <RefreshCw size={14} /> Tự sinh
              </button>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {editing
                ? 'Tối thiểu 6 ký tự. Bỏ trống để giữ nguyên mật khẩu hiện tại.'
                : 'Để trống — hệ thống tự tạo mật khẩu và hiển thị 1 lần sau khi tạo.'}
            </div>
          </Field>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isProbation} onChange={e => setIsProbation(e.target.checked)} />
            <span className="text-sm">Đang thử việc</span>
          </label>
        </div>
        <div className="p-5 border-t flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded border border-slate-200 hover:bg-slate-50">Huỷ</button>
          <button onClick={submit} disabled={submitting || !email.trim() || !fullName.trim() || !roleCode}
            className="px-4 py-2 bg-slate-800 text-white text-sm rounded hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed">
            <Plus size={14} className="inline" /> {submitting ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TempPasswordModal({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copyAll() {
    await navigator.clipboard.writeText(`Email: ${email}\nMật khẩu tạm: ${password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        <div className="p-5 border-b">
          <div className="font-bold text-lg text-slate-800">🔑 Mật khẩu tạm</div>
          <div className="text-xs text-slate-500 mt-1">
            ⚠️ Chỉ hiện 1 lần. Gửi cho nhân viên để đăng nhập lần đầu.
          </div>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1">Email</div>
            <div className="font-mono text-sm bg-slate-50 p-2 rounded border">{email}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1">Mật khẩu tạm</div>
            <div className="font-mono text-base bg-amber-50 border border-amber-200 p-2 rounded select-all">{password}</div>
          </div>
        </div>
        <div className="p-5 border-t flex gap-2 justify-end">
          <button onClick={copyAll}
            className="inline-flex items-center gap-1 px-4 py-2 text-sm border border-slate-200 rounded hover:bg-slate-50">
            <Copy size={14} /> {copied ? 'Đã copy!' : 'Copy email + mật khẩu'}
          </button>
          <button onClick={onClose}
            className="px-4 py-2 bg-slate-800 text-white text-sm rounded hover:bg-slate-700">
            Đã ghi nhớ, đóng
          </button>
        </div>
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
