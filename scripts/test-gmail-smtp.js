// Test Gmail SMTP qua Nodemailer
const user = process.env.GMAIL_SMTP_USER;
const pass = process.env.GMAIL_SMTP_PASS;
if (!user || !pass) { console.log('❌ GMAIL_SMTP_USER/PASS chưa set'); process.exit(1); }

const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user, pass: pass.replace(/\s/g, '') },
});

(async () => {
  console.log(`From: ${user}`);
  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0">
    <tr><td align="center">
      <table width="600" style="background:#fff;border-radius:12px;max-width:600px;width:100%">
        <tr><td style="padding:24px 32px;border-bottom:1px solid #e2e8f0">
          <div style="font-size:18px;font-weight:700">🏊 Green Pool ERP</div>
        </td></tr>
        <tr><td style="padding:32px">
          <h1 style="margin:0 0 12px 0;font-size:20px;color:#0f172a">📥 Đề xuất chờ duyệt</h1>
          <p style="margin:0;color:#334155;font-size:15px;line-height:1.6">
            "Test pipeline V6.5 Phase A — Email backup qua Gmail SMTP" — từ TP Kỹ thuật
          </p>
          <a href="https://greenpool-erp.vercel.app/de-xuat"
             style="display:inline-block;background:#059669;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;margin-top:16px">
            Mở Green Pool ERP
          </a>
          <p style="color:#94a3b8;font-size:12px;margin-top:24px">
            Email backup vì thông báo đẩy trên iPhone có thể không tới được.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#f8fafc;border-radius:0 0 12px 12px;border-top:1px solid #e2e8f0">
          <p style="margin:0;color:#94a3b8;font-size:12px">Email tự động Green Pool ERP. Không trả lời email này.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  try {
    const info = await transporter.sendMail({
      from: `Green Pool ERP <${user}>`,
      to: 'huongnguyenvu2015tokyo@gmail.com',
      subject: '[Green Pool] TEST V6.5 — Email backup qua Gmail SMTP',
      html,
    });
    console.log('✅ SENT — messageId:', info.messageId);
    console.log('   To: huongnguyenvu2015tokyo@gmail.com');
    console.log('   Anh check inbox (cả Inbox lẫn Spam) — thường tới trong 5-30 giây');
    process.exit(0);
  } catch (e) {
    console.log('❌ FAIL:', e.message);
    if (e.code) console.log('   code:', e.code);
    if (e.response) console.log('   response:', e.response);
    process.exit(1);
  }
})();
