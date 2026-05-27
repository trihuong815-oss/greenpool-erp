// Seed package catalog từ ảnh user: 5 groups × packages × 5 cơ sở.
// Idempotent: skip nếu group/package đã tồn tại (theo branchId + name).
// Mặc định DRY-RUN. --apply để ghi.
//
// Sau seed: admin sẽ vào /doanh-so/packages để add/remove gói theo cơ sở.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const APPLY = process.argv.includes('--apply');
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }), projectId: sa.project_id });
}
const db = getFirestore();

const BRANCHES = ['HM', 'TK', 'CTT', '24', 'TT'] as const;

interface PackageDef { name: string; defaultPrice: number; }
interface GroupDef { name: string; sortOrder: number; packages: PackageDef[]; }

const GROUPS: GroupDef[] = [
  {
    name: 'Thẻ member bơi', sortOrder: 10,
    packages: [
      { name: 'Thẻ 1 tháng',  defaultPrice: 1_200_000 },
      { name: 'Thẻ 3 tháng',  defaultPrice: 2_500_000 },
      { name: 'Thẻ 6 tháng',  defaultPrice: 4_500_000 },
      { name: 'Thẻ 1 năm',    defaultPrice: 7_500_000 },
      { name: 'Thẻ 2 năm',    defaultPrice: 14_000_000 },
      { name: 'Thẻ 3 năm',    defaultPrice: 19_500_000 },
      { name: 'Thẻ 5 năm',    defaultPrice: 30_000_000 },
    ],
  },
  {
    name: 'Thẻ tích lượt', sortOrder: 20,
    packages: [
      { name: '10 lượt',  defaultPrice: 500_000 },
      { name: '15 lượt',  defaultPrice: 700_000 },
      { name: '30 lượt',  defaultPrice: 1_200_000 },
      { name: '50 lượt',  defaultPrice: 1_900_000 },
      { name: '60 lượt',  defaultPrice: 2_200_000 },
      { name: '90 lượt',  defaultPrice: 3_100_000 },
      { name: '100 lượt', defaultPrice: 3_400_000 },
      { name: '120 lượt', defaultPrice: 3_900_000 },
      { name: '200 lượt', defaultPrice: 6_000_000 },
      { name: '240 lượt', defaultPrice: 7_000_000 },
    ],
  },
  {
    name: 'Thẻ học bơi', sortOrder: 30,
    packages: [
      { name: 'Học bơi cơ bản trẻ em',     defaultPrice: 2_500_000 },
      { name: 'Học bơi cơ bản người lớn',  defaultPrice: 3_000_000 },
      { name: 'Học bơi chất lượng cao TE', defaultPrice: 4_500_000 },
      { name: 'Học bơi chất lượng cao NL', defaultPrice: 5_500_000 },
      { name: 'Học bơi PT',                defaultPrice: 7_000_000 },
      { name: 'Học bơi Thang Long Kid',    defaultPrice: 5_000_000 },
      { name: 'Học bơi Thang Long Aqua',   defaultPrice: 6_000_000 },
    ],
  },
  {
    name: 'Thẻ member Fitness', sortOrder: 40,
    packages: [
      { name: '1 tháng fitness',  defaultPrice: 800_000 },
      { name: '3 tháng fitness',  defaultPrice: 2_000_000 },
      { name: '6 tháng fitness',  defaultPrice: 3_600_000 },
      { name: '1 năm fitness',    defaultPrice: 6_500_000 },
      { name: '2 năm fitness',    defaultPrice: 12_000_000 },
      { name: '3 năm fitness',    defaultPrice: 17_000_000 },
      { name: '5 năm fitness',    defaultPrice: 26_000_000 },
    ],
  },
  {
    name: 'Thẻ lặn', sortOrder: 50,
    packages: [
      { name: 'Free Diving', defaultPrice: 8_000_000 },
      { name: 'Mermaid',     defaultPrice: 10_000_000 },
    ],
  },
];

async function existingGroup(branchId: string, name: string): Promise<string | null> {
  const snap = await db.collection('packageGroups')
    .where('branchId', '==', branchId).where('name', '==', name).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

async function existingPackage(branchId: string, groupId: string, name: string): Promise<string | null> {
  const snap = await db.collection('packages')
    .where('branchId', '==', branchId).where('groupId', '==', groupId).where('name', '==', name).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

async function main() {
  console.log(`=== Seed Package Catalog ===`);
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

  const now = new Date();
  let groupsCreated = 0, groupsExisted = 0;
  let pkgsCreated = 0, pkgsExisted = 0;

  for (const branchId of BRANCHES) {
    console.log(`\n--- Branch ${branchId} ---`);
    for (const grp of GROUPS) {
      let groupId = await existingGroup(branchId, grp.name);
      if (groupId) {
        groupsExisted++;
        console.log(`  ~ group "${grp.name}" exists (${groupId.slice(0,8)})`);
      } else if (APPLY) {
        const ref = await db.collection('packageGroups').add({
          name: grp.name, branchId, sortOrder: grp.sortOrder, active: true,
          createdAt: now, createdBy: 'seed-script',
          updatedAt: now, updatedBy: 'seed-script',
        });
        groupId = ref.id;
        groupsCreated++;
        console.log(`  + group "${grp.name}" → ${groupId.slice(0,8)}`);
      } else {
        groupId = `would-create-${groupsCreated}`;
        groupsCreated++;
        console.log(`  + group "${grp.name}" (dry-run)`);
      }

      for (let i = 0; i < grp.packages.length; i++) {
        const pkg = grp.packages[i];
        const existId = await existingPackage(branchId, groupId, pkg.name);
        if (existId) {
          pkgsExisted++;
          continue;
        }
        if (APPLY) {
          await db.collection('packages').add({
            name: pkg.name, groupId, branchId,
            defaultPrice: pkg.defaultPrice, sortOrder: i + 1, active: true,
            createdAt: now, createdBy: 'seed-script',
            updatedAt: now, updatedBy: 'seed-script',
          });
        }
        pkgsCreated++;
      }
    }
  }

  console.log(`\nGroups:   created=${groupsCreated}  exists=${groupsExisted}`);
  console.log(`Packages: created=${pkgsCreated}  exists=${pkgsExisted}`);
  if (!APPLY) console.log(`\n→ Dry-run xong. Re-run với --apply.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('LỖI:', e); process.exit(1); });
