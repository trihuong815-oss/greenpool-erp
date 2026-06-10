// E2E Permission Matrix Test — verify CANONICAL flow cho mọi user lãnh đạo.
//
// 1. Load các test docs đã tạo (Case A/B/C/D)
// 2. Cho mỗi role lãnh đạo, simulate canApproveTask + canCreateAssignment +
//    canCreateProposal logic theo lib/firebase/tasks-scope.ts.
// 3. Report ma trận: ai có nút duyệt cho doc nào, ai có thể tạo gì.

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

interface UserCtx {
  uid: string;
  role: string;
  name: string;
  email: string;
  block: 'KD' | 'VP' | 'all' | null;
}

const ROLE_BLOCK: Record<string, 'KD' | 'VP' | 'all'> = {
  ADMIN: 'all', CEO: 'all',
  GD_KD: 'KD', GD_VP: 'VP',
  TP_KT: 'KD', TP_DT: 'KD', TP_MKT: 'KD',
  TP_KE: 'VP', TP_NS: 'VP', TP_GS: 'VP',
  PP_HT: 'KD', PP_XLN: 'KD',
  QLCS_HM: 'KD', QLCS_TK: 'KD', QLCS_CTT: 'KD', QLCS_24NCT: 'KD', QLCS_TT: 'KD',
};

function getBlockOf(role: string): 'KD' | 'VP' | 'all' | null {
  return ROLE_BLOCK[role] ?? null;
}

function isCEO(p: UserCtx): boolean { return p.role === 'CEO' || p.role === 'ADMIN'; }
function isGD(p: UserCtx): boolean { return p.role === 'GD_KD' || p.role === 'GD_VP'; }

/** Mô phỏng canApproveTask đúng spec 4-layer override Phase Stability 2026-06-09. */
function canApproveTask(p: UserCtx, t: any): boolean {
  if (t.status !== 'pending_approval') return false;
  if (p.role === 'ADMIN') return true; // adminSystem bypass mọi rule
  if (t.createdBy === p.uid) return false; // creator không tự duyệt
  if ((t.assigneeUserIds ?? []).includes(p.uid)) return false;

  const myBlock = getBlockOf(p.role);
  const sameBlock = !!myBlock && myBlock !== 'all'
    && (t.assigneeBlock === myBlock || t.createdByBlock === myBlock);
  const canOverrideAsGd = isGD(p) && sameBlock;

  const cur: string | null = t.currentApprover;
  if (cur) {
    if (cur.startsWith('user:')) {
      if (cur.slice(5) === p.uid) return true;
      if (canOverrideAsGd) return true;
      if (isCEO(p)) return true;
      return false;
    }
    // role-key or legacy
    const roleCode = cur.startsWith('role:') ? cur.slice(5) : cur;
    if (roleCode === p.role) return true;
    if (canOverrideAsGd) return true;
    if (isCEO(p)) return true;
    return false;
  }
  return canOverrideAsGd || isCEO(p);
}

function canCreateProposal(role: string): boolean {
  if (role === 'CEO') return false;
  if (role === 'ADMIN') return true;
  return /^(GD_|TP_|QLCS_)/.test(role);
}

function canCreateAssignment(role: string): boolean {
  return role === 'ADMIN' || role === 'CEO' || /^GD_/.test(role);
}

async function loadUser(db: any, uid: string): Promise<UserCtx | null> {
  const d = await db.collection('users').doc(uid).get();
  if (!d.exists) return null;
  const x = d.data();
  return {
    uid: d.id, role: x.roleId, name: x.displayName,
    email: x.email, block: ROLE_BLOCK[x.roleId] ?? null,
  };
}

async function loadUserByRole(db: any, role: string): Promise<UserCtx | null> {
  const s = await db.collection('users').where('status','==','active').where('roleId','==',role).limit(1).get();
  if (s.empty) return null;
  return loadUser(db, s.docs[0].id);
}

