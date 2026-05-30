'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Paperclip, Trash2 } from 'lucide-react';
import {
  tasksApi,
  type Block, type TaskPriority, type TaskKind,
  type ProposalType, type FinancialGroup,
  PROPOSAL_TYPE_LABEL, FINANCIAL_GROUP_LABEL, AUTO_APPROVE_THRESHOLD,
} from '@/lib/services/tasks/api-client';
import { ROLE_BLOCK } from '@/lib/permissions';

// Cấp bậc role để validate đề xuất "ngang cấp / cấp trên".
// Đề xuất chỉ được gửi cho người có level ≥ level creator.
const ROLE_LEVEL: Record<string, number> = {
  ADMIN: 10, CEO: 10,
  GD_KD: 8, GD_VP: 8,
  TP_KT: 6, TP_DT: 6, TP_MKT: 6, TP_GS: 6, TP_KE: 6, TP_NS: 6, TIBAN_TT: 6,
  PP_HT: 5, PP_XLN: 5, PP_DT_CM: 5, PP_DT_TC: 5,
  QLCS_HM: 5, QLCS_TK: 5, QLCS_CTT: 5, QLCS_24NCT: 5, QLCS_TT: 5,
  TT_LT: 4, TT_AS: 4, TT_DT: 4,
};
function getRoleLevel(roleCode: string): number {
  return ROLE_LEVEL[roleCode] ?? 3; // mặc định nhân viên cấp 3
}

const PROPOSAL_TYPES: ProposalType[] = ['tai_chinh', 'van_hanh'];
const FINANCIAL_GROUPS: FinancialGroup[] = ['chi_thuong_xuyen', 'chi_khac'];

/** Tính trước "đề xuất này có cần duyệt không, qua bao nhiêu cấp" để hiển thị cho user
 *  ngay trước khi submit. Mirror logic server (POST /api/tasks). */
function computeApprovalPreview(
  creatorRole: string,
  creatorBlock: 'KD' | 'VP' | 'all',
  proposalType: ProposalType,
  financialGroup: FinancialGroup | null,
  estimatedCost: number | null,
  assigneeBlock: Block,
): { chain: string[]; reason: string } {
  // Skip: creator đã ở top
  if (creatorRole === 'CEO' || creatorRole === 'ADMIN') return { chain: [], reason: 'Bạn ở cấp cao nhất — không cần duyệt' };
  // Skip: chi thường xuyên
  if (proposalType === 'tai_chinh' && financialGroup === 'chi_thuong_xuyen') {
    return { chain: [], reason: 'Chi hoạt động thường xuyên — QLCS tự quyết, không cần duyệt' };
  }
  // Skip: chi khác ≤ 5tr
  if (proposalType === 'tai_chinh' && financialGroup === 'chi_khac' && estimatedCost != null && estimatedCost <= AUTO_APPROVE_THRESHOLD) {
    return { chain: [], reason: `Chi ≤ ${(AUTO_APPROVE_THRESHOLD / 1_000_000).toFixed(0)}tr — QLCS tự quyết, không cần duyệt` };
  }
  // Cross-block: 2 cấp duyệt
  if (creatorBlock !== assigneeBlock && creatorBlock !== 'all') {
    const creatorGD = creatorBlock === 'KD' ? 'GD_KD' : 'GD_VP';
    const assigneeGD = assigneeBlock === 'KD' ? 'GD_KD' : 'GD_VP';
    return { chain: [creatorGD, assigneeGD], reason: `Cross-block: ${creatorGD} duyệt → ${assigneeGD} duyệt → đến người nhận` };
  }
  // Same block: 1 cấp
  const gd = assigneeBlock === 'KD' ? 'GD_KD' : 'GD_VP';
  return { chain: [gd], reason: `Cần ${gd} duyệt → đến người nhận` };
}

interface Department { id: string; name: string; blockId: 'KD' | 'VP' | null; }
interface Branch { id: string; name: string; }
interface User { id: string; name: string; roleId: string; branchId: string | null; departmentId: string | null; }

type AssigneeKind = 'department' | 'facility' | 'user';

