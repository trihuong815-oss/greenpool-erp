// Debug script: check GD_KD account FCM state + recent push attempts.
// Usage: npx tsx scripts/check-gdkd-noti.ts

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

async function main() {
  initAdmin();
  const db = getFirestore();

  // 1. Tìm tất cả user roleId=GD_KD
  const snap = await db.collection('users').where('roleId', '==', 'GD_KD').get();
  console.log(`\n=== GD_KD users: ${snap.size} ===`);
  for (const doc of snap.docs) {
    const x = doc.data();
    const devices: any[] = Array.isArray(x.fcmDevices) ? x.fcmDevices : [];
    const legacyTokens: string[] = Array.isArray(x.fcmTokens) ? x.fcmTokens : [];
    console.log(`\nUID: ${doc.id}`);
    console.log(`  email: ${x.email}`);
    console.log(`  displayName: ${x.displayName}`);
    console.log(`  status: ${x.status}`);
    console.log(`  branchId: ${x.branchId}`);
    console.log(`  fcmDevices: ${devices.length} entries`);
    devices.forEach((d, i) => {
      console.log(`    [${i}] token=${(d.token ?? '').slice(0, 20)}... enabled=${d.enabled !== false} label=${d.label ?? ''} lastSeen=${d.lastSeen ?? ''}`);
    });
    console.log(`  fcmTokens (legacy): ${legacyTokens.length} entries`);
    legacyTokens.forEach((t, i) => {
      console.log(`    [${i}] ${(t ?? '').slice(0, 20)}...`);
    });
    console.log(`  fcmTokensUpdatedAt: ${x.fcmTokensUpdatedAt ?? '(none)'}`);
  }

  // 2. Check tasks pending_approval với currentApprover = role:GD_KD hoặc user:UID GD_KD
  console.log(`\n=== Tasks pending_approval cho GD_KD (recent 10) ===`);
  const gdkdUids = snap.docs.map(d => d.id);
  const tasksSnap = await db.collection('tasks')
    .where('status', '==', 'pending_approval')
    .where('currentApprover', '==', 'role:GD_KD')
    .orderBy('createdAt', 'desc')
    .limit(10).get();
  console.log(`Found ${tasksSnap.size} pending_approval tasks for GD_KD role-key`);
  tasksSnap.forEach((d) => {
    const t = d.data();
    console.log(`  - ${d.id}: ${t.title} | createdAt=${t.createdAt?.toDate?.()?.toISOString?.()} | createdByName=${t.createdByName}`);
  });

  // Also user-specific
  for (const uid of gdkdUids) {
    const userSpecific = await db.collection('tasks')
      .where('status', '==', 'pending_approval')
      .where('currentApprover', '==', `user:${uid}`)
      .limit(5).get();
    if (userSpecific.size > 0) {
      console.log(`Found ${userSpecific.size} tasks for user:${uid} specifically`);
    }
  }

  // 3. Audit log: rate limit fail-open events?
  console.log(`\n=== Recent rate_limit_fail_open events (last 50) ===`);
  const flSnap = await db.collection('auditLogs')
    .where('action', '==', 'rate_limit_fail_open')
    .orderBy('createdAt', 'desc')
    .limit(50).get();
  console.log(`Found ${flSnap.size} events`);
  flSnap.forEach((d) => {
    const e = d.data();
    console.log(`  - ${e.createdAt?.toDate?.()?.toISOString?.()}: ${JSON.stringify(e.after)}`);
  });

  // 4. Audit any login attempts cho gdkd
  console.log(`\n=== Login rate limit events (last 30) ===`);
  const loginSnap = await db.collection('auditLogs')
    .where('action', '==', 'login_rate_limit_uid')
    .orderBy('createdAt', 'desc')
    .limit(30).get();
  console.log(`Found ${loginSnap.size} events`);
  loginSnap.forEach((d) => {
    const e = d.data();
    console.log(`  - ${e.createdAt?.toDate?.()?.toISOString?.()} uid=${e.userId} ${JSON.stringify(e.after)}`);
  });
}

main().catch((e) => {
  console.error('Failed:', e);
  process.exit(1);
});
