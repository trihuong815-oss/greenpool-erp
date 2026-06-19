// Client wrappers cho /api/package-groups + /api/packages

export interface PackageGroup {
  id: string;
  name: string;
  branchId: string;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PackageItem {
  id: string;
  name: string;
  groupId: string;
  branchId: string;
  defaultPrice: number;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  // V6 PT (2026-06-17): gói tính theo buổi (PT Gym, học bơi PT...).
  // Khi true: doanh số = số buổi × đơn giá / buổi (Sale nhập tại lúc bán).
  isCustomQuantity?: boolean;
  unitName?: string;           // 'buổi' / 'lượt' / ...
  defaultUnitPrice?: number;   // đơn giá / buổi gợi ý
  // V8.Y (2026-06-19): Manual mode — Sale tự nhập packageValue + ghi số buổi (note).
  // Mutually exclusive với isCustomQuantity. Dùng cho HB CLB Kid/Aqua.
  manualPriceWithQuantity?: boolean;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const body = await res.json(); if (body?.error) msg = body.error; } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const packageGroupsApi = {
  async list(branchId?: string): Promise<PackageGroup[]> {
    const url = `/api/package-groups${branchId ? '?branchId=' + encodeURIComponent(branchId) : ''}`;
    return (await jsonOrThrow<{ rows: PackageGroup[] }>(await fetch(url, { cache: 'no-store' }))).rows;
  },
  async create(payload: { name: string; branchId: string; sortOrder?: number }): Promise<PackageGroup> {
    const res = await fetch('/api/package-groups', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return (await jsonOrThrow<{ group: PackageGroup }>(res)).group;
  },
  async update(id: string, patch: Partial<PackageGroup>): Promise<void> {
    const res = await fetch(`/api/package-groups/${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patch }),
    });
    await jsonOrThrow<{ ok: true }>(res);
  },
  async delete(id: string): Promise<void> {
    await jsonOrThrow<{ ok: true }>(await fetch(`/api/package-groups/${encodeURIComponent(id)}`, { method: 'DELETE' }));
  },
};

export interface PackageSale {
  id: string;
  period: string;
  periodType: 'month' | 'day';
  branchId: string;
  saleId: string;
  saleName: string;
  groupId: string;
  groupName: string;
  packageId: string;
  packageName: string;
  quantity: number;
  unitPrice: number;
  revenue: number;
  updatedAt: string;
}

export interface PackageSaleUpsert {
  period: string;
  periodType: 'month' | 'day';
  branchId: string;
  saleId: string;
  saleName: string;
  groupId: string;
  groupName: string;
  packageId: string;
  packageName: string;
  quantity: number;
  unitPrice: number;
  revenue: number;
}

export const packageSalesApi = {
  async list(filter: { period: string; periodType: 'month' | 'day'; branchId: string }): Promise<PackageSale[]> {
    const qs = new URLSearchParams(filter as any);
    return (await jsonOrThrow<{ rows: PackageSale[] }>(await fetch(`/api/package-sales?${qs.toString()}`, { cache: 'no-store' }))).rows;
  },
  /** Cross-mode: fetch tất cả docs của (year, month, branch) — cả month-mode + day-mode. */
  async listMonth(filter: { year: number; month: number; branchId: string }): Promise<PackageSale[]> {
    const qs = new URLSearchParams({
      year: String(filter.year), month: String(filter.month), branchId: filter.branchId,
    });
    return (await jsonOrThrow<{ rows: PackageSale[] }>(await fetch(`/api/package-sales?${qs.toString()}`, { cache: 'no-store' }))).rows;
  },
  async bulkUpsert(
    entries: PackageSaleUpsert[],
    opts: { replace?: boolean; period?: string; periodType?: 'month' | 'day'; branchId?: string } = {},
  ): Promise<{ written: number; deleted?: number }> {
    const res = await fetch('/api/package-sales', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries,
        replace: opts.replace === true,
        // Top-level fallback cho clear-all case (entries=[] với replace=true).
        ...(opts.period ? { period: opts.period } : {}),
        ...(opts.periodType ? { periodType: opts.periodType } : {}),
        ...(opts.branchId ? { branchId: opts.branchId } : {}),
      }),
    });
    return jsonOrThrow<{ written: number; deleted?: number }>(res);
  },
};

export const packagesApi = {
  async list(filter: { branchId?: string; groupId?: string; activeOnly?: boolean } = {}): Promise<PackageItem[]> {
    const qs = new URLSearchParams();
    if (filter.branchId) qs.set('branchId', filter.branchId);
    if (filter.groupId) qs.set('groupId', filter.groupId);
    if (filter.activeOnly) qs.set('active', 'true');
    const url = `/api/packages${qs.toString() ? '?' + qs.toString() : ''}`;
    return (await jsonOrThrow<{ rows: PackageItem[] }>(await fetch(url, { cache: 'no-store' }))).rows;
  },
  async create(payload: {
    name: string; branchId: string; groupId: string; defaultPrice: number; sortOrder?: number;
    isCustomQuantity?: boolean; unitName?: string; defaultUnitPrice?: number;
    manualPriceWithQuantity?: boolean;
  }): Promise<PackageItem> {
    const res = await fetch('/api/packages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return (await jsonOrThrow<{ pkg: PackageItem }>(res)).pkg;
  },
  async update(id: string, patch: Partial<PackageItem>): Promise<void> {
    const res = await fetch(`/api/packages/${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patch }),
    });
    await jsonOrThrow<{ ok: true }>(res);
  },
  async delete(id: string): Promise<void> {
    await jsonOrThrow<{ ok: true }>(await fetch(`/api/packages/${encodeURIComponent(id)}`, { method: 'DELETE' }));
  },
};

