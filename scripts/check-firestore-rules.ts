// Test rules: thử ghi từ "unauthenticated client" (REST API không token).
// Nếu rules đang deploy đúng → bị deny.
// Nếu rules trống/public → ghi thành công (CẢNH BÁO BẢO MẬT).
// Chạy:  npx --yes tsx scripts/check-firestore-rules.ts

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath || !existsSync(resolve(process.cwd(), credPath))) {
  console.error('Thiếu GOOGLE_APPLICATION_CREDENTIALS');
  process.exit(1);
}
const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
const projectId = sa.project_id;

async function tryUnauthWrite() {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/_smoke?documentId=unauth-${Date.now()}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        test: { stringValue: 'unauthenticated-write-from-rules-check' },
      },
    }),
  });
  return { status: res.status, body: await res.text() };
}

async function main() {
  console.log(`Project: ${projectId}`);
  console.log('Thử ghi từ unauthenticated REST client...\n');
  const r = await tryUnauthWrite();
  console.log(`Status: ${r.status}`);
  console.log(`Body: ${r.body.slice(0, 300)}\n`);

  if (r.status === 200) {
    console.log('⚠️  CẢNH BÁO: Ghi thành công khi KHÔNG đăng nhập.');
    console.log('   Rules đang public hoặc CHƯA deploy. PHẢI deploy rules ngay.');
  } else if (r.status === 403) {
    console.log('✓ Rules đang DENY unauthenticated write — đúng kỳ vọng.');
  } else if (r.status === 401) {
    console.log('✓ Yêu cầu auth token — rules đang chặn.');
  } else {
    console.log('? Status không quen thuộc, đọc body để biết thêm.');
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('LỖI:', e.message);
  process.exit(1);
});
