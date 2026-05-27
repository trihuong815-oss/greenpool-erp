'use client';

import { Crown, User, Wrench, Droplet, Mail, Phone, MapPin } from 'lucide-react';
import type { TechMember } from './page';

interface Props {
  members: TechMember[];
  branchOrder: readonly string[];
  branchLabels: Record<string, string>;
}

export function OrgChart({ members, branchOrder, branchLabels }: Props) {
  const head = members.find((m) => m.roleId === 'TP_KT') ?? null;
  const ppHT = members.find((m) => m.roleId === 'PP_HT') ?? null;
  const ppXLN = members.find((m) => m.roleId === 'PP_XLN') ?? null;
  const ktHTByBranch = new Map<string, TechMember[]>();
  const ktXLNByBranch = new Map<string, TechMember[]>();
  for (const b of branchOrder) {
    ktHTByBranch.set(b, members.filter((m) => m.roleId === `KT_HT_${b === '24' ? '24NCT' : b}`));
    ktXLNByBranch.set(b, members.filter((m) => m.roleId === `KT_XLN_${b === '24' ? '24NCT' : b}`));
  }

  const totalCount = members.length;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header summary */}
      <div className="rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-teal-50 p-5 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Sơ đồ phòng Kỹ thuật</h2>
            <p className="text-sm text-slate-600 mt-0.5">
              Cơ cấu: Trưởng phòng · 2 Phó phòng (Hệ thống & Xử lý nước) · KTV cơ sở
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Pill icon={<Crown size={14} />} label="TP" value={head ? 1 : 0} color="amber" />
            <Pill icon={<User size={14} />} label="PP" value={(ppHT ? 1 : 0) + (ppXLN ? 1 : 0)} color="purple" />
            <Pill icon={<Wrench size={14} />} label="KTV" value={totalCount - (head ? 1 : 0) - (ppHT ? 1 : 0) - (ppXLN ? 1 : 0)} color="cyan" />
            <Pill icon={null} label="Tổng" value={totalCount} color="slate" />
          </div>
        </div>
      </div>

      {/* TP — đỉnh kim tự tháp */}
      <div className="flex justify-center">
        <PersonCard member={head} fallbackRole="TP_KT" fallbackTitle="Trưởng phòng Kỹ thuật" colorClass="from-amber-500 to-orange-600" iconNode={<Crown size={20} />} wide />
      </div>

      {/* Connector */}
      <div className="flex justify-center -my-3">
        <div className="h-6 w-px bg-slate-300" />
      </div>

      {/* 2 Phó phòng song song */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <PpColumn
          pp={ppHT}
          fallbackRole="PP_HT"
          fallbackTitle="Phó phòng Hệ thống"
          colorClass="from-purple-500 to-fuchsia-600"
          iconNode={<Wrench size={18} />}
          ktByBranch={ktHTByBranch}
          branchOrder={branchOrder}
          branchLabels={branchLabels}
          ktTitle="KTV Hệ thống"
        />
        <PpColumn
          pp={ppXLN}
          fallbackRole="PP_XLN"
          fallbackTitle="Phó phòng Xử lý nước"
          colorClass="from-blue-500 to-cyan-600"
          iconNode={<Droplet size={18} />}
          ktByBranch={ktXLNByBranch}
          branchOrder={branchOrder}
          branchLabels={branchLabels}
          ktTitle="KTV Xử lý nước"
        />
      </div>

      {/* Note */}
      <div className="rounded-lg border border-slate-200 bg-white p-3 text-[11px] text-slate-500">
        📋 Đọc từ <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">users</code> collection (status=active).
        Để thêm/sửa nhân sự KT: vào <a href="/quan-ly-sale" className="text-cyan-700 underline">Quản trị → Quản lý người dùng</a> (tương đương).
        Role codes phòng KT: <code>TP_KT</code>, <code>PP_HT</code>, <code>PP_XLN</code>, <code>KT_HT_&#123;branch&#125;</code>, <code>KT_XLN_&#123;branch&#125;</code>.
      </div>
    </div>
  );
}

