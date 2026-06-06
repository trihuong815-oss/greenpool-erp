'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Paperclip, Trash2 } from 'lucide-react';
import {
  tasksApi,
  type Block, type TaskPriority, type TaskKind,
} from '@/lib/services/tasks/api-client';
import { ROLE_BLOCK } from '@/lib/permissions';

// Phase 12.9 (2026-06-04): Form Đề xuất đơn giản hoá.
//   - 2 tab: NGANG CẤP / CẤP TRÊN
//   - Mỗi tab → dropdown user phù hợp
//   - Server: chain = [recipientUid] (1 cấp duyệt)
//   - Module /giao-viec chỉ cho TP/QLCS/GD/CEO/ADMIN.

// Phase 12.9: chỉ tầng 3 (theo sơ đồ org).
// TIBAN_TT đã hạ xuống tầng 4 (thuộc phòng NS) — không nằm trong pool này nữa.
const PEER_ROLES = new Set([
  'TP_KT', 'TP_DT', 'TP_MKT', 'TP_GS', 'TP_KE', 'TP_NS',
  'QLCS_HM', 'QLCS_TK', 'QLCS_CTT', 'QLCS_24NCT', 'QLCS_TT',
]);

// Phase 12.9.6 (2026-06-06): cấu trúc tabs khối cho TP/QLCS.
//   - Khối KD: phòng ban (TP_KT/DT/MKT) + cơ sở (QLCS_*) + lãnh đạo (GD_KD / ADMIN fallback)
//   - Khối VP: phòng ban (TP_KE/GS/NS) + lãnh đạo (GD_VP) — VP không có cơ sở
const TP_ROLES_KD = new Set(['TP_KT', 'TP_DT', 'TP_MKT']);
const TP_ROLES_VP = new Set(['TP_GS', 'TP_KE', 'TP_NS']);
const QLCS_ROLES = new Set(['QLCS_HM', 'QLCS_TK', 'QLCS_CTT', 'QLCS_24NCT', 'QLCS_TT']);

interface Department { id: string; name: string; blockId: 'KD' | 'VP' | null; }
interface Branch { id: string; name: string; }
interface User { id: string; name: string; roleId: string; branchId: string | null; departmentId: string | null; }

