// GET /api/fcm-config — trả config Firebase public cho Service Worker.
// SW không có process.env → fetch từ endpoint này khi khởi tạo.
// Public values only (apiKey, projectId, messagingSenderId, appId) — không phải secret.

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
  }, {
    headers: { 'cache-control': 'public, max-age=3600' },
  });
}
