// Firebase Storage helper — server-only.
// Bucket được resolve theo thứ tự:
//   1. NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET (env)
//   2. {project_id}.firebasestorage.app  (post-2024 default)
//   3. {project_id}.appspot.com          (legacy fallback)

import 'server-only';
import { getStorage } from 'firebase-admin/storage';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { getFirebaseAdmin } from './admin';

type Bucket = ReturnType<ReturnType<typeof getStorage>['bucket']>;

let _bucket: Bucket | null = null;

function resolveProjectId(): string | undefined {
  // 1) env explicit
  if (process.env.FIREBASE_PROJECT_ID) return process.env.FIREBASE_PROJECT_ID;
  if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) return process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  // 2) admin app options
  const app = getFirebaseAdmin();
  if (app.options.projectId) return app.options.projectId;
  // 3) đọc trực tiếp service account JSON
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath) {
    const abs = resolve(process.cwd(), credPath);
    if (existsSync(abs)) {
      try {
        const sa = JSON.parse(readFileSync(abs, 'utf8'));
        return sa.project_id;
      } catch { /* ignore */ }
    }
  }
  return undefined;
}

function resolveBucketName(): string {
  if (process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) {
    return process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  }
  const projectId = resolveProjectId();
  if (!projectId) {
    throw new Error('[firebase/storage] Không xác định được projectId để build bucket name. Set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET trong .env.local.');
  }
  return `${projectId}.firebasestorage.app`;
}

export function getEvidenceBucket(): Bucket {
  if (_bucket) return _bucket;
  _bucket = getStorage(getFirebaseAdmin()).bucket(resolveBucketName());
  return _bucket;
}

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_SIZE_PDF = 10 * 1024 * 1024;
const MAX_SIZE_IMG = 5 * 1024 * 1024;

export function validateEvidenceFile(file: { type: string; size: number }): string | null {
  if (!ALLOWED_MIME.has(file.type)) {
    return `Định dạng không cho phép: ${file.type}. Chỉ chấp nhận JPG/PNG/WEBP/PDF.`;
  }
  const limit = file.type === 'application/pdf' ? MAX_SIZE_PDF : MAX_SIZE_IMG;
  if (file.size > limit) {
    return `File quá lớn (${(file.size / 1024 / 1024).toFixed(2)} MB). Giới hạn ${(limit / 1024 / 1024).toFixed(0)} MB.`;
  }
  return null;
}

export function sanitizeEvidenceFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 60);
}

// Path: checklist-evidence/{facilityId}/{instanceId}/{itemId}/{ts}_{filename}
// Khớp với firestore.rules + storage.rules (path facilityId chặn upload sai cơ sở).
export function buildEvidencePath(args: {
  facilityId: string;
  instanceId: string;
  itemId: string;
  fileName: string;
}): string {
  const ts = Date.now();
  const safe = sanitizeEvidenceFileName(args.fileName);
  return `checklist-evidence/${args.facilityId}/${args.instanceId}/${args.itemId}/${ts}_${safe}`;
}

// ============================================================================
// Task attachments (Phase 7) — reuse bucket, validation thoáng hơn (docx/xlsx/zip).
// Path: task-attachments/{taskId}/{ts}_{filename}
// ============================================================================
const TASK_ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv',
  'application/zip', 'application/x-zip-compressed',
]);
const TASK_MAX_SIZE = 20 * 1024 * 1024; // 20 MB

export function validateTaskAttachment(file: { type: string; size: number }): string | null {
  if (file.type && !TASK_ALLOWED_MIME.has(file.type)) {
    return `Định dạng không cho phép: ${file.type}. Chỉ chấp nhận ảnh, PDF, Office, TXT/CSV, ZIP.`;
  }
  if (file.size > TASK_MAX_SIZE) {
    return `File quá lớn (${(file.size / 1024 / 1024).toFixed(2)} MB). Giới hạn ${(TASK_MAX_SIZE / 1024 / 1024).toFixed(0)} MB.`;
  }
  return null;
}

export function buildTaskAttachmentPath(args: { taskId: string; fileName: string }): string {
  const ts = Date.now();
  const safe = sanitizeEvidenceFileName(args.fileName);
  return `task-attachments/${args.taskId}/${ts}_${safe}`;
}
