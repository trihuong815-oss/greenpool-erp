'use client';

// Tab "Cấp quyền sử dụng" — chỉ ADMIN dùng được.
// Chọn 1 user → liệt kê toàn bộ permission catalog → check/uncheck theo nhóm → lưu.
// State: override per user lưu ở users/{uid}.menuOverrides.
// Display logic:
//   effectiveAllowed = (override[route] !== undefined) ? override[route] : (route ∈ MENU_PERMISSIONS[role])
//   • Default (theo role): hiển thị 'Mặc định' badge, không có override.
//   • Explicit ALLOW: badge 'Đã cấp thêm' (override=true, role chưa cho).
//   • Explicit DENY: badge 'Đã thu hồi' (override=false, role cho).
// Reset row → xoá key khỏi override → quay về default.

import { useEffect, useMemo, useState } from 'react';
import { Search, Save, Loader2, AlertCircle, CheckCircle2, RotateCcw, Shield, ShieldAlert, Filter } from 'lucide-react';
import { MENU_PERMISSIONS } from '@/lib/permissions';
import { PERMISSION_CATALOG, PERMISSION_GROUPS, type PermissionGroup } from '@/lib/permissions-catalog';

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  role_code: string | null;
  active: boolean;
  menu_overrides: Record<string, boolean>;
}

interface RoleRef { code: string; name: string }

interface Props {
  currentUserId: string;
  users: UserRow[];
  roles: RoleRef[];
  onSaved: () => Promise<void>;
}

