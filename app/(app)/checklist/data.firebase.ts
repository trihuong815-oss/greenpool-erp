// Server-side fetcher cho Checklist khi NEXT_PUBLIC_DATA_BACKEND=firebase.
// Dùng firebase-admin (bypass Firestore rules) — đã apply scope thủ công
// dựa trên profile (auth Supabase vẫn là source of truth cho identity).
//
// CHỈ chạy server-side. Có 'server-only' để Next.js refuse bundle vào client.
//
// Quy ước Firestore (xem docs/firebase-checklist-migration.md):
//   checklists/{id}                — top-level (rename Phase 1.5 từ checklistInstances)
//   checklists/{id}/items/{itemId} — subcollection
//   templates/{id}                 — top-level (rename Phase 1.5 từ checklistTemplates)
//
// Timestamp ↔ ISO string conversion để tương thích type ChecklistInstance
// hiện tại (vốn dùng ISO string cho mọi field thời gian).

import 'server-only';
import { getApps, initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { COLLECTIONS } from '@/lib/firebase/collections';
import type {
  CardData, ChecklistInstance, ChecklistInstanceItem, ChecklistTemplate,
} from './helpers';
import type { ChecklistScope } from '@/lib/permissions';

// ---- Init firebase-admin (idempotent) ----
function initFirebaseAdmin(): void {
  if (getApps().length > 0) return;

  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  let creds: ServiceAccount | null = null;

  if (path && existsSync(path)) {
    creds = JSON.parse(readFileSync(path, 'utf-8')) as ServiceAccount;
  } else {
    const projectId   = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const rawKey      = process.env.FIREBASE_PRIVATE_KEY;
    if (projectId && clientEmail && rawKey) {
      creds = {
        projectId,
        clientEmail,
        privateKey: rawKey.replace(/\\n/g, '\n'),
      } as ServiceAccount;
    }
  }

  if (!creds) {
    throw new Error(
      '[firebase] Thiếu Admin credential. Bổ sung vào .env.local một trong hai:\n' +
      '  GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json\n' +
      '  hoặc FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY'
    );
  }
  initializeApp({ credential: cert(creds) });
}

// ---- Helpers ----
function deserialize<T>(id: string, data: Record<string, unknown>): T {
  const out: Record<string, unknown> = { id };
  for (const [k, v] of Object.entries(data)) {
    if (v instanceof Timestamp) {
      // Convert Timestamp → ISO string để khớp type hiện có
      out[k] = v.toDate().toISOString();
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

// Firestore 'in' max values per query
const IN_CHUNK = 30;

export interface FetchFirebaseArgs {
  scope: ChecklistScope;
  date: string;
  // Identity fields giữ lại cho consistency với data.ts (chưa dùng ở đây
  // vì admin SDK bypass rules; sẽ cần khi triển khai auto-create per-user).
  userId: string;
  userRole: string;
  userFacility: string | null;
  userDepartment: string | null;
  userShift: string | null;
  isSharedShift: boolean;
}

export interface OperationsResult {
  cards: CardData[];
  error: string | null;
}

export async function getChecklistOperationsDataFirebase(
  args: FetchFirebaseArgs
): Promise<OperationsResult> {
  try {
    initFirebaseAdmin();
    const db = getFirestore();

    // ---- 1. Query instances theo date + facility scope (server-side) ----
    // Firestore không cho phép nhiều 'in' clauses cùng query; ưu tiên facility ở
    // server (phổ biến cho QLCS), department/shift filter client-side sau.
    let query = db.collection(COLLECTIONS.CHECKLISTS).where('date', '==', args.date);

    if (args.scope.facilityIds !== null) {
      if (args.scope.facilityIds.length === 0) {
        return { cards: [], error: null };
      } else if (args.scope.facilityIds.length === 1) {
        query = query.where('facility_id', '==', args.scope.facilityIds[0]);
      } else {
        // 5 cơ sở < 30 → 'in' OK
        query = query.where('facility_id', 'in', args.scope.facilityIds.slice(0, IN_CHUNK));
      }
    }

    const instSnap = await query.get();
    let instances: ChecklistInstance[] = instSnap.docs.map(d =>
      deserialize<ChecklistInstance>(d.id, d.data())
    );

    // ---- 2. Apply department + shift scope client-side ----
    if (args.scope.departmentIds !== null) {
      if (args.scope.departmentIds.length === 0) return { cards: [], error: null };
      const set = new Set(args.scope.departmentIds);
      instances = instances.filter(i =>
        i.department_id != null && set.has(i.department_id as string)
      );
    }
    if (args.scope.shiftTypes !== null) {
      if (args.scope.shiftTypes.length === 0) return { cards: [], error: null };
      const set = new Set(args.scope.shiftTypes);
      instances = instances.filter(i =>
        i.shift_type != null && set.has(i.shift_type as string)
      );
    }

    if (instances.length === 0) {
      return { cards: [], error: null };
    }

    // ---- 3. Load templates được tham chiếu (chunked 'in' qua __name__) ----
    const templateIds = Array.from(new Set(instances.map(i => i.template_id)));
    const templates: Record<string, ChecklistTemplate> = {};
    for (let i = 0; i < templateIds.length; i += IN_CHUNK) {
      const slice = templateIds.slice(i, i + IN_CHUNK);
      const tSnap = await db.collection(COLLECTIONS.TEMPLATES)
        .where('__name__', 'in', slice)
        .get();
      tSnap.docs.forEach(d => {
        templates[d.id] = deserialize<ChecklistTemplate>(d.id, d.data());
      });
    }

    // ---- 4. Load items subcollection song song (1 query/instance) ----
    const itemsByInstance: Record<string, ChecklistInstanceItem[]> = {};
    await Promise.all(
      instances.map(async (inst) => {
        const itSnap = await db
          .collection(COLLECTIONS.CHECKLISTS).doc(inst.id)
          .collection('items')
          .orderBy('sort_order')
          .get();
        itemsByInstance[inst.id] = itSnap.docs.map(d =>
          deserialize<ChecklistInstanceItem>(d.id, d.data())
        );
      })
    );

    // ---- 5. Build CardData[] ----
    const cards: CardData[] = instances
      .filter(inst => templates[inst.template_id])
      .map(inst => {
        const items = itemsByInstance[inst.id] || [];
        return {
          instance: inst,
          template: templates[inst.template_id],
          items,
          templateItemCount: items.length,
        };
      });

    return { cards, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { cards: [], error: msg };
  }
}
