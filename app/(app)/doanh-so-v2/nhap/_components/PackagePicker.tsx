'use client';

// Autocomplete picker cho gói dịch vụ.
// Phase 1 (2026-06-17).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Check } from 'lucide-react';
import type { SalesV2Package } from '@/lib/sales-v2/packages';

interface Props {
  packages: SalesV2Package[];
  value: string | null; // packageId
  disabled?: boolean;
  onChange: (pkg: SalesV2Package | null) => void;
}

const MAX_RESULTS = 8;

export default function PackagePicker({ packages, value, disabled, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => packages.find((p) => p.id === value) ?? null, [packages, value]);
  const displayValue = open ? query : (selected ? selected.name : '');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return packages.slice(0, MAX_RESULTS);
    // Match: lowercase + bỏ dấu tiếng Việt để user gõ "the hoc boi" cũng ra "Thẻ học bơi"
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const qn = norm(q);
    return packages
      .filter((p) => {
        const haystack = norm(`${p.code} ${p.name}`);
        return haystack.includes(qn);
      })
      .slice(0, MAX_RESULTS);
  }, [packages, query]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Reset highlight khi danh sách đổi
  useEffect(() => {
    setHighlightIdx(0);
  }, [query]);

  const handleSelect = useCallback((pkg: SalesV2Package) => {
    onChange(pkg);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = results[highlightIdx];
      if (pick) handleSelect(pick);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setQuery('');
    }
  }, [open, results, highlightIdx, handleSelect]);

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="relative">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          disabled={disabled}
          onFocus={() => { if (!disabled) setOpen(true); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder={selected ? '' : 'Tên thẻ / gói...'}
          title={!selected ? 'Chọn gói (quyết định các field còn lại)' : ''}
          className="w-full pl-6 pr-2 py-1 rounded border border-violet-200 bg-white text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50"
        />
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-30 mt-1 left-0 min-w-[320px] max-w-[420px] max-h-72 overflow-y-auto rounded-lg bg-white shadow-lg ring-1 ring-slate-200">
          {results.map((p, i) => {
            const isHighlight = i === highlightIdx;
            const isSelected = p.id === value;
            return (
              <button
                type="button"
                key={p.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(p)}
                onMouseEnter={() => setHighlightIdx(i)}
                className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2 ${
                  isHighlight ? 'bg-emerald-50' : 'bg-white'
                }`}
              >
                {/* Chỉ tên gói (full, wrap nếu dài) — không hiển thị tên nhóm + giá tiền */}
                <span className="flex-1 text-slate-700 font-medium whitespace-normal break-words leading-snug">
                  {p.name}
                </span>
                {p.isChildPackage && (
                  <span className="shrink-0 text-[9px] uppercase font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                    Trẻ em
                  </span>
                )}
                {isSelected && <Check size={12} className="text-emerald-600 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}

      {open && results.length === 0 && (
        <div className="absolute z-30 mt-1 left-0 min-w-[320px] rounded-lg bg-white shadow-lg ring-1 ring-slate-200 px-3 py-2 text-xs text-slate-400">
          Không tìm thấy gói khớp <strong>"{query}"</strong>
        </div>
      )}
    </div>
  );
}