type AssigneeKind = 'department' | 'facility' | 'user';
type RecipientTier = 'peer' | 'senior';

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

  const myBlock = ROLE_BLOCK[currentUserRole] ?? 'all';
  // Phase 12.9.1 (anh chốt 2026-06-05): ADMIN ≠ CEO. ADMIN trong CTY xếp dưới CEO/Chủ tịch
  // → ADMIN vẫn cần đề xuất (peer GD_KD/GD_VP, senior CEO/Chủ tịch).
  const isCEO = currentUserRole === 'CEO'; // CHỈ CEO thuần (không ADMIN)
  const isAdmin = currentUserRole === 'ADMIN';
  const isGD = currentUserRole === 'GD_KD' || currentUserRole === 'GD_VP';
  const isTP = currentUserRole.startsWith('TP_');
  const isQLCS = currentUserRole.startsWith('QLCS_');
  // Phase 12.9.6: TP/QLCS dùng UI tabs khối (KD/VP) + 3 nhóm.
  const isCreatorTpQlcs = isTP || isQLCS;

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

  // ─── PROPOSAL state (Phase 12.9 — đơn giản hoá) ───
  const [recipientTier, setRecipientTier] = useState<RecipientTier>('peer');
  const [recipientUid, setRecipientUid] = useState<string>('');
  // Phase 12.9.6: cho TP/QLCS — chọn khối nhận (default = khối creator).
  const [recipientBlock, setRecipientBlock] = useState<'KD' | 'VP'>(myBlock === 'VP' ? 'VP' : 'KD');

  // Phase 12.9.4 (anh chốt 2026-06-06): cho phép đề xuất LIÊN KHỐI cho TP/QLCS.
  // Khi recipient cross-block → server tự chèn GĐ khối creator vào đầu chain (2 cấp duyệt).
  // Cùng khối → 1 cấp duyệt như cũ.
  const peerCandidates = useMemo<User[]>(() => {
    if (kind !== 'proposal') return [];
    if (isCEO) return [];
    // ADMIN: ngang cấp = GD_KD + GD_VP
    if (isAdmin) {
      return users
        .filter((u) => u.roleId === 'GD_KD' || u.roleId === 'GD_VP')
        .filter((u) => u.id !== currentUserId)
        .sort((a, b) => a.roleId.localeCompare(b.roleId));
    }
    // GĐ: ngang cấp = GĐ khối còn lại
    if (isGD) {
      const peerGdRole = currentUserRole === 'GD_KD' ? 'GD_VP' : 'GD_KD';
      return users.filter((u) => u.roleId === peerGdRole && u.id !== currentUserId);
    }
    // TP/QLCS/TIBAN_TT: ngang cấp = TP + QLCS CẢ 2 KHỐI (anh chốt 2026-06-06).
    // Server tự chèn GĐ khối creator nếu recipient khác khối.
    return users
      .filter((u) => PEER_ROLES.has(u.roleId))
      .filter((u) => u.id !== currentUserId)
      .sort((a, b) => {
        // Cùng khối ưu tiên hiển thị trước
        const blockA = ROLE_BLOCK[a.roleId] ?? 'all';
        const blockB = ROLE_BLOCK[b.roleId] ?? 'all';
        const sameA = blockA === myBlock ? 0 : 1;
        const sameB = blockB === myBlock ? 0 : 1;
        if (sameA !== sameB) return sameA - sameB;
        return a.name.localeCompare(b.name, 'vi');
      });
  }, [kind, users, isCEO, isAdmin, isGD, currentUserRole, currentUserId, myBlock]);

  const seniorCandidates = useMemo<User[]>(() => {
    if (kind !== 'proposal') return [];
    if (isCEO) return [];
    // ADMIN: cấp trên = CEO
    if (isAdmin) {
      return users
        .filter((u) => u.roleId === 'CEO')
        .filter((u) => u.id !== currentUserId)
        .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    }
    // GĐ: cấp trên = CEO
    if (isGD) {
      return users
        .filter((u) => u.roleId === 'CEO')
        .filter((u) => u.id !== currentUserId)
        .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    }
    // TP/QLCS/TIBAN_TT: cấp trên = GĐ KHỐI cả 2 (anh chốt 2026-06-06 cho liên khối).
    // Phase 12.9.5: nếu slot GD_KD trống → hiển thị ADMIN (anh đảm nhiệm GĐKD thực tế).
    // Server resolveGdUid cũng fallback ADMIN cho GD_KD → UI & chain đồng bộ.
    const hasGdKd = users.some((u) => u.roleId === 'GD_KD');
    return users
      .filter((u) =>
        u.roleId === 'GD_KD'
        || u.roleId === 'GD_VP'
        || (!hasGdKd && u.roleId === 'ADMIN'),  // ADMIN xuất hiện thay GD_KD khi slot trống
      )
      .filter((u) => u.id !== currentUserId)
      .sort((a, b) => {
        // GĐ cùng khối ưu tiên trước. ADMIN coi như GD_KD (khối KD).
        const aGd = a.roleId === 'ADMIN' ? 'GD_KD' : a.roleId;
        const bGd = b.roleId === 'ADMIN' ? 'GD_KD' : b.roleId;
        const myGd = myBlock === 'KD' ? 'GD_KD' : myBlock === 'VP' ? 'GD_VP' : null;
        if (aGd === myGd && bGd !== myGd) return -1;
        if (bGd === myGd && aGd !== myGd) return 1;
        return aGd.localeCompare(bGd);
      });
  }, [kind, users, isCEO, isAdmin, isGD, currentUserId, myBlock]);

  // Phase 12.9.6: groups theo khối cho TP/QLCS — 3 nhóm: phòng ban / cơ sở / lãnh đạo.
  //   KD: TP_KT/DT/MKT + 5 QLCS + GD_KD (fallback ADMIN nếu trống)
  //   VP: TP_KE/GS/NS + GD_VP (VP không có cơ sở)
  const blockGroups = useMemo(() => {
    if (!isCreatorTpQlcs || kind !== 'proposal') return null;
    const hasGdKd = users.some((u) => u.roleId === 'GD_KD');
    const sortByName = (a: User, b: User) => a.name.localeCompare(b.name, 'vi');
    const notSelf = (u: User) => u.id !== currentUserId;
    return {
      KD: {
        dept: users.filter((u) => TP_ROLES_KD.has(u.roleId)).filter(notSelf).sort(sortByName),
        facility: users.filter((u) => QLCS_ROLES.has(u.roleId)).filter(notSelf)
          .sort((a, b) => a.roleId.localeCompare(b.roleId)),
        leadership: users.filter((u) => u.roleId === 'GD_KD' || (!hasGdKd && u.roleId === 'ADMIN')).filter(notSelf),
      },
      VP: {
        dept: users.filter((u) => TP_ROLES_VP.has(u.roleId)).filter(notSelf).sort(sortByName),
        facility: [] as User[],
        leadership: users.filter((u) => u.roleId === 'GD_VP').filter(notSelf),
      },
    } as const;
  }, [isCreatorTpQlcs, kind, users, currentUserId]);

  // Auto chọn người đầu tiên khi đổi tab — cho cả 2 chế độ UI.
  useEffect(() => {
    if (kind !== 'proposal') return;
    let list: User[];
    if (isCreatorTpQlcs && blockGroups) {
      const g = blockGroups[recipientBlock];
      list = [...g.dept, ...g.facility, ...g.leadership];
    } else {
      list = recipientTier === 'peer' ? peerCandidates : seniorCandidates;
    }
    if (list.length > 0 && !list.find((u) => u.id === recipientUid)) {
      setRecipientUid(list[0].id);
    } else if (list.length === 0) {
      setRecipientUid('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientTier, recipientBlock, isCreatorTpQlcs, blockGroups, peerCandidates, seniorCandidates, kind]);

  const creatorBlocked = kind === 'proposal' && isCEO;

  // Assignment constraints (giữ nguyên)
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

  async function submit() {
    setError(null);
    if (creatorBlocked) {
      setError('CEO/Chủ tịch không cần tạo đề xuất — tự ra quyết định trực tiếp.');
      return;
    }
    if (!title.trim()) { setError('Tiêu đề bắt buộc'); return; }

    if (kind === 'proposal') {
      if (!recipientUid) {
        setError(isCreatorTpQlcs
          ? 'Chưa chọn đối tượng nhận đề xuất.'
          : (recipientTier === 'peer' ? 'Không có người ngang cấp để gửi đề xuất.' : 'Không có người cấp trên để gửi đề xuất.'));
        return;
      }
    } else {
      if (assigneeKind === 'department' && !assigneeDeptId) { setError('Chọn phòng ban'); return; }
      if (assigneeKind === 'facility' && !assigneeFacilityId) { setError('Chọn cơ sở'); return; }
      if (assigneeKind === 'user' && assigneeUserIds.length === 0) { setError('Chọn ít nhất 1 người'); return; }
    }

    setSaving(true);
    try {
      let createBody: Parameters<typeof tasksApi.create>[0];
      if (kind === 'proposal') {
        // Phase 12.9.6: TP/QLCS dùng tab khối → infer tier client-side từ role recipient.
        //   recipient role = GD_KD/GD_VP/ADMIN  → senior
        //   recipient role = TP_*/QLCS_*       → peer
        let finalTier: RecipientTier = recipientTier;
        if (isCreatorTpQlcs) {
          const r = users.find((u) => u.id === recipientUid);
          const role = r?.roleId ?? '';
          finalTier = (role === 'GD_KD' || role === 'GD_VP' || role === 'ADMIN') ? 'senior' : 'peer';
        }
        createBody = {
          kind: 'proposal',
          title: title.trim(),
          description: description.trim(),
          assigneeBlock: (myBlock === 'all' ? 'KD' : myBlock) as Block,
          assigneeDeptId: null,
          assigneeFacilityId: null,
          assigneeUserIds: [],
          priority,
          dueDate: dueDate || null,
          proposalType: null,
          financialGroup: null,
          estimatedCost: null,
          // Phase 12.9: server build chain từ recipientUid + tier
          recipientTier: finalTier,
          recipientUid,
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
    <div className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white shadow-2xl w-full sm:max-w-2xl h-full sm:h-auto sm:max-h-[90vh] sm:rounded-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold">Tạo {kindLabel} mới</h2>
            <p className="text-xs text-emerald-50/90 mt-0.5">
              {kind === 'proposal'
                ? '1 cấp duyệt — người nhận trực tiếp duyệt'
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

          {/* ═══ FORM ĐỀ XUẤT (Phase 12.9 — đơn giản 2 mục) ═══ */}
          {kind === 'proposal' && !creatorBlocked && (
            <Field label="Đối tượng nhận đề xuất *">
              {/* Phase 12.9.6 (2026-06-06): TP/QLCS dùng tab KHỐI (KD/VP) + 3 nhóm.
                  GD/ADMIN giữ tab peer/senior cũ (chỉ có vài lựa chọn cố định). */}
              {isCreatorTpQlcs && blockGroups ? (
                <>
                  {/* Tabs 2 khối */}
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {(['KD', 'VP'] as const).map((b) => {
                      const g = blockGroups[b];
                      const total = g.dept.length + g.facility.length + g.leadership.length;
                      const isMyBlock = b === myBlock;
                      return (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setRecipientBlock(b)}
                          disabled={total === 0}
                          className={`px-3 py-2 rounded-lg text-sm font-semibold ring-1 transition ${
                            recipientBlock === b
                              ? 'bg-emerald-50 text-emerald-800 ring-emerald-300'
                              : 'bg-white text-slate-600 ring-slate-200 hover:ring-emerald-200'
                          } disabled:opacity-40`}
                        >
                          {b === 'KD' ? '🏭 Khối Kinh Doanh' : '🏢 Khối Văn Phòng'}
                          <span className="ml-1 text-[10px] opacity-60">
                            ({total}{isMyBlock ? ' · của bạn' : ''})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {/* Dropdown 3 nhóm cho khối được chọn */}
                  {(() => {
                    const g = blockGroups[recipientBlock];
                    const total = g.dept.length + g.facility.length + g.leadership.length;
                    if (total === 0) {
                      return (
                        <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                          Khối {recipientBlock === 'KD' ? 'Kinh Doanh' : 'Văn Phòng'} chưa có người nhận hợp lệ.
                        </div>
                      );
                    }
                    const renderOpt = (u: User) => (
                      <option key={u.id} value={u.id}>
                        {u.name} · {u.roleId}
                      </option>
                    );
                    return (
                      <select
                        value={recipientUid}
                        onChange={(e) => setRecipientUid(e.target.value)}
                        className={inputCls}
                      >
                        <option value="">-- Chọn người nhận --</option>
                        {g.dept.length > 0 && (
                          <optgroup label="📋 Phòng ban (Trưởng phòng)">
                            {g.dept.map(renderOpt)}
                          </optgroup>
                        )}
                        {g.facility.length > 0 && (
                          <optgroup label="🏊 Cơ sở (Quản lý cơ sở)">
                            {g.facility.map(renderOpt)}
                          </optgroup>
                        )}
                        {g.leadership.length > 0 && (
                          <optgroup label="👔 Lãnh đạo (Giám đốc Khối)">
                            {g.leadership.map(renderOpt)}
                          </optgroup>
                        )}
                      </select>
                    );
                  })()}
                  {/* Hint liên khối */}
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    {recipientBlock !== myBlock
                      ? `⚠ Liên khối → chain 3 cấp: GĐ khối bạn (${myBlock === 'KD' ? 'KD' : 'VP'}) → GĐ khối nhận (${recipientBlock}) → người nhận.`
                      : 'Trong khối — gửi trực tiếp 1 cấp duyệt (trừ khi chọn GĐ khối → 1 cấp luôn).'}
                  </p>
                </>
              ) : (
              <>
              <div className="grid grid-cols-2 gap-2 mb-2">
                {(['peer', 'senior'] as const).map((t) => {
                  const list = t === 'peer' ? peerCandidates : seniorCandidates;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setRecipientTier(t)}
                      disabled={list.length === 0}
                      className={`px-3 py-2 rounded-lg text-sm font-semibold ring-1 transition ${
                        recipientTier === t
                          ? 'bg-emerald-50 text-emerald-800 ring-emerald-300'
                          : 'bg-white text-slate-600 ring-slate-200 hover:ring-emerald-200'
                      } disabled:opacity-40`}
                    >
                      {t === 'peer' ? '↔ Ngang cấp' : '↑ Cấp trên'}
                      <span className="ml-1 text-[10px] opacity-60">({list.length})</span>
                    </button>
                  );
                })}
              </div>
              {(() => {
                const list = recipientTier === 'peer' ? peerCandidates : seniorCandidates;
                if (list.length === 0) {
                  return (
                    <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                      Không có {recipientTier === 'peer' ? 'người ngang cấp' : 'người cấp trên'} để gửi đề xuất.
                    </div>
                  );
                }
                // Phase 12.9.5: group dropdown thành "Trong khối" / "Liên khối" (tách rõ cho anh).
                // ADMIN coi như khối KD (đảm nhiệm GĐKD ảo) — đồng bộ server resolveGdUid.
                const effectiveBlockOf = (roleId: string): 'KD' | 'VP' | 'all' =>
                  roleId === 'ADMIN' ? 'KD' : (ROLE_BLOCK[roleId] ?? 'all');
                const inBlockList = list.filter((u) => {
                  const b = effectiveBlockOf(u.roleId);
                  return myBlock === 'all' || b === 'all' || b === myBlock;
                });
                const crossBlockList = list.filter((u) => {
                  const b = effectiveBlockOf(u.roleId);
                  return myBlock !== 'all' && b !== 'all' && b !== myBlock;
                });
                const blockLabel = (b: 'KD' | 'VP' | 'all') =>
                  b === 'KD' ? 'Kinh Doanh' : b === 'VP' ? 'Văn Phòng' : 'toàn cty';
                const renderOpt = (u: User) => {
                  const b = effectiveBlockOf(u.roleId);
                  return (
                    <option key={u.id} value={u.id}>
                      {u.name} · {u.roleId}{b !== 'all' ? ` (${blockLabel(b)})` : ' (toàn cty)'}
                    </option>
                  );
                };
                return (
                  <select
                    value={recipientUid}
                    onChange={(e) => setRecipientUid(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">-- Chọn người nhận --</option>
                    {inBlockList.length > 0 && (
                      <optgroup label={`▸ Trong khối${myBlock !== 'all' ? ` (${blockLabel(myBlock)})` : ''}`}>
                        {inBlockList.map(renderOpt)}
                      </optgroup>
                    )}
                    {crossBlockList.length > 0 && (
                      <optgroup label="▸ Liên khối (qua GĐ khối duyệt thêm)">
                        {crossBlockList.map(renderOpt)}
                      </optgroup>
                    )}
                  </select>
                );
              })()}
              <p className="mt-1.5 text-[11px] text-slate-500">
                {isAdmin
                  ? 'Ngang cấp = GĐ Kinh Doanh / Văn Phòng. Cấp trên = CEO / Chủ tịch.'
                  : isGD
                    ? 'Ngang cấp = GĐ khối còn lại. Cấp trên = CEO / Chủ tịch.'
                    : 'Ngang cấp = các TP + QLCS (cả 2 khối). Cấp trên = GĐ Khối. Liên khối → chain: GĐ khối bạn → GĐ khối nhận → người nhận.'}
              </p>
              </>
              )}
            </Field>
          )}

          {/* ═══ FORM GIAO VIỆC (giữ nguyên) ═══ */}
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
