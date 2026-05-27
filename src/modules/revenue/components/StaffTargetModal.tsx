'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, Save, User, Calculator } from 'lucide-react';
import { targetsApi, type StaffTargets } from '@/lib/services/sales/targets-api-client';

interface SaleStaff {
  saleId: string;
  saleName: string;
}

interface Props {
  year: number;
  branchId: string;
  branchName: string;
  sales: SaleStaff[];          // danh sách sale trong branch
  onClose: () => void;
}

const MONTH_LABELS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];

function fmtVND(n: number): string {
  return n.toLocaleString('vi-VN');
}
function sum12(arr: number[]) { return arr.reduce((a, n) => a + (n || 0), 0); }
function zeros12() { return Array(12).fill(0); }

export function StaffTargetModal({ year, branchId, branchName, sales, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targets, setTargets] = useState<StaffTargets>({});

  // Load existing
  useEffect(() => {
    setLoading(true);
    setError(null);
    targetsApi.list(year)
      .then((rows) => {
        const found = rows.find((r) => r.branchId === branchId);
        if (found?.staffTargets) {
          setTargets(found.staffTargets);
        } else {
          // Init empty cho mọi sale
          const init: StaffTargets = {};
          sales.forEach((s) => { init[s.saleId] = zeros12(); });
          setTargets(init);
        }
      })
      .catch((e) => setError('Load lỗi: ' + e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, branchId]);

  function setCell(saleId: string, monthIdx: number, val: number) {
    setTargets((prev) => {
      const arr = [...(prev[saleId] ?? zeros12())];
      arr[monthIdx] = Math.max(0, Math.floor(val));
      return { ...prev, [saleId]: arr };
    });
  }

  // Tính nhanh: chia đều total cho 12 tháng
  function distributeEven(saleId: string, total: number) {
    if (total < 0) return;
    const each = Math.floor(total / 12);
    setTargets((prev) => ({ ...prev, [saleId]: Array(12).fill(each) }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Gửi chỉ entries có ít nhất 1 sale (đảm bảo entry không rỗng)
      await targetsApi.bulkUpsert([{
        year, branchId,
        staffTargets: targets,
      }]);
      onClose();
      if (typeof window !== 'undefined') window.location.reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // Totals
  const monthTotals = MONTH_LABELS.map((_, m) =>
    sales.reduce((s, sale) => s + ((targets[sale.saleId] ?? [])[m] || 0), 0),
  );
  const yearTotals = sales.reduce((s, sale) => s + sum12(targets[sale.saleId] ?? []), 0);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1280px] max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2"><User size={18} /> Đặt mục tiêu Sale — {branchName}</h2>
            <p className="text-xs text-emerald-50/90 mt-0.5">
              Năm {year} · {sales.length} sale · Nhập mục tiêu doanh số (VND) cho từng tháng
            </p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5 bg-slate-50/40">
          {loading ? (
            <div className="text-center py-16 text-slate-500"><Loader2 size={20} className="inline animate-spin mr-2" /> Đang tải…</div>
          ) : error ? (
            <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3 mb-3">{error}</div>
          ) : sales.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">Chi nhánh chưa có sale active. Vào /users để thêm.</div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-xs tabular-nums">
                  <thead className="bg-gradient-to-b from-slate-100 to-slate-50 text-slate-700">
                    <tr>
                      <th className="text-left px-3 py-2.5 font-semibold sticky left-0 bg-slate-100 z-10 min-w-[180px] border-r border-slate-200">Sale</th>
                      {MONTH_LABELS.map((m) => (
                        <th key={m} className="px-2 py-2.5 font-semibold text-center min-w-[100px]">{m}</th>
                      ))}
                      <th className="px-3 py-2.5 font-bold text-center bg-emerald-100 text-emerald-800 min-w-[130px] border-l border-emerald-300">Tổng năm</th>
                      <th className="px-2 py-2.5 font-semibold text-center w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((sale) => {
                      const arr = targets[sale.saleId] ?? zeros12();
                      const yearSum = sum12(arr);
                      return (
                        <tr key={sale.saleId} className="border-t border-slate-100 hover:bg-emerald-50/30">
                          <td className="px-3 py-2 font-medium text-slate-800 sticky left-0 bg-white z-10 border-r border-slate-200">
                            {sale.saleName}
                          </td>
                          {MONTH_LABELS.map((_, i) => (
                            <td key={i} className="px-1.5 py-1">
                              <input
                                type="number"
                                min={0}
                                step={1_000_000}
                                value={arr[i] || 0}
                                onChange={(e) => setCell(sale.saleId, i, Number(e.target.value))}
                                className="w-full text-right px-2 py-1.5 border border-slate-200 rounded-md focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none text-xs"
                              />
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right font-bold text-emerald-700 bg-emerald-50/70 border-l border-emerald-200">
                            {fmtVND(yearSum)}
                          </td>
                          <td className="px-1 py-1 text-center">
                            <button
                              onClick={() => {
                                const v = prompt(`Chia đều tổng năm cho ${sale.saleName} (VND):`, String(yearSum || 0));
                                if (v !== null) {
                                  const n = Number(v.replace(/[.,\s]/g, ''));
                                  if (Number.isFinite(n) && n >= 0) distributeEven(sale.saleId, n);
                                }
                              }}
                              title="Chia đều tổng năm cho 12 tháng"
                              className="text-emerald-600 hover:bg-emerald-100 rounded p-1"
                            >
                              <Calculator size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gradient-to-b from-emerald-100 to-emerald-50 font-bold text-emerald-900">
                    <tr className="border-t-2 border-emerald-300">
                      <td className="px-3 py-2.5 sticky left-0 bg-emerald-100 z-10 border-r border-emerald-300">Tổng cơ sở</td>
                      {monthTotals.map((v, i) => (
                        <td key={i} className="px-2 py-2.5 text-right">{fmtVND(v)}</td>
                      ))}
                      <td className="px-3 py-2.5 text-right text-base bg-emerald-200/70 border-l border-emerald-300">
                        {fmtVND(yearTotals)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500">
                💡 Đơn vị: <b>VND</b> · Bước nhập 1,000,000. Bấm <Calculator size={10} className="inline" /> để chia đều tổng năm cho 12 tháng.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-white flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Tổng mục tiêu năm <b className="text-emerald-700">{fmtVND(yearTotals)} VND</b> · {sales.length} sale
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Hủy</button>
            <button
              onClick={save}
              disabled={saving || loading || sales.length === 0}
              className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 shadow-sm inline-flex items-center gap-2"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Đang lưu…' : `Lưu mục tiêu ${year}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
