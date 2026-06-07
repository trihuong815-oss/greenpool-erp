'use client';

// Phase UI-3.2 (2026-06-07): global keyboard shortcuts.
// Pattern Linear/GitHub: "g" prefix → letter để nhảy nhanh.
//   g d   → Dashboard
//   g t   → Tin nhắn
//   g s   → Doanh số dashboard
//   g v   → Giao việc
//   g c   → Công việc cá nhân (chính-mình)
//   g k   → Kỹ thuật
//   g l   → Checklist
//   g u   → Users (nếu có quyền)
//   ?     → Cheatsheet shortcuts
//   /     → Focus search trong page (nếu có input[data-search])
//
// Implementation:
// - Buffer "g" pressed → đợi 1.2s letter kế tiếp. Sau timeout reset.
// - Bỏ qua nếu user đang gõ trong input/textarea/contenteditable.
// - Bỏ qua nếu Cmd+K palette đang mở (palette tự handle Esc).

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Keyboard } from 'lucide-react';
import { effectiveMenu } from '@/lib/permissions';

interface Shortcut {
  /** Phím sau "g" (lowercase). */
  key: string;
  /** Route slug — sẽ check effectiveMenu trước khi push. */
  route: string;
  /** Label hiển thị trong cheatsheet. */
  label: string;
}

const G_SHORTCUTS: Shortcut[] = [
  { key: 'd', route: 'dashboard',         label: 'Dashboard' },
  { key: 't', route: 'tin-nhan',          label: 'Tin nhắn' },
  { key: 'c', route: 'cong-viec-ca-nhan', label: 'Công việc cá nhân' },
  { key: 's', route: 'doanh-so',          label: 'Doanh số' },
  { key: 'v', route: 'giao-viec',         label: 'Giao việc · Đề xuất' },
  { key: 'l', route: 'checklist-v2',      label: 'Checklist vận hành' },
  { key: 'k', route: 'ky-thuat',          label: 'Kỹ thuật' },
  { key: 'o', route: 'sodo',              label: 'Sơ đồ tổ chức' },
  { key: 'r', route: 'bao-cao',           label: 'Báo cáo' },
  { key: 'b', route: 'bao-mat',           label: 'Bảo mật & Thông báo' },
  { key: 'u', route: 'users',             label: 'Cài đặt user' },
];

const G_BUFFER_MS = 1200;

interface Props {
  roleCode: string;
  menuOverrides?: Record<string, boolean>;
}

/** Component không render gì — chỉ đăng ký global listeners + cheatsheet modal. */
export function KeyboardShortcuts({ roleCode, menuOverrides }: Props) {
  const router = useRouter();
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
  const gBufferAt = useRef<number>(0);

  useEffect(() => {
    const allowed = effectiveMenu(roleCode, menuOverrides);

    function isTypingInForm(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (target.isContentEditable) return true;
      return false;
    }

    function onKey(e: KeyboardEvent) {
      // Bỏ qua nếu modifier (chừa cho Cmd+K, Ctrl+S...)
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Bỏ qua nếu đang gõ form
      if (isTypingInForm(e.target)) return;

      const key = e.key.toLowerCase();

      // Esc đóng cheatsheet
      if (e.key === 'Escape' && cheatsheetOpen) {
        setCheatsheetOpen(false);
        return;
      }

      // "?" mở cheatsheet (Shift+/ trên hầu hết layout)
      if (e.key === '?') {
        e.preventDefault();
        setCheatsheetOpen(true);
        return;
      }

      // "g" prefix: bắt đầu buffer
      if (key === 'g') {
        gBufferAt.current = Date.now();
        return;
      }

      // Letter sau "g"
      if (gBufferAt.current && Date.now() - gBufferAt.current < G_BUFFER_MS) {
        const shortcut = G_SHORTCUTS.find((s) => s.key === key);
        gBufferAt.current = 0;
        if (shortcut) {
          // Always-allow doi-mat-khau, others check effectiveMenu
          if (shortcut.route === 'doi-mat-khau' || allowed.has(shortcut.route)) {
            e.preventDefault();
            router.push(`/${shortcut.route}`);
          }
        }
        return;
      }

      gBufferAt.current = 0;
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, roleCode, menuOverrides, cheatsheetOpen]);

  if (!cheatsheetOpen) return null;
  return <Cheatsheet onClose={() => setCheatsheetOpen(false)} roleCode={roleCode} menuOverrides={menuOverrides} />;
}

function Cheatsheet({ onClose, roleCode, menuOverrides }: { onClose: () => void; roleCode: string; menuOverrides?: Record<string, boolean> }) {
  const allowed = effectiveMenu(roleCode, menuOverrides);
  const visible = G_SHORTCUTS.filter((s) => s.route === 'doi-mat-khau' || allowed.has(s.route));

  return (
    <div
      className="fixed inset-0 z-[90] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-label="Phím tắt"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <Keyboard size={18} className="text-emerald-600" />
          <h3 className="font-semibold text-slate-800 flex-1">Phím tắt</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Đóng">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          <Section title="Điều hướng nhanh">
            <Row keys={['G', 'D']} label="Mở Dashboard" />
            {visible.filter((s) => s.key !== 'd').map((s) => (
              <Row key={s.key} keys={['G', s.key.toUpperCase()]} label={s.label} />
            ))}
          </Section>
          <Section title="Hệ thống">
            <Row keys={['⌘', 'K']} label="Tìm trang (Spotlight)" sub="Ctrl+K trên Windows" />
            <Row keys={['?']} label="Mở bảng phím tắt này" />
            <Row keys={['Esc']} label="Đóng dialog / palette" />
          </Section>
          <p className="text-[11px] text-slate-400">
            Mẹo: nhấn <kbd className="px-1 bg-slate-100 rounded text-[10px]">G</kbd> rồi nhanh chóng nhấn chữ kế (vd <kbd className="px-1 bg-slate-100 rounded text-[10px]">D</kbd>) trong ~1 giây. Phím tắt tự bỏ qua nếu bạn đang gõ trong ô nhập.
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1.5">{title}</div>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

function Row({ keys, label, sub }: { keys: string[]; label: string; sub?: string }) {
  return (
    <li className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-slate-50">
      <div className="flex items-center gap-1 shrink-0">
        {keys.map((k, i) => (
          <kbd key={i} className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 text-[11px] font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded">
            {k}
          </kbd>
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-slate-700">{label}</div>
        {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
      </div>
    </li>
  );
}
