// ============================================================
// Revenue module — Mock data (UI only, no Firebase)
// ============================================================
import type {
  Branch, BranchRevenue, CurrentUser, PackageRevenue,
  RevenueFilter, RevenueSnapshot, SaleRevenue, SystemRevenue,
} from './types';

// ---------- Users (cho switcher demo phân quyền) ----------
export const MOCK_USERS: CurrentUser[] = [
  { id: 'u-ceo',   name: 'Nguyễn Văn CEO',     role: 'ceo' },
  { id: 'u-bd',    name: 'Trần Thị BD',        role: 'business_director' },
  { id: 'u-admin', name: 'Lê Hoàng Admin',     role: 'admin' },
  { id: 'u-bm-hm', name: 'Phạm BM Hoàng Mai',  role: 'branch_manager', branchIds: ['HM'] },
  { id: 'u-bm-tk', name: 'Vũ BM Thuỵ Khuê',    role: 'branch_manager', branchIds: ['TK'] },
  { id: 'u-bm-multi', name: 'Đỗ BM Đa CS',     role: 'branch_manager', branchIds: ['HM', 'TT'] },
  { id: 'u-sale-1', name: 'Hoàng Sale 1',      role: 'sale', saleId: 's-hm-1', branchIds: ['HM'] },
  { id: 'u-sale-2', name: 'Mai Sale 2',        role: 'sale', saleId: 's-tk-1', branchIds: ['TK'] },
];

export const DEFAULT_USER: CurrentUser = MOCK_USERS[0];

// ---------- Branches (5 cơ sở Green Pool) ----------
export const MOCK_BRANCHES: Branch[] = [
  { id: 'HM',  code: 'HM',  name: 'CS Hoàng Mai',       address: 'Hoàng Mai, Hà Nội',     color: '#7c3aed' },
  { id: 'TK',  code: 'TK',  name: 'CS Thuỵ Khuê',       address: 'Thuỵ Khuê, Hà Nội',     color: '#8b5cf6' },
  { id: 'CTT', code: 'CTT', name: 'CS CTT Dưới Nước',   address: 'Quận 3, TP.HCM',         color: '#a78bfa' },
  { id: '24',  code: '24',  name: 'CS 24 NCT',          address: '24 Nguyễn Công Trứ',    color: '#6d28d9' },
  { id: 'TT',  code: 'TT',  name: 'CS Thanh Trì',       address: 'Thanh Trì, Hà Nội',      color: '#9333ea' },
];

const PACKAGES: { id: string; name: string }[] = [
  { id: 'p-hbcb',  name: 'Học bơi cơ bản' },
  { id: 'p-clc',   name: 'Lớp Cao cấp CLC' },
  { id: 'p-lan',   name: 'Khoá Lặn' },
  { id: 'p-pt',    name: 'PT 1-1' },
  { id: 'p-vip',   name: 'Vé hồ VIP' },
];

// ---------- Generator helpers ----------
// Seeded pseudo-random: cùng filter cho cùng số liệu
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function buildPackages(rand: () => number, totalRevenue: number): PackageRevenue[] {
  // Phân bổ ngẫu nhiên revenue về 3-4 gói chính
  const chosen = PACKAGES.slice(0, 3 + Math.floor(rand() * 2));
  const weights = chosen.map(() => 0.5 + rand());
  const sum = weights.reduce((a, b) => a + b, 0);
  return chosen.map((p, i) => {
    const portion = weights[i] / sum;
    const rev = Math.round(totalRevenue * portion / 1_000_000) * 1_000_000;
    const count = Math.max(1, Math.round(rev / 4_500_000));
    return { packageId: p.id, packageName: p.name, revenue: rev, count };
  }).sort((a, b) => b.revenue - a.revenue);
}

