'use client';

// Quy trình đề xuất / giao việc — 3D card design + curved SVG connectors.
// 4 flows: trong-khối · chéo-khối · giao-việc trực tiếp · nhiệm vụ định kỳ.

import {
  User, Users, Briefcase, Crown, Star, ShieldCheck,
  Send, ListChecks, Building2, Sparkles, FileText, CheckCircle2,
  ArrowRight, AlertTriangle, type LucideIcon,
} from 'lucide-react';

interface StepDef {
  badge: string;       // "Bước 1"
  label: string;
  sub: string;
  icon: LucideIcon;
}

interface FlowDef {
  id: string;
  title: string;
  emoji: string;
  description: string;
  gradient: string;    // tailwind gradient class
  ring: string;
  text: string;
  steps: StepDef[];
  /** Optional warning callout dưới flow */
  warning?: string;
}

const FLOWS: FlowDef[] = [
  {
    id: 'in-block',
    title: 'Đề xuất trong cùng Khối',
    emoji: '🔵',
    description: 'Nhân viên gửi đề xuất lên cấp trên trực tiếp trong cùng khối. Đi thẳng đến người duyệt — không cần qua 2 GĐ.',
    gradient: 'from-sky-500 via-blue-600 to-indigo-700',
    ring: 'ring-blue-200',
    text: 'text-blue-900',
    steps: [
      { badge: 'Bước 1', label: 'Nhân viên', sub: 'Tạo đề xuất từ /giao-viec', icon: User },
      { badge: 'Bước 2', label: 'Cấp trên trực tiếp', sub: 'TT / PP / TP cùng khối', icon: Briefcase },
      { badge: 'Bước 3', label: 'Phê duyệt', sub: 'Approve / Reject', icon: ShieldCheck },
      { badge: 'Bước 4', label: 'Triển khai', sub: 'Người thực hiện nhận task', icon: CheckCircle2 },
    ],
  },
  {
    id: 'cross-block',
    title: 'Đề xuất chéo Khối',
    emoji: '🟣',
    description: 'Đề xuất từ Khối A tác động sang Khối B → GĐ Khối A duyệt trước, sau đó GĐ Khối B duyệt và chỉ định người thực hiện.',
    gradient: 'from-purple-500 via-violet-600 to-fuchsia-700',
    ring: 'ring-purple-200',
    text: 'text-purple-900',
    steps: [
      { badge: 'Bước 1', label: 'NV Khối A', sub: 'Tạo đề xuất chéo khối', icon: Send },
      { badge: 'Bước 2', label: 'GĐ Khối A', sub: 'Duyệt cho phép gửi đi', icon: Star },
      { badge: 'Bước 3', label: 'GĐ Khối B', sub: 'Duyệt + chỉ định người', icon: Crown },
      { badge: 'Bước 4', label: 'Người thực hiện', sub: 'NV thuộc Khối B', icon: CheckCircle2 },
    ],
    warning: 'Mọi đề xuất chạm nhân sự/tài nguyên Khối khác phải qua 2 GĐ. Audit log ghi lại toàn bộ quá trình.',
  },
  {
    id: 'direct-assign',
    title: 'Giao việc trực tiếp (trên → dưới)',
    emoji: '🟢',
    description: 'Cấp trên giao việc thẳng cho nhân viên dưới quyền. Không cần duyệt — vào hàng đợi của người nhận ngay.',
    gradient: 'from-emerald-500 via-teal-600 to-cyan-700',
    ring: 'ring-emerald-200',
    text: 'text-emerald-900',
    steps: [
      { badge: 'Bước 1', label: 'Quản lý', sub: 'GĐ · TP · QLCS · Tổ trưởng', icon: Crown },
      { badge: 'Bước 2', label: 'Giao việc', sub: 'Tạo task + gán người nhận', icon: Send },
      { badge: 'Bước 3', label: 'Nhân viên', sub: 'Nhận thông báo real-time', icon: CheckCircle2 },
    ],
  },
  {
    id: 'recurring',
    title: 'Nhiệm vụ định kỳ / chuyên môn',
    emoji: '🟡',
    description: 'Nhiệm vụ phát sinh từ checklist, lịch định kỳ, hoặc từ TP chuyên môn xuống QLCS để thực thi tại cơ sở.',
    gradient: 'from-amber-500 via-orange-600 to-rose-600',
    ring: 'ring-amber-200',
    text: 'text-amber-900',
    steps: [
      { badge: 'Bước 1', label: 'Nguồn', sub: 'Checklist · Lịch · TP chuyên môn', icon: ListChecks },
      { badge: 'Bước 2', label: 'QLCS', sub: 'Nhận nhiệm vụ tại cơ sở', icon: Building2 },
      { badge: 'Bước 3', label: 'Phân công', sub: 'QLCS giao nhân viên thực thi', icon: Users },
      { badge: 'Bước 4', label: 'Báo cáo', sub: 'Cập nhật trạng thái + file', icon: FileText },
    ],
  },
];

export function FlowView() {
  return (
    <div className="space-y-5">
      {FLOWS.map((f) => <FlowCard key={f.id} flow={f} />)}
      <SummaryPrinciples />
    </div>
  );
}

