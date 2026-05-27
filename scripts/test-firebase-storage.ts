// Smoke test Firebase Storage: bucket exists? + upload/delete a test file?
// Chạy:  npx --yes tsx scripts/test-firebase-storage.ts

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) {
  initializeApp({
    credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }),
  });
}

const bucketNames = [
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  `${sa.project_id}.firebasestorage.app`,
  `${sa.project_id}.appspot.com`,
].filter(Boolean) as string[];

async function probeBucket(name: string): Promise<boolean> {
  try {
    const b = getStorage().bucket(name);
    const [exists] = await b.exists();
    return exists;
  } catch (e: any) {
    console.log(`  ${name} → lỗi: ${e?.message ?? e}`);
    return false;
  }
}

async function main() {
  console.log('Probing buckets cho project', sa.project_id);
  let working: string | null = null;
  for (const n of bucketNames) {
    const ok = await probeBucket(n);
    console.log(`  ${ok ? '✓' : '✗'} ${n}`);
    if (ok && !working) working = n;
  }
  if (!working) {
    console.log('\n⚠ KHÔNG có bucket nào tồn tại. Cần bật Firebase Storage trong Console.');
    console.log('   Console → Build → Storage → Get started → chọn region asia-southeast1');
    process.exit(2);
  }
  console.log(`\nDùng bucket: ${working}`);

  // Upload test
  const path = `_smoke/storage-test-${Date.now()}.txt`;
  const bucket = getStorage().bucket(working);
  await bucket.file(path).save(Buffer.from('hello from smoke test\n'), {
    metadata: { contentType: 'text/plain' },
    resumable: false,
  });
  console.log(`✓ Upload OK: ${path}`);

  // Signed URL
  const [url] = await bucket.file(path).getSignedUrl({
    action: 'read',
    expires: Date.now() + 5 * 60 * 1000,
  });
  console.log(`✓ Signed URL: ${url.slice(0, 80)}...`);

  // Cleanup
  await bucket.file(path).delete();
  console.log('✓ Cleanup OK');
}

main().then(() => process.exit(0)).catch((e) => { console.error('LỖI:', e); process.exit(1); });
