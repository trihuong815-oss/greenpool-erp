'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Edit3, Save, X, Loader2, CheckCircle2, AlertCircle, Power, PowerOff, Package as PackageIcon, Folder, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import {
  packageGroupsApi, packagesApi, comparePackagesSmart,
  type PackageGroup, type PackageItem,
} from '@/lib/services/sales/packages-api-client';

interface BranchRef { id: string; name: string; }
interface Props { allowedBranches: BranchRef[]; }

// ===== Helpers VND format =====
function formatVND(n: number): string {
  return n.toLocaleString('vi-VN');
}
function parseVNDInput(s: string): number {
  // Strip non-digit. Cap at 999 tỷ.
  const digits = s.replace(/\D/g, '').slice(0, 12);
  return digits ? Number(digits) : 0;
}

// ===== Modal types =====
type GroupModalState =
  | { mode: 'add' }
  | { mode: 'edit'; group: PackageGroup };

type PackageModalState =
  | { mode: 'add'; groupId: string; groupName: string }
  | { mode: 'edit'; pkg: PackageItem; groupName: string };

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
}

export function PackagesClient({ allowedBranches }: Props) {
  const [branchId, setBranchId] = useState(allowedBranches[0]?.id ?? '');
  const [groups, setGroups] = useState<PackageGroup[]>([]);
  const [packages, setPackages] = useState<Record<string, PackageItem[]>>({});
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Modal states
  const [groupModal, setGroupModal] = useState<GroupModalState | null>(null);
  const [packageModal, setPackageModal] = useState<PackageModalState | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmState | null>(null);
  // UI preferences — persist qua localStorage (mỗi user/browser tự nhớ)
  const [showPrice, setShowPrice] = useState(true);
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('packages-show-price') : null;
    if (saved !== null) setShowPrice(saved === 'true');
  }, []);
  function togglePrice() {
    setShowPrice((prev) => {
      const next = !prev;
      try { window.localStorage.setItem('packages-show-price', String(next)); } catch {}
      return next;
    });
  }

  function showToast(t: 'success' | 'error', msg: string) {
    setToast({ type: t, msg });
    setTimeout(() => setToast(null), 4000);
  }

  async function load() {
    if (!branchId) return;
    setLoading(true);
    try {
      const grps = await packageGroupsApi.list(branchId);
      setGroups(grps);
      const pkgsAll = await packagesApi.list({ branchId });
      const byGroup: Record<string, PackageItem[]> = {};
      pkgsAll.forEach((p) => { (byGroup[p.groupId] ??= []).push(p); });
      // Smart-sort mỗi nhóm: ưu tiên numeric từ tên ("1 tháng" < "6 tháng" < "1 năm" = 12 tháng;
      // "10 lượt" < "30 lượt"). Fallback theo sortOrder + tên cho gói không có số.
      for (const gid of Object.keys(byGroup)) byGroup[gid].sort(comparePackagesSmart);
      setPackages(byGroup);
    } catch (e: any) {
      showToast('error', 'Load lỗi: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [branchId]);

  // ===== Group CRUD =====
  async function saveGroup(name: string) {
    if (!groupModal) return;
    try {
      if (groupModal.mode === 'add') {
        await packageGroupsApi.create({
          name, branchId,
          sortOrder: (groups.at(-1)?.sortOrder ?? 0) + 10,
        });
        showToast('success', 'Đã thêm nhóm');
      } else {
        await packageGroupsApi.update(groupModal.group.id, { name });
        showToast('success', 'Đã đổi tên nhóm');
      }
      setGroupModal(null);
      await load();
    } catch (e: any) { showToast('error', e.message); }
  }

  async function toggleGroup(g: PackageGroup) {
    try {
      await packageGroupsApi.update(g.id, { active: !g.active });
      showToast('success', g.active ? 'Đã tắt nhóm' : 'Đã bật nhóm');
      await load();
    } catch (e: any) { showToast('error', e.message); }
  }

  function askDeleteGroup(g: PackageGroup) {
    setConfirmModal({
      title: 'Xoá nhóm',
      message: `Xoá nhóm "${g.name}"? Chỉ được nếu nhóm rỗng (không có gói nào).`,
      confirmLabel: 'Xoá',
      danger: true,
      onConfirm: async () => {
        try { await packageGroupsApi.delete(g.id); showToast('success', 'Đã xoá nhóm'); await load(); }
        catch (e: any) { showToast('error', e.message); throw e; }
      },
    });
  }

  // ===== Package CRUD =====
  async function savePackage(name: string, defaultPrice: number) {
    if (!packageModal) return;
    try {
      if (packageModal.mode === 'add') {
        const next = (packages[packageModal.groupId] ?? []).at(-1)?.sortOrder ?? 0;
        await packagesApi.create({
          name, branchId, groupId: packageModal.groupId, defaultPrice,
          sortOrder: next + 1,
        });
        showToast('success', 'Đã thêm gói');
      } else {
        await packagesApi.update(packageModal.pkg.id, { name, defaultPrice });
        showToast('success', 'Đã cập nhật gói');
      }
      setPackageModal(null);
      await load();
    } catch (e: any) { showToast('error', e.message); }
  }

  async function togglePackage(p: PackageItem) {
    try {
      await packagesApi.update(p.id, { active: !p.active });
      showToast('success', p.active ? 'Đã tắt gói' : 'Đã bật gói');
      await load();
    } catch (e: any) { showToast('error', e.message); }
  }

  function askDeletePackage(p: PackageItem) {
    setConfirmModal({
      title: 'Xoá gói dịch vụ',
      message: `Xoá gói "${p.name}"? Chỉ được nếu chưa có lịch sử doanh số liên quan.`,
      confirmLabel: 'Xoá',
      danger: true,
      onConfirm: async () => {
        try { await packagesApi.delete(p.id); showToast('success', 'Đã xoá gói'); await load(); }
        catch (e: any) { showToast('error', e.message); throw e; }
      },
    });
  }

  const branchName = allowedBranches.find((b) => b.id === branchId)?.name ?? branchId;

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Header bar */}
      <div className="card flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase font-semibold text-slate-500">Cơ sở đang quản lý</div>
          <select
            value={branchId} onChange={(e) => setBranchId(e.target.value)}
            disabled={allowedBranches.length === 1}
            className="mt-1 text-lg font-bold border-2 border-emerald-200 rounded-lg px-3 py-1.5 bg-white disabled:bg-slate-100 focus:border-emerald-500 outline-none"
          >
            {allowedBranches.map((b) => <option key={b.id} value={b.id}>{b.id} · {b.name}</option>)}
          </select>
        </div>
        <button
          onClick={() => setGroupModal({ mode: 'add' })}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-lg hover:shadow-md font-semibold transition"
        >
          <Plus size={16} /> Thêm nhóm
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`card flex items-center gap-2 ${toast.type === 'success' ? 'border-emerald-300 bg-emerald-50' : 'border-rose-300 bg-rose-50'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="text-emerald-700" size={18} /> : <AlertCircle className="text-rose-700" size={18} />}
          <div className={`text-sm ${toast.type === 'success' ? 'text-emerald-900' : 'text-rose-900'}`}>{toast.msg}</div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="card text-center py-12 text-slate-500"><Loader2 className="inline animate-spin" size={18} /> Đang tải...</div>
      ) : groups.length === 0 ? (
        <div className="card text-center py-12 text-slate-500">
          <Folder size={32} className="inline text-slate-300 mb-2" />
          <div>Chưa có nhóm nào cho cơ sở <strong>{branchName}</strong>.</div>
          <div className="text-xs mt-1">Bấm <strong>+ Thêm nhóm</strong> để bắt đầu.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.id} className={`card ${!g.active ? 'opacity-60 bg-slate-50' : ''}`}>
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2 min-w-0">
                  <Folder size={16} className="text-emerald-600 shrink-0" />
                  <span className="text-base font-bold text-slate-800 truncate">{g.name}</span>
                  {!g.active && <span className="text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-600 shrink-0">Đã tắt</span>}
                  <span className="text-xs text-slate-400 shrink-0">({packages[g.id]?.length ?? 0} gói)</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <IconBtn onClick={() => setPackageModal({ mode: 'add', groupId: g.id, groupName: g.name })} title="Thêm gói"><Plus size={14} /></IconBtn>
                  <IconBtn onClick={() => setGroupModal({ mode: 'edit', group: g })} title="Đổi tên nhóm"><Edit3 size={14} /></IconBtn>
                  <IconBtn onClick={() => toggleGroup(g)} title={g.active ? 'Tắt nhóm' : 'Bật nhóm'}>
                    {g.active ? <PowerOff size={14} /> : <Power size={14} />}
                  </IconBtn>
                  <IconBtn onClick={() => askDeleteGroup(g)} title="Xoá nhóm (chỉ khi rỗng)" danger><Trash2 size={14} /></IconBtn>
                </div>
              </div>

              {(packages[g.id]?.length ?? 0) === 0 ? (
                <div className="text-sm text-slate-400 italic py-3 text-center">Chưa có gói. Bấm <strong>+</strong> ở header nhóm để thêm.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase text-slate-500">
                      <th className="text-left p-1 w-12">#</th>
                      <th className="text-left p-1">Tên gói</th>
                      <th className={`text-right p-1 ${showPrice ? 'w-40' : 'w-24'}`}>
                        <div className="flex items-center justify-end gap-1">
                          {showPrice && <span>Đơn giá (VND)</span>}
                          {!showPrice && <span className="text-slate-400 italic normal-case">giá ẩn</span>}
                          <button
                            onClick={togglePrice}
                            title={showPrice ? 'Ẩn cột đơn giá' : 'Hiện cột đơn giá'}
                            className="ml-1 p-0.5 rounded text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition"
                          >
                            {showPrice ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                        </div>
                      </th>
                      <th className="text-center p-1 w-24">Trạng thái</th>
                      <th className="p-1 w-32"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {packages[g.id]?.map((p, i) => (
                      <tr key={p.id} className={`border-t border-slate-100 ${!p.active ? 'opacity-50' : ''}`}>
                        <td className="p-1 text-slate-400">{i + 1}</td>
                        <td className="p-1 font-medium text-slate-800">{p.name}</td>
                        <td className="p-1 text-right tabular-nums">
                          {showPrice
                            ? p.defaultPrice.toLocaleString('vi-VN')
                            : <span className="text-slate-300 select-none">•••</span>}
                        </td>
                        <td className="p-1 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded ${p.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                            {p.active ? 'Bật' : 'Đã tắt'}
                          </span>
                        </td>
                        <td className="p-1 text-right space-x-1">
                          <IconBtn onClick={() => setPackageModal({ mode: 'edit', pkg: p, groupName: g.name })} title="Sửa"><Edit3 size={12} /></IconBtn>
                          <IconBtn onClick={() => togglePackage(p)} title={p.active ? 'Tắt' : 'Bật'}>
                            {p.active ? <PowerOff size={12} /> : <Power size={12} />}
                          </IconBtn>
                          <IconBtn onClick={() => askDeletePackage(p)} title="Xoá" danger><Trash2 size={12} /></IconBtn>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ===== Modals ===== */}
      {groupModal && (
        <GroupModal
          state={groupModal}
          onClose={() => setGroupModal(null)}
          onSave={saveGroup}
        />
      )}
      {packageModal && (
        <PackageModal
          state={packageModal}
          onClose={() => setPackageModal(null)}
          onSave={savePackage}
        />
      )}
      {confirmModal && (
        <ConfirmModal
          state={confirmModal}
          onClose={() => setConfirmModal(null)}
        />
      )}
    </div>
  );
}

// ===== GroupModal: add/edit nhóm =====
function GroupModal({ state, onClose, onSave }: {
  state: GroupModalState;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const isEdit = state.mode === 'edit';
  const [name, setName] = useState(isEdit ? state.group.name : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const trimmed = name.trim();
    if (trimmed.length < 1) { setError('Tên nhóm không được rỗng'); return; }
    if (trimmed.length > 100) { setError('Tên nhóm tối đa 100 ký tự'); return; }
    setSaving(true);
    setError(null);
    try { await onSave(trimmed); }
    catch (e: any) { setError(e.message); setSaving(false); }
  }

  return (
    <ModalShell title={isEdit ? 'Đổi tên nhóm' : 'Thêm nhóm mới'} icon={<Folder size={18} />} onClose={onClose}>
      <div className="space-y-3">
        <FieldLabel label="Tên nhóm">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !saving) { e.preventDefault(); handleSave(); }
              else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
            }}
            autoFocus
            placeholder="Vd: Thẻ member bơi, Học bơi cá nhân,..."
            disabled={saving}
            className={inputCls}
          />
        </FieldLabel>
        {error && <ErrorBanner msg={error} />}
      </div>
      <ModalFooter onCancel={onClose} onSave={handleSave} saving={saving} saveDisabled={!name.trim()} />
    </ModalShell>
  );
}

// ===== PackageModal: add/edit gói (name + price VND) =====
function PackageModal({ state, onClose, onSave }: {
  state: PackageModalState;
  onClose: () => void;
  onSave: (name: string, defaultPrice: number) => Promise<void>;
}) {
  const isEdit = state.mode === 'edit';
  const [name, setName] = useState(isEdit ? state.pkg.name : '');
  const [priceStr, setPriceStr] = useState(isEdit ? formatVND(state.pkg.defaultPrice) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handlePriceChange(s: string) {
    const n = parseVNDInput(s);
    setPriceStr(n === 0 && s.replace(/\D/g, '') === '' ? '' : formatVND(n));
  }

  async function handleSave() {
    const trimmed = name.trim();
    if (trimmed.length < 1) { setError('Tên gói không được rỗng'); return; }
    if (trimmed.length > 100) { setError('Tên gói tối đa 100 ký tự'); return; }
    const price = parseVNDInput(priceStr);
    if (price < 0) { setError('Đơn giá phải ≥ 0'); return; }
    setSaving(true);
    setError(null);
    try { await onSave(trimmed, price); }
    catch (e: any) { setError(e.message); setSaving(false); }
  }

  return (
    <ModalShell
      title={isEdit ? `Sửa gói trong "${state.groupName}"` : `Thêm gói vào "${state.groupName}"`}
      icon={<PackageIcon size={18} />}
      onClose={onClose}
    >
      <div className="space-y-3">
        <FieldLabel label="Tên gói">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }}
            autoFocus
            placeholder='Vd: "Thẻ 1 tháng", "Thẻ 3 tháng"'
            disabled={saving}
            className={inputCls}
          />
        </FieldLabel>
        <FieldLabel label="Đơn giá mặc định (VND)" hint="Có thể chỉnh khi nhập doanh số. Format tự động theo VND.">
          <div className="relative">
            <input
              value={priceStr}
              onChange={(e) => handlePriceChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !saving) { e.preventDefault(); handleSave(); }
                else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
              }}
              placeholder="0"
              inputMode="numeric"
              disabled={saving}
              className={`${inputCls} pr-12 text-right tabular-nums font-semibold text-blue-700`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">VND</span>
          </div>
        </FieldLabel>
        {error && <ErrorBanner msg={error} />}
      </div>
      <ModalFooter onCancel={onClose} onSave={handleSave} saving={saving} saveDisabled={!name.trim()} />
    </ModalShell>
  );
}

// ===== ConfirmModal: thay window.confirm() =====
function ConfirmModal({ state, onClose }: { state: ConfirmState; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  async function handleConfirm() {
    setBusy(true);
    try { await state.onConfirm(); onClose(); }
    catch { /* error đã được toast bởi caller */ setBusy(false); }
  }
  return (
    <ModalShell title={state.title} icon={<AlertTriangle size={18} className="text-amber-500" />} onClose={onClose} narrow>
      <div className="text-sm text-slate-700">{state.message}</div>
      <ModalFooter
        onCancel={onClose}
        onSave={handleConfirm}
        saving={busy}
        saveLabel={state.confirmLabel ?? 'Xác nhận'}
        danger={state.danger}
      />
    </ModalShell>
  );
}

// ===== Modal primitives =====
function ModalShell({ title, icon, children, onClose, narrow = false }: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
  narrow?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3" onClick={onClose}>
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full ${narrow ? 'max-w-md' : 'max-w-lg'} flex flex-col overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {icon}
            <h2 className="text-base font-bold">{title}</h2>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-3 bg-slate-50/40">
          {children}
        </div>
      </div>
    </div>
  );
}

function ModalFooter({ onCancel, onSave, saving, saveDisabled = false, saveLabel = 'Lưu', danger = false }: {
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  saveDisabled?: boolean;
  saveLabel?: string;
  danger?: boolean;
}) {
  return (
    <div className="pt-2 flex items-center justify-end gap-2">
      <button onClick={onCancel} disabled={saving} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-50">
        Huỷ
      </button>
      <button
        onClick={onSave}
        disabled={saving || saveDisabled}
        className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg shadow-sm transition disabled:opacity-50 ${
          danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-gradient-to-r from-emerald-600 to-teal-700 hover:shadow-md'
        }`}
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        {saving ? 'Đang lưu...' : saveLabel}
      </button>
    </div>
  );
}

function FieldLabel({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 flex items-start gap-2">
      <AlertCircle size={14} className="text-rose-600 shrink-0 mt-0.5" />
      <div>{msg}</div>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-400 focus:border-transparent outline-none disabled:bg-slate-100';

function IconBtn({ children, onClick, title, danger = false }: {
  children: React.ReactNode; onClick: () => void; title: string; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick} title={title}
      className={`p-1.5 rounded transition ${danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-600 hover:bg-slate-100'}`}
    >
      {children}
    </button>
  );
}
