// Migration CTT: tách "Bể trong nhà" và "Bể ngoài trời" thành 2 sub-group mỗi bể:
//   - "Bể X - Thẻ member" (giữ groupId hiện có, rename)
//   - "Bể X - Thẻ tích lượt" (tạo group mới, di chuyển package lượt sang)
// Xóa 2 group cũ thừa (Thẻ member bơi + Thẻ tích lượt) + 11 records vô nghĩa + 18 packages thuộc.
//
// Anh chốt 2026-06-04: KHÔNG mất số liệu, sắp xếp nhỏ → lớn.
//
// Run: GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin-sa.json npx tsx scripts/migrate-ctt-pool-groups.ts

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('./secrets/firebase-admin-sa.json', 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
}
const db = getFirestore();

// Hardcoded constants
const BRANCH = 'CTT';
const OLD_MEMBER_GROUP = '1LLqWvNasmrVBNZ54Us6'; // Thẻ member bơi (vô nghĩa, xóa)
const OLD_TICH_LUOT_GROUP = 'BiVMfiMvTZN9saUOWyDF'; // Thẻ tích lượt (vô nghĩa, xóa)
const POOL_INDOOR_GROUP = 'IrXz3PB0AP7Sn4UyzX5S'; // Bể trong nhà → sẽ rename + chỉ giữ packages member
const POOL_OUTDOOR_GROUP = 'nltxEgMdo9iI5IeETgXU'; // Bể ngoài trời → tương tự

// Pattern detect package type (lượt vs member)
function isTichLuot(name: string): boolean {
  return /lượt|luot/i.test(name);
}

// Parse số trong tên package để sort
// "Gói 1 tháng" → 1 (months)
// "Gói 1 năm" → 12 (months)
// "5 lượt" → 5
// "Gói 60 lượt" → 60
function getPackageSortKey(name: string): number {
  const luotMatch = name.match(/(\d+)\s*lượt/i);
  if (luotMatch) return parseInt(luotMatch[1], 10);
  const yearMatch = name.match(/(\d+)\s*năm/i);
  if (yearMatch) return parseInt(yearMatch[1], 10) * 12;
  const monthMatch = name.match(/(\d+)\s*tháng/i);
  if (monthMatch) return parseInt(monthMatch[1], 10);
  return 999;
}

