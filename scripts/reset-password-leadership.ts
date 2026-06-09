// Reset password tạm cho user lãnh đạo chưa có / chưa biết password.
// Mặc định: Greenpool@2026 (giống pattern em đã set cho 3 TP VP).
// Chỉ reset user truyền vào qua arg --emails=email1,email2.
//
// Usage:
//   tsx scripts/reset-password-leadership.ts --emails=doanhue.gdvp@greenpool.vn (dry)
//   tsx scripts/reset-password-leadership.ts --emails=doanhue.gdvp@greenpool.vn --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function initAdmin() {
  if (getApps().length > 0) return;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './secrets/firebase-admin-sa.json';
  const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
  initializeApp({ credential: cert(sa) });
}

const DEFAULT_PASSWORD = 'Greenpool@2026';

async function main() {
  initAdmin();
  const auth = getAuth();
  const APPLY = process.argv.includes('--apply');

  const emailArg = process.argv.find((a) => a.startsWith('--emails='));
  if (!emailArg) {
    console.error('Usage: --emails=email1,email2');
    process.exit(1);
  }
  const emails = emailArg.slice(9).split(',').map((s) => s.trim()).filter(Boolean);

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Default password: ${DEFAULT_PASSWORD}\n`);

  for (const email of emails) {
    try {
      const user = await auth.getUserByEmail(email);
      console.log(`${APPLY ? '[APPLY]' : '[DRY]'} Reset password for ${email} (uid=${user.uid})`);
      if (APPLY) {
        await auth.updateUser(user.uid, { password: DEFAULT_PASSWORD });
        console.log(`  ✓ Done. User có thể login với password: ${DEFAULT_PASSWORD}`);
      }
    } catch (e: any) {
      console.error(`❌ ${email}: ${e?.message}`);
    }
  }

  if (!APPLY) console.log(`\nDry-run. Chạy với --apply để commit.`);
  else {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`⚠ Yêu cầu user đăng nhập + đổi password ngay tại /doi-mat-khau`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
