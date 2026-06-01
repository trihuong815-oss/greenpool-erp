// Seed 13 standard channels (Phase 13.2): 1 toàn công ty + 5 cơ sở + 7 phòng.
// Idempotent — re-run safe: doc id deterministic, merge participantIds mới.
//
// DRY-RUN: GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx tsx scripts/seed-chat-channels.ts
// APPLY:   GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx tsx scripts/seed-chat-channels.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { STANDARD_CHANNELS, channelConversationId, type ChannelMeta } from '../lib/firebase/chat-scope';

const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

// Inline resolver — script chạy CLI, không qua lib/firebase/admin (file đó có 'server-only').
async function resolveChannelParticipants(meta: ChannelMeta): Promise<{ ids: string[]; names: Record<string, string> }> {
  let q: FirebaseFirestore.Query = db.collection('users').where('status', '==', 'active');
  if (meta.kind === 'branch') {
    if (!meta.branchId) throw new Error('branch channel cần branchId');
    q = q.where('branchId', '==', meta.branchId);
  } else if (meta.kind === 'department') {
    if (!meta.departmentId) throw new Error('department channel cần departmentId');
    q = q.where('departmentId', '==', meta.departmentId);
  }
  const snap = await q.get();
  const ids: string[] = [];
  const names: Record<string, string> = {};
  for (const d of snap.docs) {
    const x = d.data();
    ids.push(d.id);
    names[d.id] = x.displayName ?? x.email ?? '?';
  }
  ids.sort();
  return { ids, names };
}

async function main() {
  console.log(APPLY ? '🚀 APPLY' : '👀 DRY-RUN');
  console.log(`Seed ${STANDARD_CHANNELS.length} channels (1 company + 5 branch + 7 dept)\n`);

  const now = Timestamp.now();
  let created = 0, updated = 0, skipped = 0;

  for (const ch of STANDARD_CHANNELS) {
    const cid = channelConversationId(ch.meta);
    const { ids, names } = await resolveChannelParticipants(ch.meta);
    if (ids.length === 0) {
      console.log(`  ⚠ SKIP "${ch.name}" (${cid}) — không có user active phù hợp`);
      skipped++;
      continue;
    }
    const ref = db.collection('conversations').doc(cid);
    const existing = await ref.get();
    const baseDoc = {
      type: 'channel',
      name: ch.name,
      participantIds: ids,
      participantNames: names,
      channel: ch.meta,
      systemManaged: true,
    };
    if (!existing.exists) {
      console.log(`  + CREATE "${ch.name}" (${cid}) — ${ids.length} members`);
      if (APPLY) {
        await ref.set({
          ...baseDoc,
          lastMessage: null,
          lastMessageAt: now,
          readBy: {},
          createdAt: now,
          createdBy: 'system',
          createdByName: 'Hệ thống',
        });
      }
      created++;
    } else {
      const before: string[] = Array.isArray(existing.data()?.participantIds) ? existing.data()!.participantIds : [];
      const added = ids.filter((u) => !before.includes(u));
      const removed = before.filter((u) => !ids.includes(u));
      if (added.length === 0 && removed.length === 0 && existing.data()?.name === ch.name) {
        console.log(`  = UNCHANGED "${ch.name}" — ${ids.length} members`);
        skipped++;
      } else {
        console.log(`  ~ UPDATE "${ch.name}" — ${ids.length} members (+${added.length}, -${removed.length})`);
        if (APPLY) {
          await ref.update({
            ...baseDoc,
            // KHÔNG override readBy/lastMessage/createdAt
          });
        }
        updated++;
      }
    }
  }

  console.log(`\n✓ Tổng: ${created} created · ${updated} updated · ${skipped} skipped`);
  if (!APPLY) console.log('(dry-run — KHÔNG ghi vào DB. Re-run với --apply để áp dụng.)');
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
