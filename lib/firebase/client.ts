// Firebase Client SDK — chạy trong browser.
// Dùng cho Auth (signInWithEmailAndPassword).

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

interface ClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

function readConfig(): ClientConfig | null {
  const c: ClientConfig = {
    apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
  };
  if (!c.apiKey || !c.projectId || !c.appId) return null;
  return c;
}

let _app: FirebaseApp | null = null;

export function getFirebaseClient(): FirebaseApp {
  if (_app) return _app;
  const cfg = readConfig();
  if (!cfg) {
    throw new Error(
      '[firebase/client] Thiếu env NEXT_PUBLIC_FIREBASE_*. Bổ sung vào .env.local trước khi gọi getFirebaseClient().'
    );
  }
  _app = getApps().length ? getApp() : initializeApp(cfg);
  return _app;
}

export function getFirebaseClientAuth(): Auth {
  return getAuth(getFirebaseClient());
}

export function isFirebaseClientReady(): boolean {
  return readConfig() !== null;
}
