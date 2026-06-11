'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Paperclip, Trash2 } from 'lucide-react';
import {
  tasksApi,
  type Block, type TaskPriority, type TaskKind,
} from '@/lib/services/tasks/api-client';
import { ROLE_BLOCK } from '@/lib/permissions';

// Phase 12.9 (2026-06-04): Form Äá» xuáº¥t ÄÆ¡n giáº£n hoÃ¡.
//   - 2 tab: NGANG Cáº¤P / Cáº¤P TRÃN
//   - Má»i tab â dropdown user phÃ¹ há»£p
//   - Server: chain = [recipientUid] (1 cáº¥p duyá»t)
//   - Module /giao-viec chá» cho TP/QLCS/GD/CEO/ADMIN.

// Phase 12.9: chá» táº§ng 3 (theo sÆ¡ Äá» org).
// TIBAN_TT ÄÃ£ háº¡ xuá»ng táº§ng 4 (thuá»c phÃ²ng NS) â khÃ´ng náº±m trong pool nÃ y ná»¯a.
const PEER_ROLES = new Set([
  'TP_KT', 'TP_DT', 'TP_MKT', 'TP_GS', 'TP_KE', 'TP_NS',
  'QLCS_HM', 'QLCS_TK', 'QLCS_CTT', 'QLCS_24NCT', 'QLCS_TT',
]);

