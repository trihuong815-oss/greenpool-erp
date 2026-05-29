'use client';

import { useMemo, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import {
  proposalsApi, PROPOSAL_CATEGORY_LABEL,
  type ProposalCategory, type ProposalBlock,
} from '@/lib/services/proposals/api-client';

interface Department { id: string; name: string; blockId: 'KD' | 'VP' | null; }
interface Branch { id: string; name: string; }
interface Role { code: string; name: string; }

const CATEGORIES: ProposalCategory[] = ['mua_sam', 'sua_chua', 'tuyen_dung', 'marketing', 'dao_tao', 'dau_tu', 'khac'];
const BLOCKS: { value: ProposalBlock; label: string }[] = [
  { value: 'all', label: 'Toàn hệ thống' },
  { value: 'KD', label: 'Khối Kinh doanh' },
  { value: 'VP', label: 'Khối Văn phòng' },
];

export function CreateProposalModal(props: {
  currentUserId: string;
  currentUserRole: string;
  currentBranchId: string | null;
  currentDepartmentId: string | null;
  departments: Department[];
  branches: Branch[];
  roles: Role[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { departments, branches, roles, currentBranchId, currentDepartmentId, onClose, onCreated } = props;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ProposalCategory>('mua_sam');
  const [block, setBlock] = useState<ProposalBlock>('all');
  const [branchId, setBranchId] = useState(currentBranchId ?? '');
  const [departmentId, setDepartmentId] = useState(currentDepartmentId ?? '');
  const [approverRole, setApproverRole] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter departments by block (nếu chọn KD/VP)
  const deptsInBlock = useMemo(
    () => block === 'all' ? departments : departments.filter((d) => d.blockId === block),
    [departments, block],
  );

  // Approver roles thường dùng — giúp UX. User cũng có thể nhập tự do nếu cần.
  const commonApproverRoles = useMemo(() => {
    const codes = ['GD_KD', 'GD_VP', 'CEO', 'TP_KE', 'TP_NS', 'TP_KT'];
    return codes
      .map((c) => roles.find((r) => r.code === c) ?? { code: c, name: c })
      .filter(Boolean);
  }, [roles]);

  async function handleSubmit() {
    setError(null);
    const t = title.trim();
    if (!t) { setError('Tiêu đề bắt buộc.'); return; }
    if (!approverRole) { setError('Phải chọn vai trò người duyệt.'); return; }
    setSaving(true);
    try {
      await proposalsApi.create({
        title: t,
        description: description.trim(),
        category,
        block,
        branchId: branchId || null,
        departmentId: departmentId || null,
        approverRole,
        estimatedCost: estimatedCost ? Number(estimatedCost.replace(/[^\d]/g, '')) : null,
      });
      onCreated();
    } catch (e: any) {
      setError(e.message ?? 'Lỗi tạo đề xuất');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h2 className="font-bold text-slate-800">Tạo đề xuất mới (Nháp)</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{error}</div>}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Tiêu đề <span className="text-rose-500">*</span></label>
            <input
              type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Vd: Đề xuất mua máy lọc nước cho CTT"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Mô tả chi tiết</label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={5000}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              placeholder="Lý do, chi tiết kỹ thuật, mong muốn…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Loại đề xuất</label>
              <select
                value={category} onChange={(e) => setCategory(e.target.value as ProposalCategory)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{PROPOSAL_CATEGORY_LABEL[c]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Khối</label>
              <select
                value={block} onChange={(e) => { setBlock(e.target.value as ProposalBlock); setDepartmentId(''); }}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {BLOCKS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Cơ sở (nếu có)</label>
              <select
                value={branchId} onChange={(e) => setBranchId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">— Không gắn cơ sở —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Phòng ban (nếu có)</label>
              <select
                value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">— Không gắn phòng —</option>
                {deptsInBlock.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Vai trò người duyệt <span className="text-rose-500">*</span>
            </label>
            <select
              value={approverRole} onChange={(e) => setApproverRole(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">— Chọn vai trò sẽ duyệt —</option>
              {commonApproverRoles.map((r) => <option key={r.code} value={r.code}>{r.name} ({r.code})</option>)}
            </select>
            <div className="text-xs text-slate-500 mt-1">
              Người duyệt sẽ chỉ định người thực hiện + hạn hoàn thành khi duyệt.
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Chi phí dự kiến (VND, tùy chọn)</label>
            <input
              type="text" value={estimatedCost}
              onChange={(e) => setEstimatedCost(e.target.value.replace(/[^\d.,]/g, ''))}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="vd: 5000000"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <button onClick={onClose} disabled={saving} className="px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 rounded-md">Hủy</button>
          <button
            onClick={handleSubmit} disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white text-sm font-semibold rounded-md hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Lưu nháp
          </button>
        </div>
      </div>
    </div>
  );
}