export function PermissionGrantPanel({ currentUserId, users, roles, onSaved }: Props) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filteredUsers = useMemo(() => {
    const s = search.trim().toLowerCase();
    return users.filter((u) => {
      if (!u.active) return false;
      if (!s) return true;
      return (u.full_name ?? '').toLowerCase().includes(s) || u.email.toLowerCase().includes(s);
    }).sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'vi'));
  }, [users, search]);

  const selectedUser = users.find((u) => u.id === selectedId) ?? null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4">
      {/* LEFT — user picker */}
      <div className="card p-0 overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-200 bg-slate-50">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-2.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm tên / email…"
              className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400"
            />
          </div>
          <div className="text-[11px] text-slate-500 mt-1">{filteredUsers.length} user active</div>
        </div>
        <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-100">
          {filteredUsers.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-400">Không có user khớp</div>
          ) : (
            filteredUsers.map((u) => {
              const role = roles.find((r) => r.code === u.role_code);
              const overrideCount = Object.keys(u.menu_overrides ?? {}).length;
              const isSelected = u.id === selectedId;
              return (
                <button
                  key={u.id}
                  onClick={() => setSelectedId(u.id)}
                  className={`w-full text-left p-2.5 transition flex items-start gap-2 ${
                    isSelected ? 'bg-emerald-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold shrink-0 ${
                    isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {(u.full_name ?? u.email).split(' ').slice(-2).map((w) => w[0]).join('').toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm text-slate-800 truncate">{u.full_name || u.email}</div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {role?.name ?? u.role_code} {overrideCount > 0 && (
                        <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                          {overrideCount} override
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT — permission editor */}
      <div>
        {!selectedUser ? (
          <div className="card text-center py-16 text-slate-400">
            <Shield size={36} className="mx-auto mb-2 text-slate-300" />
            <div className="text-sm">Chọn 1 user ở cột trái để cấp quyền.</div>
          </div>
        ) : (
          <UserPermissionEditor
            user={selectedUser}
            roles={roles}
            isSelf={selectedUser.id === currentUserId}
            onSaved={onSaved}
          />
        )}
      </div>
    </div>
  );
}

// ─────────── UserPermissionEditor ───────────

function UserPermissionEditor({
  user, roles, isSelf, onSaved,
}: {
  user: UserRow;
  roles: RoleRef[];
  isSelf: boolean;
  onSaved: () => Promise<void>;
}) {
  const roleDefaults = useMemo(() => {
    const list = MENU_PERMISSIONS[user.role_code ?? ''] || ['dashboard'];
    return new Set(list);
  }, [user.role_code]);

  // Working state: clone server-side overrides
  const [overrides, setOverrides] = useState<Record<string, boolean>>(() => ({ ...(user.menu_overrides ?? {}) }));
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Reset working state khi user đổi
  useEffect(() => {
    setOverrides({ ...(user.menu_overrides ?? {}) });
    setToast(null);
  }, [user.id, user.menu_overrides]);

  const role = roles.find((r) => r.code === user.role_code);

  function isAllowed(route: string): boolean {
    if (Object.prototype.hasOwnProperty.call(overrides, route)) return overrides[route];
    return roleDefaults.has(route);
  }
  function statusOf(route: string): 'default' | 'granted' | 'revoked' {
    if (!Object.prototype.hasOwnProperty.call(overrides, route)) return 'default';
    const override = overrides[route];
    const def = roleDefaults.has(route);
    if (override === def) return 'default'; // override khớp default → effectively default
    return override ? 'granted' : 'revoked';
  }
  function toggle(route: string) {
    const cur = isAllowed(route);
    setOverrides((prev) => ({ ...prev, [route]: !cur }));
  }
  function resetRoute(route: string) {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[route];
      return next;
    });
  }
  function resetAll() {
    if (!confirm('Đặt lại toàn bộ về mặc định theo vai trò?')) return;
    setOverrides({});
  }
  function setAllByGroup(group: PermissionGroup, allow: boolean) {
    const routes = PERMISSION_CATALOG.filter((p) => p.group === group).map((p) => p.route);
    setOverrides((prev) => {
      const next = { ...prev };
      for (const r of routes) {
        // Chỉ ghi override nếu khác default — keep override map tinh gọn
        const def = roleDefaults.has(r);
        if (allow === def) delete next[r];
        else next[r] = allow;
      }
      return next;
    });
  }

  function showToast(t: 'success' | 'error', msg: string) {
    setToast({ type: t, msg });
    setTimeout(() => setToast(null), 4000);
  }

  async function save() {
    setSaving(true);
    try {
      // Loại bỏ entries trùng default → giữ map gọn
      const clean: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(overrides)) {
        if (roleDefaults.has(k) !== v) clean[k] = v;
      }
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menuOverrides: clean }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? 'Lỗi lưu');
      await onSaved();
      showToast('success', 'Đã lưu quyền cho ' + (user.full_name || user.email));
    } catch (e: any) {
      showToast('error', e.message);
    } finally {
      setSaving(false);
    }
  }

  const overrideCount = Object.keys(overrides).filter((k) => roleDefaults.has(k) !== overrides[k]).length;
  const dirty = JSON.stringify(overrides) !== JSON.stringify(user.menu_overrides ?? {});

  return (
    <div className="space-y-3">
      {/* User header */}
      <div className="card flex items-center gap-3 flex-wrap">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold">
          {(user.full_name ?? user.email).split(' ').slice(-2).map((w) => w[0]).join('').toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-800 truncate">{user.full_name || '(chưa đặt tên)'}</div>
          <div className="text-xs text-slate-500 truncate">{user.email} · {role?.name ?? user.role_code}</div>
        </div>
        {isSelf && (
          <div className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-800 inline-flex items-center gap-1">
            <ShieldAlert size={12} /> Tài khoản của bạn — cẩn thận khi tự thay đổi quyền
          </div>
        )}
        <button
          onClick={resetAll}
          disabled={overrideCount === 0 || saving}
          className="px-3 py-1.5 text-xs rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1"
        >
          <RotateCcw size={13} /> Reset tất cả về mặc định
        </button>
      </div>

      {toast && (
        <div className={`rounded-lg p-3 flex items-center gap-2 ring-1 ${
          toast.type === 'success' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-rose-50 text-rose-800 ring-rose-200'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span className="text-sm">{toast.msg}</span>
        </div>
      )}

      {/* Permission groups */}
      <div className="space-y-3">
        {PERMISSION_GROUPS.map((g) => {
          const items = PERMISSION_CATALOG.filter((p) => p.group === g.id);
          if (items.length === 0) return null;
          const grantedCount = items.filter((p) => isAllowed(p.route)).length;
          return (
            <section key={g.id} className="card p-0 overflow-hidden">
              <header className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="font-bold text-sm text-slate-800">{g.label}</div>
                  <div className="text-[11px] text-slate-500">{g.desc}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{grantedCount}/{items.length}</span>
                  <button
                    onClick={() => setAllByGroup(g.id, true)}
                    className="text-xs px-2 py-1 rounded border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  >
                    Cấp toàn nhóm
                  </button>
                  <button
                    onClick={() => setAllByGroup(g.id, false)}
                    className="text-xs px-2 py-1 rounded border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
                  >
                    Thu hồi nhóm
                  </button>
                </div>
              </header>
              <div className="divide-y divide-slate-100">
                {items.map((p) => {
                  const allowed = isAllowed(p.route);
                  const st = statusOf(p.route);
                  return (
                    <label
                      key={p.route}
                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 transition ${
                        allowed ? '' : 'opacity-70'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={allowed}
                        onChange={() => toggle(p.route)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-slate-800">{p.label}</span>
                          {p.sensitive && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                              <ShieldAlert size={10} /> nhạy cảm
                            </span>
                          )}
                          {st === 'granted' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              ➕ Đã cấp thêm
                            </span>
                          )}
                          {st === 'revoked' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-800">
                              ➖ Đã thu hồi
                            </span>
                          )}
                          {st === 'default' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                              {roleDefaults.has(p.route) ? 'Mặc định: có' : 'Mặc định: không'}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{p.description} · <code className="text-slate-400">{p.route}</code></div>
                      </div>
                      {st !== 'default' && (
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); resetRoute(p.route); }}
                          className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100"
                          title="Đặt lại về mặc định theo vai trò"
                        >
                          <RotateCcw size={13} />
                        </button>
                      )}
                    </label>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Sticky save bar */}
      <div className={`sticky bottom-3 card flex items-center justify-between gap-3 transition ${
        dirty ? 'ring-2 ring-emerald-400' : 'opacity-60'
      }`}>
        <div className="text-sm text-slate-700">
          {overrideCount > 0 ? (
            <span><strong>{overrideCount}</strong> quyền khác mặc định</span>
          ) : (
            <span>Tất cả đang theo mặc định vai trò</span>
          )}
          {dirty && <span className="ml-2 text-amber-700 inline-flex items-center gap-1"><Filter size={12} /> chưa lưu</span>}
        </div>
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Đang lưu…' : 'Lưu quyền'}
        </button>
      </div>
    </div>
  );
}
