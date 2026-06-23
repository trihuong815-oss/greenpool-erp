'use client';

// V6.5 Phase B (2026-06-14): User tự bật/tắt kênh nhận noti per module.
//
// 3 module:
//   - Đề xuất (proposal)
//   - Điều phối (dispatch)
//   - Hệ thống (system)
//
// 3 kênh per module:
//   - In-app (badge + bell + lịch sử) — KHÔNG cho tắt, là source of truth
//   - Push (FCM tới điện thoại/web)
//   - Email (Gmail backup khi push fail)

import { useEffect, useState } from 'react';
import { Loader2, Bell, Smartphone, Mail, Check, AlertCircle } from 'lucide-react';

// PR-CASH1E (2026-06-23): + finance + kt + chat (fix gap audit cũ; finance là module mới Thu-Chi).
type Channels = {
  proposal: { inApp: boolean; push: boolean; email: boolean };
  dispatch: { inApp: boolean; push: boolean; email: boolean };
  sales:    { inApp: boolean; push: boolean; email: boolean };
  kt:       { inApp: boolean; push: boolean; email: boolean };
  chat:     { inApp: boolean; push: boolean; email: boolean };
  finance:  { inApp: boolean; push: boolean; email: boolean };
  system:   { inApp: boolean; push: boolean; email: boolean };
};

const DEFAULT: Channels = {
  proposal: { inApp: true, push: true, email: true },
  dispatch: { inApp: true, push: true, email: true },
  sales:    { inApp: true, push: true, email: false },
  kt:       { inApp: true, push: true, email: false },
  chat:     { inApp: true, push: true, email: false },
  finance:  { inApp: true, push: true, email: true },
  system:   { inApp: true, push: true, email: false },
};

const MODULE_LABELS: Record<keyof Channels, string> = {
  proposal: 'Đề xuất',
  dispatch: 'Điều phối',
  sales:    'Doanh số v2',
  kt:       'Kỹ thuật',
  chat:     'Tin nhắn',
  finance:  'Tài chính / Thu-Chi',
  system:   'Hệ thống',
};

const MODULE_DESC: Record<keyof Channels, string> = {
  proposal: 'Thông báo đề xuất chờ duyệt, được duyệt, bị từ chối, quá SLA…',
  dispatch: 'Thông báo công việc được giao, phối hợp, hoàn thành, quá hạn…',
  sales:    'Sale gửi batch chờ đối chiếu, kế toán duyệt/trả lại bảng doanh số daily…',
  kt:       'Kỹ thuật giao việc, đề xuất KT chờ duyệt/đã duyệt, báo cáo KT…',
  chat:     'Tin nhắn mới trong cuộc trò chuyện 1-1, nhóm, kênh…',
  finance:  'Báo cáo thu-chi mới được nộp, đã kiểm tra, bị trả lại bổ sung…',
  system:   'Cảnh báo lỗi hệ thống, bảo trì, cập nhật phiên bản…',
};

export function NotiChannelsSettings() {
  const [channels, setChannels] = useState<Channels>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/personal/noti-channels', { cache: 'no-store' });
        if (res.ok) {
          const j = await res.json();
          if (j.channels) setChannels({ ...DEFAULT, ...j.channels });
        }
      } catch { /* silent */ } finally { setLoading(false); }
    })();
  }, []);

  function toggle(mod: keyof Channels, ch: 'push' | 'email') {
    setChannels((prev) => ({
      ...prev,
      [mod]: { ...prev[mod], [ch]: !prev[mod][ch] },
    }));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/personal/noti-channels', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channels }),
      });
      if (res.ok) setMsg({ type: 'ok', text: 'Đã lưu cài đặt kênh thông báo.' });
      else {
        const j = await res.json().catch(() => ({}));
        setMsg({ type: 'err', text: j?.error || 'Lưu thất bại.' });
      }
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.message || 'Lỗi mạng.' });
    } finally { setSaving(false); }
  }

  if (loading) {
    return (
      <div className="card flex items-center gap-2 text-sm text-slate-500">
        <Loader2 size={14} className="animate-spin" /> Đang tải cài đặt kênh thông báo…
      </div>
    );
  }

  return (
    <section className="card">
      <h3 className="card-title">
        <Bell size={16} className="text-emerald-600" />
        Kênh nhận thông báo theo module
      </h3>
      <p className="text-xs text-slate-500 mb-4">
        Tùy chỉnh kênh nhận noti cho từng module. <strong>In-app</strong> (badge + chuông) luôn bật để đảm bảo bạn không bỏ lỡ việc cần xử lý.
      </p>

      <div className="space-y-3">
        {(Object.keys(channels) as Array<keyof Channels>).map((mod) => (
          <div key={mod} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
            <div className="mb-2">
              <div className="text-sm font-semibold text-slate-800">{MODULE_LABELS[mod]}</div>
              <div className="text-[11px] text-slate-500">{MODULE_DESC[mod]}</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <ChannelChip icon={<Bell size={13} />} label="In-app" on={true} locked tooltip="Luôn bật (nguồn dữ liệu gốc cho badge/chuông)" />
              <ChannelChip
                icon={<Smartphone size={13} />}
                label="Push"
                on={channels[mod].push}
                onToggle={() => toggle(mod, 'push')}
                tooltip="FCM push tới điện thoại + web (chỉ work khi đã bật ở thiết bị)"
              />
              <ChannelChip
                icon={<Mail size={13} />}
                label="Email"
                on={channels[mod].email}
                onToggle={() => toggle(mod, 'email')}
                tooltip="Email backup qua Gmail SMTP — đảm bảo nhận được kể cả khi push fail"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        {msg && (
          <div className={`flex items-center gap-1.5 text-xs ${msg.type === 'ok' ? 'text-emerald-700' : 'text-rose-700'}`}>
            {msg.type === 'ok' ? <Check size={14} /> : <AlertCircle size={14} />}
            {msg.text}
          </div>
        )}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="ml-auto px-4 py-2 text-sm font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Lưu cài đặt
        </button>
      </div>
    </section>
  );
}

function ChannelChip({
  icon, label, on, onToggle, locked, tooltip,
}: { icon: React.ReactNode; label: string; on: boolean; onToggle?: () => void; locked?: boolean; tooltip?: string }) {
  const base = 'flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md ring-1 transition';
  const style = on
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-300'
    : 'bg-white text-slate-500 ring-slate-200 hover:ring-slate-300';
  if (locked) {
    return (
      <div className={`${base} ${style} cursor-not-allowed opacity-90`} title={tooltip}>
        {icon} {label} <span className="text-[10px] text-emerald-600">●</span>
      </div>
    );
  }
  return (
    <button type="button" onClick={onToggle} className={`${base} ${style} active:scale-95`} title={tooltip}>
      {icon} {label} <span className={`text-[10px] ${on ? 'text-emerald-600' : 'text-slate-400'}`}>{on ? '●' : '○'}</span>
    </button>
  );
}