async function main() {
  initAdmin();
  const db = getFirestore();

  const TEST_DOC_IDS = {
    A: 'cuEDlDBRxBTv8263P3ER', // Đề xuất same-block KD
    B: 'DZLsr4e8rMztJGQF2x6g', // Đề xuất CROSS-BLOCK KD→VP
    C: 'OfbB1NIkFUiaBikRokdN', // Giao việc same-block
    D: 'KtBU5r5NRfFmMUIEBg5x', // Giao việc CROSS-BLOCK VP→KD
  };

  console.log(`${'═'.repeat(75)}`);
  console.log(`  PERMISSION MATRIX TEST — toàn hệ thống`);
  console.log(`${'═'.repeat(75)}`);

  const CRITICAL_ROLES = ['ADMIN','CEO','GD_VP','TP_KT','TP_DT','TP_MKT','TP_KE','TP_NS','TP_GS','PP_HT','PP_XLN','QLCS_HM','QLCS_TK','QLCS_CTT','QLCS_24NCT','QLCS_TT'];
  const users: UserCtx[] = [];
  for (const r of CRITICAL_ROLES) {
    const u = await loadUserByRole(db, r);
    if (u) users.push(u);
  }

  // ── Test 1: Quyền TẠO ──
  console.log(`\n[1] Permission tạo Đề xuất / Giao việc`);
  console.log(`Role          | Tạo ĐX | Tạo Giao việc`);
  console.log(`-`.repeat(45));
  for (const u of users) {
    const p = canCreateProposal(u.role) ? '✓' : '❌';
    const a = canCreateAssignment(u.role) ? '✓' : '❌';
    console.log(`${u.role.padEnd(13)} |   ${p}    |   ${a}`);
  }
  console.log(`\nSpec check:`);
  console.log(`  - CEO: KHÔNG tạo ĐX (cấp cao nhất), CÓ giao việc — chỉ cho GĐ Khối`);
  console.log(`  - ADMIN: tạo cả 2 (đảm nhiệm GĐ_KD thực tế)`);
  console.log(`  - GĐ Khối: tạo cả 2`);
  console.log(`  - TP/QLCS: tạo ĐX nhưng KHÔNG tạo giao việc`);

  // ── Test 2: Ma trận canApproveTask ──
  for (const [caseLabel, docId] of Object.entries(TEST_DOC_IDS)) {
    const doc = await db.collection('tasks').doc(docId).get();
    if (!doc.exists) {
      console.log(`\n[2-${caseLabel}] doc ${docId} không tồn tại — bỏ qua`);
      continue;
    }
    const t = doc.data() as any;
    console.log(`\n[2-${caseLabel}] Case ${caseLabel}: "${t.title}"`);
    console.log(`  status=${t.status}  currentApprover=${t.currentApprover}`);
    console.log(`  createdBy=${t.createdBy.slice(0,8)}... (${t.createdByRole}/${t.createdByBlock})  assigneeBlock=${t.assigneeBlock}`);

    console.log(`\n  Role          | uid8       | canApprove | Lý do`);
    console.log(`  ${'-'.repeat(75)}`);
    for (const u of users) {
      const can = canApproveTask(u, t);
      let reason = '';
      if (t.status !== 'pending_approval') reason = 'task không pending_approval';
      else if (t.createdBy === u.uid) reason = 'creator không tự duyệt';
      else if ((t.assigneeUserIds ?? []).includes(u.uid)) reason = 'assignee không duyệt';
      else if (can) {
        const myBlock = getBlockOf(u.role);
        const cur: string = t.currentApprover ?? '';
        if (cur.startsWith('user:') && cur.slice(5) === u.uid) reason = 'chính chủ uid';
        else if (cur === `role:${u.role}`) reason = 'chính chủ role';
        else if (isCEO(u)) reason = 'CEO/ADMIN override';
        else if (isGD(u) && myBlock && (t.assigneeBlock === myBlock || t.createdByBlock === myBlock)) reason = 'GĐ same-block override';
      } else {
        reason = 'không có quyền';
      }
      const flag = can ? '✓' : '·';
      console.log(`  ${u.role.padEnd(13)} | ${u.uid.slice(0,8)}... |     ${flag}      | ${reason}`);
    }
  }

  console.log(`\n${'═'.repeat(75)}`);
  console.log(`  KẾT LUẬN`);
  console.log(`${'═'.repeat(75)}`);
  console.log(`  Anh review ma trận trên — mỗi case phải có ít nhất 1 ✓ để chain advance được.`);
  console.log(`  ADMIN luôn có ✓ → đảm bảo không kẹt khi user vắng (4-layer override).`);
  console.log(`  Chính chủ + GĐ same-block + CEO/ADMIN tạo ra 4 lớp fallback.`);
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
