/**
 * scripts/deploy-firebase-rules.ts
 *
 * Deploy Firestore + Storage rules qua Firebase Admin SDK trực tiếp.
 * Bypass `firebase-tools` CLI (vốn cần quyền serviceusage.services.get
 * mà default Admin SDK service account không có).
 *
 * Credentials:
 *   GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json
 *
 * Args:
 *   --firestore   Chỉ deploy Firestore rules
 *   --storage     Chỉ deploy Storage rules
 *   (mặc định: cả 2)
 *
 * Chạy:
 *   GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json \
 *     npm run deploy:rules
 */

import { initializeApp, cert, getApps, type ServiceAccount } from 'firebase-admin/app';
import { getSecurityRules } from 'firebase-admin/security-rules';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

function loadDotEnv(path: string): void {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf-8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotEnv(join(process.cwd(), '.env.local'));

function getSA(): ServiceAccount {
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path) {
    if (!existsSync(path)) {
      console.error(`❌ GOOGLE_APPLICATION_CREDENTIALS không tồn tại: ${path}`);
      process.exit(1);
    }
    return JSON.parse(readFileSync(path, 'utf-8')) as ServiceAccount;
  }
  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey } as ServiceAccount;
  }
  console.error('❌ Thiếu credential Firebase.');
  process.exit(1);
}

const sa = getSA();
const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(sa) });
const rules = getSecurityRules(app);

const args = process.argv.slice(2);
const onlyFirestore = args.includes('--firestore');
const onlyStorage   = args.includes('--storage');
const doFirestore = !onlyStorage; // mặc định cả 2
const doStorage   = !onlyFirestore;

async function deployFirestore(): Promise<void> {
  const path = join(process.cwd(), 'firebase', 'firestore.rules');
  if (!existsSync(path)) {
    console.error(`❌ Không tìm thấy ${path}`);
    process.exit(1);
  }
  const source = readFileSync(path, 'utf-8');
  console.log(`📜 Deploy Firestore rules (${source.length} bytes)…`);
  await rules.releaseFirestoreRulesetFromSource(source);
  console.log('  ✓ Firestore rules đã release.');
}

async function deployStorage(): Promise<void> {
  const path = join(process.cwd(), 'firebase', 'storage.rules');
  if (!existsSync(path)) {
    console.error(`❌ Không tìm thấy ${path}`);
    process.exit(1);
  }
  const source = readFileSync(path, 'utf-8');
  // Resolve bucket: env override → projectId.firebasestorage.app (mặc định mới).
  const projectId = (sa as { projectId?: string; project_id?: string }).projectId
    ?? (sa as { project_id?: string }).project_id;
  const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    ?? (projectId ? `${projectId}.firebasestorage.app` : undefined);
  console.log(`📜 Deploy Storage rules (${source.length} bytes) → ${bucket}…`);
  await rules.releaseStorageRulesetFromSource(source, bucket);
  console.log('  ✓ Storage rules đã release.');
}

async function main(): Promise<void> {
  console.log(`🚀 Deploy rules → project ${(sa as { projectId?: string; project_id?: string }).projectId ?? (sa as { project_id?: string }).project_id}`);
  console.log();

  if (doFirestore) {
    try {
      await deployFirestore();
    } catch (e) {
      console.error('  ❌ Firestore rules thất bại:', e instanceof Error ? e.message : String(e));
      if (!doStorage) process.exit(1);
    }
  }

  if (doStorage) {
    try {
      await deployStorage();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('  ❌ Storage rules thất bại:', msg);
      if (msg.includes('not been used') || msg.includes('disabled') || msg.includes('not found')) {
        console.error('     → Storage có thể chưa được bật trên Firebase project.');
        console.error('     → Bật ở Console: https://console.firebase.google.com/project/' +
          ((sa as { projectId?: string; project_id?: string }).projectId ?? (sa as { project_id?: string }).project_id) +
          '/storage');
      }
      // không exit để chạy tiếp các phần khác
    }
  }

  console.log('\n✅ Hoàn tất.');
}

main().catch(err => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('❌ Deploy thất bại:', msg);
  process.exit(1);
});
