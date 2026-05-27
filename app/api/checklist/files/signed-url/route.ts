// POST /api/checklist/files/signed-url
// Body: { path: string }
// Trả về URL ký 1h để hiển thị/xem file evidence.
// Scope check: load instance từ path, verify caller có scope đọc.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getEvidenceBucket } from '@/lib/firebase/storage';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { matchesScope, type InstanceForScope } from '@/lib/firebase/checklist-scope';

const SIGNED_URL_TTL_MS = 60 * 60 * 1000; // 1h

// path format: checklist-evidence/{facility}/{instance}/{item}/{filename}
function parseEvidencePath(path: string): { facility: string; instance: string; item: string } | null {
  const parts = path.split('/');
  if (parts.length < 5 || parts[0] !== 'checklist-evidence') return null;
  return { facility: parts[1], instance: parts[2], item: parts[3] };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const path: string = body?.path;
    if (!path) return NextResponse.json({ error: 'Thiếu path' }, { status: 400 });

    const parsed = parseEvidencePath(path);
    if (!parsed) return NextResponse.json({ error: 'Path không hợp lệ' }, { status: 400 });

    const caller = await getAuthedCaller();

    const db = getFirebaseAdminDb();
    const instSnap = await db.collection(COLLECTIONS.CHECKLISTS).doc(parsed.instance).get();
    if (!instSnap.exists) return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    const inst = instSnap.data()!;
    const instForScope: InstanceForScope = {
      facility_id: inst.facility_id ?? null,
      department_id: inst.department_id ?? null,
      shift_type: inst.shift_type ?? null,
      assigned_to: inst.assigned_to ?? null,
      status: inst.status ?? 'pending',
    };
    if (!matchesScope(caller.profile, instForScope)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // Path facility phải khớp instance.facility_id để tránh đoán đường dẫn cơ sở khác
    if (inst.facility_id !== parsed.facility) {
      return NextResponse.json({ error: 'Path không khớp facility instance' }, { status: 400 });
    }

    const [url] = await getEvidenceBucket().file(path).getSignedUrl({
      action: 'read',
      expires: Date.now() + SIGNED_URL_TTL_MS,
    });
    return NextResponse.json({ url, expiresInMs: SIGNED_URL_TTL_MS });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[signed-url]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
