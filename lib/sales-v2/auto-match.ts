// Auto-match logic cho transactionType='thanh_toan_not'.
// Phase 4 (2026-06-17).
//
// Workflow: sau khi kế toán duyệt batch → scan tx 'thanh_toan_not' có
// matchStatus='pending' → tìm tx cũ approved cùng (branchId + phone + packageCode + customerName)
// còn debtAmount > 0.
//
// Match key: phone + packageCode (Firestore where 2 field — auto-index single equality),
//            sau đó filter client-side branchId + customerName + status + còn nợ.
//
// 3 case xử lý:
//   - 1 match → auto-link: tx.matchedTransactionId + target.debtAmount giảm
//   - N match → matchStatus='needs_review' (kế toán chọn manual)
//   - 0 match → matchStatus='no_match' ("cần kiểm tra")

import 'server-only';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeSalesAudit } from './audit';

export interface MatchCandidate {
  id: string;
  date: string;
  customerName: string;
  packageName: string;
  packageValue: number;
  collectedToday: number;
  debtAmount: number;
  transactionType: string;
  createdAt: string;
}

function normalizeName(s: string): string {
  return String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Tìm candidates cho 1 tx 'thanh_toan_not'.
 *  V6 (2026-06-17) workflow link:
 *    1. ƯU TIÊN: nếu tx có receiptNo → tìm tx cũ approved cùng branchId + receiptNo
 *       (chính xác nhất — Sale nhập số phiếu thu cũ để link)
 *    2. Fallback: branchId + phone + packageId + customerName (cho trường hợp Sale
 *       không có/quên số phiếu thu)
 */
export async function findMatchCandidates(
  db: Firestore,
  tx: {
    id: string;
    branchId: string;
    phone: string;
    packageId: string;
    customerName: string;
    receiptNo?: string | null;
  },
): Promise<MatchCandidate[]> {
  // CÁCH 1: match by receiptNo (Sale nhập số phiếu thu cũ)
  if (tx.receiptNo) {
    const snap = await db.collection(COLLECTIONS.SALES_TRANSACTIONS)
      .where('receiptNo', '==', tx.receiptNo)
      .get();
    const out: MatchCandidate[] = [];
    for (const d of snap.docs) {
      if (d.id === tx.id) continue;
      const x = d.data() as Record<string, any>;
      if (x.branchId !== tx.branchId) continue;
      if (x.reviewStatus !== 'approved') continue;
      const debt = Number(x.debtAmount ?? 0);
      if (debt <= 0) continue;
      out.push({
        id: d.id,
        date: String(x.date ?? ''),
        customerName: String(x.customerName ?? ''),
        packageName: String(x.packageName ?? ''),
        packageValue: Number(x.packageValue ?? 0),
        collectedToday: Number(x.collectedToday ?? 0),
        debtAmount: debt,
        transactionType: String(x.transactionType ?? ''),
        createdAt: x.createdAt?.toDate?.()?.toISOString?.() ?? String(x.createdAt ?? ''),
      });
    }
    if (out.length > 0) {
      out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return out;
    }
    // receiptNo nhập sai → fallback tìm theo cách cũ
  }

  // CÁCH 2 (fallback): branchId + phone + packageId + customerName
  if (!tx.phone || !tx.packageId) return [];
  const snap = await db.collection(COLLECTIONS.SALES_TRANSACTIONS)
    .where('phone', '==', tx.phone)
    .get();

  const targetName = normalizeName(tx.customerName);
  const out: MatchCandidate[] = [];
  for (const d of snap.docs) {
    if (d.id === tx.id) continue;
    const x = d.data() as Record<string, any>;
    if (x.branchId !== tx.branchId) continue;
    if (String(x.packageId ?? '') !== tx.packageId) continue;
    if (normalizeName(x.customerName) !== targetName) continue;
    if (x.reviewStatus !== 'approved') continue;
    const debt = Number(x.debtAmount ?? 0);
    if (debt <= 0) continue;
    out.push({
      id: d.id,
      date: String(x.date ?? ''),
      customerName: String(x.customerName ?? ''),
      packageName: String(x.packageName ?? ''),
      packageValue: Number(x.packageValue ?? 0),
      collectedToday: Number(x.collectedToday ?? 0),
      debtAmount: debt,
      transactionType: String(x.transactionType ?? ''),
      createdAt: x.createdAt?.toDate?.()?.toISOString?.() ?? String(x.createdAt ?? ''),
    });
  }
  out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return out;
}

/** Auto-match TẤT CẢ tx 'thanh_toan_not' của 1 batch sau khi approve.
 *  - 1 candidate: auto-link, giảm target.debt
 *  - N candidates: matchStatus='needs_review' (kế toán chọn sau)
 *  - 0: matchStatus='no_match'
 *  Fire-and-forget — không throw nếu fail (log only).
 */
export async function runAutoMatchForBatch(
  db: Firestore,
  batchId: string,
  actor: { uid: string; name: string },
): Promise<{ matched: number; needsReview: number; noMatch: number }> {
  const result = { matched: 0, needsReview: 0, noMatch: 0 };
  try {
    const txSnap = await db.collection(COLLECTIONS.SALES_TRANSACTIONS)
      .where('batchId', '==', batchId)
      .get();

    const targets = txSnap.docs.filter((d) => {
      const x = d.data();
      return x.transactionType === 'thanh_toan_not' && (x.matchStatus ?? 'pending') === 'pending';
    });

    for (const doc of targets) {
      const x = doc.data();
      const tx = {
        id: doc.id,
        branchId: String(x.branchId ?? ''),
        phone: String(x.phone ?? ''),
        packageId: String(x.packageId ?? ''),
        customerName: String(x.customerName ?? ''),
        receiptNo: x.receiptNo ?? null,
      };
      const collectedToday = Number(x.collectedToday ?? 0);
      const candidates = await findMatchCandidates(db, tx);

      const now = Timestamp.now();
      if (candidates.length === 0) {
        await doc.ref.update({ matchStatus: 'no_match', updatedAt: now });
        result.noMatch++;
      } else if (candidates.length === 1) {
        const target = candidates[0];
        // BUG-4 audit fix 2026-06-17: re-fetch target trong transaction + check
        // matchedTransactionId/debtAmount để tránh race với /approve song song.
        // BUG-5 audit fix: denormalize matchedTargetSummary = "DD/MM/YYYY · KH" để
        // UI hiển thị tooltip rõ không cần fetch lại.
        let didMatch = false;
        await db.runTransaction(async (t) => {
          const targetRef = db.collection(COLLECTIONS.SALES_TRANSACTIONS).doc(target.id);
          const targetSnap = await t.get(targetRef);
          if (!targetSnap.exists) return;
          const tData = targetSnap.data() ?? {};
          const currentDebt = Number(tData.debtAmount ?? 0);
          if (currentDebt <= 0) return; // race: tx khác đã link, debt về 0
          const newCollected = Number(tData.collectedToday ?? 0) + collectedToday;
          const newDebt = Math.max(0, Number(tData.packageValue ?? 0) - newCollected);
          const dateStr = String(tData.date ?? '');
          const targetSummary = `${dateStr.split('-').reverse().join('/')} · ${String(tData.customerName ?? '?')}`;
          t.update(targetRef, {
            collectedToday: newCollected,
            debtAmount: newDebt,
            updatedAt: now,
          });
          t.update(doc.ref, {
            matchStatus: 'matched',
            matchedTransactionId: target.id,
            matchedTargetSummary: targetSummary,
            updatedAt: now,
          });
          didMatch = true;
        });
        if (didMatch) {
          result.matched++;
          void writeSalesAudit({
            db, batchId, transactionId: doc.id,
            action: 'auto_match', field: 'matchedTransactionId',
            oldValue: null, newValue: target.id,
            changedBy: actor.uid, changedByName: actor.name,
          });
        } else {
          // Race: target đã hết debt → đánh dấu cần kiểm tra
          await doc.ref.update({ matchStatus: 'needs_review', updatedAt: now });
          result.needsReview++;
        }
      } else {
        await doc.ref.update({ matchStatus: 'needs_review', updatedAt: now });
        result.needsReview++;
      }
    }
  } catch (e: any) {
    console.warn('[auto-match] runAutoMatchForBatch fail:', e?.message);
  }
  return result;
}

/** Manual link: kế toán chọn 1 candidate cho tx needs_review hoặc no_match. */
export async function linkTransaction(
  db: Firestore,
  txId: string,
  targetTxId: string,
  actor: { uid: string; name: string },
): Promise<{ ok: true } | { error: string }> {
  try {
    const txRef = db.collection(COLLECTIONS.SALES_TRANSACTIONS).doc(txId);
    const targetRef = db.collection(COLLECTIONS.SALES_TRANSACTIONS).doc(targetTxId);
    let oldMatchedId: string | null = null;
    await db.runTransaction(async (t) => {
      const [txSnap, targetSnap] = await Promise.all([t.get(txRef), t.get(targetRef)]);
      if (!txSnap.exists) throw new Error('Transaction không tồn tại');
      if (!targetSnap.exists) throw new Error('Target transaction không tồn tại');
      const tx = txSnap.data() ?? {};
      const target = targetSnap.data() ?? {};
      // Validate cùng cơ sở + phone + package (EXACT packageId — BUG-3 fix)
      if (tx.branchId !== target.branchId || tx.phone !== target.phone || tx.packageId !== target.packageId) {
        throw new Error('Candidate không khớp branch/phone/gói');
      }
      oldMatchedId = tx.matchedTransactionId ?? null;
      // Nếu đã link với target cũ → unlink target cũ (revert debt)
      if (oldMatchedId && oldMatchedId !== targetTxId) {
        const oldRef = db.collection(COLLECTIONS.SALES_TRANSACTIONS).doc(oldMatchedId);
        const oldSnap = await t.get(oldRef);
        if (oldSnap.exists) {
          const old = oldSnap.data() ?? {};
          const revertedCollected = Math.max(0, Number(old.collectedToday ?? 0) - Number(tx.collectedToday ?? 0));
          const revertedDebt = Math.max(0, Number(old.packageValue ?? 0) - revertedCollected);
          t.update(oldRef, { collectedToday: revertedCollected, debtAmount: revertedDebt, updatedAt: Timestamp.now() });
        }
      }
      // Apply mới
      const collectedToday = Number(tx.collectedToday ?? 0);
      const newCollected = Number(target.collectedToday ?? 0) + collectedToday;
      const newDebt = Math.max(0, Number(target.packageValue ?? 0) - newCollected);
      const now = Timestamp.now();
      const dateStr = String(target.date ?? '');
      const targetSummary = `${dateStr.split('-').reverse().join('/')} · ${String(target.customerName ?? '?')}`;
      t.update(targetRef, { collectedToday: newCollected, debtAmount: newDebt, updatedAt: now });
      t.update(txRef, {
        matchStatus: 'matched',
        matchedTransactionId: targetTxId,
        matchedTargetSummary: targetSummary,
        updatedAt: now,
      });
    });

    // Audit
    const tx = (await txRef.get()).data() ?? {};
    void writeSalesAudit({
      db, batchId: String(tx.batchId ?? ''), transactionId: txId,
      action: 'manual_link', field: 'matchedTransactionId',
      oldValue: oldMatchedId, newValue: targetTxId,
      changedBy: actor.uid, changedByName: actor.name,
    });
    return { ok: true };
  } catch (e: any) {
    return { error: e?.message ?? 'Lỗi link' };
  }
}
