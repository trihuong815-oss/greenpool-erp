'use client';

import { useState } from 'react';
import { TodayChecklist } from './TodayChecklist';
import { TemplateManager } from './TemplateManager';
import { AuditView } from './AuditView';
import type { FacilityId } from '@/lib/types';

interface Facility { id: string; name: string; color: string }
interface RoleRef { code: string; name: string; block_id: string | null; tier: number }

interface Props {
  userId: string;
  userName: string;
  userRole: string;
  userFacility: FacilityId | null;
  facilities: Facility[];
  roles: RoleRef[];
}

type Tab = 'today' | 'manage' | 'audit';

function canManageTemplates(role: string): boolean {
  return ['CEO', 'GD_KD', 'GD_VP'].includes(role);
}

function canAudit(role: string): boolean {
  if (['CEO', 'GD_KD', 'GD_VP', 'TP_GS', 'TP_NS'].includes(role)) return true;
  return role.startsWith('QLCS_');
}

function userBlock(role: string): 'KD' | 'VP' | 'all' {
  if (role === 'CEO') return 'all';
  if (role === 'GD_KD') return 'KD';
  if (role === 'GD_VP') return 'VP';
  return 'all';
}

export function ChecklistClient(props: Props) {
  const { userRole } = props;
  const showManage = canManageTemplates(userRole);
  const showAudit = canAudit(userRole);

  const [tab, setTab] = useState<Tab>('today');

  const tabs: { key: Tab; label: string; icon: string; visible: boolean }[] = [
    { key: 'today', label: 'Hôm nay', icon: '✅', visible: true },
    { key: 'manage', label: 'Quản lý template', icon: '⚙️', visible: showManage },
    { key: 'audit', label: 'Tuân thủ / Audit', icon: '📊', visible: showAudit },
  ];

  return (
    <>
      <div className="flex gap-2 mb-4 flex-wrap">
        {tabs.filter(t => t.visible).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              tab === t.key
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'today' && (
        <TodayChecklist
          userId={props.userId}
          userRole={props.userRole}
          userFacility={props.userFacility}
          roles={props.roles}
        />
      )}
      {tab === 'manage' && showManage && (
        <TemplateManager
          userRole={props.userRole}
          userBlock={userBlock(props.userRole)}
          roles={props.roles}
        />
      )}
      {tab === 'audit' && showAudit && (
        <AuditView
          userRole={props.userRole}
          userFacility={props.userFacility}
          facilities={props.facilities}
          roles={props.roles}
        />
      )}
    </>
  );
}
