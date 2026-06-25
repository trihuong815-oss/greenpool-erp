// lib/display-id.ts
// Chống lộ mã kỹ thuật (uuid/push-id/hash) ra UI ở vị trí "tên người / đối tượng".
// Dùng ở mọi nơi render tên: BottleneckTable, AuditTable, ... (UI 10/10 — audit P1).

/** True nếu chuỗi trông giống mã kỹ thuật: uuid, Firestore push-id, hash dài. */
export function looksTechnicalId(s?: string | null): boolean {
  if (!s) return false;
  const v = s.trim();
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-/.test(v)) return true; // uuid
  if (/\s/.test(v)) return false; // có khoảng trắng -> là tên người, bỏ qua
  if (/^[A-Za-z0-9_-]{20,}$/.test(v)) return true; // push-id/hash dài, không dấu cách
  return false;
}

/**
 * Tên an toàn để hiển thị: nếu là mã kỹ thuật -> "Chưa định danh".
 * Giữ nguyên tên thật (kể cả có dấu tiếng Việt).
 */
export function safeName(name?: string | null, fallback = 'Chưa định danh'): string {
  if (!name || !name.trim()) return fallback;
  return looksTechnicalId(name) ? fallback : name;
}

/** Tooltip chứa mã gốc (chỉ hiện khi rê chuột), không in thẳng ra bảng. */
export function rawIdTooltip(id?: string | null): string | undefined {
  if (!id || !looksTechnicalId(id)) return undefined;
  return `Mã nội bộ: ${id}`;
}

/** Nhãn nghiệp vụ thân thiện cho đối tượng audit (thay "Tx ab12cd…"). */
export function entityFriendly(opts: {
  transactionId?: string | null;
  batchId?: string | null;
  programId?: string | null;
  code?: string | null; // mã nghiệp vụ thân thiện nếu có (PC-…, DP-…)
}): string {
  if (opts.code && !looksTechnicalId(opts.code)) {
    return opts.code;
  }
  if (opts.transactionId) return 'Giao dịch';
  if (opts.batchId) return 'Đợt đối chiếu';
  if (opts.programId) return 'Chương trình KM';
  return '—';
}