// ═══════ Smart sort cho package name ═══════
// Extract sort key từ tên gói: "X lượt" / "X tháng" / "X năm" (auto-convert năm → tháng).
// Trả null nếu không match → fallback dùng sortOrder field.
// Áp dụng cho mọi nơi list package — user vừa thêm gói mới sẽ tự xếp đúng từ nhỏ → lớn.
export function extractPackageSortKey(name: string): number | null {
  if (!name) return null;
  // Ưu tiên "lượt" trước (số ô lượt) — không bị nhầm với time unit.
  const luotMatch = /(\d+)\s*l(?:ượ|uo|ư)t/i.exec(name);
  if (luotMatch) return Number(luotMatch[1]);
  // Năm → quy về tháng (× 12) để so sánh cùng đơn vị.
  const namMatch = /(\d+)\s*n(?:ăm|am)/i.exec(name);
  if (namMatch) return Number(namMatch[1]) * 12;
  // Tháng.
  const thangMatch = /(\d+)\s*th(?:áng|ang)/i.exec(name);
  if (thangMatch) return Number(thangMatch[1]);
  return null;
}

/** Extract "cluster stem" từ tên gói: phần ổn định sau khi bỏ variant suffix.
 *  Mục đích: gom variant cùng prefix lại gần nhau, bất kể khoảng trắng/dấu/viết tắt nhỏ.
 *  Vd cùng stem "hbclb":
 *    "HB CLB cấp 1" / "HBCLB cấp 2" / "HB CLB người lớn" / "HBCLB 8 buổi"
 *  Variant suffix strip: trailing "cấp N" / "level N" / số + đơn vị (buổi/tháng/năm/lượt/tuần/ngày)
 *  / "trẻ em" / "người lớn" / "kid" / "adult" / "nữ" / "nam". */
function packageClusterStem(name: string): string {
  if (!name) return '';
  let s = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // bỏ dấu tiếng Việt
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')      // unify separator
    .trim();
  // Loop strip vì có thể nhiều suffix chồng nhau ("HB CLB người lớn cấp 1")
  const TRAILING_RE = /\s*(?:cap\s*\d+|level\s*\d+|\d+\s*(?:buoi|thang|nam|luot|tuan|ngay)?|tre\s*em|nguoi\s*lon|kid|adult|nu|nam)\s*$/;
  let prev = '';
  while (s !== prev) {
    prev = s;
    s = s.replace(TRAILING_RE, '').trim();
  }
  // Flatten: bỏ luôn whitespace để "HB CLB" ≡ "HBCLB" ≡ "hb  clb"
  return s.replace(/\s+/g, '');
}

