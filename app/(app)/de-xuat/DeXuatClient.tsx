'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, RefreshCw, FileText, Loader2 } from 'lucide-react';
import {
  proposalsApi, type Proposal, type ProposalStatus,
  PROPOSAL_STATUS_LABEL, PROPOSAL_CATEGORY_LABEL,
} from '@/lib/services/proposals/api-client';
import { CreateProposalModal } from './CreateProposalModal';
import { ProposalDetailModal } from './ProposalDetailModal';

interface Department { id: string; name: string; blockId: 'KD' | 'VP' | null; }
interface Branch { id: string; name: string; }
interface User { id: string; name: string; roleId: string; branchId: string | null; departmentId: string | null; }
interface Role { code: string; name: string; }

const TABS: { key: ProposalStatus; label: string; color: string }[] = [
  { key: 'draft', label: 'Nháp', color: 'bg-slate-100 text-slate-700 ring-slate-200' },
  { key: 'submitted', label: 'Chờ duyệt', color: 'bg-amber-50 text-amber-700 ring-amber-200' },
  { key: 'approved', label: 'Đã duyệt', color: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  { key: 'rejected', label: 'Từ chối', color: 'bg-rose-50 text-rose-700 ring-rose-200' },
];

export function DeXuatClient(props: {
  currentUserId: string;
  currentUserName: string;
  currentUserRole: string;
  currentBranchId: string | null;
  currentDepartmentId: string | null;
  departments: Department[];
  branches: Branch[];
  users: User[];
  roles: Role[];
}) {
  const router = useRouter();
  const { currentUserId, currentUserRole, departments, branches, users, roles } = props;
  const [tab, setTab] = useState<ProposalStatus>('submitted');
  const [rows, setRows] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const list = await proposalsApi.list({ status: tab });
      setRows(list);
    } catch (e: any) {
      setError(e.message ?? 'Không tải được danh sách');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [tab]);

  const counts = useMemo(() => {
    const c: Record<ProposalStatus, number> = { draft: 0, submitted: 0, approved: 0, rejected: 0 };
    rows.forEach((r) => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [rows]);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header actions */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-slate-600">
          <span className="font-semibold text-slate-800">{rows.length}</span> đề xuất ở trạng thái{' '}
          <span className="font-semibold">"{PROPOSAL_STATUS_LABEL[tab]}"</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-800 rounded-md border border-slate-200 hover:bg-slate-50"
          >
            <RefreshCw size={12} /> Tải lại
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 shadow-sm"
          >
            <Plus size={14} /> Gửi duyệt
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
              tab === t.key
                ? 'border-emerald-500 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
            {tab === t.key && <span className="ml-1.5 inline-block px-1.5 py-0.5 text-xs rounded-md bg-emerald-100 text-emerald-700">{counts[t.key]}</span>}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 size={20} className="animate-spin mr-2" /> Đang tải…
        </div>
      ) : error ? (
        <div className="card bg-rose-50 border-rose-200 text-rose-700 text-sm py-4 px-4">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <FileText size={40} className="mx-auto mb-3 opacity-40" />
          <div className="text-sm">Chưa có đề xuất nào ở trạng thái này.</div>
          {tab === 'draft' && (
            <button
              onClick={() => setShowCreate(true)}
              className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 text-sm text-emerald-700 hover:text-emerald-800 font-semibold"
            >
              <Plus size={14} /> Tạo đề xuất mới
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <button
              key={r.id}
              onClick={() => setDetailId(r.id)}
              className="w-full text-left card hover:shadow-md transition-shadow p-4"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 truncate">{r.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {PROPOSAL_CATEGORY_LABEL[r.category]} · {r.creatorName} · {new Date(r.createdAt).toLocaleDateString('vi-VN')}
                    {r.branchId && ` · ${r.branchId}`}
                  </div>
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md ring-1 ring-inset ${TABS.find((t) => t.key === r.status)?.color}`}>
                  {PROPOSAL_STATUS_LABEL[r.status]}
                </span>
              </div>
              {r.estimatedCost != null && (
                <div className="text-xs text-slate-600">
                  Chi phí dự kiến: <span className="font-semibold">{r.estimatedCost.toLocaleString('vi-VN')}₫</span>
                </div>
              )}
              {r.status === 'approved' && r.generatedTaskId && (
                <div className="mt-1 text-xs text-emerald-700">
                  ✓ Đã tạo nhiệm vụ thực hiện ({r.generatedTaskId.slice(0, 8)})
                </div>
              )}
              {r.status === 'rejected' && r.rejectedReason && (
                <div className="mt-1 text-xs text-rose-600 italic">"{r.rejectedReason}"</div>
              )}
            </button>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateProposalModal
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          currentBranchId={props.currentBranchId}
          currentDepartmentId={props.currentDepartmentId}
          departments={departments}
          branches={branches}
          roles={roles}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            setTab('draft');
            void load();
          }}
        />
      )}

      {detailId && (
        <ProposalDetailModal
          proposalId={detailId}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          departments={departments}
          branches={branches}
          users={users}
          onClose={() => setDetailId(null)}
          onChanged={() => { void load(); router.refresh(); }}
        />
      )}
    </div>
  );
}
