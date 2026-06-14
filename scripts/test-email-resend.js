// V6.5 Phase A: test Resend sau khi anh add API key.
// KHÔNG dùng env file — read trực tiếp từ Vercel hoặc pass qua ENV.

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) { console.log('❌ RESEND_API_KEY chưa set'); process.exit(1); }

const { Resend } = require('resend');
const resend = new Resend(apiKey);

(async () => {
  console.log(`Using API key: ${apiKey.slice(0,8)}...`);

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;max-width:600px;width:100%">
        <tr><td style="padding:24px 32px;border-bottom:1px solid #e2e8f0">
          <div style="font-size:18px;font-weight:700;color:#0f172a">🏊 Green Pool ERP</div>
        </td></tr>
        <tr><td style="padding:32px">
          <h1 style="margin:0 0 12px 0;font-size:20px;color:#0f172a;font-weight:700">📥 Đề xuất chờ duyệt</h1>
          <p style="margin:0;color:#334155;font-size:15px;line-height:1.6">
            "Test pipeline V6.5 Phase A — Email backup" — từ Phạm Thanh Tùng (TP_KT)
          </p>
          <a href="https://greenpool-erp.vercel.app/de-xuat?proposalId=test123"
             style="display:inline-block;background:#059669;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;margin-top:16px">
            Mở Green Pool ERP
          </a>
          <p style="color:#94a3b8;font-size:12px;margin-top:24px">
            Email backup vì thông báo đẩy trên thiết bị có thể không tới được.
            Bạn nhận được vì là người duyệt trong hệ thống.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#f8fafc;border-radius:0 0 12px 12px;border-top:1px solid #e2e8f0">
          <p style="margin:0;color:#94a3b8;font-size:12px">Email tự động từ Green Pool ERP. Không trả lời email này.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  try {
    const { data, error } = await resend.emails.send({
      from: 'Green Pool <onboarding@resend.dev>',
      to: ['trihuong815@gmail.com'],
      subject: '[Green Pool] TEST V6.5 Phase A — Email backup',
      html,
    });
    if (error) {
      console.log('❌ FAIL:', error.message);
      console.log(JSON.stringify(error, null, 2));
      process.exit(1);
    }
    console.log('✅ SENT — messageId:', data.id);
    console.log('   Anh check inbox huongnguyenvu2015tokyo@gmail.com (cả Inbox lẫn Spam)');
    process.exit(0);
  } catch (e) {
    console.log('❌ EXCEPTION:', e.message);
    process.exit(1);
  }
})();
