'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Paperclip, Trash2, Plus } from 'lucide-react';
import {
  tasksApi,
  type Block, type TaskPriority, type TaskKind,
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

interface Department { id: string; name: string; blockId: 'KD' | 'VP' | null; }
interface Branch { id: string; name: string; }
interface User { id: string; name: string; roleId: string; branchId: string | null; departmentId: string | null; }

type AssigneeKind = 'department' | 'facility' | 'user';

export function TaskCreateModal(props: {
  kind: TaskKind;
  currentUserId: string;
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
    kind, currentUserId, currentUserRole, currentDepartmentId, currentBranchId,
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
  // Phase 12.6 (2026-06-03): BỎ phân biệt loại/nhóm chi/cost. Đề xuất chỉ còn tiêu đề + mô tả + người duyệt + file.
  // Đề xuất v2.5 (2026-06-03): người tạo CHỌN chuỗi người duyệt (ngang cấp + cấp trên).
  // Mảng UID theo thứ tự duyệt. Empty = không cần duyệt → đi thẳng pending.
  const [approverUserIds, setApproverUserIds] = useState<string[]>([]);

  // Cấp bậc người tạo — dùng để filter "Gửi cho" cho đề xuất (ngang cấp hoặc cấp trên)
  const myLevel = getRoleLevel(currentUserRole);

  // Phase 12.5: candidate người duyệt cho đề xuất — ngang cấp + cấp trên (level >= myLevel),
  // KHÔNG phải creator. Hiển thị mọi khối (anh chốt 2026-06-03 không phân biệt cross-block).
  const approverCandidates = useMemo(() => {
    return users
      .filter((u) => u.id !== currentUserId)
      .filter((u) => getRoleLevel(u.roleId) >= myLevel)
      .sort((a, b) => {
        const la = getRoleLevel(a.roleId);
        const lb = getRoleLevel(b.roleId);
        if (la !== lb) return lb - la; // cấp cao trước
        return a.name.localeCompare(b.name, 'vi');
      });
  }, [users, myLevel, currentUserId]);

  // Phase 12.5 (2026-06-03 v2): sort 2 tầng:
  //   1. Cùng khối creator ưu tiên trước (vd creator KD: KD trước VP)
  //   2. Trong mỗi nhóm: cấp cao trước cấp dưới
  // Ví dụ: creator KD chọn [GD_KD, GD_VP, TP_KE]
  //   → GD_KD (KD, 8) → GD_VP (VP, 8) → TP_KE (VP, 6)
  // Block 'all' (CEO/ADMIN) coi như cùng khối creator (ưu tiên).
  function sortApproversByLevel(uids: string[]): string[] {
    return [...uids].sort((a, b) => {
      const ua = users.find((u) => u.id === a);
      const ub = users.find((u) => u.id === b);
      const ba = ua ? (ROLE_BLOCK[ua.roleId] ?? 'all') : 'all';
      const bb = ub ? (ROLE_BLOCK[ub.roleId] ?? 'all') : 'all';
      const sameA = ba === myBlock || ba === 'all' ? 0 : 1;
      const sameB = bb === myBlock || bb === 'all' ? 0 : 1;
      if (sameA !== sameB) return sameA - sameB; // cùng khối creator trước
      const la = ua ? getRoleLevel(ua.roleId) : 0;
      const lb = ub ? getRoleLevel(ub.roleId) : 0;
      return lb - la; // cấp cao trước
    });
  }
  function addApprover() {
    const firstAvailable = approverCandidates.find((u) => !approverUserIds.includes(u.id));
    if (firstAvailable) setApproverUserIds((p) => sortApproversByLevel([...p, firstAvailable.id]));
  }
  // Auto-add cấp 1 khi mở form Đề xuất (bắt buộc ≥1 người duyệt)
  useEffect(() => {
    if (kind === 'proposal' && approverUserIds.length === 0 && approverCandidates.length > 0) {
      setApproverUserIds([approverCandidates[0].id]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);
  function removeApprover(idx: number) {
    setApproverUserIds((p) => p.filter((_, i) => i !== idx));
  }
  function changeApprover(idx: number, uid: string) {
    setApproverUserIds((p) => {
      const next = [...p];
      next[idx] = uid;
      return sortApproversByLevel(next);
    });
  }

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
    if (kind === 'proposal') {
      // Đề xuất v2.5 (2026-06-03): creator = executor + BẮT BUỘC chọn ≥1 người duyệt.
      if (approverUserIds.length === 0) {
        setError('Đã là đề xuất thì phải có ít nhất 1 người duyệt — bấm "+ Thêm cấp duyệt"');
        return;
      }
    } else if (assigneeKind === 'department') {
      if (!assigneeDeptId) { setError('Chọn phòng ban'); return; }
      deptId = assigneeDeptId;
    } else if (assigneeKind === 'facility') {
      if (!assigneeFacilityId) { setError('Chọn cơ sở'); return; }
      facilityId = assigneeFacilityId;
    } else {
      if (assigneeUserIds.length === 0) { setError('Chọn ít nhất 1 người'); return; }
      userIds = assigneeUserIds;
    }
    // Phase 12.6 (2026-06-03): BỎ phân biệt loại + nhóm chi + cost. Tất cả null cho proposal mới.
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
        proposalType: null,
        financialGroup: null,
        estimatedCost: null,
        approverUserIds: kind === 'proposal' ? approverUserIds : undefined,
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
              {kind === 'proposal'
                ? `Đi qua ${approverUserIds.length || 1} cấp duyệt → bạn thực hiện`
                : (willNeedApproval
                    ? (isCrossBlock ? `Liên khối → ${targetGDLabel} sẽ duyệt` : `Liên phòng/cơ sở → ${targetGDLabel} sẽ duyệt`)
                    : 'Đi thẳng đến người nhận, không cần duyệt')}
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

          {/* Phase 12.6 (2026-06-03): BỎ phân biệt loại/nhóm chi/cost. Đề xuất chỉ tiêu đề + mô tả + người duyệt + file. */}


          {/* Block radio — chỉ cho giao việc; đề xuất không cần (creator = executor). */}
          {kind !== 'proposal' && (
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
          )}

          {/* Đề xuất: chọn chuỗi người duyệt (BẮT BUỘC ≥ 1 cấp) */}
          {kind === 'proposal' && (
            <Field label={`Người duyệt * (${approverUserIds.length} cấp)`}>
              <div className="space-y-2">
                {approverUserIds.length === 0 && (
                  <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                    ⚠ Bắt buộc chọn ít nhất 1 người duyệt — đã là đề xuất thì phải có người duyệt.
                  </div>
                )}
                {approverUserIds.map((uid, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs font-bold text-amber-700 bg-amber-100 rounded px-2 py-1 min-w-[42px] text-center">
                      Cấp {idx + 1}
                    </span>
                    <select
                      value={uid}
                      onChange={(e) => changeApprover(idx, e.target.value)}
                      className={`${inputCls} flex-1`}
                    >
                      {approverCandidates
                        .filter((u) => u.id === uid || !approverUserIds.includes(u.id))
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} · {u.roleId}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeApprover(idx)}
                      className="text-slate-400 hover:text-rose-600 p-1"
                      title="Xoá cấp duyệt này"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {approverCandidates.length > approverUserIds.length && (
                  <button
                    type="button"
                    onClick={addApprover}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg"
                  >
                    <Plus size={12} /> Thêm cấp duyệt
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">
                Bắt buộc ít nhất 1 người duyệt. Chọn ngang cấp hoặc cấp trên — hệ thống tự sắp xếp <strong>cấp cao duyệt trước</strong> (GĐ → TP/QLCS → NV). Sau khi tất cả duyệt xong, bạn vào chi tiết và ấn "Hoàn thành".
              </p>
            </Field>
          )}

          {/* Assignee kind picker — CHỈ cho giao việc. Proposal đã thông báo creator = executor ở trên. */}
          {kind !== 'proposal' && (
          <Field label="Giao cho">
            <div className="flex gap-1 mb-2 bg-slate-100 p-1 rounded-lg">
              {(['department', 'facility', 'user'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => { setAssigneeKind(k); setAssigneeUserIds([]); }}
                  className={`flex-1 py-1.5 text-xs rounded font-medium ${
                    assigneeKind === k ? 'bg-white shadow text-emerald-700' : 'text-slate-600 hover:bg-white/50'
                  }`}
                >
                  {k === 'department' ? 'Phòng ban' : k === 'facility' ? 'Cơ sở' : 'Cá nhân'}
                </button>
              ))}
            </div>

            {assigneeKind === 'department' && (
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
            )}
            {assigneeKind === 'facility' && (
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
            )}
            {assigneeKind === 'user' && (
              <div className="max-h-40 overflow-auto border border-slate-200 rounded-lg p-2 bg-slate-50/40 space-y-1">
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
          )}

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
            {kind === 'proposal'
              ? 'Gửi để duyệt'
              : (willNeedApproval ? 'Gửi để duyệt' : `Tạo ${kindLabel}`)}
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
