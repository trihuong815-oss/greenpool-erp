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
function formatVND(n: number | null | undefined): string {
  // Defensive: package có thể có defaultPrice=undefined (vd "PT Gym tùy chỉnh")
  return Number(n ?? 0).toLocaleString('vi-VN');
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
  // V8.Y bug fix 2026-06-19: EDIT/toggle optimistic — đóng modal ngay, PATCH ngầm.
  async function saveGroup(name: string) {
    if (!groupModal) return;
    // ADD: cần server tạo ID
    if (groupModal.mode === 'add') {
      try {
        await packageGroupsApi.create({
          name, branchId,
          sortOrder: (groups.at(-1)?.sortOrder ?? 0) + 10,
        });
        showToast('success', 'Đã thêm nhóm');
        setGroupModal(null);
        await load();
      } catch (e: any) { showToast('error', e.message); }
      return;
    }
    // EDIT: optimistic rename — retry once nếu fail
    const original = groupModal.group;
    setGroups((prev) => prev.map((g) => (g.id === original.id ? { ...g, name } : g)));
    setGroupModal(null);
    patchGroupWithRetry(original.id, { name }).then((err) => {
      if (!err) { showToast('success', 'Đã đổi tên nhóm'); return; }
      setGroups((prev) => prev.map((g) => (g.id === original.id ? original : g)));
      showToast('error', `Đổi tên thất bại: ${err.message} (đã hoàn tác)`);
    });
  }

  async function toggleGroup(g: PackageGroup) {
    const newActive = !g.active;
    setGroups((prev) => prev.map((x) => (x.id === g.id ? { ...x, active: newActive } : x)));
    patchGroupWithRetry(g.id, { active: newActive }).then((err) => {
      if (!err) { showToast('success', newActive ? 'Đã bật nhóm' : 'Đã tắt nhóm'); return; }
      setGroups((prev) => prev.map((x) => (x.id === g.id ? { ...x, active: g.active } : x)));
      showToast('error', `Thao tác thất bại: ${err.message} (đã hoàn tác)`);
    });
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
  // V8.Y bug fix 2026-06-19: EDIT/toggle dùng OPTIMISTIC UPDATE — apply patch
  // vào local state ngay + đóng modal ngay, gọi PATCH ngầm. Nếu fail thì rollback
  // + toast error. Tránh modal stuck khi cold start App Hosting (~2-5s).
  //
  // V8.Y bug fix 2026-06-19 (round 2): bg PATCH có thể fail transient (cold start,
  // network blip) → user thấy badge nhấp nháy rồi biến mất. Fix: RETRY ONCE silent
  // sau 300ms; chỉ rollback nếu cả 2 lần fail. Surface lỗi qua console.error để debug.
  async function patchPackageWithRetry(id: string, patch: Partial<PackageItem>): Promise<Error | null> {
    try {
      await packagesApi.update(id, patch);
      return null;
    } catch (e1) {
      console.warn('[packages] PATCH attempt 1 failed, retrying...', e1);
      await new Promise((r) => setTimeout(r, 300));
      try {
        await packagesApi.update(id, patch);
        return null;
      } catch (e2) {
        console.error('[packages] PATCH attempt 2 failed:', e2);
        return e2 instanceof Error ? e2 : new Error(String(e2));
      }
    }
  }
  async function patchGroupWithRetry(id: string, patch: Partial<PackageGroup>): Promise<Error | null> {
    try {
      await packageGroupsApi.update(id, patch);
      return null;
    } catch (e1) {
      console.warn('[packageGroups] PATCH attempt 1 failed, retrying...', e1);
      await new Promise((r) => setTimeout(r, 300));
      try {
        await packageGroupsApi.update(id, patch);
        return null;
      } catch (e2) {
        console.error('[packageGroups] PATCH attempt 2 failed:', e2);
        return e2 instanceof Error ? e2 : new Error(String(e2));
      }
    }
  }
  async function savePackage(payload: {
    name: string;
    defaultPrice: number;
    isCustomQuantity: boolean;
    unitName: string;
    defaultUnitPrice: number;
    manualPriceWithQuantity: boolean;
  }) {
    if (!packageModal) return;
    const { name, defaultPrice, isCustomQuantity, unitName, defaultUnitPrice, manualPriceWithQuantity } = payload;

    // ADD: cần server tạo ID → vẫn await (không optimistic được)
    if (packageModal.mode === 'add') {
      try {
        const next = (packages[packageModal.groupId] ?? []).at(-1)?.sortOrder ?? 0;
        await packagesApi.create({
          name, branchId, groupId: packageModal.groupId, defaultPrice,
          sortOrder: next + 1,
          isCustomQuantity, unitName, defaultUnitPrice,
          manualPriceWithQuantity,
        });
        showToast('success', 'Đã thêm gói');
        setPackageModal(null);
        await load();
      } catch (e: any) { showToast('error', e.message); }
      return;
    }

    // EDIT: optimistic
    const original = packageModal.pkg;
    const patch: Partial<PackageItem> = {
      name, defaultPrice, isCustomQuantity, unitName, defaultUnitPrice, manualPriceWithQuantity,
    };
    // Apply optimistic patch + re-sort theo helper smart
    setPackages((prev) => {
      const updated: typeof prev = {};
      for (const gid of Object.keys(prev)) {
        const arr = prev[gid].map((p) => (p.id === original.id ? { ...p, ...patch } : p));
        updated[gid] = [...arr].sort(comparePackagesSmart);
      }
      return updated;
    });
    setPackageModal(null);
    // Background PATCH (retry once) — rollback chỉ khi cả 2 lần fail
    patchPackageWithRetry(original.id, patch).then((err) => {
      if (!err) {
        showToast('success', 'Đã cập nhật gói');
        return;
      }
      // Rollback to original
      setPackages((prev) => {
        const updated: typeof prev = {};
        for (const gid of Object.keys(prev)) {
          const arr = prev[gid].map((p) => (p.id === original.id ? original : p));
          updated[gid] = [...arr].sort(comparePackagesSmart);
        }
        return updated;
      });
      showToast('error', `Lưu thất bại: ${err.message} (đã hoàn tác)`);
    });
  }

  async function togglePackage(p: PackageItem) {
    // Optimistic toggle
    const newActive = !p.active;
    setPackages((prev) => {
      const updated: typeof prev = {};
      for (const gid of Object.keys(prev)) {
        updated[gid] = prev[gid].map((x) => (x.id === p.id ? { ...x, active: newActive } : x));
      }
      return updated;
    });
    patchPackageWithRetry(p.id, { active: newActive }).then((err) => {
      if (!err) {
        showToast('success', newActive ? 'Đã bật gói' : 'Đã tắt gói');
        return;
      }
      // Rollback
      setPackages((prev) => {
        const updated: typeof prev = {};
        for (const gid of Object.keys(prev)) {
          updated[gid] = prev[gid].map((x) => (x.id === p.id ? { ...x, active: p.active } : x));
        }
        return updated;
      });
      showToast('error', `Thao tác thất bại: ${err.message} (đã hoàn tác)`);
    });
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
                        <td className="p-1 font-medium text-slate-800">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{p.name}</span>
                            {p.isCustomQuantity && (
                              <span
                                className="text-xs uppercase font-bold text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded ring-1 ring-violet-200"
                                title={`Tính theo ${p.unitName || 'buổi'} (PT) — Sale nhập số ${p.unitName || 'buổi'} × đơn giá`}
                              >
                                PT · {p.unitName || 'buổi'}
                              </span>
                            )}
                            {p.manualPriceWithQuantity && (
                              <span
                                className="text-xs uppercase font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded ring-1 ring-amber-200"
                                title="Sale tự nhập giá trị gói + ghi số buổi (vd HB CLB Kid/Aqua)"
                              >
                                Tự nhập · ghi buổi
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-1 text-right tabular-nums">
                          {!showPrice ? (
                            <span className="text-slate-300 select-none">•••</span>
                          ) : p.isCustomQuantity ? (
                            <span className="text-emerald-700 font-medium" title="Đơn giá / buổi gợi ý — Sale có thể chỉnh">
                              {(p.defaultUnitPrice ?? 0).toLocaleString('vi-VN')}
                              <span className="text-[10px] text-slate-400 ml-0.5">/{p.unitName || 'buổi'}</span>
                            </span>
                          ) : (
                            (p.defaultPrice ?? 0).toLocaleString('vi-VN')
                          )}
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

// ===== PackageModal: add/edit gói (name + price VND + PT mode) =====
function PackageModal({ state, onClose, onSave }: {
  state: PackageModalState;
  onClose: () => void;
  onSave: (payload: {
    name: string;
    defaultPrice: number;
    isCustomQuantity: boolean;
    unitName: string;
    defaultUnitPrice: number;
    manualPriceWithQuantity: boolean;
  }) => Promise<void>;
}) {
  const isEdit = state.mode === 'edit';
  const [name, setName] = useState(isEdit ? state.pkg.name : '');
  const [priceStr, setPriceStr] = useState(isEdit ? formatVND(state.pkg.defaultPrice) : '');
  // V6 PT (2026-06-17)
  const [isCustomQuantity, setIsCustomQuantity] = useState(isEdit ? (state.pkg.isCustomQuantity === true) : false);
  const [unitName, setUnitName] = useState(isEdit ? (state.pkg.unitName ?? 'buổi') : 'buổi');
  const [unitPriceStr, setUnitPriceStr] = useState(
    isEdit && state.pkg.defaultUnitPrice ? formatVND(state.pkg.defaultUnitPrice) : ''
  );
  // V8.Y (2026-06-19): Manual price + ghi số buổi (HB CLB Kid/Aqua)
  const [manualPriceWithQuantity, setManualPriceWithQuantity] = useState(
    isEdit ? (state.pkg.manualPriceWithQuantity === true) : false
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handlePriceChange(s: string) {
    const n = parseVNDInput(s);
    setPriceStr(n === 0 && s.replace(/\D/g, '') === '' ? '' : formatVND(n));
  }
  function handleUnitPriceChange(s: string) {
    const n = parseVNDInput(s);
    setUnitPriceStr(n === 0 && s.replace(/\D/g, '') === '' ? '' : formatVND(n));
  }

  async function handleSave() {
    const trimmed = name.trim();
    if (trimmed.length < 1) { setError('Tên gói không được rỗng'); return; }
    if (trimmed.length > 100) { setError('Tên gói tối đa 100 ký tự'); return; }
    if (isCustomQuantity && manualPriceWithQuantity) {
      setError('Không thể bật cùng lúc "PT theo buổi × đơn giá" và "Tự nhập giá + ghi số buổi"');
      return;
    }
    const price = parseVNDInput(priceStr);
    if (price < 0) { setError('Đơn giá phải ≥ 0'); return; }
    const unitPrice = parseVNDInput(unitPriceStr);
    if (isCustomQuantity && unitPrice < 0) { setError('Đơn giá / buổi phải ≥ 0'); return; }
    const cleanUnitName = (unitName.trim() || 'buổi').slice(0, 20);
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: trimmed,
        defaultPrice: price,
        isCustomQuantity,
        unitName: isCustomQuantity ? cleanUnitName : '',
        defaultUnitPrice: isCustomQuantity ? unitPrice : 0,
        manualPriceWithQuantity,
      });
    } catch (e: any) { setError(e.message); setSaving(false); }
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

        {/* V6 PT toggle */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2">
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isCustomQuantity}
              onChange={(e) => {
                setIsCustomQuantity(e.target.checked);
                if (e.target.checked) setManualPriceWithQuantity(false);
              }}
              disabled={saving || manualPriceWithQuantity}
              className="mt-0.5 w-4 h-4 accent-emerald-600 disabled:opacity-50"
            />
            <div className="flex-1">
              <div className="text-sm font-semibold text-slate-800">Gói tính theo buổi / lượt (PT, học PT)</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Sale sẽ nhập <strong>số buổi × đơn giá / buổi</strong> tại thời điểm bán. Doanh số = số buổi × đơn giá.
                Dùng cho gói PT GYM, học bơi PT, ... — số buổi linh hoạt theo từng khách.
              </div>
            </div>
          </label>
        </div>

        {/* V8.Y Manual price + ghi số buổi toggle (HB CLB Kid/Aqua) */}
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-2">
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={manualPriceWithQuantity}
              onChange={(e) => {
                setManualPriceWithQuantity(e.target.checked);
                if (e.target.checked) setIsCustomQuantity(false);
              }}
              disabled={saving || isCustomQuantity}
              className="mt-0.5 w-4 h-4 accent-amber-600 disabled:opacity-50"
            />
            <div className="flex-1">
              <div className="text-sm font-semibold text-slate-800">Sale tự nhập giá + ghi số buổi (HB CLB Kid/Aqua)</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Sale tự nhập <strong>giá trị gói</strong> + <strong>số buổi học</strong> (chỉ để note thông tin).
                KHÔNG có ô đơn giá, KHÔNG có công thức × tự động. Dùng cho gói linh hoạt giá theo từng khách.
              </div>
            </div>
          </label>
        </div>

        {!isCustomQuantity && (
          <FieldLabel
            label="Đơn giá mặc định (VND)"
            hint={manualPriceWithQuantity
              ? 'Mode "Sale tự nhập": đây là giá GỢI Ý mặc định. Sale có thể đè khi nhập tx.'
              : 'Có thể chỉnh khi nhập doanh số. Format tự động theo VND.'}
          >
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
        )}

        {isCustomQuantity && (
          <div className="grid grid-cols-2 gap-3">
            <FieldLabel label="Tên đơn vị" hint="Vd: buổi, lượt">
              <input
                value={unitName}
                onChange={(e) => setUnitName(e.target.value)}
                placeholder="buổi"
                disabled={saving}
                maxLength={20}
                className={inputCls}
              />
            </FieldLabel>
            <FieldLabel label="Đơn giá / buổi gợi ý (VND)" hint="Sale có thể chỉnh từng khách.">
              <div className="relative">
                <input
                  value={unitPriceStr}
                  onChange={(e) => handleUnitPriceChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !saving) { e.preventDefault(); handleSave(); }
                    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
                  }}
                  placeholder="0"
                  inputMode="numeric"
                  disabled={saving}
                  className={`${inputCls} pr-12 text-right tabular-nums font-semibold text-emerald-700`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">VND</span>
              </div>
            </FieldLabel>
          </div>
        )}

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
