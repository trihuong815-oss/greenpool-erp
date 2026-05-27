import { type LucideIcon } from 'lucide-react';

interface Feature { label: string; desc?: string; }

export function ComingSoon({
  icon: Icon, title, description, features,
}: { icon: LucideIcon; title: string; description: string; features: Feature[] }) {
  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="rounded-2xl border-2 border-dashed border-cyan-300 bg-white p-8 text-center shadow-sm">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-teal-500 text-white shadow-md mb-4">
          <Icon size={26} />
        </div>
        <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm text-slate-600 max-w-xl mx-auto">{description}</p>
        <div className="mt-5 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-800 text-xs font-semibold rounded-full">
          🚧 Đang xây dựng
        </div>
        <ul className="mt-6 text-left max-w-md mx-auto space-y-2">
          {features.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
              <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-cyan-500 shrink-0" />
              <div>
                <strong>{f.label}</strong>
                {f.desc && <span className="text-slate-500"> — {f.desc}</span>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
