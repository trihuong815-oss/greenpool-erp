// lib/display-name.ts — Chống lộ UUID/hash ra UI.
// PR-UI-PIXEL-MATCH B1 (2026-06-26): port từ code-10diem.
// Mọi nơi hiển thị người/đơn vị/đối tượng PHẢI đi qua helper này để
// tránh "Lộ mã kỹ thuật thay cho tên" (audit P1).

const TECH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}|^[A-Za-z0-9_-]{20,}$/; // uuid hoặc hash dài

/** True nếu chuỗi trông giống mã kỹ thuật (uuid, push id, hash). */
export function looksTechnical(s?: string | null): boolean {
  if (!s) return false;
  return TECH_ID.test(s.trim());
}

export type PersonRef = {
  name?: string | null;
  fullName?: string | null;
  roleLabel?: string | null;
  facilityLabel?: string | null;
  id?: string | null;
  uid?: string | null;
};

/**
 * Tên hiển thị theo bậc thang:
 * name → roleLabel + facilityLabel → "Chưa định danh".
 * KHÔNG bao giờ trả về uuid/uid. id thật để đưa vào title tooltip riêng.
 */
export function displayName(ref?: PersonRef | string | null): string {
  if (!ref) return 'Chưa định danh';
  if (typeof ref === 'string') {
    return looksTechnical(ref) ? 'Chưa định danh' : ref;
  }
  const name = ref.fullName || ref.name;
  if (name && !looksTechnical(name)) return name;
  const role = ref.roleLabel?.trim();
  const fac = ref.facilityLabel?.trim();
  if (role && fac) return `${role} · ${fac}`;
  if (role) return role;
  if (fac) return fac;
  return 'Chưa định danh';
}

/** ID kỹ thuật rút gọn để đặt trong title=tooltip (không hiển thị thẳng). */
export function technicalIdTooltip(ref?: PersonRef | string | null): string | undefined {
  const id = typeof ref === 'string' ? ref : ref?.id || ref?.uid;
  if (!id) return undefined;
  return `Mã nội bộ: ${id}`;
}

/** Nhãn nghiệp vụ thân thiện cho đối tượng audit (thay Tx/Batch hash). */
export function objectLabel(kind: string, code?: string | null): string {
  const map: Record<string, string> = {
    transaction: 'Giao dịch',
    batch: 'Đợt đối chiếu',
    expense: 'Phiếu chi',
    proposal: 'Đề xuất',
    dispatch: 'Điều phối',
  };
  const label = map[kind] ?? 'Bản ghi';
  if (code && !looksTechnical(code)) return `${label} ${code}`;
  return label; // mã hash → chỉ hiện loại, không hiện hash
}