async function main() {
  const DRY = process.argv.includes('--dry-run');
  console.log(DRY ? '🔍 DRY-RUN mode' : '⚡ APPLY mode');

  // 1. Load all CTT packages with their current group
  const pkgsSnap = await db.collection('packages').where('branchId', '==', BRANCH).get();
  const packages = pkgsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  // 2. Categorize packages by current group
  const memberBoiPkgs = packages.filter((p) => p.groupId === OLD_MEMBER_GROUP);
  const tichLuotPkgs = packages.filter((p) => p.groupId === OLD_TICH_LUOT_GROUP);
  const indoorPkgs = packages.filter((p) => p.groupId === POOL_INDOOR_GROUP);
  const outdoorPkgs = packages.filter((p) => p.groupId === POOL_OUTDOOR_GROUP);

  console.log(`\n📦 Old "Thẻ member bơi" (xóa): ${memberBoiPkgs.length} packages`);
  memberBoiPkgs.forEach((p) => console.log(`  - ${p.name}`));
  console.log(`\n📦 Old "Thẻ tích lượt" (xóa): ${tichLuotPkgs.length} packages`);
  tichLuotPkgs.forEach((p) => console.log(`  - ${p.name}`));

  // 3. Split indoor + outdoor packages by type
  const indoorMember = indoorPkgs.filter((p) => !isTichLuot(p.name));
  const indoorTichLuot = indoorPkgs.filter((p) => isTichLuot(p.name));
  const outdoorMember = outdoorPkgs.filter((p) => !isTichLuot(p.name));
  const outdoorTichLuot = outdoorPkgs.filter((p) => isTichLuot(p.name));

  console.log(`\n🏊 Bể trong nhà - Thẻ member (${indoorMember.length}):`);
  indoorMember.sort((a, b) => getPackageSortKey(a.name) - getPackageSortKey(b.name))
    .forEach((p) => console.log(`  ${getPackageSortKey(p.name).toString().padStart(3)} ← ${p.name}`));
  console.log(`\n🏊 Bể trong nhà - Thẻ tích lượt (${indoorTichLuot.length}):`);
  indoorTichLuot.sort((a, b) => getPackageSortKey(a.name) - getPackageSortKey(b.name))
    .forEach((p) => console.log(`  ${getPackageSortKey(p.name).toString().padStart(3)} ← ${p.name}`));
  console.log(`\n🌊 Bể ngoài trời - Thẻ member (${outdoorMember.length}):`);
  outdoorMember.sort((a, b) => getPackageSortKey(a.name) - getPackageSortKey(b.name))
    .forEach((p) => console.log(`  ${getPackageSortKey(p.name).toString().padStart(3)} ← ${p.name}`));
  console.log(`\n🌊 Bể ngoài trời - Thẻ tích lượt (${outdoorTichLuot.length}):`);
  outdoorTichLuot.sort((a, b) => getPackageSortKey(a.name) - getPackageSortKey(b.name))
    .forEach((p) => console.log(`  ${getPackageSortKey(p.name).toString().padStart(3)} ← ${p.name}`));

  // 4. Audit packageQuantities to be moved
  const pqSnap = await db.collection('packageQuantities').where('branchId', '==', BRANCH).get();
  const oldPq = pqSnap.docs.filter((d) => {
    const x = d.data();
    return x.groupId === OLD_MEMBER_GROUP || x.groupId === OLD_TICH_LUOT_GROUP;
  });
  console.log(`\n🗑️  Old packageQuantities records (xóa): ${oldPq.length}`);
  let totalRev = 0;
  for (const d of oldPq) totalRev += (d.data().revenue || 0);
  console.log(`   Total revenue trong các record xóa: ${totalRev.toLocaleString('vi-VN')} (phải = 0)`);

  // packageQuantities cần update groupId (đã thuộc Bể trong/ngoài, nay phải point đến sub-group)
  const indoorPqDocs = pqSnap.docs.filter((d) => d.data().groupId === POOL_INDOOR_GROUP);
  const outdoorPqDocs = pqSnap.docs.filter((d) => d.data().groupId === POOL_OUTDOOR_GROUP);
  console.log(`\n📝 packageQuantities cần update: indoor=${indoorPqDocs.length}, outdoor=${outdoorPqDocs.length}`);

  if (DRY) {
    console.log('\n✅ Dry-run xong. Chạy lại không có --dry-run để apply.');
    return;
  }

  // ═══════════════════════════════════════════════════════════
  // APPLY STAGE
  // ═══════════════════════════════════════════════════════════

  const batch = db.batch();

  // Step A: Create 2 new groups for "Thẻ tích lượt"
  const newIndoorLuotRef = db.collection('packageGroups').doc();
  const newOutdoorLuotRef = db.collection('packageGroups').doc();
  batch.set(newIndoorLuotRef, {
    branchId: BRANCH,
    name: 'Bể trong nhà - Thẻ tích lượt',
    order: 2,
  });
  batch.set(newOutdoorLuotRef, {
    branchId: BRANCH,
    name: 'Bể ngoài trời - Thẻ tích lượt',
    order: 4,
  });

  // Step B: Rename existing groups
  batch.update(db.collection('packageGroups').doc(POOL_INDOOR_GROUP), {
    name: 'Bể trong nhà - Thẻ member',
    order: 1,
  });
  batch.update(db.collection('packageGroups').doc(POOL_OUTDOOR_GROUP), {
    name: 'Bể ngoài trời - Thẻ member',
    order: 3,
  });

  // Step C: Move "lượt" packages from indoor/outdoor parent to new sub-groups
  for (const p of indoorTichLuot) {
    batch.update(db.collection('packages').doc(p.id), {
      groupId: newIndoorLuotRef.id,
      order: getPackageSortKey(p.name),
    });
  }
  for (const p of outdoorTichLuot) {
    batch.update(db.collection('packages').doc(p.id), {
      groupId: newOutdoorLuotRef.id,
      order: getPackageSortKey(p.name),
    });
  }
  // Set order cho member packages (giữ groupId)
  for (const p of indoorMember) {
    batch.update(db.collection('packages').doc(p.id), {
      order: getPackageSortKey(p.name),
    });
  }
  for (const p of outdoorMember) {
    batch.update(db.collection('packages').doc(p.id), {
      order: getPackageSortKey(p.name),
    });
  }

  // Step D: Update packageQuantities for moved packages (groupId/groupName)
  const indoorLuotIds = new Set(indoorTichLuot.map((p) => p.id));
  const outdoorLuotIds = new Set(outdoorTichLuot.map((p) => p.id));
  for (const d of indoorPqDocs) {
    const x = d.data();
    if (indoorLuotIds.has(x.packageId)) {
      batch.update(d.ref, {
        groupId: newIndoorLuotRef.id,
        groupName: 'Bể trong nhà - Thẻ tích lượt',
      });
    } else {
      batch.update(d.ref, { groupName: 'Bể trong nhà - Thẻ member' });
    }
  }
  for (const d of outdoorPqDocs) {
    const x = d.data();
    if (outdoorLuotIds.has(x.packageId)) {
      batch.update(d.ref, {
        groupId: newOutdoorLuotRef.id,
        groupName: 'Bể ngoài trời - Thẻ tích lượt',
      });
    } else {
      batch.update(d.ref, { groupName: 'Bể ngoài trời - Thẻ member' });
    }
  }

  // Step E: Delete old groups + their packages + vô nghĩa packageQuantities
  for (const p of memberBoiPkgs) {
    batch.delete(db.collection('packages').doc(p.id));
  }
  for (const p of tichLuotPkgs) {
    batch.delete(db.collection('packages').doc(p.id));
  }
  batch.delete(db.collection('packageGroups').doc(OLD_MEMBER_GROUP));
  batch.delete(db.collection('packageGroups').doc(OLD_TICH_LUOT_GROUP));
  for (const d of oldPq) {
    batch.delete(d.ref);
  }

  await batch.commit();
  console.log('\n✅ Migration completed!');
  console.log(`   Created: 2 groups (${newIndoorLuotRef.id}, ${newOutdoorLuotRef.id})`);
  console.log(`   Renamed: 2 groups`);
  console.log(`   Moved packages: ${indoorTichLuot.length + outdoorTichLuot.length}`);
  console.log(`   Updated packageQuantities: ${indoorPqDocs.length + outdoorPqDocs.length}`);
  console.log(`   Deleted: ${memberBoiPkgs.length + tichLuotPkgs.length} orphan packages + 2 old groups + ${oldPq.length} junk records`);
}

main().catch((e) => { console.error(e); process.exit(1); });
