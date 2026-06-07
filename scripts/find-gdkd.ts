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

  // Dump tất cả users — sample 5 doc để xem schema
  const snap = await db.collection('users').limit(5).get();
  console.log(`Sample 5 users (showing field names):`);
  snap.forEach((d) => {
    const x = d.data();
    console.log(`\nUID: ${d.id}`);
    console.log(`  Keys: ${Object.keys(x).join(', ')}`);
    console.log(`  roleId: ${x.roleId} | role: ${x.role} | role_code: ${x.role_code} | roleCode: ${x.roleCode}`);
    console.log(`  email: ${x.email} displayName: ${x.displayName}`);
  });

  // Roles distinct
  console.log(`\n=== Distinct roleId values ===`);
  const allUsers = await db.collection('users').get();
  const roleSet = new Set<string>();
  let totalUsers = 0;
  let withFcm = 0;
  let gdkdCandidate: any = null;
  allUsers.forEach((d) => {
    totalUsers++;
    const x = d.data();
    const r = x.roleId || x.role || x.role_code || x.roleCode;
    if (r) roleSet.add(String(r));
    const devices = Array.isArray(x.fcmDevices) ? x.fcmDevices : [];
    const legacy = Array.isArray(x.fcmTokens) ? x.fcmTokens : [];
    if (devices.length > 0 || legacy.length > 0) withFcm++;
    // Tìm user có displayName/email chứa "gdkd" hoặc role chứa "GD"
    const dn = (x.displayName ?? '').toLowerCase();
    const em = (x.email ?? '').toLowerCase();
    if (dn.includes('gdkd') || em.includes('gdkd') || dn.includes('giam doc kd') || (r && String(r).toUpperCase().includes('GD'))) {
      if (!gdkdCandidate) {
        gdkdCandidate = { uid: d.id, ...x };
      }
    }
  });
  console.log(`Total users: ${totalUsers}`);
  console.log(`Users with FCM token: ${withFcm}`);
  console.log(`Roles found: ${[...roleSet].sort().join(', ')}`);

  if (gdkdCandidate) {
    console.log(`\n=== GD candidate ===`);
    console.log(`  UID: ${gdkdCandidate.uid}`);
    console.log(`  email: ${gdkdCandidate.email}`);
    console.log(`  displayName: ${gdkdCandidate.displayName}`);
    console.log(`  roleId: ${gdkdCandidate.roleId} role: ${gdkdCandidate.role} role_code: ${gdkdCandidate.role_code}`);
    console.log(`  status: ${gdkdCandidate.status}`);
    const devices = Array.isArray(gdkdCandidate.fcmDevices) ? gdkdCandidate.fcmDevices : [];
    const legacy = Array.isArray(gdkdCandidate.fcmTokens) ? gdkdCandidate.fcmTokens : [];
    console.log(`  fcmDevices: ${devices.length} entries`);
    devices.forEach((d: any, i: number) => {
      console.log(`    [${i}] token=${(d.token ?? '').slice(0, 25)}... enabled=${d.enabled !== false} label=${d.label} lastSeen=${d.lastSeen}`);
    });
    console.log(`  fcmTokens (legacy): ${legacy.length} entries`);
    legacy.forEach((t: string, i: number) => {
      console.log(`    [${i}] ${(t ?? '').slice(0, 25)}...`);
    });
  } else {
    console.log(`\n(no user matching gdkd / GD found)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
