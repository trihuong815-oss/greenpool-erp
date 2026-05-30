'use client';

import { useState } from 'react';
import { X, Loader2, UserPlus, UserMinus, UserCheck, AlertCircle, Copy, Pencil, Check } from 'lucide-react';

interface StaffRow {
  id: string;
  name: string;
  roleId: string;
  branchId: string | null;
  status?: string;
}

interface Props {
  branchId: string;
  branchName: string;
  staff: StaffRow[];               // current sales (from server) filtered to NV_SALE of this branch
  onClose: () => void;
  onChanged: () => void;            // called after add/remove to trigger router.refresh()
}

interface CreateResp {
  uid: string;
  email: string;
  fullName: string;
  branchId: string;
  defaultPassword: string;
}

export function ManageSalesModal({ branchId, branchName, staff, onClose, onChanged }: Props) {
  const [busy, setBusy] = useState<null | 'add' | string>(null); // null | 'add' | uid
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [lastCreated, setLastCreated] = useState<CreateResp | null>(null);
  // Inline edit name state
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Phase 2026-05-30: filter cả NV_SALE (Member) + NV_SALE_PT (PT — chỉ cơ sở 24)
  const branchSales = staff.filter((s) => (s.roleId === 'NV_SALE' || s.roleId === 'NV_SALE_PT') && s.branchId === branchId);

  async function addSale() {
    if (!newName.trim()) { setError('Nhập họ tên'); return; }
    setBusy('add');
    setError(null);
    try {
      const res = await fetch('/api/sales-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId, fullName: newName.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setLastCreated(j as CreateResp);
      setNewName('');
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function toggleStatus(uid: string, currentStatus: string | undefined) {
    const next = currentStatus === 'inactive' ? 'active' : 'inactive';
    if (next === 'inactive' && !confirm('Tắt sale này khỏi danh sách? (data cũ vẫn được giữ — có thể bật lại bất kỳ lúc nào)')) return;
    setBusy(uid);
    setError(null);
    try {
      const res = await fetch(`/api/sales-staff/${uid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  function startEdit(uid: string, currentName: string) {
    setEditingUid(uid);
    setEditName(currentName);
    setError(null);
  }

  function cancelEdit() {
    setEditingUid(null);
    setEditName('');
  }

  async function saveEdit(uid: string, originalName: string) {
    const name = editName.trim();
    if (name.length < 2) { setError('Họ tên ít nhất 2 ký tự'); return; }
    if (name === originalName) { cancelEdit(); return; }
    setBusy(uid);
    setError(null);
    try {
      const res = await fetch(`/api/sales-staff/${uid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      cancelEdit();
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  function copyCredentials() {
    if (!lastCreated) return;
    const text = `Đăng nhập app Green Pool System:\nEmail: ${lastCreated.email}\nMật khẩu: ${lastCreated.defaultPassword}\n(Đổi mật khẩu sau khi đăng nhập lần đầu)`;
    navigator.clipboard.writeText(text).then(
      () => alert('Đã copy email + mật khẩu vào clipboard'),
      () => alert('Copy thất bại — chọn text bằng tay'),
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold">Quản lý Sale — {branchName}</h2>
            <p className="text-xs text-emerald-50/90 mt-0.5">
              Thêm hoặc tắt sale của cơ sở này. Chỉ admin có quyền.
            </p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X size={20} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {error && (
            <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          {/* Success: created sale credentials */}
          {lastCreated && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 space-y-2">
              <div className="text-sm font-semibold text-emerald-900 flex items-center gap-2">
                <UserCheck size={14} /> Đã tạo: {lastCreated.fullName}
              </div>
              <div className="text-xs space-y-1 text-slate-700">
                <div><strong>Email:</strong> <code className="bg-white px-1.5 py-0.5 rounded text-emerald-700">{lastCreated.email}</code></div>
                <div><strong>Mật khẩu mặc định:</strong> <code className="bg-white px-1.5 py-0.5 rounded text-emerald-700">{lastCreated.defaultPassword}</code></div>
                <div className="text-amber-700 text-[11px]">⚠ Yêu cầu sale đổi mật khẩu sau khi đăng nhập lần đầu.</div>
              </div>
              <button
                onClick={copyCredentials}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
              >
                <Copy size={11} /> Copy email + mật khẩu
              </button>
            </div>
          )}

          {/* Add new sale */}
          <div className="rounded-lg border-2 border-dashed border-emerald-200 p-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Thêm sale mới vào {branchId}</div>
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !busy) { e.preventDefault(); addSale(); } }}
                placeholder="Họ tên đầy đủ (vd: Nguyễn Văn A)"
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-400 outline-none"
              />
              <button
                onClick={addSale}
                disabled={busy === 'add' || !newName.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
              >
                {busy === 'add' ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                Thêm
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              📧 Email auto-gen: <code>{`{slug_họ_tên}.${branchId.toLowerCase()}@greenpool.vn`}</code> · Mật khẩu mặc định: <code>Greenpool@2026</code>
            </p>
          </div>

          {/* Active sales list */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Sale hiện có ({branchSales.length})
            </div>
            {branchSales.length === 0 ? (
              <div className="text-center py-6 text-sm text-slate-400">Cơ sở chưa có sale nào.</div>
            ) : (
              <ul className="space-y-1.5">
                {branchSales.map((s) => {
                  const isInactive = s.status === 'inactive';
                  const isBusy = busy === s.id;
                  const isEditing = editingUid === s.id;
                  return (
                    <li key={s.id} className={`flex items-center gap-2 p-2.5 rounded-lg border ${isInactive ? 'bg-slate-50 border-slate-200 text-slate-400' : isEditing ? 'bg-emerald-50/40 border-emerald-300' : 'bg-white border-slate-200 hover:border-emerald-300'}`}>
                      <UserCheck size={14} className={isInactive ? 'text-slate-400' : 'text-emerald-600'} />
                      {isEditing ? (
                        <>
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !isBusy) { e.preventDefault(); saveEdit(s.id, s.name); }
                              else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                            }}
                            autoFocus
                            disabled={isBusy}
                            className="flex-1 px-2 py-1 text-sm border border-emerald-300 rounded focus:ring-2 focus:ring-emerald-400 outline-none"
                          />
                          <button
                            onClick={() => saveEdit(s.id, s.name)}
                            disabled={isBusy || !editName.trim()}
                            title="Lưu (Enter)"
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {isBusy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                            Lưu
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={isBusy}
                            title="Huỷ (Esc)"
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                          >
                            <X size={11} /> Huỷ
                          </button>
                        </>
                      ) : (
                        <>
                          <span className={`flex-1 text-sm font-medium ${isInactive ? 'line-through' : 'text-slate-800'}`}>
                            {s.name}
                            {isInactive && <span className="ml-2 text-[10px] uppercase tracking-wider text-rose-600">(đã tắt)</span>}
                          </span>
                          <button
                            onClick={() => startEdit(s.id, s.name)}
                            disabled={isBusy || editingUid !== null}
                            title="Sửa tên"
                            className="inline-flex items-center justify-center w-7 h-7 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 disabled:opacity-30"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => toggleStatus(s.id, s.status)}
                            disabled={isBusy || editingUid !== null}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded ${
                              isInactive
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                            } disabled:opacity-50`}
                          >
                            {isBusy ? <Loader2 size={11} className="animate-spin" /> : isInactive ? <UserCheck size={11} /> : <UserMinus size={11} />}
                            {isInactive ? 'Bật lại' : 'Tắt'}
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="text-[11px] text-slate-500 italic space-y-0.5">
            <div>💡 Tắt sale không xoá dữ liệu cũ — vẫn xem được trong báo cáo lịch sử. Có thể bật lại bất kỳ lúc nào.</div>
            <div>✏️ Sửa tên: bấm icon ✎ bên cạnh sale. Email & mật khẩu KHÔNG đổi — chỉ tên hiển thị thay đổi (audit log lưu lịch sử rename).</div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/40 flex items-center justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Đóng</button>
        </div>
      </div>
    </div>
  );
}
