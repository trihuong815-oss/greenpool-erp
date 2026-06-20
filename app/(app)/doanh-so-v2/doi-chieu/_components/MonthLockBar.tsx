'use client';

// M2.1 PR-3A (2026-06-20) — Month lock UI bar trong /doi-chieu.
// FLAG-GATED: chỉ render khi `useFeatureFlag('SALES_V2_MONTH_LOCK')` = true.
//
// Hành vi theo role:
//   - TP_KE / CEO / CHU_TICH / ADMIN: thấy badge state + nút Khoá/Mở khoá
//   - QLCS_* / NV_KE: chỉ thấy badge state, KHÔNG có nút
//   - Sale: không render (chưa scope)
//
// QUAN TRỌNG PR-3A: KHÔNG enforce chặn tx mutation. Bar chỉ tạo/đọc lock doc.
// PR-3B sẽ wire assertMonthNotLocked() vào tx APIs.

import { useCallback, useEffect, useState } from 'react';
import { Lock, Unlock, Loader2, AlertTriangle } from 'lucide-react';
import type { BranchId } from '@/lib/branches';
import { BRANCH_BY_ID } from '@/lib/branches';
import { useFeatureFlag } from '@/lib/feature-flags/client';

interface LockState {
  locked: boolean;
  lockedByName: string | null;
  lockedAt: string | null;
}

interface Props {
  branchId: BranchId | 'all';
  /** Tháng đang xem — vd '2026-06'. Caller derive từ date filter hoặc currentMonth. */
  month: string;
  roleCode: string;
}

const PRIVILEGED_ROLES = new Set(['TP_KE', 'CEO', 'CHU_TICH', 'ADMIN']);
/** Roles xem được state khoá (nếu flag bật) nhưng không lock/unlock được. */
const READ_ONLY_ROLES_PREFIX = ['QLCS_'];
const READ_ONLY_ROLES_EXACT = new Set(['NV_KE', 'GD_KD', 'GD_VP']);

function canSeeBar(roleCode: string): boolean {
  if (PRIVILEGED_ROLES.has(roleCode)) return true;
  if (READ_ONLY_ROLES_EXACT.has(roleCode)) return true;
  if (READ_ONLY_ROLES_PREFIX.some((p) => roleCode.startsWith(p))) return true;
  return false;
}

function canManageLock(roleCode: string): boolean {
  return PRIVILEGED_ROLES.has(roleCode);
}

