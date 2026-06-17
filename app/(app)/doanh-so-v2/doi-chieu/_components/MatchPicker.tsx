'use client';

// Picker chọn candidate match cho tx 'thanh_toan_not' khi matchStatus='needs_review'
// hoặc 'no_match' (kế toán muốn link manual).
// Phase 4 (2026-06-17).

import { useEffect, useState } from 'react';
import { X, Loader2, Link as LinkIcon, AlertCircle } from 'lucide-react';
import type { SalesTransaction } from '@/lib/types/sales-v2';

interface Candidate {
  id: string;
  date: string;
  customerName: string;
  packageName: string;
  packageValue: number;
  collectedToday: number;
  debtAmount: number;
  transactionType: string;
  receiptNo?: string | null;
  createdAt: string;
}

interface Props {
  tx: SalesTransaction;
  onClose: () => void;
  onLinked: (newTx: SalesTransaction) => void;
}

function fmtDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export default function MatchPicker({ tx, onClose, onLinked }: Props) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/sales-v2/transactions/${encodeURIComponent(tx.id)}/match-candidates`);
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
        const j = await r.json();
        if (!cancelled) setCandidates(j.candidates as Candidate[]);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Lỗi tải candidates');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tx.id]);

  const handleLink = async (candidateId: string) => {
    setLinking(candidateId);
    try {
      const r = await fetch(`/api/sales-v2/transactions/${encodeURIComponent(tx.id)}/link`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ matchedTransactionId: candidateId }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      const j = await r.json();
      onLinked(j.transaction as SalesTransaction);
    } catch (e: any) {
      setError(e?.message ?? 'Lỗi link');
    } finally {
      setLinking(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-800">Chọn giao dịch cũ để link</h3>
            <div className="mt-1 text-xs text-slate-500">
              {tx.customerName} · {tx.phone} · {tx.packageName} · Thu nốt {tx.collectedToday.toLocaleString()}đ
            </div>
            {tx.receiptNo && (
              <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-semibold ring-1 ring-emerald-200">
                Sale nhập Số PT: <strong>{tx.receiptNo}</strong> → khớp by Số PT
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-400">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <Loader2 className="animate-spin mr-2" size={16} /> Đang tải candidates…
            </div>
          ) : error ? (
            <div className="text-center py-8 text-sm text-rose-600">
              <AlertCircle className="mx-auto mb-2" size={20} />
              {error}
            </div>
          ) : !candidates || candidates.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-400">
              <AlertCircle className="mx-auto mb-2 text-amber-500" size={20} />
              Không tìm thấy giao dịch nào cùng <strong>{tx.customerName}</strong> + <strong>{tx.phone}</strong> + gói "{tx.packageName}" còn công nợ.
              <div className="mt-2 text-xs">Có thể khách hàng/SĐT/gói không khớp chính xác với giao dịch cũ.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {candidates.map((c) => {
                const isLinking = linking === c.id;
                const isCurrentLinked = tx.matchedTransactionId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleLink(c.id)}
                    disabled={isLinking || linking !== null}
                    className={`w-full text-left p-3 rounded-lg ring-1 transition disabled:opacity-50 disabled:cursor-not-allowed ${
                      isCurrentLinked
                        ? 'bg-emerald-50 ring-emerald-300 hover:bg-emerald-100'
                        : 'bg-white ring-slate-200 hover:bg-slate-50 hover:ring-emerald-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-800">
                        {fmtDate(c.date)} · {c.transactionType === 'dat_coc' ? 'Đặt cọc' : 'Thanh toán full'}
                      </div>
                      {isCurrentLinked && (
                        <span className="text-[10px] uppercase font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                          Đang link
                        </span>
                      )}
                      {isLinking && <Loader2 size={14} className="animate-spin text-emerald-600" />}
                    </div>
                    <div className="mt-1 text-xs text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">
                      <span>Giá gói: <strong className="text-slate-800">{c.packageValue.toLocaleString()}đ</strong></span>
                      <span>Đã thu: <strong className="text-sky-700">{c.collectedToday.toLocaleString()}đ</strong></span>
                      <span>Còn nợ: <strong className="text-rose-700">{c.debtAmount.toLocaleString()}đ</strong></span>
                      {c.receiptNo && (
                        <span className="text-emerald-700">Số PT: <strong>{c.receiptNo}</strong></span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

/** Quick badge for column "Link" trong transaction table */
export function MatchStatusBadge({ tx, onClick }: { tx: SalesTransaction; onClick?: () => void }) {
  if (tx.transactionType !== 'thanh_toan_not') {
    return <span className="text-slate-300 text-xs">—</span>;
  }
  const ms = tx.matchStatus;
  if (ms === 'matched') {
    const tip = tx.matchedTargetSummary
      ? `Đã link → ${tx.matchedTargetSummary}${tx.receiptNo ? ` (qua Số PT ${tx.receiptNo})` : ''}`
      : 'Đã link với GD cũ';
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[11px] font-semibold ring-1 ring-emerald-200 hover:bg-emerald-100"
        title={tip}
      >
        <LinkIcon size={11} /> Đã link
      </button>
    );
  }
  if (ms === 'needs_review') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-[11px] font-semibold ring-1 ring-amber-200 hover:bg-amber-100"
      >
        ⚠ Chọn
      </button>
    );
  }
  if (ms === 'no_match') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 text-rose-700 text-[11px] font-semibold ring-1 ring-rose-200 hover:bg-rose-100"
      >
        ✗ Không tìm
      </button>
    );
  }
  // pending (chưa approve batch) or not_applicable
  return <span className="text-slate-400 text-[11px]">Chờ duyệt</span>;
}