export function TaskCreateModal(props: {
  kind: TaskKind;
  currentUserRole: string;
  currentDepartmentId: string | null;
  currentBranchId: string | null;
  departments: Department[];
  branches: Branch[];
  users: User[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const {
    kind, currentUserRole, currentDepartmentId, currentBranchId,
    departments, branches, users, onClose, onCreated,
  } = props;
  const kindLabel = kind === 'proposal' ? 'đề xuất' : 'giao việc';
  const kindLabelCap = kind === 'proposal' ? 'Đề xuất' : 'Giao việc';

  const myBlock = ROLE_BLOCK[currentUserRole] ?? 'all';
  const isCEO = currentUserRole === 'CEO' || currentUserRole === 'ADMIN';
  const isGD = currentUserRole === 'GD_KD' || currentUserRole === 'GD_VP';
  const isTP = currentUserRole.startsWith('TP_') || currentUserRole === 'TIBAN_TT';
  const isQLCS = currentUserRole.startsWith('QLCS_');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeBlock, setAssigneeBlock] = useState<Block>(myBlock === 'VP' ? 'VP' : 'KD');
  const [assigneeKind, setAssigneeKind] = useState<AssigneeKind>('department');
  const [assigneeDeptId, setAssigneeDeptId] = useState<string>('');
  const [assigneeFacilityId, setAssigneeFacilityId] = useState<string>('');
  const [assigneeUserIds, setAssigneeUserIds] = useState<string[]>([]);
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [dueDate, setDueDate] = useState<string>('');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Đề xuất v2: nội dung (tài chính/vận hành) + nhóm chi + số tiền
  const [proposalType, setProposalType] = useState<ProposalType>('van_hanh');
  const [financialGroup, setFinancialGroup] = useState<FinancialGroup>('chi_thuong_xuyen');
  const [estimatedCost, setEstimatedCost] = useState<string>('');

  // Cấp bậc người tạo — dùng để filter "Gửi cho" cho đề xuất (ngang cấp hoặc cấp trên)
  const myLevel = getRoleLevel(currentUserRole);

  // Filter departments theo khối nhận
  const deptsInBlock = useMemo(
    () => departments.filter((d) => d.blockId === assigneeBlock),
    [departments, assigneeBlock],
  );

  // Filter users theo khối + dept/facility (nếu chọn).
  // Đề xuất + tab "Cá nhân": CHỈ list cấp trên (GĐ_KD, GĐ_VP, CEO, ADMIN/Chủ tịch).
  // Giao việc: ngang cấp / cấp trên (logic cũ).
  const TOP_LEADER_ROLES = new Set(['GD_KD', 'GD_VP', 'CEO', 'ADMIN']);
  const usersInScope = useMemo(() => {
    return users.filter((u) => {
      // Đề xuất + tab user → chỉ list cấp trên
      if (kind === 'proposal' && assigneeKind === 'user') {
        return TOP_LEADER_ROLES.has(u.roleId);
      }
      const ub = ROLE_BLOCK[u.roleId];
      if (ub !== assigneeBlock && ub !== 'all') return false;
      if (assigneeKind === 'department' && assigneeDeptId && u.departmentId !== assigneeDeptId) return false;
      if (assigneeKind === 'facility' && assigneeFacilityId && u.branchId !== assigneeFacilityId) return false;
      if (kind === 'proposal' && getRoleLevel(u.roleId) < myLevel) return false;
      return true;
    });
  }, [users, assigneeBlock, assigneeKind, assigneeDeptId, assigneeFacilityId, kind, myLevel]);

  // Đề xuất + chọn phòng ban → tự động set assignee = TP của phòng đó (gửi cho TP).
  // Đề xuất + chọn cơ sở → tự động set assignee = QLCS của cơ sở.
  useEffect(() => {
    if (kind !== 'proposal') return;
    if (assigneeKind === 'department' && assigneeDeptId) {
      const tp = users.find((u) => u.departmentId === assigneeDeptId && u.roleId.startsWith('TP_'));
      setAssigneeUserIds(tp ? [tp.id] : []);
    } else if (assigneeKind === 'facility' && assigneeFacilityId) {
      const qlcs = users.find((u) => u.branchId === assigneeFacilityId && u.roleId.startsWith('QLCS_'));
      setAssigneeUserIds(qlcs ? [qlcs.id] : []);
    }
  }, [kind, assigneeKind, assigneeDeptId, assigneeFacilityId, users]);

  // Lookup tên TP / QLCS để hiển thị xác nhận dưới select
  const autoResolvedRecipient = useMemo(() => {
    if (kind !== 'proposal' || assigneeUserIds.length === 0) return null;
    const u = users.find((x) => x.id === assigneeUserIds[0]);
    return u ? `${u.name} (${u.roleId})` : null;
  }, [kind, assigneeUserIds, users]);

  // Constraints — đã mở: TP/QLCS/GĐ/CEO đều có thể cross-block / liên phòng.
  // computeApproval ở server tự quyết status (pending_approval khi cần).
  const isCrossBlock = myBlock !== 'all' && myBlock !== assigneeBlock;
  const isCrossDept =
    !isCrossBlock && !isCEO && !isGD &&
    ((assigneeKind === 'department' && assigneeDeptId && assigneeDeptId !== currentDepartmentId) ||
     (assigneeKind === 'facility' && assigneeFacilityId && assigneeFacilityId !== currentBranchId));
  const willNeedApproval = (isCrossBlock && !isCEO) || !!isCrossDept;
  const targetGDLabel = isCrossBlock
    ? (assigneeBlock === 'KD' ? 'GĐ Khối Kinh Doanh' : 'GĐ Khối Văn Phòng')
    : (myBlock === 'KD' ? 'GĐ Khối Kinh Doanh' : myBlock === 'VP' ? 'GĐ Khối Văn Phòng' : 'GĐ Khối');
  void isTP; void isQLCS;

  async function submit() {
    setError(null);
    if (!title.trim()) { setError('Tiêu đề bắt buộc'); return; }
    // Validate assignee theo kind
    let deptId: string | null = null;
    let facilityId: string | null = null;
    let userIds: string[] = [];
    if (assigneeKind === 'department') {
      if (!assigneeDeptId) { setError('Chọn phòng ban'); return; }
      deptId = assigneeDeptId;
    } else if (assigneeKind === 'facility') {
      if (!assigneeFacilityId) { setError('Chọn cơ sở'); return; }
      facilityId = assigneeFacilityId;
    } else {
      if (assigneeUserIds.length === 0) { setError('Chọn ít nhất 1 người'); return; }
      // Đề xuất: validate người nhận phải ≥ cấp người gửi
      if (kind === 'proposal') {
        const wrong = assigneeUserIds.find((uid) => {
          const u = users.find((x) => x.id === uid);
          return u && getRoleLevel(u.roleId) < myLevel;
        });
        if (wrong) { setError('Đề xuất chỉ được gửi cho người ngang cấp hoặc cấp trên — không gửi xuống cấp dưới.'); return; }
      }
      userIds = assigneeUserIds;
    }
    // Đề xuất v2: tài chính + chi khác bắt buộc số tiền > 0; chi thường xuyên cost optional
    let cost: number | null = null;
    if (kind === 'proposal' && proposalType === 'tai_chinh' && financialGroup === 'chi_khac') {
      const n = Number(estimatedCost.replace(/[^\d]/g, ''));
      if (!Number.isFinite(n) || n <= 0) { setError('Đề xuất chi khác bắt buộc nhập chi phí dự kiến (VND > 0).'); return; }
      cost = n;
    } else if (kind === 'proposal' && estimatedCost) {
      const n = Number(estimatedCost.replace(/[^\d]/g, ''));
      if (Number.isFinite(n) && n > 0) cost = n;
    }
    setSaving(true);
    try {
      const { id } = await tasksApi.create({
        kind,
        title: title.trim(),
        description: description.trim(),
        assigneeBlock,
        assigneeDeptId: deptId,
        assigneeFacilityId: facilityId,
        assigneeUserIds: userIds,
        priority,
        dueDate: dueDate || null,
        proposalType: kind === 'proposal' ? proposalType : null,
        financialGroup: kind === 'proposal' && proposalType === 'tai_chinh' ? financialGroup : null,
        estimatedCost: cost,
      });
      // Upload attachments tuần tự (đơn giản, ít edge case)
      if (files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          setUploadProgress(`Đang upload ${i + 1}/${files.length} (${files[i].name})...`);
          try {
            await tasksApi.uploadAttachment(id, files[i]);
          } catch (upErr: any) {
            // Task đã tạo thành công — chỉ báo lỗi file, không rollback
            setError(`Tạo ${kindLabel} OK, nhưng upload file "${files[i].name}" thất bại: ${upErr.message}. Bạn có thể đính kèm lại trong chi tiết task.`);
            // Tiếp tục upload file còn lại
          }
        }
      }
      onCreated();
    } catch (e: any) {
      // Network error (TypeError) → message ngắn không hữu ích; thêm gợi ý
      const msg = e?.message ?? 'unknown';
      if (msg === 'Failed to fetch' || msg.includes('NetworkError')) {
        setError('Không kết nối được server. Kiểm tra mạng hoặc dev server (npm run dev) có đang chạy không.');
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
      setUploadProgress(null);
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold">Tạo {kindLabel} mới</h2>
            <p className="text-xs text-emerald-50/90 mt-0.5">
              {willNeedApproval
                ? (isCrossBlock ? `Liên khối → ${targetGDLabel} sẽ duyệt` : `Liên phòng/cơ sở → ${targetGDLabel} sẽ duyệt`)
                : 'Đi thẳng đến người nhận, không cần duyệt'}
            </p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X size={20} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {error && (
            <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">{error}</div>
          )}

          {/* Title */}
          <Field label="Tiêu đề *">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Ngắn gọn, dễ hiểu"
              className={inputCls}
            />
          </Field>

          {/* Description */}
          <Field label="Mô tả">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={5000}
              placeholder="Mục tiêu, các bước, kết quả mong muốn..."
              className={inputCls}
            />
          </Field>

          {/* Đề xuất v2: nội dung + nhóm chi + số tiền (tài chính) */}
          {kind === 'proposal' && (
            <>
              <Field label="Nội dung đề xuất *">
                <div className="grid grid-cols-2 gap-2">
                  {PROPOSAL_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setProposalType(t)}
                      className={`px-3 py-2 rounded-lg text-sm font-semibold ring-1 transition ${
                        proposalType === t
                          ? 'bg-amber-50 text-amber-800 ring-amber-300'
                          : 'bg-white text-slate-600 ring-slate-200 hover:ring-amber-200'
                      }`}
                    >
                      {t === 'tai_chinh' ? '💰 ' : '⚙️ '}{PROPOSAL_TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </Field>
              {proposalType === 'tai_chinh' && (
                <>
                  <Field label="Nhóm chi *">
                    <select
                      value={financialGroup}
                      onChange={(e) => setFinancialGroup(e.target.value as FinancialGroup)}
                      className={inputCls}
                    >
                      {FINANCIAL_GROUPS.map((g) => (
                        <option key={g} value={g}>{FINANCIAL_GROUP_LABEL[g]}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={financialGroup === 'chi_khac' ? 'Chi phí dự kiến (VND) *' : 'Chi phí dự kiến (VND, tùy chọn)'}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={estimatedCost}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^\d]/g, '');
                        setEstimatedCost(raw ? Number(raw).toLocaleString('vi-VN') : '');
                      }}
                      placeholder="vd: 5.000.000"
                      className={inputCls}
                    />
                  </Field>
                </>
              )}
              {/* Preview luồng duyệt — minh bạch trước khi gửi */}
              {(() => {
                const costNum = estimatedCost ? Number(estimatedCost.replace(/[^\d]/g, '')) : null;
                const preview = computeApprovalPreview(currentUserRole, myBlock, proposalType, proposalType === 'tai_chinh' ? financialGroup : null, costNum, assigneeBlock);
                return (
                  <div className={`text-xs rounded-lg p-2.5 ${preview.chain.length === 0 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                    <span className="font-semibold">{preview.chain.length === 0 ? '✓ Không cần duyệt:' : `📋 Cần duyệt (${preview.chain.length} cấp):`}</span> {preview.reason}
                  </div>
                );
              })()}
            </>
          )}

          {/* Block radio */}
          <Field label="Khối nhận">
            <div className="flex gap-2">
              {(['KD', 'VP'] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => {
                    setAssigneeBlock(b);
                    setAssigneeDeptId('');
                    setAssigneeFacilityId('');
                    setAssigneeUserIds([]);
                  }}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold ring-1 transition ${
                    assigneeBlock === b
                      ? 'bg-emerald-600 text-white ring-emerald-600 shadow-sm'
                      : 'bg-white text-slate-600 ring-slate-200 hover:ring-emerald-300 hover:text-emerald-700'
                  }`}
                >
                  {b === 'KD' ? '💼 Khối Kinh Doanh' : '📑 Khối Văn Phòng'}
                  {b !== myBlock && myBlock !== 'all' && (
                    <span className="ml-1 text-[10px] opacity-75">(liên khối)</span>
                  )}
                </button>
              ))}
            </div>
          </Field>

          {/* Assignee kind picker — proposal: 3 nhóm rõ ràng (gửi TP phòng / QLCS cơ sở / Lãnh đạo cá nhân) */}
          <Field label={kind === 'proposal' ? 'Gửi cho' : 'Giao cho'}>
            <div className="flex gap-1 mb-2 bg-slate-100 p-1 rounded-lg">
              {(['department', 'facility', 'user'] as const).map((k) => {
                const labels = kind === 'proposal'
                  ? { department: 'Phòng ban', facility: 'Cơ sở', user: 'Lãnh đạo' }
                  : { department: 'Phòng ban', facility: 'Cơ sở', user: 'Cá nhân' };
                return (
                  <button
                    key={k}
                    onClick={() => { setAssigneeKind(k); setAssigneeUserIds([]); }}
                    className={`flex-1 py-1.5 text-xs rounded font-medium ${
                      assigneeKind === k ? 'bg-white shadow text-emerald-700' : 'text-slate-600 hover:bg-white/50'
                    }`}
                  >
                    {labels[k]}
                  </button>
                );
              })}
            </div>

            {assigneeKind === 'department' && (
              <>
                <select
                  value={assigneeDeptId}
                  onChange={(e) => setAssigneeDeptId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">-- Chọn phòng --</option>
                  {deptsInBlock.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}{d.id === currentDepartmentId ? ' (phòng của bạn)' : ''}
                    </option>
                  ))}
                </select>
                {kind === 'proposal' && assigneeDeptId && (
                  <div className={`mt-1.5 text-xs px-2 py-1.5 rounded ${autoResolvedRecipient ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                    {autoResolvedRecipient ? `→ Gửi cho TP: ${autoResolvedRecipient}` : '⚠ Phòng này chưa có Trưởng phòng — đề xuất sẽ không có người nhận'}
                  </div>
                )}
              </>
            )}
            {assigneeKind === 'facility' && (
              <>
                <select
                  value={assigneeFacilityId}
                  onChange={(e) => setAssigneeFacilityId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">-- Chọn cơ sở --</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.id} · {b.name}{b.id === currentBranchId ? ' (cơ sở của bạn)' : ''}
                    </option>
                  ))}
                </select>
                {kind === 'proposal' && assigneeFacilityId && (
                  <div className={`mt-1.5 text-xs px-2 py-1.5 rounded ${autoResolvedRecipient ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                    {autoResolvedRecipient ? `→ Gửi cho QLCS: ${autoResolvedRecipient}` : '⚠ Cơ sở này chưa có QLCS — đề xuất sẽ không có người nhận'}
                  </div>
                )}
              </>
            )}
            {assigneeKind === 'user' && (
              <div className="max-h-40 overflow-auto border border-slate-200 rounded-lg p-2 bg-slate-50/40 space-y-1">
                {kind === 'proposal' && (
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 px-2 pb-1 font-semibold">
                    Lãnh đạo cấp trên
                  </div>
                )}
                {usersInScope.length === 0 && (
                  <div className="text-xs text-slate-400 text-center py-3">Không có người nhận phù hợp</div>
                )}
                {usersInScope.map((u) => {
                  const checked = assigneeUserIds.includes(u.id);
                  return (
                    <label key={u.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setAssigneeUserIds((p) => e.target.checked ? [...p, u.id] : p.filter((x) => x !== u.id));
                        }}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="font-medium text-slate-800">{u.name}</span>
                      <span className="text-xs text-slate-400">{u.roleId}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Ưu tiên">
              <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className={inputCls}>
                <option value="low">Thấp</option>
                <option value="normal">Bình thường</option>
                <option value="high">Cao</option>
                <option value="urgent">Khẩn</option>
              </select>
            </Field>
            <Field label="Hạn chót">
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
            </Field>
          </div>

          {/* File attachments */}
          <Field label="File đính kèm (tuỳ chọn)">
            <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 border border-dashed border-emerald-300 rounded-lg text-sm text-emerald-700 hover:bg-emerald-50">
              <Paperclip size={14} />
              Chọn file (ảnh, PDF, Office, ZIP — tối đa 20MB/file)
              <input
                type="file"
                multiple
                onChange={(e) => {
                  const list = Array.from(e.target.files ?? []);
                  setFiles((p) => [...p, ...list]);
                  e.target.value = '';
                }}
                className="hidden"
              />
            </label>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs px-2 py-1 bg-slate-50 rounded">
                    <Paperclip size={11} className="text-slate-400" />
                    <span className="flex-1 truncate text-slate-700">{f.name}</span>
                    <span className="text-slate-400 tabular-nums">{(f.size / 1024).toFixed(0)} KB</span>
                    <button
                      type="button"
                      onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                      className="text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 size={11} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {uploadProgress && (
              <p className="mt-1 text-xs text-emerald-700">{uploadProgress}</p>
            )}
          </Field>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2 bg-slate-50/40">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Huỷ</button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 shadow-sm inline-flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {willNeedApproval ? 'Gửi để duyệt' : `Tạo ${kindLabel}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