/** Comparator để sort packages.
 *  1. Cả 2 có numeric key (tháng/năm/lượt) → numeric ascending — luôn ưu tiên
 *     bất kể prefix tên. Vd "Thẻ 1 tháng" / "Member 6 tháng" / "VIP 1 năm" → 1<6<12.
 *  2. Một có numeric → numeric đứng trước (gói có "X tháng" lên trên gói tên đặc biệt).
 *  3. Cả 2 không có numeric → cluster theo stem chung (variant gần nhau,
 *     vd "HB CLB cấp 1" / "HBCLB người lớn" → cùng cluster).
 *  4. Same cluster, no numeric → sortOrder rồi tên alphabetical (vi). */
export function comparePackagesSmart(a: PackageItem, b: PackageItem): number {
  const ka = extractPackageSortKey(a.name);
  const kb = extractPackageSortKey(b.name);
  // 1. Cả 2 numeric → ascending CROSS-CLUSTER. Đảm bảo Thẻ member fitness
  //    1 tháng → 3 tháng → 6 tháng → 1 năm (=12) → 2 năm (=24) đúng thứ tự.
  if (ka !== null && kb !== null) return ka - kb;
  // 2. Một có numeric → đứng trước (gói có đơn vị thời gian/lượt rõ ràng lên đầu)
  if (ka !== null) return -1;
  if (kb !== null) return 1;
  // 3. Cả 2 không numeric → cluster theo stem (HB CLB grouping case)
  const stemA = packageClusterStem(a.name);
  const stemB = packageClusterStem(b.name);
  if (stemA !== stemB) {
    if (!stemA) return 1;
    if (!stemB) return -1;
    return stemA.localeCompare(stemB, 'vi');
  }
  // 4. Same cluster: sortOrder rồi alphabetical
  const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  if (so !== 0) return so;
  return a.name.localeCompare(b.name, 'vi');
}

// ═══════ Package Quantities (cơ cấu số lượng gói theo tháng × cơ sở, tách khỏi doanh số) ═══════

export interface PackageQuantity {
  id: string;
  year: number;
  month: number;
  branchId: string;
  groupId: string;
  groupName: string;
  packageId: string;
  packageName: string;
  quantity: number;
  /** Doanh số gói trong tháng (Section 3B) — độc lập với quantity (Section 3A). */
  revenue?: number;
  updatedAt?: string;
}

export interface PackageQuantityUpsert {
  packageId: string;
  packageName: string;
  groupId: string;
  groupName: string;
  quantity: number;
  /** Optional: doanh số per package per month. Nếu không gửi → giữ giá trị cũ trong DB. */
  revenue?: number;
}

export const packageQuantitiesApi = {
  async list(filter: { year: number; month: number; branchId: string }): Promise<PackageQuantity[]> {
    const qs = new URLSearchParams({
      year: String(filter.year),
      month: String(filter.month),
      branchId: filter.branchId,
    });
    return (await jsonOrThrow<{ rows: PackageQuantity[] }>(
      await fetch(`/api/package-quantities?${qs.toString()}`, { cache: 'no-store' }),
    )).rows;
  },
  async listYear(filter: { year: number; branchId: string }): Promise<PackageQuantity[]> {
    const qs = new URLSearchParams({
      year: String(filter.year),
      branchId: filter.branchId,
      yearOnly: 'true',
    });
    return (await jsonOrThrow<{ rows: PackageQuantity[] }>(
      await fetch(`/api/package-quantities?${qs.toString()}`, { cache: 'no-store' }),
    )).rows;
  },
  async bulkUpsert(
    payload: { year: number; month: number; branchId: string; entries: PackageQuantityUpsert[] },
    opts?: { replace?: boolean },
  ): Promise<{ ok: true; written: number; deleted?: number }> {
    const res = await fetch('/api/package-quantities', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, replace: opts?.replace === true }),
    });
    return jsonOrThrow<{ ok: true; written: number; deleted?: number }>(res);
  },
};
