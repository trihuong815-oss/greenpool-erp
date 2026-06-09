// Backfill inAppNotifications cho mọi user-key currentApprover trong tasks
// pending_approval. Đảm bảo user khi mở app thấy Bell badge → biết có việc.
//
// Áp dụng cho docs approve trước khi dual-write LIVE (commit e3b331d).

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function initAdmin() {
  if (getApps().length > 0) return;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './secrets/firebase-admin-sa.json';
  const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
  initializeApp({ credential: cert(sa) });
}

async function main() {
  initAdmin();
  const db = getFirestore();
  const APPLY = process.argv.includes('--apply');

  const snap = await db.collection('tasks')
    .where('status', '==', 'pending_approval')
    .get();
  console.log(`Total pending_approval: ${snap.size}\n`);

  let totalWritten = 0;
  for (const docRef of snap.docs) {
    const t = docRef.data() as any;
    const cur: string | null = t.currentApprover ?? null;
    if (!cur) continue;

    let uids: string[] = [];
    if (cur.startsWith('user:')) {
      uids = [cur.slice(5)];
    } else if (cur.startsWith('role:')) {
      const role = cur.slice(5);
      const rSnap = await db.collection('users')
        .where('status', '==', 'active').where('roleId', '==', role).get();
      uids = rSnap.docs.map((d) => d.id);
      // GD_KD fallback ADMIN
      if (role === 'GD_KD' && uids.length === 0) {
        const aSnap = await db.collection('users')
          .where('status', '==', 'active').where('roleId', '==', 'ADMIN').get();
        uids = aSnap.docs.map((d) => d.id);
      }
    }
    if (uids.length === 0) continue;

    // Build payload giống notifyTaskApproved next-step
    const kindLabel = t.kind === 'proposal' ? 'Đề xuất' : 'Giao việc';
    const payload = {
      title: `📥 ${kindLabel} chờ bạn duyệt`,
      body: `"${t.title}" — đang chờ bạn duyệt`,
      link: `/giao-viec?taskId=${docRef.id}`,
      kind: 'task_pending_next_approval',
      data: { taskId: docRef.id, kind: 'task_pending_next_approval' },
    };

    for (const uid of uids) {
      const userDoc = await db.collection('users').doc(uid).get();
      if (!userDoc.exists) continue;
      const u = userDoc.data() as any;
      // Check exist same-kind noti chưa (tránh dup)
      const itemsRef = db.collection('inAppNotifications').doc(uid).collection('items');
      const existing = await itemsRef
        .where('kind', '==', 'task_pending_next_approval')
        .get();
      const dup = existing.docs.some((d) => (d.data() as any).data?.taskId === docRef.id);
      if (dup) {
        console.log(`  Skip ${u.displayName} (${u.roleId}) — đã có inAppNoti cho task ${docRef.id}`);
        continue;
      }
      console.log(`  ${APPLY ? '[APPLY]' : '[DRY]'} → ${u.displayName} (${u.roleId}) | task ${docRef.id} | ${t.title.slice(0, 50)}`);
      if (APPLY) {
        await itemsRef.add({
          ...payload,
          createdAt: FieldValue.serverTimestamp(),
          seenAt: null,
        });
        totalWritten++;
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`${APPLY ? 'Written' : 'Would write'}: ${totalWritten}`);
  if (!APPLY) console.log(`\nDry-run. --apply để commit.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
