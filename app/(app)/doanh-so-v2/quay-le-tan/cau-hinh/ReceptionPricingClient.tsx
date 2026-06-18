'use client';

// V8 Reception (2026-06-18) — UI cấu hình đơn giá quầy lễ tân (per branch).
// Admin set 1 lần, NV_KE nhập daily sẽ auto-fill unitPrice từ pricing này.

import { useCallback, useEffect, useState } from 'react';
import { Save, Loader2, AlertCircle } from 'lucide-react';
import { BRANCHES } from '@/lib/branches';
import type { BranchId } from '@/lib/branches';
import {
  RECEPTION_CATEGORY_LABEL, categoriesForBranch, categoryHasUnitPrice,
  type ReceptionCategory, type SalesReceptionPricing,
} from '@/lib/types/sales-reception';

export default function ReceptionPricingClient() {
  const [branchId, setBranchId] = useState<BranchId>(BRANCHES[0].id as BranchId);
  const [pricing, setPricing] = useState<SalesReceptionPricing | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  function showToast(type: 'ok' | 'err', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }

  // Categories có unitPrice cho branch này
  const priceableCats = categoriesForBranch(branchId).filter(categoryHasUnitPrice);

  const fetchPricing = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/sales-v2/reception/pricing?branchId=${branchId}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      const j = await r.json();
      setPricing(j.pricing as SalesReceptionPricing);
      const next: Record<string, string> = {};
      for (const c of priceableCats) {
        const v = (j.pricing.prices as any)[c];
        next[c] = v != null && v > 0 ? String(v) : '';
      }
      setPrices(next);
    } catch (e: any) {
      setError(e?.message ?? 'Lỗi tải');
    } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  useEffect(() => { void fetchPricing(); }, [fetchPricing]);

  async function handleSave() {
    setSaving(true);
    try {
      const cleaned: Partial<Record<ReceptionCategory, number>> = {};
      for (const c of priceableCats) {
        const n = Number((prices[c] ?? '').replace(/[^\d]/g, '')) || 0;
        if (n > 0) cleaned[c] = n;
      }
      const r = await fetch('/api/sales-v2/reception/pricing', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ branchId, prices: cleaned }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      showToast('ok', `Đã lưu đơn giá ${branchId}`);
      await fetchPricing();
    } catch (e: any) {
      showToast('err', e?.message ?? 'Lỗi lưu');
    } finally { setSaving(false); }
  }

  return (
    <div className="flex-1 p-3 md:p-5 bg-slate-50 overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="card">
          <h1 className="text-lg font-bold text-slate-800">Cấu hình đơn giá quầy lễ tân</h1>
          <p className="mt-1 text-sm text-slate-600">
            Đơn giá riêng cho từng cơ sở. NV_KE nhập daily sẽ auto-fill từ cấu hình này.
            Chỉ category có đơn giá cố định (vé lẻ, thuê tủ, làm thẻ) cần setup — đồ bơi / đồ ăn / khác biến đổi theo khách.
          </p>
          <div className="mt-4">
            <select value={branchId} onChange={(e) => setBranchId(e.target.value as BranchId)}
              className="px-3 py-2 rounded-lg bg-white text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500">
              {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            {pricing && pricing.updatedAt && (
              <p className="mt-2 text-xs text-slate-500">
                Cập nhật lần cuối: <strong>{pricing.updatedByName || 'chưa rõ'}</strong> · {new Date(pricing.updatedAt).toLocaleString('vi-VN')}
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="card border-rose-200 bg-rose-50/40">
            <div className="text-sm text-rose-700 flex items-center gap-2"><AlertCircle size={14} /> {error}</div>
          </div>
        )}

        <div className="card">
          {loading ? (
            <div className="py-8 text-center text-slate-400 text-sm">
              <Loader2 className="animate-spin inline mr-2" size={14} /> Đang tải...
            </div>
          ) : (
            <div className="space-y-3">
              {priceableCats.map((c) => (
                <label key={c} className="block">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    {RECEPTION_CATEGORY_LABEL[c]}
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={prices[c] ? Number(prices[c]).toLocaleString('vi-VN') : ''}
                      onChange={(e) => setPrices((prev) => ({
                        ...prev, [c]: e.target.value.replace(/[^\d]/g, ''),
                      }))}
                      placeholder="0"
                      className="w-full px-3 py-2 pr-12 rounded-lg ring-1 ring-slate-200 text-sm tabular-nums text-right font-semibold text-blue-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium pointer-events-none">VND</span>
                  </div>
                </label>
              ))}
              <button onClick={handleSave} disabled={saving}
                className="w-full mt-4 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                Lưu cấu hình {BRANCHES.find((b) => b.id === branchId)?.name}
              </button>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium z-50 ${
          toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
        }`}>{toast.msg}</div>
      )}
    </div>
  );
}
