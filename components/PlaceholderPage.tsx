// V9.0 Sidebar restructure (2026-06-19).
// Component reuse cho các page placeholder mới — page có khung navigation,
// hiển thị tiêu đề + mô tả + badge "Đang phát triển". Nội dung nghiệp vụ
// sẽ bổ sung ở các giai đoạn sau.

import { AppTopBar, type AppTopBarIcon } from '@/components/AppTopBar';
import { Rocket } from 'lucide-react';

interface Props {
  topBarTitle: string;
  topBarIcon?: AppTopBarIcon;
  pageTitle: string;
  description: string;
  status?: 'wip' | 'soon';  // 'wip' = đang phát triển; 'soon' = sắp ra mắt
}

export function PlaceholderPage({ topBarTitle, topBarIcon = 'task', pageTitle, description, status = 'wip' }: Props) {
  const statusLabel = status === 'wip' ? 'Đang phát triển' : 'Sắp ra mắt';
  const statusTone = status === 'wip'
    ? 'bg-amber-50 text-amber-700 ring-amber-200'
    : 'bg-sky-50 text-sky-700 ring-sky-200';

  return (
    <>
      <AppTopBar title={topBarTitle} icon={topBarIcon} />
      <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
        <div className="card max-w-xl w-full text-center py-12">
          <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-50 to-cyan-50 ring-1 ring-emerald-100">
            <Rocket size={32} className="text-emerald-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">{pageTitle}</h1>
          <p className="text-sm text-slate-600 mb-4 max-w-md mx-auto leading-relaxed">
            {description}
          </p>
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full ring-1 ${statusTone}`}>
            {statusLabel}
          </span>
        </div>
      </div>
    </>
  );
}
