'use client';

import { useMemo, useState } from 'react';
import { X, Users } from 'lucide-react';
import type { Role, Profile } from '@/lib/types';
import { OrgTreeView } from './OrgTreeView';
import { FlowView } from './FlowView';

interface Props {
  roles: Role[];
  profiles: Profile[];
}

type Tab = 'org' | 'tree' | 'flow';

const TIER_LABELS: Record<number, string> = {
  1: 'Tầng 1 — Lãnh đạo',
  2: 'Tầng 2 — Giám đốc Khối',
  3: 'Tầng 3 — QLCS · Trưởng phòng',
  4: 'Tầng 4 — Phó phòng',
  5: 'Tầng 5 — Tổ trưởng',
  6: 'Tầng 6 — Nhân viên · Giáo viên',
};

function blockColor(role: Role): string {
  if (role.tier === 1) return 'border-l-rose-600 bg-rose-50';
  if (role.block_id === 'KD') return 'border-l-blue-600 bg-blue-50';
  if (role.block_id === 'VP') return 'border-l-emerald-600 bg-emerald-50';
  return 'border-l-slate-400 bg-white';
}

function blockBadge(role: Role): { label: string; cls: string } | null {
  if (role.tier === 1) return { label: 'Lãnh đạo', cls: 'bg-rose-100 text-rose-800' };
  if (role.block_id === 'KD') return { label: 'Kinh doanh', cls: 'bg-blue-100 text-blue-800' };
  if (role.block_id === 'VP') return { label: 'Văn phòng', cls: 'bg-emerald-100 text-emerald-800' };
  return null;
}