function Pill({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: 'amber' | 'purple' | 'cyan' | 'slate' }) {
  const bg = {
    amber: 'bg-amber-100 text-amber-800',
    purple: 'bg-purple-100 text-purple-800',
    cyan: 'bg-cyan-100 text-cyan-800',
    slate: 'bg-slate-200 text-slate-800',
  }[color];
  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${bg}`}>
      {icon}
      <span>{label}: <span className="tabular-nums">{value}</span></span>
    </div>
  );
}

function PersonCard({
  member, fallbackRole, fallbackTitle, colorClass, iconNode, wide = false,
}: {
  member: TechMember | null;
  fallbackRole: string;
  fallbackTitle: string;
  colorClass: string;
  iconNode: React.ReactNode;
  wide?: boolean;
}) {
  const filled = !!member;
  return (
    <div className={`rounded-xl shadow-sm border-2 ${filled ? 'border-slate-200 bg-white' : 'border-dashed border-slate-300 bg-slate-50/60'} overflow-hidden ${wide ? 'w-72' : 'w-full'}`}>
      <div className={`bg-gradient-to-r ${colorClass} text-white px-4 py-2 flex items-center gap-2`}>
        <div className="bg-white/20 rounded-md p-1">{iconNode}</div>
        <div className="text-[10px] font-semibold uppercase tracking-wider opacity-90">{fallbackTitle}</div>
      </div>
      <div className="p-3">
        {filled ? (
          <>
            <div className="font-bold text-slate-900 truncate">{member!.displayName}</div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">{member!.roleId}</div>
            <div className="mt-2 space-y-0.5 text-[11px] text-slate-600">
              {member!.email && (
                <div className="flex items-center gap-1.5 truncate">
                  <Mail size={11} className="text-slate-400 shrink-0" />
                  <span className="truncate">{member!.email}</span>
                </div>
              )}
              {member!.phone && (
                <div className="flex items-center gap-1.5">
                  <Phone size={11} className="text-slate-400" />
                  <span>{member!.phone}</span>
                </div>
              )}
              {member!.branchName && (
                <div className="flex items-center gap-1.5">
                  <MapPin size={11} className="text-slate-400" />
                  <span>{member!.branchName}</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center text-xs text-slate-400 py-3">
            <em>Chưa có nhân sự</em>
            <div className="mt-1 text-[10px] font-mono">role: {fallbackRole}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function PpColumn({
  pp, fallbackRole, fallbackTitle, colorClass, iconNode,
  ktByBranch, branchOrder, branchLabels, ktTitle,
}: {
  pp: TechMember | null;
  fallbackRole: string;
  fallbackTitle: string;
  colorClass: string;
  iconNode: React.ReactNode;
  ktByBranch: Map<string, TechMember[]>;
  branchOrder: readonly string[];
  branchLabels: Record<string, string>;
  ktTitle: string;
}) {
  return (
    <div className="space-y-3">
      {/* PP card */}
      <PersonCard member={pp} fallbackRole={fallbackRole} fallbackTitle={fallbackTitle} colorClass={colorClass} iconNode={iconNode} />

      {/* Connector */}
      <div className="flex justify-center -my-1">
        <div className="h-3 w-px bg-slate-300" />
      </div>

      {/* KTV per branch */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600">{ktTitle} — 5 cơ sở</div>
        </div>
        <ul className="divide-y divide-slate-100">
          {branchOrder.map((b) => {
            const ktvs = ktByBranch.get(b) ?? [];
            return (
              <li key={b} className="px-3 py-2 flex items-start gap-2">
                <span className="inline-flex w-9 shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] font-bold text-slate-700">{b}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-slate-500 leading-tight">{branchLabels[b] ?? b}</div>
                  {ktvs.length === 0 ? (
                    <div className="text-xs text-slate-400 italic mt-0.5">(chưa có KTV)</div>
                  ) : (
                    <ul className="mt-0.5 space-y-0.5">
                      {ktvs.map((k) => (
                        <li key={k.uid} className="text-sm font-medium text-slate-800 truncate" title={k.email}>
                          {k.displayName}
                          {k.phone && <span className="ml-2 text-[10px] text-slate-400 font-normal">· {k.phone}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
