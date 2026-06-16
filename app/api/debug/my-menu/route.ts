// Phase 0 debug (2026-06-17): trả về effectiveMenu cho user hiện tại
// để xác định vấn đề menu "Doanh số v2" không hiện.
// XOÁ sau khi debug xong.

import { NextResponse } from 'next/server';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { effectiveMenu } from '@/lib/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { profile } = await requireAuthedProfile();
    const allowed = effectiveMenu(profile.roleCode, profile.menuOverrides);
    return NextResponse.json({
      ok: true,
      uid: profile.id,
      email: profile.email,
      roleCode: profile.roleCode,
      menuOverrides: profile.menuOverrides,
      allowedRoutes: [...allowed].sort(),
      salesV2: {
        'doanh-so-v2/nhap': allowed.has('doanh-so-v2/nhap'),
        'doanh-so-v2/doi-chieu': allowed.has('doanh-so-v2/doi-chieu'),
        'doanh-so-v2/cong-no': allowed.has('doanh-so-v2/cong-no'),
        'doanh-so-v2/tong-ket': allowed.has('doanh-so-v2/tong-ket'),
      },
      buildId: process.env.BUILD_ID ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'unknown' }, { status: 500 });
  }
}
