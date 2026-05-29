'use client';

import { useMemo, useState } from 'react';
import { X, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  proposalsApi, PRIORITY_LABEL,
  type Proposal, type TaskBlock, type TaskPriority,
} from '@/lib/services/proposals/api-client';

interface Department { id: string; name: string; blockId: 'KD' | 'VP' | null; }
interface Branch { id: string; name: string; }
interface User { id: string; name: string; roleId: string; branchId: string | null; departmentId: string | null; }

const PRIORITIES: TaskPriority[] = ['low', 'normal', 'high', 'urgent'];
const PRIORITY_COLOR: Record<TaskPriority, string> = {
  low: 'bg-slate-100 text-slate-700 ring-slate-200',
  normal: 'bg-sky-50 text-sky-700 ring-sky-200',
  high: 'bg-amber-50 text-amber-700 ring-amber-200',
  urgent: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export function ApproveProposalModal(props: {
  proposal: Proposal;
  departments: Department[];
  branches: Branch[];
  users: User[];
  onClose: () => void;
  onApproved: (taskId: string, warning: string | null) => void;
}) {
  const { proposal, departments, branches, users, onClose, onApproved } = props;

  const initBlock: TaskBlock = proposal.block === 'VP' ? 'VP' : 'KD';
  const [assigneeBlock, setAssigneeBlock] = useState<TaskBlock>(initBlock);
  const [assigneeUserIds, setAssigneeUserIds] = useState<string[]>([]);
  const [assigneeDeptId, setAssigneeDeptId] = useState<string>(proposal.departmentId ?? '');
  const [assigneeFacilityId, setAssigneeFacilityId] = useState<string>(proposal.branchId ?? '');
  const [dueDate, setDueDate] = useState<string>('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [approverNotes, setApproverNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deptsInBlock = useMemo(() => departments.filter((d) => d.blockId === assigneeBlock), [departments, assigneeBlock]);

  // Filter users theo block + dept/facility nếu có
  const usersInScope = useMemo(() => {
    return users.filter((u) => {
      if (assigneeDeptId && u.departmentId !== assigneeDeptId) return false;
      if (assigneeFacilityId && u.branchId !== assigneeFacilityId) return false;
      return true;
    });
  }, [users, assigneeDeptId, assigneeFacilityId]);

  const creatorIsAssignee = assigneeUserIds.includes(proposal.creatorId);

  function toggleUser(uid: string) {
    setAssigneeUserIds((prev) => prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]);
  }

  async function handleApprove() {
    setError(null);
    if (assigneeUserIds.length === 0) { setError('Phải chọn ít nhất 1 người thực hiện.'); return; }
    if (!dueDate) { setError('Phải chọn hạn hoàn thành.'); return; }
    setSaving(true);
    try {
      const res = await proposalsApi.approve(proposal.id, {
        assigneeUserIds,
        assigneeBlock,
        assigneeDeptId: assigneeDeptId || null,
        assigneeFacilityId: assigneeFacilityId || null,
        dueDate,
        priority,
        approverNotes: approverNotes.trim(),
      });
      onApproved(res.taskId, res.warning);
    } catch (e: any) {
      setError(e.message ?? 'Lỗi duyệt đề xuất');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header gradient */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-white">
              <CheckCircle2 size={20} />
              <h2 className="font-bold text-lg">Duyệt đề xuất + Giao việc</h2>
            </div>
            <div className="text-emerald-100 text-sm mt-0.5 truncate">{proposal.title}</div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X size={22} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" /> <span>{error}</span>
            </div>
          )}

          {/* Section 1: Người thực hiện */}
          <section>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">1. Người thực hiện</div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              <button
                onClick={() => { setAssigneeBlock('KD'); setAssigneeDeptId(''); setAssigneeUserIds([]); }}
                className={`px-3 py-2 text-sm font-semibold rounded-lg border-2 transition-colors ${
                  assigneeBlock === 'KD'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >Kinh doanh</button>
              <button
                onClick={() => { setAssigneeBlock('VP'); setAssigneeDeptId(''); setAssigneeUserIds([]); }}
                className={`px-3 py-2 text-sm font-semibold rounded-lg border-2 transition-colors ${
                  assigneeBlock === 'VP'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >Văn phòng</button>
              <div className="px-3 py-2 text-xs text-slate-500 flex items-center justify-center bg-slate-50 rounded-lg">
                Khối nhận
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Phòng ban</label>
                <select
                  value={assigneeDeptId} onChange={(e) => { setAssigneeDeptId(e.target.value); setAssigneeUserIds([]); }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="">— Không gắn phòng —</option>
                  {deptsInBlock.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Cơ sở</label>
                <select
                  value={assigneeFacilityId} onChange={(e) => { setAssigneeFacilityId(e.target.value); setAssigneeUserIds([]); }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="">— Không gắn cơ sở —</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Nhân sự đảm nhận <span className="text-rose-500">*</span>
                <span className="ml-2 font-normal text-slate-400">(chọn nhiều — {assigneeUserIds.length} đã chọn)</span>
              </label>
              <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-lg bg-white divide-y divide-slate-100">
                {usersInScope.length === 0 ? (
                  <div className="p-3 text-sm text-slate-400 text-center">Không có nhân sự phù hợp scope đã chọn</div>
                ) : usersInScope.map((u) => {
                  const checked = assigneeUserIds.includes(u.id);
                  const isCreator = u.id === proposal.creatorId;
                  return (
                    <label key={u.id} className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 ${checked ? 'bg-emerald-50' : ''}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleUser(u.id)} className="rounded accent-emerald-600" />
                      <span className="font-medium text-slate-800">{u.name}</span>
                      <span className="text-xs text-slate-500">{u.roleId}</span>
                      {isCreator && <span className="ml-auto text-xs px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">Người đề xuất</span>}
                    </label>
                  );
                })}
              </div>
            </div>

            {creatorIsAssignee && (
              <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                <div>
                  Bạn đang giao việc cho cả người đề xuất. Hợp lệ, nhưng người đề xuất sẽ <strong>không được tự duyệt completion</strong> — phải có quản lý khác duyệt.
                </div>
              </div>
            )}
          </section>

          {/* Section 2: Hạn + Ưu tiên */}
          <section>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">2. Hạn hoàn thành + Ưu tiên</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Hạn hoàn thành <span className="text-rose-500">*</span></label>
                <input
                  type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Mức ưu tiên</label>
                <div className="grid grid-cols-4 gap-1">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPriority(p)}
                      className={`px-2 py-2 text-xs font-semibold rounded-md ring-1 ring-inset transition-colors ${
                        priority === p ? PRIORITY_COLOR[p] : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {PRIORITY_LABEL[p]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: Ghi chú duyệt */}
          <section>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">3. Ghi chú khi duyệt (tùy chọn)</div>
            <textarea
              value={approverNotes} onChange={(e) => setApproverNotes(e.target.value)} rows={3} maxLength={1000}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Vd: Đồng ý mua, ưu tiên hãng A. Liên hệ kế toán trước."
            />
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-slate-200 bg-slate-50">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-200 rounded-md transition-colors">Hủy</button>
          <button
            onClick={handleApprove} disabled={saving || assigneeUserIds.length === 0 || !dueDate}
            className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Duyệt & Giao việc
          </button>
        </div>
      </div>
    </div>
  );
}
