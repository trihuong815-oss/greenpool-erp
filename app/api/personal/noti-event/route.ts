// POST /api/personal/noti-event
// Body: { event: 'enabled' | 'deferred' | 'declined', roleCode?: string }
//
// Phase PWA-Stability (2026-06-09): track user behavior với noti prompt.
// Admin xem audit log → biết role nào hay hoãn → đôn đốc.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/firebase/current-profile';
import { writeAuditLog } from '@/lib/firebase/audit-log';

const VALID_EVENTS = new Set(['enabled', 'deferred', 'declined']);

export async function POST(req: NextRequest) {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const event: string = typeof body?.event === 'string' ? body.event : '';
  if (!VALID_EVENTS.has(event)) {
    return NextResponse.json({ error: 'event không hợp lệ' }, { status: 400 });
  }

  try {
    await writeAuditLog({
      action: `noti_${event}`,
      module: 'users',
      userId: ctx.profile.id,
      branchId: ctx.profile.branchId ?? null,
      before: null,
      after: { roleCode: ctx.profile.roleCode, displayName: ctx.profile.displayName },
      actorName: ctx.profile.displayName,
      actorRole: ctx.profile.roleCode,
      source: 'ui',
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.warn('[noti-event]', e?.message);
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
