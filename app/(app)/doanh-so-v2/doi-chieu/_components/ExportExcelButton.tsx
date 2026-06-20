'use client';

// M2.2 PR-6 (2026-06-20) — Nút "Xuất Excel" trong /doi-chieu header.
//
// FLAG-GATED: chỉ render khi `useFeatureFlag('SALES_V2_EXPORT_EXCEL')` = true
// VÀ role nằm trong allow list (top role hoặc QLCS_*).
//
// Click → popover chọn (cơ sở + tháng) → fetch endpoint → download file.
// QLCS auto-fill + disabled cơ sở (chỉ branch của mình).
//
// KHÔNG sửa Sidebar/Permission/Route Access — chỉ insert component nhỏ.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import { BRANCHES, type BranchId } from '@/lib/branches';
import { useFeatureFlag } from '@/lib/feature-flags/client';
import { useToast } from '@/components/ui/Toast';

interface Props {
  /** Role code hiện tại của user (truyền từ DoiChieuClient). */
  roleCode: string;
  /** Branch của user nếu là QLCS — server sẽ override anyway nhưng UI hiện đúng giá trị. */
  ownBranchId?: BranchId | null;
  /** Tháng mặc định (vd current month) — popover sẽ pre-fill. */
  defaultMonth: string;
  /** Branch mặc định ngoài UI parent — nếu top role chưa chọn branch riêng. */
  defaultBranchId?: BranchId | 'all';
}

const TOP_ROLES = ['ADMIN', 'CEO', 'CHU_TICH', 'GD_KD', 'GD_VP', 'TP_KE'] as const;

function isTopRole(roleCode: string): boolean {
  return (TOP_ROLES as ReadonlyArray<string>).includes(roleCode);
}

function isQlcsRole(roleCode: string): boolean {
  return roleCode.startsWith('QLCS_');
}

export default function ExportExcelButton(props: Props) {
  const { roleCode, ownBranchId, defaultMonth, defaultBranchId } = props;
  const flagOn = useFeatureFlag('SALES_V2_EXPORT_EXCEL');
  const toast = useToast();

  const canExport = isTopRole(roleCode) || isQlcsRole(roleCode);
  const isQlcs = isQlcsRole(roleCode);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const initialBranch: BranchId | '' = (() => {
    if (isQlcs && ownBranchId) return ownBranchId;
    if (defaultBranchId && defaultBranchId !== 'all') return defaultBranchId;
    return '';
  })();
  const [branchId, setBranchId] = useState<BranchId | ''>(initialBranch);
  const [month, setMonth] = useState<string>(defaultMonth);

  const popRef = useRef<HTMLDivElement>(null);

  // Click outside → close
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const handleExport = useCallback(async () => {
    if (loading) return;
    if (isQlcs && ownBranchId && branchId !== ownBranchId) {
      // Defensive — UI đã disable nhưng vẫn check phòng bypass DOM
      toast.error('QLCS chỉ có thể xuất báo cáo cơ sở mình');
      return;
    }
    if (!branchId) {
      toast.error('Vui lòng chọn cơ sở');
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(month)) {
      toast.error('Tháng không hợp lệ');
      return;
    }

    setLoading(true);
    try {
      const url = `/api/sales-v2/export?branchId=${encodeURIComponent(branchId)}&month=${encodeURIComponent(month)}`;
      const res = await fetch(url, { method: 'GET', cache: 'no-store' });

      if (!res.ok) {
        // API trả JSON error
        let msg = 'Lỗi khi xuất file';
        try {
          const j = await res.json();
          msg = j?.error ?? msg;
        } catch { /* binary or empty */ }
        toast.error(msg);
        return;
      }

      // Get filename from Content-Disposition
      const cd = res.headers.get('Content-Disposition') ?? '';
      const fnMatch = /filename="([^"]+)"/.exec(cd);
      const fallbackName = `DoanhSo_${branchId}_${month}.xlsx`;
      const filename = fnMatch ? fnMatch[1] : fallbackName;

      const blob = await res.blob();
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(dlUrl);

      toast.success(`Đã tải file: ${filename}`);
      setOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? 'Lỗi mạng khi xuất file');
    } finally {
      setLoading(false);
    }
  }, [branchId, month, loading, isQlcs, ownBranchId, toast]);

  if (!flagOn || !canExport) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
      >
        <Download size={16} />
        Xuất Excel
      </button>

      {open && (
        <div
          ref={popRef}
          className="absolute right-0 top-full mt-2 z-50 w-80 rounded-xl bg-white shadow-lg ring-1 ring-slate-200 p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-800">Xuất báo cáo doanh số</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-slate-600"
              aria-label="Đóng"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Cơ sở
              </label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value as BranchId | '')}
                disabled={isQlcs}
                className="w-full px-3 py-2 rounded-lg bg-white text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
              >
                <option value="">-- Chọn cơ sở --</option>
                {BRANCHES.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              {isQlcs && (
                <p className="mt-1 text-xs text-slate-500">QLCS chỉ xuất được cơ sở của mình.</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Tháng
              </label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <button
              type="button"
              onClick={handleExport}
              disabled={loading || !branchId}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  Đang tạo file...
                </>
              ) : (
                <>
                  <Download size={16} />
                  Xuất file
                </>
              )}
            </button>

            <p className="text-xs text-slate-500 leading-relaxed">
              File Excel có 4 sheet: Tổng kết, Chi tiết giao dịch, Doanh số theo Sale, Doanh số theo gói.
              Chỉ tính giao dịch đã được duyệt.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
