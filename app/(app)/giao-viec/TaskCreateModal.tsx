'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Paperclip, Trash2 } from 'lucide-react';
import {
  tasksApi,
  type Block, type TaskPriority, type TaskKind,
} from '@/lib/services/tasks/api-client';
import { ROLE_BLOCK } from '@/lib/permissions';

// Phase 12.8 (2026-06-04): Form Đề xuất theo tài liệu chuẩn.
//   - Module /giao-viec chỉ cho TP/QLCS/GD/CEO/ADMIN (NV/GV/TT bị ẩn menu).
//   - Đề xuất có 2 scope: Trong khối / Liên khối
//   - Liên khối có 2 subtype: Thường xuyên (không qua GĐ khối mình) / Phát sinh (qua GĐ khối mình duyệt)
//   - Người tạo chọn ĐỐI TƯỢNG NHẬN (phòng ban / cơ sở / GĐ khối), KHÔNG chọn user cụ thể.
//   - Hệ thống tự build approvalChain: liên khối phát sinh = [GĐ khối creator, recipient]; còn lại = [recipient].
//   - Mọi người nhận đều có 3 nút Duyệt/Bổ sung/Từ chối + ghi chú.
//   - Bỏ phân biệt tài chính/vận hành, bỏ cost.
//   - Giao việc (kind=assignment): giữ nguyên logic cũ.

interface Department { id: string; name: string; blockId: 'KD' | 'VP' | null; }
interface Branch { id: string; name: string; }
interface User { id: string; name: string; roleId: string; branchId: string | null; departmentId: string | null; }

