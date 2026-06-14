// V6.5 (2026-06-14): Email backup khi FCM web push không tới được (iOS Safari quirks,
// SW chết, device offline). Phát kèm push, không thay thế.
//
// Env vars cần set (Vercel project settings):
//   RESEND_API_KEY  — lấy từ resend.com/api-keys
//   RESEND_FROM     — vd "Green Pool <noreply@yourdomain.com>" hoặc bỏ trống
//                     → mặc định "Green Pool <onboarding@resend.dev>" (free tier, có "via resend.dev")
//
// Pattern: fire-and-forget. KHÔNG throw nếu thiếu API key — chỉ log warning.

import 'server-only';
import { Resend } from 'resend';

let cachedClient: Resend | null = null;
function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!cachedClient) cachedClient = new Resend(key);
  return cachedClient;
}

const FROM_DEFAULT = 'Green Pool <onboarding@resend.dev>';

export interface EmailNotiInput {
  to: string;                  // email người nhận
  subject: string;             // tiêu đề
  title: string;               // heading lớn trong email body
  body: string;                // nội dung chính (plain text, sẽ render trong <p>)
  ctaLabel?: string;           // text nút CTA
  ctaUrl?: string;             // url full (vd https://greenpool-erp.vercel.app/de-xuat)
  footerNote?: string;         // chú thích cuối
}

function renderHtml(input: EmailNotiInput): string {
  const safe = (s: string) => s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const cta = input.ctaUrl && input.ctaLabel
    ? `<a href="${safe(input.ctaUrl)}" style="display:inline-block;background:#059669;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;margin-top:16px">${safe(input.ctaLabel)}</a>`
    : '';
  const footer = input.footerNote
    ? `<p style="color:#94a3b8;font-size:12px;margin-top:24px">${safe(input.footerNote)}</p>`
    : '';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;max-width:600px;width:100%">
        <tr><td style="padding:24px 32px;border-bottom:1px solid #e2e8f0">
          <div style="font-size:18px;font-weight:700;color:#0f172a">🏊 Green Pool ERP</div>
        </td></tr>
        <tr><td style="padding:32px">
          <h1 style="margin:0 0 12px 0;font-size:20px;color:#0f172a;font-weight:700">${safe(input.title)}</h1>
          <p style="margin:0;color:#334155;font-size:15px;line-height:1.6">${safe(input.body)}</p>
          ${cta}
          ${footer}
        </td></tr>
        <tr><td style="padding:16px 32px;background:#f8fafc;border-radius:0 0 12px 12px;border-top:1px solid #e2e8f0">
          <p style="margin:0;color:#94a3b8;font-size:12px">Email tự động từ Green Pool ERP. Không trả lời email này.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** Fire-and-forget send. KHÔNG throw, log warning nếu thiếu key / fail. */
export async function sendEmailNoti(input: EmailNotiInput): Promise<{ ok: boolean; skipped?: boolean; err?: string }> {
  const client = getClient();
  if (!client) {
    return { ok: false, skipped: true, err: 'RESEND_API_KEY chưa set' };
  }
  if (!input.to || !input.to.includes('@')) {
    return { ok: false, err: 'email rỗng/sai định dạng' };
  }
  try {
    const { error } = await client.emails.send({
      from: process.env.RESEND_FROM || FROM_DEFAULT,
      to: [input.to],
      subject: input.subject,
      html: renderHtml(input),
    });
    if (error) {
      console.warn('[resend] send error:', error.message);
      return { ok: false, err: error.message };
    }
    return { ok: true };
  } catch (e: any) {
    console.warn('[resend] send exception:', e?.message);
    return { ok: false, err: e?.message };
  }
}

/** Batch — gửi N email parallel với Promise.allSettled. */
export async function sendEmailNotiBatch(items: EmailNotiInput[]): Promise<{ ok: number; failed: number; skipped: number }> {
  if (!items.length) return { ok: 0, failed: 0, skipped: 0 };
  const client = getClient();
  if (!client) {
    return { ok: 0, failed: 0, skipped: items.length };
  }
  const results = await Promise.allSettled(items.map((i) => sendEmailNoti(i)));
  let ok = 0, failed = 0, skipped = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') {
      if (r.value.ok) ok++;
      else if (r.value.skipped) skipped++;
      else failed++;
    } else failed++;
  }
  return { ok, failed, skipped };
}
