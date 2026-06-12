'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { X, Loader2, Plus, Trash2, ChevronDown } from 'lucide-react';
import {
  tasksApi,
  type Block, type TaskPriority, type TaskKind,
  type CoordType, type CoordScope, type CollabUnit, type CollabUnitStatus,
} from '@/lib/services/tasks/api-client';
import { ROLE_BLOCK } from '@/lib/permissions';
import type { UserPublic } from '@/lib/types';

interface Props {
  kind: 'assignment' | 'proposal';
  departments: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  users: UserPublic[];
  roleCode: string; userRole: string; userId: string; userName: string;
  onClose: () => void;
  onChange: () => void;
}

const COORD_TYPE_OPTIONS: { value: CoordType; label: string; desc: string }[] = [
  { value: 'dieu-phoi', label: 'Điều phối', desc: 'Phân công nhiều đơn vị cùng thực hiện' },
  { value: 'ho-tro', label: 'Hỗ trợ', desc: 'Đơn vị khac ho tro co so / phong ban' },
  { value: 'de-xuat', label: 'Đề xuất', desc: 'Đề xuất lên trên hoặc ngang cấp' },
  { value: 'phe-duyet', label: 'Phê duyệt', desc: 'Yêu cầu phê duyệt từ GĐ / CEO' },
  { value: 'canh-bao', label: 'Cảnh báo', desc: 'Cảnh báo / escalation can xu ly ngay' },
];
const SCOPE_OPTIONS: { value: CoordScope; label: string }[] = [
  { value: 'noi-bo-phong', label: 'Noi bo phong ban' },
  { value: 'noi-bo-khoi', label: 'Noi bo khoi (KD / VP)' },
  { value: 'lien-khoi', label: 'Liên khối KD - VP' },
  { value: 'lien-co-so', label: 'Liên cơ sở (nhieu branch)' },
  { value: 'du-an', label: 'Dự án / Project' },
];

const emptyUnit = (): CollabUnit => ({
  unitId: '', unitType: 'dept', unitName: '', ownerId: '', ownerName: '', ownerRole: '',
  assignment: '', deliverable: '', dueDate: null, status: 'chua-tiep-nhan',
});

