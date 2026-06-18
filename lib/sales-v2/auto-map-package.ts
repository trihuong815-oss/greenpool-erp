// V8 Phase 2 (2026-06-18) — Auto-map gói Sale → nhóm trong báo cáo tổng hợp ngày.
//
// Convention dữ liệu Green Pool (verified 2026-06-18 qua inspect Firestore):
//   packageGroups (name): 'Thẻ member bơi', 'Thẻ học bơi', 'Thẻ tích lượt',
//     'Thẻ member Fitness', 'Thẻ lặn', 'Full dịch vụ' (chỉ 24),
//     'Gói PT Gym' (chỉ 24), 'Bể trong nhà - Thẻ member' / 'Bể ngoài trời - Thẻ member'
//     / 'Bể trong nhà - Thẻ tích lượt' / 'Bể ngoài trời - Thẻ tích lượt' (CTT chia bể).
//
// Mapping theo báo cáo user gửi 2026-06-18:
//   I. Thẻ tháng  = Thẻ member bơi + Thẻ member Fitness + Full dịch vụ + Bể trong/ngoài Thẻ member
//   II. Tích lượt = Thẻ tích lượt + Bể trong/ngoài Thẻ tích lượt
//   III. Học bơi  = Thẻ học bơi + Thẻ lặn + Gói PT Gym
//   Khác          = không khớp pattern

export type ReportGroup = 'the_thang' | 'tich_luot' | 'hoc_boi' | 'other';

export interface PackageMapping {
  group: ReportGroup;
  groupLabel: string;   // 'I. Thẻ tháng'
  subLabel: string;     // '01 tháng', '60 lượt', 'Trẻ em', ...
}

const GROUP_LABEL: Record<ReportGroup, string> = {
  the_thang: 'I. Thẻ tháng',
  tich_luot: 'II. Tích lượt',
  hoc_boi: 'III. Học bơi',
  other: 'IV. Khác',
};

/** Normalize: lowercase + bỏ dấu tiếng Việt + whitespace collapsed. */
function norm(s: string): string {
  return s.toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Detect group từ packageGroups.name. */
function detectGroup(packageGroupName: string): ReportGroup {
  const g = norm(packageGroupName);
  if (g.includes('hoc boi') || g.includes('lan') || g.includes('pt gym')) return 'hoc_boi';
  if (g.includes('tich luot')) return 'tich_luot';
  if (g.includes('member') || g.includes('full dich vu')) return 'the_thang';
  return 'other';
}

/** Parse số tháng/năm từ tên gói "Thẻ X tháng" / "X năm fitness" / "1 năm trong nhà" / "full 6 tháng". */
function parseDurationLabel(packageName: string): string | null {
  const n = norm(packageName);
  // X năm
  const yearMatch = n.match(/(\d+)\s*nam/);
  if (yearMatch) {
    const y = parseInt(yearMatch[1], 10);
    return `${String(y).padStart(2, '0')} năm`;
  }
  // X tháng
  const monthMatch = n.match(/(\d+)\s*thang/);
  if (monthMatch) {
    const m = parseInt(monthMatch[1], 10);
    return `${String(m).padStart(2, '0')} tháng`;
  }
  return null;
}

/** Parse số lượt từ "X lượt". Gộp 5/10/20/30 thành "5-30 lượt"; 60/90/120/200/240 riêng. */
function parseLuotLabel(packageName: string): string {
  const n = norm(packageName);
  // 'đoàn thể' → riêng nhóm
  if (n.includes('doan the')) return 'Đoàn thể';
  const m = n.match(/(\d+)\s*luot/);
  if (!m) return packageName;
  const count = parseInt(m[1], 10);
  // Bucket — theo báo cáo user (5/10/20/30 nhỏ gộp; 60/90/120/200/240 riêng)
  if (count <= 30) return '5 / 10 / 20 / 30 lượt';
  if (count === 60) return '60 lượt';
  if (count === 90) return '90 lượt';
  if (count === 120) return '120 lượt';
  if (count >= 200 && count <= 240) return `${count} lượt`;
  return `${count} lượt`;
}

/** Phân loại học bơi: Trẻ em / Người lớn / Lặn / PT / CLC / Cơ bản / Khác. */
function classifyHocBoi(packageName: string, packageGroupName: string): string {
  const n = norm(packageName);
  const g = norm(packageGroupName);
  // PT (HB PT, PT Gym)
  if (n.includes(' pt') || n.startsWith('pt ') || n === 'pt' || g.includes('pt gym')) return 'PT';
  // Lặn (Thẻ lặn group hoặc tên chứa 'lan')
  if (g.includes('lan') || n.includes(' lan') || n.includes('diving') || n.includes('mermaid')) return 'Lặn';
  // Trẻ em (TE / kid / Thăng Long Kid)
  if (/\bte\b/.test(n) || n.includes('kid') || n.includes('tre em')) return 'Trẻ em';
  // Người lớn (NL / Aqua)
  if (/\bnl\b/.test(n) || n.includes('aqua') || n.includes('nguoi lon')) return 'Người lớn';
  // Chất lượng cao
  if (n.includes('chat luong cao') || /\bclc\b/.test(n)) return 'CLC';
  // Cơ bản
  if (/\bcb\b/.test(n) || n.includes('co ban')) return 'Cơ bản';
  // Nâng cao
  if (n.includes('nang cao')) return 'Nâng cao';
  return 'Khác';
}

/** Main API: map 1 package → (group, subLabel) cho báo cáo tổng hợp. */
export function mapPackageToReport(packageName: string, packageGroupName: string): PackageMapping {
  const group = detectGroup(packageGroupName);
  let subLabel: string;
  if (group === 'the_thang') {
    subLabel = parseDurationLabel(packageName) ?? packageName;
  } else if (group === 'tich_luot') {
    subLabel = parseLuotLabel(packageName);
  } else if (group === 'hoc_boi') {
    subLabel = classifyHocBoi(packageName, packageGroupName);
  } else {
    subLabel = packageName;
  }
  return { group, groupLabel: GROUP_LABEL[group], subLabel };
}

export { GROUP_LABEL };
