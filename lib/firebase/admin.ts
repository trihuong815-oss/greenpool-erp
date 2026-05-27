// Firebase Admin SDK — server-only.
// Hỗ trợ 2 cách cung cấp credentials:
//   1. GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json  (preferred, dev local)
//   2. FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (env-only, prod)
// Tuyệt đối không import từ client component — đã có 'server-only'.

import 'server-only';
import { initializeApp, getApps, getApp, cert, applicationDefault } from 'firebase-admin/app';
import type { App as AdminApp, Credential } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

let _app: AdminApp | null = null;

function loadCredentials(): Credential {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath) {
    const abs = resolve(process.cwd(), credPath);
    if (!existsSync(abs)) {
      throw new Error(`[firebase/admin] GOOGLE_APPLICATION_CREDENTIALS trỏ tới file không tồn tại: ${abs}`);
    }
    const sa = JSON.parse(readFileSync(abs, 'utf8'));
    return cert({
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      privateKey: sa.private_key,
    });
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && rawKey) {
    return cert({
      projectId,
      clientEmail,
      privateKey: rawKey.replace(/\\n/g, '\n'),
    });
  }

  try {
    return applicationDefault();
  } catch {
    throw new Error(
      '[firebase/admin] Thiếu credentials. Set GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json ' +
      'hoặc 3 env FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY trong .env.local.'
    );
  }
}

// Resolve projectId explicit từ env hoặc service account file để truyền vào initializeApp.
// Lý do: cert(...) không tự populate app.options.projectId → storage.ts không build được bucket name.
function resolveProjectIdEarly(): string | undefined {
  if (process.env.FIREBASE_PROJECT_ID) return process.env.FIREBASE_PROJECT_ID;
  if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) return process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath) {
    const abs = resolve(process.cwd(), credPath);
    if (existsSync(abs)) {
      try {
        return JSON.parse(readFileSync(abs, 'utf8')).project_id;
      } catch { /* ignore */ }
    }
  }
  return undefined;
}

export function getFirebaseAdmin(): AdminApp {
  if (_app) return _app;
  if (getApps().length) {
    _app = getApp();
    return _app;
  }
  const projectId = resolveProjectIdEarly();
  _app = initializeApp({
    credential: loadCredentials(),
    ...(projectId ? { projectId } : {}),
  });
  return _app;
}

export function getFirebaseAdminDb(): Firestore {
  return getFirestore(getFirebaseAdmin());
}

export function getFirebaseAdminAuth(): Auth {
  return getAuth(getFirebaseAdmin());
}

export function isFirebaseAdminReady(): boolean {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const abs = resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS);
    return existsSync(abs);
  }
  return !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
}