export default function TaskCreateModal({
  kind, departments, branches, users, roleCode, userRole, userId, userName,
  onClose, onChange,
}: Props) {
  // THONG TIN CHUNG
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coordType, setCoordType] = useState<CoordType>('dieu-phoi');
  const [coordScope, setCoordScope] = useState<CoordScope>('noi-bo-khoi');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [dueDate, setDueDate] = useState('');
  const [goal, setGoal] = useState('');

  // CHU TRI
  const [assigneeBlock, setAssigneeBlock] = useState<Block>('KD');
  const [assigneeDeptId, setAssigneeDeptId] = useState('');
  const [assigneeFacilityId, setAssigneeFacilityId] = useState('');
  const [assigneeType, setAssigneeType] = useState<'dept' | 'facility'>('dept');
  const [assigneeUserIds, setAssigneeUserIds] = useState<string[]>([]);

  // DON VI PHOI HOP — multiple units with per-unit detail
  const [collabUnits, setCollabUnits] = useState<CollabUnit[]>([]);

  // WAITING-FOR
  const [waitingForUnitId, setWaitingForUnitId] = useState('');
  const [waitingForContent, setWaitingForContent] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Derive: assigneeBlock from dept
  useEffect(() => {
    if (assigneeType === 'dept' && assigneeDeptId) {
      const block = (ROLE_BLOCK as Record<string, Block>)[assigneeDeptId] || 'KD';
      setAssigneeBlock(block);
    }
  }, [assigneeDeptId, assigneeType]);

  // Filter users by dept
  const deptUsers = useMemo(() => {
    if (assigneeType === 'dept' && assigneeDeptId)
      return users.filter(u => u.departmentId === assigneeDeptId || u.departmentId === assigneeDeptId);
    if (assigneeType === 'facility' && assigneeFacilityId)
      return users.filter(u => u.branchId === assigneeFacilityId || u.branchId === assigneeFacilityId);
    return users;
  }, [users, assigneeDeptId, assigneeFacilityId, assigneeType]);

  // CollabUnit helpers
  function addCollabUnit() {
    setCollabUnits(prev => [...prev, emptyUnit()]);
  }
  function removeCollabUnit(idx: number) {
    setCollabUnits(prev => prev.filter((_, i) => i !== idx));
  }
  function updateCollabUnit(idx: number, key: keyof CollabUnit, val: string) {
    setCollabUnits(prev => prev.map((cu, i) => {
      if (i !== idx) return cu;
      const next = { ...cu, [key]: val };
      // Auto-fill unitName when unitId changes
      if (key === 'unitId') {
        const dept = departments.find(d => d.id === val);
        const branch = branches.find(b => b.id === val);
        next.unitName = dept?.name || branch?.name || val;
        next.unitType = dept ? 'dept' : 'facility';
      }
      // Auto-fill ownerName when ownerId changes
      if (key === 'ownerId') {
        const u = users.find(u => u.id === val || u.id === val);
        next.ownerName = u?.displayName || val;
        next.ownerRole = u?.roleId || '';
      }
      return next;
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError('Vui long nhap tieu de'); return; }
    setBusy(true); setError(null);
    try {
      const body: any = {
        kind,
        title: title.trim(),
        description: description.trim(),
        priority,
        dueDate: dueDate || null,
        goal: goal.trim() || null,
        assigneeBlock,
        assigneeDeptId: assigneeType === 'dept' ? assigneeDeptId || null : null,
        assigneeFacilityId: assigneeType === 'facility' ? assigneeFacilityId || null : null,
        assigneeUserIds,
        coordType,
        coordScope,
        collabUnits: collabUnits.filter(cu => cu.unitId),
        waitingFor: waitingForUnitId ? {
          unitId: waitingForUnitId,
          unitName: departments.find(d => d.id === waitingForUnitId)?.name ||
                    branches.find(b => b.id === waitingForUnitId)?.name || waitingForUnitId,
          content: waitingForContent,
          since: new Date().toISOString(),
        } : null,
        crossBlock: coordScope === 'lien-khoi' || coordScope === 'du-an',
      };
      await tasksApi.create(body);
      onChange();
    } catch (err: any) {
      setError(err.message || 'Co loi xay ra');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white shadow-2xl w-full sm:max-w-2xl h-full sm:h-auto sm:max-h-[92vh] sm:rounded-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* HEADER */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold">Tao dieu phoi moi</h2>
            <p className="text-xs text-emerald-50/80 mt-0.5">Khai bao day du thong tin chu tri + don vi phoi hop</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X size={20} /></button>
        </div>

        {/* BODY */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-auto">
          <div className="p-5 space-y-6">
            {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">{error}</div>}

            {/* ===== THONG TIN CHUNG ===== */}
            <section>
              <SectionHeading>Thong tin chung</SectionHeading>
              <div className="space-y-4">
                <Field label="Tieu de *">
                  <input value={title} onChange={e => setTitle(e.target.value)} maxLength={200}
                    placeholder="VD: Mo lop he Green Pool Linh Dam..."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
                </Field>
                <Field label="Muc tieu / Ket qua mong doi">
                  <input value={goal} onChange={e => setGoal(e.target.value)}
                    placeholder="VD: Tuyen du 120 hoc vien, doanh thu du kien 240 trieu"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
                </Field>
                <Field label="Mo ta them">
                  <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                    placeholder="Them boi canh, yeu cau cu the..."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 resize-none" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Loai dieu phoi *">
                    <select value={coordType} onChange={e => setCoordType(e.target.value as CoordType)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 bg-white">
                      {COORD_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Pham vi">
                    <select value={coordScope} onChange={e => setCoordScope(e.target.value as CoordScope)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 bg-white">
                      {SCOPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Muc do uu tien">
                    <select value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 bg-white">
                      <option value="high">Cao</option>
                      <option value="normal">Trung binh</option>
                      <option value="low">Thap</option>
                    </select>
                  </Field>
                  <Field label="Deadline">
                    <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500" />
                  </Field>
                </div>
              </div>
            </section>

            {/* ===== CHU TRI ===== */}
            <section>
              <SectionHeading>Chu tri (Owner duy nhat)</SectionHeading>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Kieu phan cong">
                    <select value={assigneeType} onChange={e => setAssigneeType(e.target.value as 'dept' | 'facility')}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 bg-white">
                      <option value="dept">Phong ban</option>
                      <option value="facility">Co so</option>
                    </select>
                  </Field>
                  <Field label="Khoi chu tri">
                    <select value={assigneeBlock} onChange={e => setAssigneeBlock(e.target.value as Block)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 bg-white">
                      <option value="KD">Kinh doanh</option>
                      <option value="VP">Van phong</option>
                    </select>
                  </Field>
                </div>
                {assigneeType === 'dept' ? (
                  <Field label="Don vi chu tri">
                    <select value={assigneeDeptId} onChange={e => setAssigneeDeptId(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 bg-white">
                      <option value="">Chon phong ban...</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </Field>
                ) : (
                  <Field label="Co so chu tri">
                    <select value={assigneeFacilityId} onChange={e => setAssigneeFacilityId(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 bg-white">
                      <option value="">Chon co so...</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </Field>
                )}
                <Field label="Nguoi chiu trach nhiem (Owner) — co the chon nhieu nguoi thuc hien">
                  <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-50">
                    {deptUsers.slice(0, 20).map(u => {
                      const uid = u.id || u.id || '';
                      const checked = assigneeUserIds.includes(uid);
                      return (
                        <label key={uid} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                          <input type="checkbox" checked={checked}
                            onChange={() => setAssigneeUserIds(prev => checked ? prev.filter(x => x !== uid) : [...prev, uid])}
                            className="rounded text-emerald-600" />
                          <span className="text-sm text-slate-700">{u.displayName}</span>
                          <span className="text-xs text-slate-400 ml-auto">{u.roleId || ''}</span>
                        </label>
                      );
                    })}
                  </div>
                </Field>
              </div>
            </section>

            {/* ===== DON VI PHOI HOP ===== */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <SectionHeading noMargin>Don vi phoi hop</SectionHeading>
                <button type="button" onClick={addCollabUnit}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition">
                  <Plus size={12} /> Them don vi
                </button>
              </div>
              {collabUnits.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-lg">
                  Chua co don vi phoi hop. Nhan "Them don vi" de them.
                </p>
              )}
              <div className="space-y-4">
                {collabUnits.map((cu, idx) => (
                  <div key={idx} className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold text-indigo-700">Don vi phoi hop #{idx+1}</span>
                      <button type="button" onClick={() => removeCollabUnit(idx)} className="text-slate-400 hover:text-rose-500"><Trash2 size={13} /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Don vi">
                        <select value={cu.unitId} onChange={e => updateCollabUnit(idx, 'unitId', e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 bg-white">
                          <option value="">Chon don vi...</option>
                          <optgroup label="Phong ban">
                            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </optgroup>
                          <optgroup label="Co so">
                            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                          </optgroup>
                        </select>
                      </Field>
                      <Field label="Nguoi phu trach">
                        <select value={cu.ownerId} onChange={e => updateCollabUnit(idx, 'ownerId', e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 bg-white">
                          <option value="">Chon nguoi...</option>
                          {users.slice(0,50).map(u => {
                            const uid = u.id || u.id || '';
                            return <option key={uid} value={uid}>{u.displayName} ({u.roleId || ''})</option>;
                          })}
                        </select>
                      </Field>
                    </div>
                    <div className="mt-3 space-y-2">
                      <Field label="Noi dung can ho tro *">
                        <input value={cu.assignment} onChange={e => updateCollabUnit(idx, 'assignment', e.target.value)}
                          placeholder="VD: Thiet ke banner tuyen sinh 3 size"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
                      </Field>
                      <Field label="Ket qua can ban giao">
                        <input value={cu.deliverable} onChange={e => updateCollabUnit(idx, 'deliverable', e.target.value)}
                          placeholder="VD: Banner hoan chinh JPG + PNG du 3 kich co"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
                      </Field>
                      <Field label="Deadline rieng">
                        <input type="date" value={cu.dueDate || ''} onChange={e => updateCollabUnit(idx, 'dueDate', e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ===== WAITING-FOR ENGINE ===== */}
            <section>
              <SectionHeading>Dang cho ai? (Waiting-For)</SectionHeading>
              <p className="text-xs text-slate-500 mb-3">Neu hien tai dang can ai do phan hoi / bao cao truoc khi tien hanh, khai bao o day.</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Dang cho don vi nao">
                  <select value={waitingForUnitId} onChange={e => setWaitingForUnitId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 bg-white">
                    <option value="">Khong cho ai</option>
                    <optgroup label="Phong ban">
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </optgroup>
                    <optgroup label="Co so">
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </optgroup>
                  </select>
                </Field>
                <Field label="Dang cho noi dung gi">
                  <input value={waitingForContent} onChange={e => setWaitingForContent(e.target.value)}
                    placeholder="VD: Xac nhan ngan sach, Ban thiet ke..."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500" />
                </Field>
              </div>
            </section>
          </div>

          {/* FOOTER */}
          <div className="sticky bottom-0 px-5 py-3 bg-white border-t border-slate-100 flex items-center justify-between gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition">Huy</button>
            <button type="submit" disabled={busy || !title.trim()}
              className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition shadow-sm">
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              Tao dieu phoi
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Sub-components
function SectionHeading({ children, noMargin }: { children: React.ReactNode; noMargin?: boolean }) {
  return <h3 className={`text-xs font-bold uppercase tracking-wider text-slate-500 ${noMargin ? '' : 'mb-3'}`}>{children}</h3>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
