// Fix proposals có chain entry trỏ về ADMIN/GD inactive (do bug resolveGdUid
// không filter status='active' trước Phase Fix 2026-06-09).
//
// Logic:
// 1. Scan tasks status='pending_approval'.
// 2. Cho mỗi task có currentApprover hoặc approvalChain dạng 'user:UID' → check user
//    đó status='active' không.
// 3. Nếu inactive → tìm user thay thế:
//    - Cùng roleId nhưng active
//    - Nếu roleId='ADMIN' inactive → tìm ADMIN active khác
// 4. Patch chain + currentApprover.
//
// Run: npx tsx scripts/fix-proposal-chain-inactive-admin.ts          (dry)
//      npx tsx scripts/fix-proposal-chain-inactive-admin.ts --apply

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function initAdmin() {
  if (getApps().length > 0) return;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './secrets/firebase-admin-sa.json';
  const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
  initializeApp({ credential: cert(sa) });
}

async function findActiveReplacement(db: any, roleId: string): Promise<string | null> {
  const snap = await db.collection('users')
    .where('status', '==', 'active')
    .where('roleId', '==', roleId)
    .limit(1).get();
  if (!snap.empty) return snap.docs[0].id;
  // GD_KD trống → fallback ADMIN active
  if (roleId === 'GD_KD') {
    const aSnap = await db.collection('users')
      .where('status', '==', 'active')
      .where('roleId', '==', 'ADMIN')
      .limit(1).get();
    if (!aSnap.empty) return aSnap.docs[0].id;
  }
  return null;
}

async function main() {
  initAdmin();
  const db = getFirestore();
  const APPLY = process.argv.includes('--apply');

  const snap = await db.collection('tasks').where('status', '==', 'pending_approval').get();
  console.log(`Total pending_approval tasks: ${snap.size}\n`);

  let fixed = 0;
  let scanned = 0;

  for (const docRef of snap.docs) {
    const t = docRef.data() as any;
    const chain: string[] = Array.isArray(t.approvalChain) ? t.approvalChain : [];
    if (chain.length === 0) continue;
    scanned++;

    const updates: any = {};
    let chainChanged = false;
    const newChain: string[] = [];

    for (const entry of chain) {
      if (typeof entry !== 'string' || !entry.startsWith('user:')) {
        newChain.push(entry);
        continue;
      }
      const uid = entry.slice(5);
      const userDoc = await db.collection('users').doc(uid).get();
      if (!userDoc.exists) {
        console.log(`  ${docRef.id}: chain entry uid=${uid} KHÔNG TỒN TẠI — skip (cần fix tay)`);
        newChain.push(entry);
        continue;
      }
      const u = userDoc.data() as any;
      if (u.status === 'active') {
        newChain.push(entry);
        continue;
      }
      // Inactive → tìm replacement
      const replacement = await findActiveReplacement(db, u.roleId);
      if (!replacement) {
        console.log(`  ${docRef.id}: ${entry} (${u.displayName} ${u.roleId} inactive) — KHÔNG có thay thế`);
        newChain.push(entry);
        continue;
      }
      const replacementEntry = `user:${replacement}`;
      const replacementDoc = await db.collection('users').doc(replacement).get();
      const rd = replacementDoc.data() as any;
      console.log(`  ${docRef.id}: ${entry} (${u.displayName} ${u.roleId} inactive) → ${replacementEntry} (${rd.displayName} ${rd.roleId})`);
      newChain.push(replacementEntry);
      chainChanged = true;
    }

    if (chainChanged) {
      updates.approvalChain = newChain;
      // Update currentApprover nếu nó trỏ về entry đã đổi
      // currentApprover should be the first non-completed entry
      const completed: string[] = Array.isArray(t.approvalsCompleted) ? t.approvalsCompleted.map((c: any) => c.entry) : [];
      const nextEntry = newChain.find((e) => !completed.includes(e));
      if (nextEntry && nextEntry !== t.currentApprover) {
        updates.currentApprover = nextEntry;
        console.log(`    currentApprover: ${t.currentApprover} → ${nextEntry}`);
      }
      fixed++;
      if (APPLY) {
        await docRef.ref.update(updates);
        console.log(`    ✓ APPLIED`);
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Scanned chain-based proposals: ${scanned}`);
  console.log(`${APPLY ? 'Fixed' : 'Would fix'}: ${fixed}`);
  if (!APPLY) console.log(`\nDry-run. Chạy với --apply để commit.`);
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