export function OrgChartClient({ roles, profiles }: Props) {
  const [tab, setTab] = useState<Tab>('tree');
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const handleSelect = (r: Role, branch?: string | null) => {
    setSelectedRole(r);
    setSelectedBranch(branch ?? null);
  };

  const profileCountByRole = useMemo(() => {
    const map: Record<string, number> = {};
    profiles.forEach(p => {
      map[p.role_code] = (map[p.role_code] || 0) + 1;
    });
    return map;
  }, [profiles]);

  // Sort: gom theo phòng ban (dept_id) để cùng bộ phận liền nhau
  function sortByDept(a: Role, b: Role): number {
    const da = a.dept_id || '￿'; // nulls last
    const db = b.dept_id || '￿';
    if (da !== db) return da.localeCompare(db);
    return a.code.localeCompare(b.code);
  }

  const rolesByTier = useMemo(() => {
    const byTier: Record<number, { kd: Role[]; vp: Role[]; other: Role[] }> = {
      1: { kd: [], vp: [], other: [] },
      2: { kd: [], vp: [], other: [] },
      3: { kd: [], vp: [], other: [] },
      4: { kd: [], vp: [], other: [] },
      5: { kd: [], vp: [], other: [] },
      6: { kd: [], vp: [], other: [] },
    };
    roles.forEach(r => {
      const bucket = byTier[r.tier];
      if (!bucket) return;
      if (r.block_id === 'KD') bucket.kd.push(r);
      else if (r.block_id === 'VP') bucket.vp.push(r);
      else bucket.other.push(r);
    });
    // Sort mỗi bucket theo phòng ban để cùng dept liền nhau
    Object.values(byTier).forEach(b => {
      b.kd.sort(sortByDept);
      b.vp.sort(sortByDept);
      b.other.sort(sortByDept);
    });
    return byTier;
  }, [roles]);

  const selectedProfiles = useMemo(
    () => {
      if (!selectedRole) return [];
      let list = profiles.filter(p => p.role_code === selectedRole.code);
      if (selectedBranch) list = list.filter(p => p.facility_id === selectedBranch);
      return list;
    },
    [selectedRole, selectedBranch, profiles]
  );

  return (
    <>
      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setTab('org')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
            tab === 'org' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          🏛️ Sơ đồ tổ chức
        </button>
        <button
          onClick={() => setTab('tree')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
            tab === 'tree' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          🌳 Cây phân cấp
        </button>
        <button
          onClick={() => setTab('flow')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
            tab === 'flow' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          🔀 Quy trình đề xuất / giao việc
        </button>
      </div>

      {tab === 'org' && (
        <OrgView
          rolesByTier={rolesByTier}
          profileCountByRole={profileCountByRole}
          onSelect={(r) => handleSelect(r, null)}
        />
      )}
      {tab === 'tree' && (
        <OrgTreeView
          roles={roles}
          profiles={profiles}
          onSelectRole={handleSelect}
        />
      )}
      {tab === 'flow' && <FlowView />}

      {selectedRole && (
        <RoleDetailModal
          role={selectedRole}
          branch={selectedBranch}
          profiles={selectedProfiles}
          onClose={() => { setSelectedRole(null); setSelectedBranch(null); }}
        />
      )}
    </>
  );
}

interface OrgViewProps {
  rolesByTier: Record<number, { kd: Role[]; vp: Role[]; other: Role[] }>;
  profileCountByRole: Record<string, number>;
  onSelect: (r: Role) => void;
}

function OrgView({ rolesByTier, profileCountByRole, onSelect }: OrgViewProps) {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5, 6].map(tier => {
        const bucket = rolesByTier[tier];
        const total = bucket.kd.length + bucket.vp.length + bucket.other.length;
        if (total === 0) return null;

        return (
          <section key={tier} className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="card-title flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-800 text-white text-sm font-bold">
                  {tier}
                </span>
                {TIER_LABELS[tier]}
              </div>
              <span className="text-xs text-slate-500">{total} vai trò</span>
            </div>

            {tier === 1 ? (
              <div className="flex justify-center">
                <RoleCardList roles={bucket.other.concat(bucket.kd, bucket.vp)} counts={profileCountByRole} onSelect={onSelect} compact={false} />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <BlockColumn
                  label="Khối Kinh doanh"
                  accent="blue"
                  count={bucket.kd.length}
                  roles={bucket.kd}
                  profileCountByRole={profileCountByRole}
                  onSelect={onSelect}
                />
                <BlockColumn
                  label="Khối Văn phòng"
                  accent="emerald"
                  count={bucket.vp.length}
                  roles={bucket.vp}
                  profileCountByRole={profileCountByRole}
                  onSelect={onSelect}
                />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

interface BlockColumnProps {
  label: string;
  accent: 'blue' | 'emerald';
  count: number;
  roles: Role[];
  profileCountByRole: Record<string, number>;
  onSelect: (r: Role) => void;
}

function BlockColumn({ label, accent, count, roles, profileCountByRole, onSelect }: BlockColumnProps) {
  const accentCls = accent === 'blue' ? 'bg-blue-50 border-blue-200 text-blue-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900';
  return (
    <div className={`rounded-lg border ${accentCls} p-3`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold uppercase tracking-wider">{label}</div>
        <span className="text-xs opacity-70">{count} vai trò</span>
      </div>
      {roles.length === 0 ? (
        <div className="text-xs italic opacity-60 py-3 text-center">— không có vai trò ở tầng này —</div>
      ) : (
        <RoleCardList roles={roles} counts={profileCountByRole} onSelect={onSelect} compact={true} />
      )}
    </div>
  );
}

interface RoleCardListProps {
  roles: Role[];
  counts: Record<string, number>;
  onSelect: (r: Role) => void;
  compact: boolean;
}

function RoleCardList({ roles, counts, onSelect, compact }: RoleCardListProps) {
  const gridCls = compact
    ? 'grid grid-cols-1 sm:grid-cols-2 gap-2'
    : 'grid grid-cols-1 gap-2';
  return (
    <div className={gridCls}>
      {roles.map(role => {
        const c = counts[role.code] || 0;
        return (
          <button
            key={role.code}
            onClick={() => onSelect(role)}
            className={`text-left p-2.5 rounded-lg border border-slate-200 border-l-4 ${blockColor(role)} hover:shadow-md hover:border-slate-300 transition`}
          >
            <div className="font-semibold text-slate-800 text-sm leading-tight">{role.name}</div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-slate-500 font-mono">{role.code}</span>
              <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                <Users size={12} />
                {c}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}


interface ModalProps {
  role: Role;
  branch: string | null;
  profiles: Profile[];
  onClose: () => void;
}

function RoleDetailModal({ role, branch, profiles, onClose }: ModalProps) {
  const badge = blockBadge(role);
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b flex items-start justify-between gap-3">
          <div>
            <div className="font-bold text-lg text-slate-800">{role.name}</div>
            <div className="text-xs text-slate-500 font-mono mt-1">{role.code}</div>
            <div className="flex gap-2 mt-2 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                Tầng {role.tier}
              </span>
              {badge && (
                <span className={`text-xs px-2 py-0.5 rounded ${badge.cls}`}>{badge.label}</span>
              )}
              {role.is_qlcs && (
                <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">QLCS</span>
              )}
              {role.is_tp && (
                <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-800">TP</span>
              )}
              {role.facility_id && (
                <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                  CS: {role.facility_id}
                </span>
              )}
              {branch && (
                <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold">
                  Cơ sở: {branch}
                </span>
              )}
              {role.dept_id && (
                <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                  Phòng: {role.dept_id}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1"
            aria-label="Đóng"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {role.description && (
            <div className="mb-4">
              <div className="text-xs font-semibold text-slate-600 mb-1">Mô tả</div>
              <p className="text-sm text-slate-700">{role.description}</p>
            </div>
          )}
          {role.parent_role && (
            <div className="mb-4">
              <div className="text-xs font-semibold text-slate-600 mb-1">Báo cáo cho</div>
              <div className="text-sm text-slate-700">{role.parent_role}</div>
            </div>
          )}

          <div>
            <div className="text-xs font-semibold text-slate-600 mb-2">
              {branch
                ? <>Nhân sự cơ sở <strong>{branch}</strong> ({profiles.length})</>
                : <>Nhân sự đang giữ vai trò ({profiles.length})</>}
            </div>
            {profiles.length === 0 ? (
              <div className="text-sm text-slate-400 italic py-4 text-center bg-slate-50 rounded">
                {branch ? `Chưa có nhân sự nào tại cơ sở ${branch}` : 'Chưa có nhân sự nào đang giữ vai trò này'}
              </div>
            ) : branch ? (
              // Branch-filtered → flat list
              <div className="space-y-2">
                {profiles.map(p => (
                  <ProfileRow key={p.id} profile={p} />
                ))}
              </div>
            ) : (
              // No branch filter → group theo facility cho dễ nhìn
              <GroupedProfileList profiles={profiles} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Hàng hiển thị 1 nhân sự
function ProfileRow({ profile }: { profile: Profile }) {
  return (
    <div className="flex items-center gap-3 p-2 rounded hover:bg-slate-50 border border-slate-100">
      <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-sm font-semibold text-slate-600">
        {profile.full_name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-800 truncate">{profile.full_name}</div>
        <div className="text-xs text-slate-500 truncate">{profile.email}</div>
      </div>
      {profile.facility_id && (
        <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">
          {profile.facility_id}
        </span>
      )}
    </div>
  );
}

// Group nhân sự theo cơ sở — dùng khi modal không filter branch (tier-view, hoặc cross-branch)
// Phase B.1: BRANCH_IDS single source of truth.
import { BRANCH_IDS as BRANCH_ORDER } from '@/lib/branches';
const BRANCH_LABEL: Record<string, string> = {
  HM: 'Hoàng Mai', TK: 'Thuỵ Khuê', CTT: 'CTT Mỹ Đình', '24': '24 NCT', TT: 'Thanh Trì',
};
function GroupedProfileList({ profiles }: { profiles: Profile[] }) {
  // Group theo facility_id; null/empty → 'Cross-branch / không gán'
  const groups: Record<string, Profile[]> = {};
  for (const p of profiles) {
    const key = (p.facility_id ?? '__none__') as string;
    (groups[key] ??= []).push(p);
  }
  const keys = Object.keys(groups).sort((a, b) => {
    // Phase B.1: BRANCH_ORDER là readonly tuple → cast string[] cho indexOf chấp nhận string thường.
    const order = BRANCH_ORDER as readonly string[];
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return (
    <div className="space-y-3">
      {keys.map(k => (
        <div key={k}>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-2">
            <span className="inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 rounded bg-indigo-100 text-indigo-800 text-[10px]">
              {k === '__none__' ? '—' : k}
            </span>
            <span>{k === '__none__' ? 'Chưa gán cơ sở' : (BRANCH_LABEL[k] ?? k)}</span>
            <span className="ml-auto text-slate-400">{groups[k].length} người</span>
          </div>
          <div className="space-y-1.5">
            {groups[k].map(p => <ProfileRow key={p.id} profile={p} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
