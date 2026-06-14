// V6.5 Phase A (2026-06-14): Gmail SMTP qua Nodemailer thay Resend free tier
// (Resend free chưa verify domain chỉ cho gửi tới email owner — quá hạn chế).
//
// Anh dùng: trihuong815@gmail.com với App Password (2FA bật + tạo tại
// https://myaccount.google.com/apppasswords).
//
// Env vars cần set:
//   GMAIL_SMTP_USER  — email Gmail gửi từ (vd trihuong815@gmail.com)
//   GMAIL_SMTP_PASS  — App Password 16 ký tự (KHÔNG phải password thường)
//   GMAIL_SMTP_FROM  — optional display name, vd "Green Pool <trihuong815@gmail.com>"
//
// Giới hạn Gmail:
//   • Free Gmail: 500 email/ngày
//   • Workspace: 2000 email/ngày
//   • Throttle: nếu gửi 30 email/min liên tiếp → Gmail tạm khoá vài giờ

import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  const user = process.env.GMAIL_SMTP_USER;
  const pass = process.env.GMAIL_SMTP_PASS;
  if (!user || !pass) return null;
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass: pass.replace(/\s/g, '') }, // strip spaces (Gmail App Password hiển thị có space)
  });
  return cachedTransporter;
}

export interface EmailNotiInput {
  to: string;
  subject: string;
  title: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
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

/** Fire-and-forget. KHÔNG throw, log warning. */
export async function sendEmailNoti(input: EmailNotiInput): Promise<{ ok: boolean; skipped?: boolean; err?: string }> {
  const transporter = getTransporter();
  if (!transporter) return { ok: false, skipped: true, err: 'GMAIL_SMTP_USER/PASS chưa set' };
  if (!input.to || !input.to.includes('@')) return { ok: false, err: 'email rỗng/sai định dạng' };

  const from = process.env.GMAIL_SMTP_FROM
    || `Green Pool ERP <${process.env.GMAIL_SMTP_USER!}>`;

  try {
    const info = await transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: renderHtml(input),
    });
    return { ok: true };
  } catch (e: any) {
    console.warn('[gmail-smtp] send fail:', e?.message);
    return { ok: false, err: e?.message };
  }
}

/** Gửi N email parallel với Promise.allSettled. */
export async function sendEmailNotiBatch(items: EmailNotiInput[]): Promise<{ ok: number; failed: number; skipped: number }> {
  if (!items.length) return { ok: 0, failed: 0, skipped: 0 };
  const transporter = getTransporter();
  if (!transporter) return { ok: 0, failed: 0, skipped: items.length };

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