type AssigneeKind = 'department' | 'facility' | 'user';
type ProposalScope = 'in_block' | 'cross_block';
type ProposalSubtype = 'regular' | 'incidental';
type RecipientType = 'department' | 'facility' | 'gd_block';

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
    kind, currentUserRole, currentDepartmentId, currentBranchId,
    departments, branches, users, onClose, onCreated,
  } = props;
  void props.currentUserId; // dùng khi cần
  const kindLabel = kind === 'proposal' ? 'đề xuất' : 'giao việc';

  const myBlock = ROLE_BLOCK[currentUserRole] ?? 'all';
  const isCEO = currentUserRole === 'CEO' || currentUserRole === 'ADMIN';
  const isGD = currentUserRole === 'GD_KD' || currentUserRole === 'GD_VP';
  const isTP = currentUserRole.startsWith('TP_') || currentUserRole === 'TIBAN_TT';
  const isQLCS = currentUserRole.startsWith('QLCS_');
  void isTP; void isQLCS;

  // Common state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [dueDate, setDueDate] = useState<string>('');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ─── ASSIGNMENT state (giao việc — giữ nguyên) ───
  const [assigneeBlock, setAssigneeBlock] = useState<Block>(myBlock === 'VP' ? 'VP' : 'KD');
  const [assigneeKind, setAssigneeKind] = useState<AssigneeKind>('department');
  const [assigneeDeptId, setAssigneeDeptId] = useState<string>('');
  const [assigneeFacilityId, setAssigneeFacilityId] = useState<string>('');
  const [assigneeUserIds, setAssigneeUserIds] = useState<string[]>([]);

  // ─── PROPOSAL state (mới) ───
  // Phase 12.8.1 (2026-06-04): default in_block cho mọi role. GĐ cũng được đề xuất trong khối
  // (vd GD_KD đề xuất xuống TP_KT khối mình). Bỏ rule ép GĐ → cross_block.
  const [proposalScope, setProposalScope] = useState<ProposalScope>('in_block');
  const [proposalSubtype, setProposalSubtype] = useState<ProposalSubtype>('regular');
  const [recipientType, setRecipientType] = useState<RecipientType>('department');
  const [recipientDeptId, setRecipientDeptId] = useState<string>('');
  const [recipientFacilityId, setRecipientFacilityId] = useState<string>('');
  const [recipientGdRole, setRecipientGdRole] = useState<'GD_KD' | 'GD_VP'>(myBlock === 'VP' ? 'GD_VP' : 'GD_KD');

  // Filter departments theo scope: trong khối = phòng cùng khối (trừ phòng mình); liên khối = phòng khối khác
  const recipientDepts = useMemo(() => {
    if (kind !== 'proposal') return [];
    const targetBlock = proposalScope === 'in_block' ? myBlock : (myBlock === 'KD' ? 'VP' : 'KD');
    return departments.filter((d) => {
      if (d.blockId !== targetBlock) return false;
      // Không tự đề xuất cho phòng của mình
      if (currentDepartmentId && d.id === currentDepartmentId) return false;
      return true;
    });
  }, [kind, departments, proposalScope, myBlock, currentDepartmentId]);

  // Cơ sở: 5 cơ sở (HM/TK/CTT/24/TT) đều thuộc khối KD.
  //   - in_block + KD: list 5 cơ sở (trừ cơ sở mình)
  //   - in_block + VP: empty (VP không có cơ sở)
  //   - cross_block + KD: empty (đề xuất sang VP, VP không có cơ sở)
  //   - cross_block + VP: list 5 cơ sở (đề xuất sang KD)
  const recipientFacilities = useMemo(() => {
    if (kind !== 'proposal') return [];
    const targetBlock = proposalScope === 'in_block' ? myBlock : (myBlock === 'KD' ? 'VP' : 'KD');
    if (targetBlock !== 'KD') return []; // cơ sở chỉ thuộc khối KD
    return branches.filter((b) => b.id !== currentBranchId);
  }, [kind, branches, proposalScope, myBlock, currentBranchId]);

  // GĐ khối: trong khối = GĐ khối mình; liên khối = GĐ khối khác
  const recipientGdOptions = useMemo<Array<{ role: 'GD_KD' | 'GD_VP'; label: string }>>(() => {
    if (kind !== 'proposal') return [];
    if (proposalScope === 'in_block') {
      if (myBlock === 'KD') return [{ role: 'GD_KD', label: 'GĐ Khối Kinh Doanh' }];
      if (myBlock === 'VP') return [{ role: 'GD_VP', label: 'GĐ Khối Văn Phòng' }];
      return [
        { role: 'GD_KD', label: 'GĐ Khối Kinh Doanh' },
        { role: 'GD_VP', label: 'GĐ Khối Văn Phòng' },
      ];
    }
    // Cross-block: GĐ khối khác
    if (myBlock === 'KD') return [{ role: 'GD_VP', label: 'GĐ Khối Văn Phòng' }];
    if (myBlock === 'VP') return [{ role: 'GD_KD', label: 'GĐ Khối Kinh Doanh' }];
    return [];
  }, [kind, proposalScope, myBlock]);

  // Reset recipient khi đổi scope (vì danh sách thay đổi)
  useEffect(() => {
    if (kind !== 'proposal') return;
    setRecipientDeptId('');
    setRecipientFacilityId('');
    if (recipientGdOptions.length > 0) setRecipientGdRole(recipientGdOptions[0].role);
    // Subtype regular default
    if (proposalScope === 'in_block') setProposalSubtype('regular');
  }, [proposalScope, kind, recipientGdOptions]);

  // CEO/ADMIN không tạo được đề xuất — báo lỗi rõ ràng
  const creatorBlocked = kind === 'proposal' && isCEO;

  // Constraints cho ASSIGNMENT (giữ logic cũ)
  const deptsInBlock = useMemo(
    () => departments.filter((d) => d.blockId === assigneeBlock),
    [departments, assigneeBlock],
  );
  const usersInScope = useMemo(() => {
    return users.filter((u) => {
      const ub = ROLE_BLOCK[u.roleId];
      if (ub !== assigneeBlock && ub !== 'all') return false;
      if (assigneeKind === 'department' && assigneeDeptId && u.departmentId !== assigneeDeptId) return false;
      if (assigneeKind === 'facility' && assigneeFacilityId && u.branchId !== assigneeFacilityId) return false;
      return true;
    });
  }, [users, assigneeBlock, assigneeKind, assigneeDeptId, assigneeFacilityId]);
  const isCrossBlock = myBlock !== 'all' && myBlock !== assigneeBlock;
  const isCrossDept =
    !isCrossBlock && !isCEO && !isGD &&
    ((assigneeKind === 'department' && assigneeDeptId && assigneeDeptId !== currentDepartmentId) ||
     (assigneeKind === 'facility' && assigneeFacilityId && assigneeFacilityId !== currentBranchId));
  const willNeedApproval = (isCrossBlock && !isCEO) || !!isCrossDept;
  const targetGDLabel = isCrossBlock
    ? (assigneeBlock === 'KD' ? 'GĐ Khối Kinh Doanh' : 'GĐ Khối Văn Phòng')
    : (myBlock === 'KD' ? 'GĐ Khối Kinh Doanh' : myBlock === 'VP' ? 'GĐ Khối Văn Phòng' : 'GĐ Khối');

  // Số cấp duyệt dự kiến cho proposal (để hiển thị)
  const proposalChainPreview = useMemo<number>(() => {
    if (kind !== 'proposal') return 0;
    if (proposalScope === 'cross_block' && proposalSubtype === 'incidental') return 2; // GĐ khối mình + recipient
    return 1; // chỉ recipient
  }, [kind, proposalScope, proposalSubtype]);

  async function submit() {
    setError(null);
    if (creatorBlocked) {
      setError('CEO/Chủ tịch không cần tạo đề xuất — tự ra quyết định trực tiếp.');
      return;
    }
    if (!title.trim()) { setError('Tiêu đề bắt buộc'); return; }

    if (kind === 'proposal') {
      // Validate recipient theo type
      if (recipientType === 'department' && !recipientDeptId) {
        setError('Chọn phòng ban nhận đề xuất');
        return;
      }
      if (recipientType === 'facility' && !recipientFacilityId) {
        setError('Chọn cơ sở nhận đề xuất');
        return;
      }
      if (recipientType === 'gd_block' && !recipientGdRole) {
        setError('Chọn GĐ khối nhận đề xuất');
        return;
      }
      // Cross-block: phòng/cơ sở phải khác khối creator
      if (proposalScope === 'cross_block' && recipientType === 'department') {
        const d = departments.find((x) => x.id === recipientDeptId);
        if (d && d.blockId === myBlock) {
          setError('Đề xuất liên khối phải chọn phòng ban khối khác.');
          return;
        }
      }
    } else {
      // Giao việc validate cũ
      if (assigneeKind === 'department' && !assigneeDeptId) { setError('Chọn phòng ban'); return; }
      if (assigneeKind === 'facility' && !assigneeFacilityId) { setError('Chọn cơ sở'); return; }
      if (assigneeKind === 'user' && assigneeUserIds.length === 0) { setError('Chọn ít nhất 1 người'); return; }
    }

    setSaving(true);
    try {
      // Body khác nhau theo kind
      let createBody: Parameters<typeof tasksApi.create>[0];
      if (kind === 'proposal') {
        createBody = {
          kind: 'proposal',
          title: title.trim(),
          description: description.trim(),
          // assigneeBlock dùng để server biết block đích (cho cross-block check)
          assigneeBlock: (proposalScope === 'in_block' ? myBlock : (myBlock === 'KD' ? 'VP' : 'KD')) as Block,
          assigneeDeptId: recipientType === 'department' ? recipientDeptId : null,
          assigneeFacilityId: recipientType === 'facility' ? recipientFacilityId : null,
          assigneeUserIds: [],
          priority,
          dueDate: dueDate || null,
          proposalType: null,
          financialGroup: null,
          estimatedCost: null,
          // Server tự build chain dựa vào scope/subtype/recipient
          proposalScope,
          proposalSubtype: proposalScope === 'cross_block' ? proposalSubtype : null,
          recipientType,
          recipientGdRole: recipientType === 'gd_block' ? recipientGdRole : null,
        } as any;
      } else {
        createBody = {
          kind,
          title: title.trim(),
          description: description.trim(),
          assigneeBlock,
          assigneeDeptId: assigneeKind === 'department' ? assigneeDeptId : null,
          assigneeFacilityId: assigneeKind === 'facility' ? assigneeFacilityId : null,
          assigneeUserIds: assigneeKind === 'user' ? assigneeUserIds : [],
          priority,
          dueDate: dueDate || null,
          proposalType: null,
          financialGroup: null,
          estimatedCost: null,
        };
      }
      const { id } = await tasksApi.create(createBody);

      if (files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          setUploadProgress(`Đang upload ${i + 1}/${files.length} (${files[i].name})...`);
          try {
            await tasksApi.uploadAttachment(id, files[i]);
          } catch (upErr: any) {
            setError(`Tạo ${kindLabel} OK, nhưng upload file "${files[i].name}" thất bại: ${upErr.message}.`);
          }
        }
      }
      onCreated();
    } catch (e: any) {
      const msg = e?.message ?? 'unknown';
      if (msg === 'Failed to fetch' || msg.includes('NetworkError')) {
        setError('Không kết nối được server. Kiểm tra mạng.');
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
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold">Tạo {kindLabel} mới</h2>
            <p className="text-xs text-emerald-50/90 mt-0.5">
              {kind === 'proposal'
                ? `${proposalChainPreview} cấp duyệt`
                : (willNeedApproval
                    ? (isCrossBlock ? `Liên khối → ${targetGDLabel} sẽ duyệt` : `Liên phòng/cơ sở → ${targetGDLabel} sẽ duyệt`)
                    : 'Đi thẳng đến người nhận, không cần duyệt')}
            </p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          {error && (
            <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">{error}</div>
          )}
          {creatorBlocked && (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              CEO/Chủ tịch không cần tạo đề xuất — tự ra quyết định trực tiếp.
            </div>
          )}

          <Field label="Tiêu đề *">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Ngắn gọn, dễ hiểu"
              className={inputCls}
            />
          </Field>

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

          {/* ═══════ FORM ĐỀ XUẤT (NEW) ═══════ */}
          {kind === 'proposal' && (
            <>
              {/* Scope: Trong khối / Liên khối */}
              <Field label="Loại đề xuất *">
                <div className="grid grid-cols-2 gap-2">
                  {(['in_block', 'cross_block'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setProposalScope(s)}
                      className={`px-3 py-2 rounded-lg text-sm font-semibold ring-1 transition ${
                        proposalScope === s
                          ? 'bg-emerald-50 text-emerald-800 ring-emerald-300'
                          : 'bg-white text-slate-600 ring-slate-200 hover:ring-emerald-200'
                      }`}
                    >
                      {s === 'in_block' ? '🏠 Trong khối' : '🔀 Liên khối'}
                    </button>
                  ))}
                </div>
              </Field>

              {/* Subtype: chỉ cho Liên khối */}
              {proposalScope === 'cross_block' && (
                <Field label="Tính chất hoạt động *">
                  <div className="space-y-1.5">
                    {(['regular', 'incidental'] as const).map((st) => (
                      <label key={st} className="flex items-start gap-2 px-3 py-2 ring-1 ring-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                        <input
                          type="radio"
                          name="subtype"
                          value={st}
                          checked={proposalSubtype === st}
                          onChange={() => setProposalSubtype(st)}
                          className="mt-0.5 text-emerald-600"
                        />
                        <div>
                          <div className="text-sm font-medium text-slate-800">
                            {st === 'regular' ? 'Thường xuyên' : 'Phát sinh'}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {st === 'regular'
                              ? 'Gửi thẳng sang phòng/cơ sở khối khác — KHÔNG qua GĐ khối mình.'
                              : 'Cần GĐ khối mình duyệt trước, rồi mới chuyển sang phòng/cơ sở khối khác.'}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </Field>
              )}

              {/* Recipient type */}
              <Field label="Đối tượng nhận *">
                <div className="flex gap-1 mb-2 bg-slate-100 p-1 rounded-lg">
                  {(['department', 'facility', 'gd_block'] as const).map((rt) => {
                    const disabled = (rt === 'facility' && recipientFacilities.length === 0) ||
                                     (rt === 'gd_block' && recipientGdOptions.length === 0);
                    return (
                      <button
                        key={rt}
                        type="button"
                        onClick={() => setRecipientType(rt)}
                        disabled={disabled}
                        className={`flex-1 py-1.5 text-xs rounded font-medium ${
                          recipientType === rt ? 'bg-white shadow text-emerald-700' : 'text-slate-600 hover:bg-white/50'
                        } disabled:opacity-40`}
                      >
                        {rt === 'department' ? 'Phòng ban' : rt === 'facility' ? 'Cơ sở' : 'GĐ Khối'}
                      </button>
                    );
                  })}
                </div>

                {recipientType === 'department' && (
                  <select
                    value={recipientDeptId}
                    onChange={(e) => setRecipientDeptId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">-- Chọn phòng ban --</option>
                    {recipientDepts.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                )}
                {recipientType === 'facility' && (
                  <select
                    value={recipientFacilityId}
                    onChange={(e) => setRecipientFacilityId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">-- Chọn cơ sở --</option>
                    {recipientFacilities.map((b) => (
                      <option key={b.id} value={b.id}>{b.id} · {b.name}</option>
                    ))}
                  </select>
                )}
                {recipientType === 'gd_block' && (
                  <select
                    value={recipientGdRole}
                    onChange={(e) => setRecipientGdRole(e.target.value as 'GD_KD' | 'GD_VP')}
                    className={inputCls}
                  >
                    {recipientGdOptions.map((o) => (
                      <option key={o.role} value={o.role}>{o.label}</option>
                    ))}
                  </select>
                )}
                <p className="mt-1.5 text-[11px] text-slate-500">
                  {proposalScope === 'cross_block' && proposalSubtype === 'incidental'
                    ? '2 cấp duyệt: GĐ khối bạn → người nhận khối khác.'
                    : '1 cấp duyệt: người nhận trực tiếp duyệt.'}
                </p>
              </Field>
            </>
          )}

          {/* ═══════ FORM GIAO VIỆC (giữ nguyên) ═══════ */}
          {kind === 'assignment' && (
            <>
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
            </>
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

        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2 bg-slate-50/40">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Huỷ</button>
          <button
            onClick={submit}
            disabled={saving || creatorBlocked}
            className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 shadow-sm inline-flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {kind === 'proposal' ? 'Gửi để duyệt' : (willNeedApproval ? 'Gửi để duyệt' : `Tạo ${kindLabel}`)}
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