function FlowCard({ flow }: { flow: FlowDef }) {
  return (
    <div
      className={`relative rounded-2xl bg-white ring-1 ${flow.ring}
        shadow-[0_2px_4px_rgba(0,0,0,0.04),0_12px_28px_-12px_rgba(15,23,42,0.18)]
        overflow-hidden`}
    >
      {/* Top accent bar — 3D gradient ribbon */}
      <div className={`h-1.5 w-full bg-gradient-to-r ${flow.gradient}`} />

      {/* Header */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <div
            className={`shrink-0 flex items-center justify-center h-12 w-12 rounded-xl
              bg-gradient-to-br ${flow.gradient} text-white text-2xl
              shadow-[0_4px_10px_-2px_rgba(0,0,0,0.25)] ring-1 ring-white/40`}
          >
            {flow.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className={`font-bold text-base ${flow.text}`}>{flow.title}</div>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">{flow.description}</p>
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="px-5 pb-5">
        <StepFlow steps={flow.steps} gradient={flow.gradient} />
      </div>

      {/* Warning */}
      {flow.warning && (
        <div className="mx-5 mb-5 rounded-lg ring-1 ring-amber-300 bg-amber-50 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle size={16} className="text-amber-700 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 leading-relaxed">{flow.warning}</div>
        </div>
      )}
    </div>
  );
}

// Steps with SVG curved arrows on desktop, vertical stack on mobile
function StepFlow({ steps, gradient }: { steps: StepDef[]; gradient: string }) {
  return (
    <>
      {/* Desktop: horizontal with arrows */}
      <div className="hidden md:flex items-stretch gap-0">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center flex-1 min-w-0">
            <StepCard step={s} idx={i} total={steps.length} gradient={gradient} />
            {i < steps.length - 1 && <StepArrow gradient={gradient} />}
          </div>
        ))}
      </div>

      {/* Mobile: vertical */}
      <div className="md:hidden space-y-2">
        {steps.map((s, i) => (
          <div key={i}>
            <StepCard step={s} idx={i} total={steps.length} gradient={gradient} vertical />
            {i < steps.length - 1 && (
              <div className="flex justify-center py-1">
                <div className={`w-0.5 h-5 rounded bg-gradient-to-b ${gradient} opacity-50`} />
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function StepCard({
  step, idx, total, gradient, vertical,
}: {
  step: StepDef; idx: number; total: number; gradient: string; vertical?: boolean;
}) {
  const Icon = step.icon;
  return (
    <div
      className={`relative bg-white rounded-xl ring-1 ring-slate-200
        shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_-6px_rgba(15,23,42,0.15)]
        hover:shadow-[0_6px_18px_-6px_rgba(15,23,42,0.3)] hover:-translate-y-0.5
        transition-all duration-200
        px-3 py-3 ${vertical ? 'w-full' : 'flex-1 min-w-0'}`}
    >
      {/* Number badge */}
      <div
        className={`absolute -top-2 left-3 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider
          bg-gradient-to-r ${gradient} text-white shadow-sm ring-1 ring-white/40`}
      >
        {step.badge}
      </div>

      {/* Icon + content */}
      <div className="flex items-start gap-2.5 mt-1">
        <div
          className={`shrink-0 flex items-center justify-center h-9 w-9 rounded-lg
            bg-gradient-to-br ${gradient} text-white shadow-sm ring-1 ring-white/30`}
        >
          <Icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-800 text-sm leading-tight">{step.label}</div>
          <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{step.sub}</div>
        </div>
      </div>

      {/* Step counter dot bottom-right */}
      <div className="absolute bottom-1.5 right-2 text-[9px] font-bold text-slate-300 tabular-nums">
        {idx + 1}/{total}
      </div>
    </div>
  );
}

function StepArrow({ gradient }: { gradient: string }) {
  return (
    <div className="shrink-0 mx-1 flex items-center justify-center w-8 h-12 relative">
      <svg viewBox="0 0 32 48" width="32" height="48" className="overflow-visible">
        <defs>
          <linearGradient id={`arrow-${gradient.replace(/\s|\//g, '-')}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#cbd5e1" />
            <stop offset="100%" stopColor="#94a3b8" />
          </linearGradient>
        </defs>
        {/* Curved arrow */}
        <path
          d="M 2 24 Q 16 24 28 24"
          stroke="#cbd5e1"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
        {/* Arrow head */}
        <path
          d="M 22 19 L 28 24 L 22 29"
          stroke="#94a3b8"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function SummaryPrinciples() {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-slate-50 via-white to-slate-50 ring-1 ring-slate-200
      shadow-[0_2px_4px_rgba(0,0,0,0.04),0_12px_28px_-12px_rgba(15,23,42,0.15)] p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={18} className="text-amber-500" />
        <div className="font-bold text-slate-800">Nguyên tắc rút gọn</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <PrincipleItem
          color="from-sky-500 to-indigo-600"
          icon={ArrowRight}
          title="Trong khối"
          desc="Đề xuất đi thẳng cấp trên · 1 lần duyệt"
        />
        <PrincipleItem
          color="from-purple-500 to-fuchsia-600"
          icon={ShieldCheck}
          title="Chéo khối"
          desc="2 GĐ duyệt — GĐ gửi → GĐ nhận"
        />
        <PrincipleItem
          color="from-emerald-500 to-teal-600"
          icon={Send}
          title="Giao việc"
          desc="Trên → dưới trong cây tổ chức · không cần duyệt"
        />
        <PrincipleItem
          color="from-amber-500 to-orange-600"
          icon={ListChecks}
          title="Nhiệm vụ định kỳ"
          desc="Lịch · Checklist · TP chuyên môn → QLCS phân công"
        />
      </div>
    </div>
  );
}

function PrincipleItem({
  color, icon: Icon, title, desc,
}: { color: string; icon: LucideIcon; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg p-2.5 bg-white ring-1 ring-slate-100 hover:ring-slate-200 transition">
      <div className={`shrink-0 flex items-center justify-center h-7 w-7 rounded-md bg-gradient-to-br ${color} text-white shadow-sm`}>
        <Icon size={13} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-slate-800 text-sm leading-tight">{title}</div>
        <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
      </div>
    </div>
  );
}
