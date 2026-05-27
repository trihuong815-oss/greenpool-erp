// Test scope helper với 3 profile mẫu trên data Firestore thật.
// Chạy:  npx --yes tsx scripts/test-checklist-scope.ts

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

import {
  matchesScope, canApproveInstance, isTerminal, isAdmin, isQLCS, isTP,
  type CallerProfile, type InstanceForScope,
} from '../lib/firebase/checklist-scope';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS!;
const sa = JSON.parse(readFileSync(resolve(process.cwd(), credPath), 'utf8'));
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      privateKey: sa.private_key,
    }),
  });
}
const db = getFirestore();

const PROFILES: Record<string, CallerProfile> = {
  CEO: {
    uid: 'ceo-test', role_code: 'CEO',
    facility_id: null, department_id: null,
    shift_assignment: null, is_shared_shift_account: false,
  },
  QLCS_HM: {
    uid: 'qlcs-hm-test', role_code: 'QLCS_HM',
    facility_id: 'HM', department_id: null,
    shift_assignment: null, is_shared_shift_account: false,
  },
  QLCS_TT: {
    uid: 'qlcs-tt-test', role_code: 'QLCS_TT',
    facility_id: 'TT', department_id: null,
    shift_assignment: null, is_shared_shift_account: false,
  },
  TT_AS: {
    uid: 'tt-as-test', role_code: 'TT_AS',
    facility_id: 'HM', department_id: 'AS',
    shift_assignment: null, is_shared_shift_account: false,
  },
};

interface Sample {
  id: string;
  facility_id: string | null;
  department_id: string | null;
  status: string;
  shift_type: string | null;
  assigned_to: string | null;
}

function toScope(s: Sample): InstanceForScope {
  return {
    facility_id: s.facility_id,
    department_id: s.department_id,
    shift_type: s.shift_type,
    assigned_to: s.assigned_to,
    status: s.status,
  };
}

async function main() {
  // Lấy mẫu instances: lấy đa dạng facility
  const snap = await db.collection('checklistInstances').limit(20).get();
  const samples: Sample[] = snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      facility_id: x.facility_id ?? null,
      department_id: x.department_id ?? null,
      status: x.status ?? 'pending',
      shift_type: x.shift_type ?? null,
      assigned_to: x.assigned_to ?? null,
    };
  });

  // Đếm facility distribution
  const byFac: Record<string, number> = {};
  samples.forEach((s) => {
    const k = s.facility_id ?? 'null';
    byFac[k] = (byFac[k] ?? 0) + 1;
  });
  console.log('Sample instances by facility:', byFac);
  console.log('');

  // Test role identification
  console.log('=== Role identification ===');
  for (const [name, p] of Object.entries(PROFILES)) {
    console.log(`  ${name}: isAdmin=${isAdmin(p)} isQLCS=${isQLCS(p)} isTP=${isTP(p)}`);
  }
  console.log('');

  // Test scope cho 1 instance đại diện mỗi facility
  const reps: Record<string, Sample> = {};
  for (const s of samples) {
    if (s.facility_id && !reps[s.facility_id]) reps[s.facility_id] = s;
  }

  console.log('=== matchesScope (read) ===');
  console.log('Format: profile → [HM TK CTT 24 TT] (kỳ vọng)');
  for (const [name, p] of Object.entries(PROFILES)) {
    const results = Object.entries(reps).map(([fac, inst]) => {
      const ok = matchesScope(p, toScope(inst));
      return `${fac}=${ok ? '✓' : '✗'}`;
    });
    console.log(`  ${name.padEnd(10)} → ${results.join('  ')}`);
  }
  console.log('');

  console.log('Expectation:');
  console.log('  CEO      → tất cả ✓');
  console.log('  QLCS_HM  → chỉ HM ✓, còn lại ✗');
  console.log('  QLCS_TT  → chỉ TT ✓, còn lại ✗');
  console.log('  TT_AS    → tất cả ✗ (trừ instance assigned trực tiếp)');
  console.log('');

  console.log('=== canApproveInstance ===');
  for (const [name, p] of Object.entries(PROFILES)) {
    const results = Object.entries(reps).map(([fac, inst]) => {
      const ok = canApproveInstance(p, toScope(inst));
      return `${fac}=${ok ? '✓' : '✗'}`;
    });
    console.log(`  ${name.padEnd(10)} → ${results.join('  ')}`);
  }
  console.log('');
  console.log('Expectation:');
  console.log('  CEO      → tất cả ✓');
  console.log('  QLCS_HM  → chỉ HM ✓');
  console.log('  QLCS_TT  → chỉ TT ✓');
  console.log('  TT_AS    → tất cả ✗ (Tổ trưởng không approve)');
  console.log('');

  // Test với assigned_to trực tiếp
  const assignedToTT_AS: Sample = { ...samples[0], assigned_to: PROFILES.TT_AS.uid };
  console.log('=== assigned_to override (TT_AS với instance được giao đích danh) ===');
  console.log(`  matchesScope = ${matchesScope(PROFILES.TT_AS, toScope(assignedToTT_AS))}  (kỳ vọng ✓)`);
  console.log(`  canApprove   = ${canApproveInstance(PROFILES.TT_AS, toScope(assignedToTT_AS))}  (kỳ vọng ✗ — vẫn không approve được)`);
  console.log('');

  // Test isTerminal
  console.log('=== isTerminal ===');
  for (const st of ['pending', 'in_progress', 'submitted', 'approved', 'failed', 'rejected']) {
    console.log(`  ${st.padEnd(13)} → ${isTerminal(st)}`);
  }
  console.log('  (kỳ vọng: submitted/approved/failed = true; pending/in_progress/rejected = false)');
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('LỖI:', e);
  process.exit(1);
});
