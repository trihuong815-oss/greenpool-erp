'use client';

// Phase UI-3.1 (2026-06-07): Cmd+K Spotlight palette.
// - Cmd/Ctrl+K mở (toggle); Escape đóng.
// - ↑↓ điều hướng, Enter mở route, Tab cũng confirm.
// - Filter theo role permissions (effectiveMenu) → user không thấy route ngoài quyền.
// - Recent items lưu localStorage (last 5).
// - Mobile (<sm): bottom drawer 80vh. Desktop: centered modal 600px.
// - Không pass LucideIcon props từ RSC — map iconId string → component client-side.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Home, MessageCircle, Briefcase, BarChart3, Wrench, CheckSquare, FileText, ListTodo,
  Users, DollarSign, FileBarChart, GraduationCap, Megaphone, ShieldCheck, Settings, UserCog, Lock,
  Bell, Building2, Factory, Rocket, Inbox,
  Search, CornerDownLeft, ArrowUp, ArrowDown,
} from 'lucide-react';
import { searchRoutes, type IconId, type NavRoute } from '@/lib/navigation/routes';
import { effectiveMenu } from '@/lib/permissions';

const ICON_MAP: Record<IconId, typeof Home> = {
  'home': Home, 'message': MessageCircle, 'briefcase': Briefcase,
  'chart': BarChart3, 'wrench': Wrench, 'check-square': CheckSquare, 'file-text': FileText, 'list-todo': ListTodo,
  'users': Users, 'dollar': DollarSign,
  'file-bar': FileBarChart, 'grad-cap': GraduationCap, 'megaphone': Megaphone,
  'shield': ShieldCheck, 'settings': Settings, 'user-cog': UserCog,
  'lock': Lock,
  // V9.0
  'bell': Bell, 'building': Building2, 'factory': Factory, 'rocket': Rocket, 'inbox': Inbox,
};

const RECENT_KEY = 'gp_cmdk_recent';
const MAX_RECENT = 5;

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
}

const Ctx = createContext<CommandPaletteContextValue | null>(null);

const NOOP: CommandPaletteContextValue = { open: false, setOpen: () => {}, toggle: () => {} };

export function useCommandPalette(): CommandPaletteContextValue {
  return useContext(Ctx) ?? NOOP;
}

interface ProviderProps {
  roleCode: string;
  menuOverrides?: Record<string, boolean>;
  children: ReactNode;
}

/**
 * Wrap layer ngoài — provide Cmd+K state + render palette UI overlay.
 * Đăng ký global keyboard listener Cmd+K / Ctrl+K.
 */
export function CommandPaletteProvider({ roleCode, menuOverrides, children }: ProviderProps) {
  const [open, setOpenState] = useState(false);
  const setOpen = useCallback((v: boolean) => setOpenState(v), []);
  const toggle = useCallback(() => setOpenState((p) => !p), []);

  // Cmd+K / Ctrl+K global trigger.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isModK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (isModK) {
        e.preventDefault();
        toggle();
      } else if (e.key === 'Escape' && open) {
        setOpenState(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, toggle]);

  const value = useMemo<CommandPaletteContextValue>(
    () => ({ open, setOpen, toggle }),
    [open, setOpen, toggle]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {open && <PaletteOverlay onClose={() => setOpenState(false)} roleCode={roleCode} menuOverrides={menuOverrides} />}
    </Ctx.Provider>
  );
}

interface OverlayProps {
  onClose: () => void;
  roleCode: string;
  menuOverrides?: Record<string, boolean>;
}