export default function MonthLockBar({ branchId, month, roleCode }: Props) {
  // PR-3A: FLAG-GATED. Default OFF → bar ẩn hoàn toàn.
  const flagEnabled = useFeatureFlag('SALES_V2_MONTH_LOCK');

  const [state, setState] = useState<LockState | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockReason, setUnlockReason] = useState('');

  const fetchState = useCallback(async () => {
    // Yêu cầu branchId cụ thể (không phải 'all') + month hợp lệ.
    if (branchId === 'all' || !month) { setState(null); return; }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/sales-v2/month-locks?branchId=${branchId}&month=${month}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setState({
        locked: !!j.locked,
        lockedByName: j.lockedByName ?? null,
        lockedAt: j.lockedAt ?? null,
      });
    } catch (e: any) {
      setError(e?.message ?? 'Lỗi tải trạng thái khoá');
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [branchId, month]);

  useEffect(() => { void fetchState(); }, [fetchState]);

  // 3 sớm exit — KHÔNG render gì
  if (!flagEnabled) return null;
  if (!canSeeBar(roleCode)) return null;
  if (branchId === 'all') {
    // UI guide: yêu cầu chọn 1 cơ sở cụ thể trước.
    if (!canManageLock(roleCode)) return null;
    return (
      <div className="rounded-lg bg-slate-50 ring-1 ring-slate-200 px-3 py-2 text-xs text-slate-500 flex items-center gap-2">
        <Lock size={12} />
        <span>Chọn 1 cơ sở để xem / quản lý khoá kỳ tháng <strong>{month}</strong>.</span>
      </div>
    );
  }

  const branchName = BRANCH_BY_ID[branchId]?.name ?? branchId;
  const isManager = canManageLock(roleCode);

  async function doLock() {
    if (busy) return;
    if (!confirm(`Khoá kỳ tháng ${month} cơ sở ${branchName}?\n\nLưu ý: PR-3A chưa enforce chặn chỉnh sửa. Tính năng chặn sẽ bật ở PR-3B.`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/sales-v2/month-locks/${branchId}/${month}/lock`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      await fetchState();
    } catch (e: any) {
      setError(e?.message ?? 'Khoá thất bại');
    } finally {
      setBusy(false);
    }
  }

  async function doUnlock() {
    if (busy) return;
    const reason = unlockReason.trim();
    if (!reason) { setError('Bắt buộc nhập lý do mở khoá'); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/sales-v2/month-locks/${branchId}/${month}/unlock`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setUnlockOpen(false);
      setUnlockReason('');
      await fetchState();
    } catch (e: any) {
      setError(e?.message ?? 'Mở khoá thất bại');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg ring-1 px-3 py-2 flex flex-wrap items-center gap-2 text-xs bg-white ring-slate-200">
      {loading ? (
        <div className="inline-flex items-center gap-1.5 text-slate-500">
          <Loader2 size={12} className="animate-spin" />
          Đang kiểm tra khoá kỳ…
        </div>
      ) : state?.locked ? (
        <>
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-rose-50 text-rose-700 ring-1 ring-rose-200 font-semibold uppercase tracking-wider">
            <Lock size={12} />
            Đã khoá
          </span>
          <span className="text-slate-600">
            Cơ sở <strong>{branchName}</strong> · tháng <strong>{month}</strong>
            {state.lockedByName ? <> · khoá bởi <strong>{state.lockedByName}</strong></> : null}
          </span>
          {isManager && (
            <button
              type="button"
              onClick={() => setUnlockOpen(true)}
              disabled={busy}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100 disabled:opacity-50"
            >
              <Unlock size={12} />
              Mở khoá
            </button>
          )}
        </>
      ) : (
        <>
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 font-semibold uppercase tracking-wider">
            <Unlock size={12} />
            Đang mở
          </span>
          <span className="text-slate-600">
            Cơ sở <strong>{branchName}</strong> · tháng <strong>{month}</strong>
          </span>
          {isManager && (
            <button
              type="button"
              onClick={doLock}
              disabled={busy}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-100 text-slate-700 ring-1 ring-slate-300 hover:bg-slate-200 disabled:opacity-50"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />}
              Khoá tháng
            </button>
          )}
        </>
      )}
      {error && (
        <span className="w-full text-rose-600 text-xs mt-1 inline-flex items-center gap-1">
          <AlertTriangle size={12} /> {error}
        </span>
      )}
      {isManager && (
        <span className="w-full text-slate-400 text-xs italic">
          Sau khi khoá, dữ liệu tháng này sẽ không được chỉnh sửa khi tính năng enforce được bật (PR-3B).
        </span>
      )}

      {/* Modal unlock — chỉ render khi user click "Mở khoá" */}
      {unlockOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3" onClick={() => !busy && setUnlockOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-xl w-full max-w-md p-4 ring-1 ring-slate-200">
            <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
              <Unlock size={14} /> Mở khoá kỳ {month} — {branchName}
            </h3>
            <p className="text-xs text-slate-600 mb-3">
              Mở khoá sẽ ghi vào lịch sử + gửi thông báo cho CEO/Chủ tịch. Nhập lý do rõ ràng để audit.
            </p>
            <textarea
              value={unlockReason}
              onChange={(e) => setUnlockReason(e.target.value)}
              placeholder="Vd: Sale phát hiện sai sót giá trị gói cần điều chỉnh, kế toán yêu cầu cập nhật."
              rows={3}
              maxLength={500}
              className="w-full text-sm rounded-lg ring-1 ring-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <div className="text-xs text-slate-400 text-right mt-1">{unlockReason.length}/500</div>
            {error && <div className="text-xs text-rose-600 mt-1 inline-flex items-center gap-1"><AlertTriangle size={12} />{error}</div>}
            <div className="flex justify-end gap-2 mt-3">
              <button type="button" onClick={() => { setUnlockOpen(false); setError(null); }} disabled={busy}
                className="px-3 py-1.5 text-sm rounded-lg ring-1 ring-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                Huỷ
              </button>
              <button type="button" onClick={doUnlock} disabled={busy || !unlockReason.trim()}
                className="px-3 py-1.5 text-sm rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 inline-flex items-center gap-1.5">
                {busy && <Loader2 size={12} className="animate-spin" />}
                Mở khoá
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