// Phase 12.9.6 (2026-06-06): cáº¥u trÃºc tabs khá»i cho TP/QLCS.
//   - Khá»i KD: phÃ²ng ban (TP_KT/DT/MKT) + cÆ¡ sá» (QLCS_*) + lÃ£nh Äáº¡o (GD_KD / ADMIN fallback)
//   - Khá»i VP: phÃ²ng ban (TP_KE/GS/NS) + lÃ£nh Äáº¡o (GD_VP) â VP khÃ´ng cÃ³ cÆ¡ sá»
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
  const kindLabel = kind === 'proposal' ? 'Äá» xuáº¥t' : 'giao viá»c';

  const myBlock = ROLE_BLOCK[currentUserRole] ?? 'all';
  // Phase 12.9.1 (anh chá»t 2026-06-05): ADMIN â  CEO. ADMIN trong CTY xáº¿p dÆ°á»i CEO/Chá»§ tá»ch
  // â ADMIN váº«n cáº§n Äá» xuáº¥t (peer GD_KD/GD_VP, senior CEO/Chá»§ tá»ch).
  const isCEO = currentUserRole === 'CEO'; // CHá» CEO thuáº§n (khÃ´ng ADMIN)
  const isAdmin = currentUserRole === 'ADMIN';
  const isGD = currentUserRole === 'GD_KD' || currentUserRole === 'GD_VP';
  const isTP = currentUserRole.startsWith('TP_');
  const isQLCS = currentUserRole.startsWith('QLCS_');
  // Phase 12.9.6: TP/QLCS dÃ¹ng UI tabs khá»i (KD/VP) + 3 nhÃ³m.
  const isCreatorTpQlcs = isTP || isQLCS;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [dueDate, setDueDate] = useState<string>('');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // âââ ASSIGNMENT state (giao viá»c â giá»¯ nguyÃªn) âââ
  const [assigneeBlock, setAssigneeBlock] = useState<Block>(myBlock === 'VP' ? 'VP' : 'KD');
  const [assigneeKind, setAssigneeKind] = useState<AssigneeKind>('department');
  const [assigneeDeptId, setAssigneeDeptId] = useState<string>('');
  const [assigneeFacilityId, setAssigneeFacilityId] = useState<string>('');
  const [assigneeUserIds, setAssigneeUserIds] = useState<string[]>([]);
  const [goal, setGoal] = useState<string>('');
  const [collaboratorDeptIds, setCollaboratorDeptIds] = useState<string[]>([]);
  const [collaboratorFacilityIds, setCollaboratorFacilityIds] = useState<string[]>([]);

  // âââ PROPOSAL state (Phase 12.9 â ÄÆ¡n giáº£n hoÃ¡) âââ
  const [recipientTier, setRecipientTier] = useState<RecipientTier>('peer');
  const [recipientUid, setRecipientUid] = useState<string>('');
  // Phase 12.9.6: cho TP/QLCS â chá»n khá»i nháº­n (default = khá»i creator).
  const [recipientBlock, setRecipientBlock] = useState<'KD' | 'VP'>(myBlock === 'VP' ? 'VP' : 'KD');

  // Phase 12.9.4 (anh chá»t 2026-06-06): cho phÃ©p Äá» xuáº¥t LIÃN KHá»I cho TP/QLCS.
  // Khi recipient cross-block â server tá»± chÃ¨n GÄ khá»i creator vÃ o Äáº§u chain (2 cáº¥p duyá»t).
  // CÃ¹ng khá»i â 1 cáº¥p duyá»t nhÆ° cÅ©.
  const peerCandidates = useMemo<User[]>(() => {
    if (kind !== 'proposal') return [];
    if (isCEO) return [];
    // ADMIN: ngang cáº¥p = GD_KD + GD_VP
    if (isAdmin) {
      return users
        .filter((u) => u.roleId === 'GD_KD' || u.roleId === 'GD_VP')
        .filter((u) => u.id !== currentUserId)
        .sort((a, b) => a.roleId.localeCompare(b.roleId));
    }
    // GÄ: ngang cáº¥p = GÄ khá»i cÃ²n láº¡i
    if (isGD) {
      const peerGdRole = currentUserRole === 'GD_KD' ? 'GD_VP' : 'GD_KD';
      return users.filter((u) => u.roleId === peerGdRole && u.id !== currentUserId);
    }
    // TP/QLCS/TIBAN_TT: ngang cáº¥p = TP + QLCS Cáº¢ 2 KHá»I (anh chá»t 2026-06-06).
    // Server tá»± chÃ¨n GÄ khá»i creator náº¿u recipient khÃ¡c khá»i.
    return users
      .filter((u) => PEER_ROLES.has(u.roleId))
      .filter((u) => u.id !== currentUserId)
      .sort((a, b) => {
        // CÃ¹ng khá»i Æ°u tiÃªn hiá»n thá» trÆ°á»c
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
    // ADMIN: cáº¥p trÃªn = CEO
    if (isAdmin) {
      return users
        .filter((u) => u.roleId === 'CEO')
        .filter((u) => u.id !== currentUserId)
        .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    }
    // GÄ: cáº¥p trÃªn = CEO
    if (isGD) {
      return users
        .filter((u) => u.roleId === 'CEO')
        .filter((u) => u.id !== currentUserId)
        .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    }
    // TP/QLCS/TIBAN_TT: cáº¥p trÃªn = GÄ KHá»I cáº£ 2 (anh chá»t 2026-06-06 cho liÃªn khá»i).
    // Phase 12.9.5: náº¿u slot GD_KD trá»ng â hiá»n thá» ADMIN (anh Äáº£m nhiá»m GÄKD thá»±c táº¿).
    // Server resolveGdUid cÅ©ng fallback ADMIN cho GD_KD â UI & chain Äá»ng bá».
    const hasGdKd = users.some((u) => u.roleId === 'GD_KD');
    return users
      .filter((u) =>
        u.roleId === 'GD_KD'
        || u.roleId === 'GD_VP'
        || (!hasGdKd && u.roleId === 'ADMIN'),  // ADMIN xuáº¥t hiá»n thay GD_KD khi slot trá»ng
      )
      .filter((u) => u.id !== currentUserId)
      .sort((a, b) => {
        // GÄ cÃ¹ng khá»i Æ°u tiÃªn trÆ°á»c. ADMIN coi nhÆ° GD_KD (khá»i KD).
        const aGd = a.roleId === 'ADMIN' ? 'GD_KD' : a.roleId;
        const bGd = b.roleId === 'ADMIN' ? 'GD_KD' : b.roleId;
        const myGd = myBlock === 'KD' ? 'GD_KD' : myBlock === 'VP' ? 'GD_VP' : null;
        if (aGd === myGd && bGd !== myGd) return -1;
        if (bGd === myGd && aGd !== myGd) return 1;
        return aGd.localeCompare(bGd);
      });
  }, [kind, users, isCEO, isAdmin, isGD, currentUserId, myBlock]);

  // Phase 12.9.6: groups theo khá»i cho TP/QLCS â 3 nhÃ³m: phÃ²ng ban / cÆ¡ sá» / lÃ£nh Äáº¡o.
  //   KD: TP_KT/DT/MKT + 5 QLCS + GD_KD (fallback ADMIN náº¿u trá»ng)
  //   VP: TP_KE/GS/NS + GD_VP (VP khÃ´ng cÃ³ cÆ¡ sá»)
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

  // Auto chá»n ngÆ°á»i Äáº§u tiÃªn khi Äá»i tab â cho cáº£ 2 cháº¿ Äá» UI.
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

  // Assignment constraints (giá»¯ nguyÃªn)
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
    ? (assigneeBlock === 'KD' ? 'GÄ Khá»i Kinh Doanh' : 'GÄ Khá»i VÄn PhÃ²ng')
    : (myBlock === 'KD' ? 'GÄ Khá»i Kinh Doanh' : myBlock === 'VP' ? 'GÄ Khá»i VÄn PhÃ²ng' : 'GÄ Khá»i');

  async function submit() {
    setError(null);
    if (creatorBlocked) {
      setError('CEO/Chá»§ tá»ch khÃ´ng cáº§n táº¡o Äá» xuáº¥t â tá»± ra quyáº¿t Äá»nh trá»±c tiáº¿p.');
      return;
    }
    if (!title.trim()) { setError('TiÃªu Äá» báº¯t buá»c'); return; }

    if (kind === 'proposal') {
      if (!recipientUid) {
        setError(isCreatorTpQlcs
          ? 'ChÆ°a chá»n Äá»i tÆ°á»£ng nháº­n Äá» xuáº¥t.'
          : (recipientTier === 'peer' ? 'KhÃ´ng cÃ³ ngÆ°á»i ngang cáº¥p Äá» gá»­i Äá» xuáº¥t.' : 'KhÃ´ng cÃ³ ngÆ°á»i cáº¥p trÃªn Äá» gá»­i Äá» xuáº¥t.'));
        return;
      }
    } else {
      if (assigneeKind === 'department' && !assigneeDeptId) { setError('Chá»n phÃ²ng ban'); return; }
      if (assigneeKind === 'facility' && !assigneeFacilityId) { setError('Chá»n cÆ¡ sá»'); return; }
      if (assigneeKind === 'user' && assigneeUserIds.length === 0) { setError('Chá»n Ã­t nháº¥t 1 ngÆ°á»i'); return; }
    }

    setSaving(true);
    try {
      let createBody: Parameters<typeof tasksApi.create>[0];
      if (kind === 'proposal') {
        // Phase 12.9.6: TP/QLCS dÃ¹ng tab khá»i â infer tier client-side tá»« role recipient.
        //   recipient role = GD_KD/GD_VP/ADMIN  â senior
        //   recipient role = TP_*/QLCS_*       â peer
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
          // Phase 12.9: server build chain tá»« recipientUid + tier
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
          goal: goal.trim() || null,
          collaboratorDeptIds,
          collaboratorFacilityIds,
        };
      }
      const { id } = await tasksApi.create(createBody);

      if (files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          setUploadProgress(`Äang upload ${i + 1}/${files.length} (${files[i].name})...`);
          try {
            await tasksApi.uploadAttachment(id, files[i]);
          } catch (upErr: any) {
            setError(`Táº¡o ${kindLabel} OK, nhÆ°ng upload file "${files[i].name}" tháº¥t báº¡i: ${upErr.message}.`);
          }
        }
      }
      onCreated();
    } catch (e: any) {
      const msg = e?.message ?? 'unknown';
      if (msg === 'Failed to fetch' || msg.includes('NetworkError')) {
        setError('KhÃ´ng káº¿t ná»i ÄÆ°á»£c server. Kiá»m tra máº¡ng.');
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
            <h2 className="text-base font-bold">Táº¡o {kindLabel} má»i</h2>
            <p className="text-xs text-emerald-50/90 mt-0.5">
              {kind === 'proposal'
                ? '1 cáº¥p duyá»t â ngÆ°á»i nháº­n trá»±c tiáº¿p duyá»t'
                : (willNeedApproval
                    ? (isCrossBlock ? `LiÃªn khá»i â ${targetGDLabel} sáº½ duyá»t` : `LiÃªn phÃ²ng/cÆ¡ sá» â ${targetGDLabel} sáº½ duyá»t`)
                    : 'Äi tháº³ng Äáº¿n ngÆ°á»i nháº­n, khÃ´ng cáº§n duyá»t')}
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
              CEO/Chá»§ tá»ch khÃ´ng cáº§n táº¡o Äá» xuáº¥t â tá»± ra quyáº¿t Äá»nh trá»±c tiáº¿p.
            </div>
          )}

          <Field label="TiÃªu Äá» *">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Ngáº¯n gá»n, dá» hiá»u"
              className={inputCls}
            />
          </Field>

          {kind === 'assignment' && (
            <Field label="Má»¥c tiÃªu (tuá»³ chá»n)">
              <input
                type="text"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="VD: Má» lá»p bÆ¡i táº¡i Linh ÄÃ m, Äáº£m báº£o káº¿ hoáº¡ch..."
                className={inputCls}
                maxLength={300}
              />
            </Field>
          )}
          <Field label="MÃ´ táº£">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={5000}
              placeholder="Má»¥c tiÃªu, cÃ¡c bÆ°á»c, káº¿t quáº£ mong muá»n..."
              className={inputCls}
            />
          </Field>

          {/* âââ FORM Äá» XUáº¤T (Phase 12.9 â ÄÆ¡n giáº£n 2 má»¥c) âââ */}
          {kind === 'proposal' && !creatorBlocked && (
            <Field label="Äá»i tÆ°á»£ng nháº­n Äá» xuáº¥t *">
              {/* Phase 12.9.6 (2026-06-06): TP/QLCS dÃ¹ng tab KHá»I (KD/VP) + 3 nhÃ³m.
                  GD/ADMIN giá»¯ tab peer/senior cÅ© (chá» cÃ³ vÃ i lá»±a chá»n cá» Äá»nh). */}
              {isCreatorTpQlcs && blockGroups ? (
                <>
                  {/* Tabs 2 khá»i */}
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
                          <span className="sm:hidden">{b === 'KD' ? 'ð­ KD' : 'ð¢ VP'}</span>
                          <span className="hidden sm:inline">{b === 'KD' ? 'ð­ Khá»i Kinh Doanh' : 'ð¢ Khá»i VÄn PhÃ²ng'}</span>
                          <span className="ml-1 text-xs opacity-60">
                            ({total}{isMyBlock ? ' Â· cá»§a báº¡n' : ''})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {/* Dropdown 3 nhÃ³m cho khá»i ÄÆ°á»£c chá»n */}
                  {(() => {
                    const g = blockGroups[recipientBlock];
                    const total = g.dept.length + g.facility.length + g.leadership.length;
                    if (total === 0) {
                      return (
                        <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                          Khá»i {recipientBlock === 'KD' ? 'Kinh Doanh' : 'VÄn PhÃ²ng'} chÆ°a cÃ³ ngÆ°á»i nháº­n há»£p lá».
                        </div>
                      );
                    }
                    const renderOpt = (u: User) => (
                      <option key={u.id} value={u.id}>
                        {u.name} Â· {u.roleId}
                      </option>
                    );
                    return (
                      <select
                        value={recipientUid}
                        onChange={(e) => setRecipientUid(e.target.value)}
                        className={inputCls}
                      >
                        <option value="">-- Chá»n ngÆ°á»i nháº­n --</option>
                        {g.dept.length > 0 && (
                          <optgroup label="ð PhÃ²ng ban (TrÆ°á»ng phÃ²ng)">
                            {g.dept.map(renderOpt)}
                          </optgroup>
                        )}
                        {g.facility.length > 0 && (
                          <optgroup label="ð CÆ¡ sá» (Quáº£n lÃ½ cÆ¡ sá»)">
                            {g.facility.map(renderOpt)}
                          </optgroup>
                        )}
                        {g.leadership.length > 0 && (
                          <optgroup label="ð LÃ£nh Äáº¡o (GiÃ¡m Äá»c Khá»i)">
                            {g.leadership.map(renderOpt)}
                          </optgroup>
                        )}
                      </select>
                    );
                  })()}
                  {/* Hint liÃªn khá»i */}
                  <p className="mt-1.5 text-xs text-slate-500">
                    {recipientBlock !== myBlock
                      ? `â  LiÃªn khá»i â chain 3 cáº¥p: GÄ khá»i báº¡n (${myBlock === 'KD' ? 'KD' : 'VP'}) â GÄ khá»i nháº­n (${recipientBlock}) â ngÆ°á»i nháº­n.`
                      : 'Trong khá»i â gá»­i trá»±c tiáº¿p 1 cáº¥p duyá»t (trá»« khi chá»n GÄ khá»i â 1 cáº¥p luÃ´n).'}
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
                      {t === 'peer' ? 'â Ngang cáº¥p' : 'â Cáº¥p trÃªn'}
                      <span className="ml-1 text-xs opacity-60">({list.length})</span>
                    </button>
                  );
                })}
              </div>
              {(() => {
                const list = recipientTier === 'peer' ? peerCandidates : seniorCandidates;
                if (list.length === 0) {
                  return (
                    <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                      KhÃ´ng cÃ³ {recipientTier === 'peer' ? 'ngÆ°á»i ngang cáº¥p' : 'ngÆ°á»i cáº¥p trÃªn'} Äá» gá»­i Äá» xuáº¥t.
                    </div>
                  );
                }
                // Phase 12.9.5: group dropdown thÃ nh "Trong khá»i" / "LiÃªn khá»i" (tÃ¡ch rÃµ cho anh).
                // ADMIN coi nhÆ° khá»i KD (Äáº£m nhiá»m GÄKD áº£o) â Äá»ng bá» server resolveGdUid.
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
                  b === 'KD' ? 'Kinh Doanh' : b === 'VP' ? 'VÄn PhÃ²ng' : 'toÃ n cty';
                const renderOpt = (u: User) => {
                  const b = effectiveBlockOf(u.roleId);
                  return (
                    <option key={u.id} value={u.id}>
                      {u.name} Â· {u.roleId}{b !== 'all' ? ` (${blockLabel(b)})` : ' (toÃ n cty)'}
                    </option>
                  );
                };
                return (
                  <select
                    value={recipientUid}
                    onChange={(e) => setRecipientUid(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">-- Chá»n ngÆ°á»i nháº­n --</option>
                    {inBlockList.length > 0 && (
                      <optgroup label={`â¸ Trong khá»i${myBlock !== 'all' ? ` (${blockLabel(myBlock)})` : ''}`}>
                        {inBlockList.map(renderOpt)}
                      </optgroup>
                    )}
                    {crossBlockList.length > 0 && (
                      <optgroup label="â¸ LiÃªn khá»i (qua GÄ khá»i duyá»t thÃªm)">
                        {crossBlockList.map(renderOpt)}
                      </optgroup>
                    )}
                  </select>
                );
              })()}
              <p className="mt-1.5 text-xs text-slate-500">
                {isAdmin
                  ? 'Ngang cáº¥p = GÄ Kinh Doanh / VÄn PhÃ²ng. Cáº¥p trÃªn = CEO / Chá»§ tá»ch.'
                  : isGD
                    ? 'Ngang cáº¥p = GÄ khá»i cÃ²n láº¡i. Cáº¥p trÃªn = CEO / Chá»§ tá»ch.'
                    : 'Ngang cáº¥p = cÃ¡c TP + QLCS (cáº£ 2 khá»i). Cáº¥p trÃªn = GÄ Khá»i. LiÃªn khá»i â chain: GÄ khá»i báº¡n â GÄ khá»i nháº­n â ngÆ°á»i nháº­n.'}
              </p>
              </>
              )}
            </Field>
          )}

          {/* âââ FORM GIAO VIá»C (giá»¯ nguyÃªn) âââ */}
          {kind === 'assignment' && (
            <>
              <Field label="Khá»i nháº­n">
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
                      {b === 'KD' ? 'ð¼ Khá»i Kinh Doanh' : 'ð Khá»i VÄn PhÃ²ng'}
                      {b !== myBlock && myBlock !== 'all' && (
                        <span className="ml-1 text-xs opacity-75">(liÃªn khá»i)</span>
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
                      {k === 'department' ? 'PhÃ²ng ban' : k === 'facility' ? 'CÆ¡ sá»' : 'CÃ¡ nhÃ¢n'}
                    </button>
                  ))}
                </div>

                {assigneeKind === 'department' && (
                  <select
                    value={assigneeDeptId}
                    onChange={(e) => setAssigneeDeptId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">-- Chá»n phÃ²ng --</option>
                    {deptsInBlock.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}{d.id === currentDepartmentId ? ' (phÃ²ng cá»§a báº¡n)' : ''}
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
                    <option value="">-- Chá»n cÆ¡ sá» --</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.id} Â· {b.name}{b.id === currentBranchId ? ' (cÆ¡ sá» cá»§a báº¡n)' : ''}
                      </option>
                    ))}
                  </select>
                )}
                {assigneeKind === 'user' && (
                  <div className="max-h-40 overflow-auto border border-slate-200 rounded-lg p-2 bg-slate-50/40 space-y-1">
                    {usersInScope.length === 0 && (
                      <div className="text-xs text-slate-400 text-center py-3">KhÃ´ng cÃ³ ngÆ°á»i nháº­n phÃ¹ há»£p</div>
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
          {kind === 'assignment' && (
            <Field label="ÄÆ¡n vá» phá»i há»£p (tuá»³ chá»n)">
              <div className="space-y-2">
                {departments.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">PhÃ²ng ban</div>
                    <div className="max-h-28 overflow-auto border border-slate-200 rounded-lg p-2 bg-slate-50/40 space-y-0.5">
                      {departments.map((d) => (
                        <label key={d.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={collaboratorDeptIds.includes(d.id)}
                            onChange={(e) => setCollaboratorDeptIds(p => e.target.checked ? [...p, d.id] : p.filter(x => x !== d.id))}
                            className="text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="font-medium text-slate-800">{d.name}</span>
                          {d.blockId && <span className="text-xs text-slate-400">{d.blockId}</span>}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {branches.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">CÆ¡ sá»</div>
                    <div className="max-h-24 overflow-auto border border-slate-200 rounded-lg p-2 bg-slate-50/40 space-y-0.5">
                      {branches.map((b) => (
                        <label key={b.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={collaboratorFacilityIds.includes(b.id)}
                            onChange={(e) => setCollaboratorFacilityIds(p => e.target.checked ? [...p, b.id] : p.filter(x => x !== b.id))}
                            className="text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="font-medium text-slate-800">{b.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Field>
          )}
            <Field label="Æ¯u tiÃªn">
              <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className={inputCls}>
                <option value="low">Tháº¥p</option>
                <option value="normal">BÃ¬nh thÆ°á»ng</option>
                <option value="high">Cao</option>
                <option value="urgent">Kháº©n</option>
              </select>
            </Field>
            <Field label="Háº¡n chÃ³t">
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
            </Field>
          </div>

          <Field label="File ÄÃ­nh kÃ¨m (tuá»³ chá»n)">
            <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 border border-dashed border-emerald-300 rounded-lg text-sm text-emerald-700 hover:bg-emerald-50">
              <Paperclip size={14} />
              Chá»n file (áº£nh, PDF, Office, ZIP â tá»i Äa 20MB/file)
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
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Huá»·</button>
          <button
            onClick={submit}
            disabled={saving || creatorBlocked}
            className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 shadow-sm inline-flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {kind === 'proposal' ? 'Gá»­i Äá» duyá»t' : (willNeedApproval ? 'Gá»­i Äá» duyá»t' : `Táº¡o ${kindLabel}`)}
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