function PaletteOverlay({ onClose, roleCode, menuOverrides }: OverlayProps) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const allowedRoutes = useMemo(() => effectiveMenu(roleCode, menuOverrides), [roleCode, menuOverrides]);
  const results = useMemo(() => searchRoutes(q, allowedRoutes), [q, allowedRoutes]);

  // Auto-focus input
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Load recent từ localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setRecent(arr.filter((s) => typeof s === 'string').slice(0, MAX_RECENT));
      }
    } catch { /* ignore */ }
  }, []);

  // Reset activeIdx khi results đổi
  useEffect(() => { setActiveIdx(0); }, [q]);

  function chooseRoute(r: NavRoute) {
    // Save to recent
    try {
      const next = [r.route, ...recent.filter((x) => x !== r.route)].slice(0, MAX_RECENT);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
    onClose();
    router.push(`/${r.route}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((p) => Math.min(p + 1, Math.max(0, results.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((p) => Math.max(0, p - 1));
    } else if (e.key === 'Enter' || (e.key === 'Tab' && results.length > 0)) {
      e.preventDefault();
      const target = results[activeIdx];
      if (target) chooseRoute(target);
    }
  }

  // Scroll active item vào view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  // Group results by section
  const grouped = useMemo(() => {
    const map = new Map<string, { route: NavRoute; idx: number }[]>();
    results.forEach((r, i) => {
      const arr = map.get(r.section) ?? [];
      arr.push({ route: r, idx: i });
      map.set(r.section, arr);
    });
    return Array.from(map.entries());
  }, [results]);

  // Recent routes resolved (chỉ hiện khi q trống)
  const recentRoutes = useMemo(() => {
    if (q.trim()) return [];
    return recent
      .map((slug) => results.find((r) => r.route === slug))
      .filter((r): r is NavRoute => !!r);
  }, [recent, results, q]);

  return (
    <div
      className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-start justify-center pt-[10vh] sm:pt-[15vh] px-4"
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-label="Tìm nhanh trang"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <Search size={18} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Tìm trang... (vd: dashboard, sale, bao mat)"
            className="flex-1 bg-transparent outline-none text-base placeholder:text-slate-400"
            autoComplete="off"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 bg-slate-100 rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <ul ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-1">
          {recentRoutes.length > 0 && (
            <>
              <li className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 px-3 pt-2 pb-1">
                Truy cập gần đây
              </li>
              {recentRoutes.map((r) => {
                const Icon = ICON_MAP[r.icon];
                return (
                  <li key={`recent-${r.route}`}>
                    <button
                      type="button"
                      onClick={() => chooseRoute(r)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-800"
                    >
                      <Icon size={16} className="text-slate-400" />
                      <span className="flex-1 truncate">{r.label}</span>
                      <span className="text-[10px] text-slate-400">{r.section}</span>
                    </button>
                  </li>
                );
              })}
              <li className="border-t border-slate-100 my-1" />
            </>
          )}

          {grouped.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-slate-400">
              Không tìm thấy trang phù hợp.
            </li>
          ) : (
            grouped.map(([section, entries]) => (
              <li key={section}>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 px-3 pt-2 pb-1">
                  {section}
                </div>
                <ul>
                  {entries.map(({ route, idx }) => {
                    const Icon = ICON_MAP[route.icon];
                    const isActive = idx === activeIdx;
                    return (
                      <li key={route.route} data-idx={idx}>
                        <button
                          type="button"
                          onClick={() => chooseRoute(route)}
                          onMouseEnter={() => setActiveIdx(idx)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm ${
                            isActive
                              ? 'bg-emerald-600 text-white'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <Icon size={16} className={isActive ? 'text-white' : 'text-slate-400'} />
                          <span className="flex-1 truncate">{route.label}</span>
                          {isActive && <CornerDownLeft size={14} />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))
          )}
        </ul>

        {/* Footer hints */}
        <div className="border-t border-slate-100 px-4 py-2 flex items-center gap-3 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1"><ArrowUp size={11} /><ArrowDown size={11} /> di chuyển</span>
          <span className="inline-flex items-center gap-1"><CornerDownLeft size={11} /> chọn</span>
          <span className="ml-auto hidden sm:inline">⌘K / Ctrl+K để mở</span>
        </div>
      </div>
    </div>
  );
}