// ---------- Snapshot builder ----------
export function buildSnapshot(filter: RevenueFilter): RevenueSnapshot {
  const { year, month } = filter;
  const rand = seededRandom(year * 100 + month);

  // Branch-level
  const branches: BranchRevenue[] = MOCK_BRANCHES.map((b) => {
    const baseTarget = 350_000_000 + Math.floor(rand() * 250_000_000);
    const target = Math.round(baseTarget / 5_000_000) * 5_000_000;
    const achieveRate = 0.55 + rand() * 0.7; // 55%–125%
    const revenue = Math.round((target * achieveRate) / 1_000_000) * 1_000_000;
    const ytdMonths = month;
    const ytdTarget = target * ytdMonths;
    const ytdAchieve = 0.6 + rand() * 0.5;
    const ytdRevenue = Math.round((ytdTarget * ytdAchieve) / 1_000_000) * 1_000_000;
    const sales = 4 + Math.floor(rand() * 5);
    const deals = 25 + Math.floor(rand() * 40);

    return {
      branchId: b.id,
      branchName: b.name,
      branchCode: b.code,
      year, month,
      revenue, target,
      ytdRevenue, ytdTarget,
      sales, deals,
      topPackages: buildPackages(rand, revenue),
    };
  });

  // System aggregate
  const sysRevenue = branches.reduce((a, b) => a + b.revenue, 0);
  const sysTarget = branches.reduce((a, b) => a + b.target, 0);
  const sysYtd = branches.reduce((a, b) => a + b.ytdRevenue, 0);
  const sysYtdTarget = branches.reduce((a, b) => a + b.ytdTarget, 0);
  // Tháng trước
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevRand = seededRandom(prevYear * 100 + prevMonth);
  let prevSys = 0;
  for (let i = 0; i < branches.length; i++) {
    const baseT = 350_000_000 + Math.floor(prevRand() * 250_000_000);
    const t = Math.round(baseT / 5_000_000) * 5_000_000;
    const ar = 0.55 + prevRand() * 0.7;
    prevSys += Math.round((t * ar) / 1_000_000) * 1_000_000;
    // skip extra rand consumption (rough enough for demo)
  }
  const momPct = prevSys > 0 ? ((sysRevenue - prevSys) / prevSys) * 100 : 0;

  const system: SystemRevenue = {
    year, month,
    revenue: sysRevenue,
    target: sysTarget,
    ytdRevenue: sysYtd,
    ytdTarget: sysYtdTarget,
    branchesCount: branches.length,
    salesCount: branches.reduce((a, b) => a + b.sales, 0),
    deals: branches.reduce((a, b) => a + b.deals, 0),
    monthOverMonthPct: momPct,
  };

  // Sales — mỗi cơ sở 4-8 sale
  const sales: SaleRevenue[] = [];
  const SALE_NAMES = ['Hoàng Anh', 'Minh Tú', 'Quốc Bảo', 'Thu Hà', 'Đức Huy', 'Lan Phương', 'Nguyên Khôi', 'Bích Vân'];
  branches.forEach((b) => {
    const sRand = seededRandom(year * 100 + month + b.branchId.charCodeAt(0));
    for (let i = 0; i < b.sales; i++) {
      const target = Math.round((40_000_000 + sRand() * 50_000_000) / 1_000_000) * 1_000_000;
      const rate = 0.4 + sRand() * 1.0;
      const revenue = Math.round((target * rate) / 500_000) * 500_000;
      const deals = Math.max(1, Math.round(revenue / 6_000_000));
      const saleId = `s-${b.branchId.toLowerCase()}-${i + 1}`;
      sales.push({
        id: `${saleId}-${year}-${month}`,
        saleId,
        saleName: SALE_NAMES[i % SALE_NAMES.length] + ' (' + b.branchCode + ')',
        branchId: b.branchId,
        branchName: b.branchName,
        year, month,
        revenue, target, deals,
        packages: buildPackages(sRand, revenue),
      });
    }
  });

  return { filter, system, branches, sales };
}

// Cho phép pre-bundle 1 snapshot mặc định để IDE preview nhanh
export const DEFAULT_FILTER: RevenueFilter = (() => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
})();

export const DEFAULT_SNAPSHOT: RevenueSnapshot = buildSnapshot(DEFAULT_FILTER);
