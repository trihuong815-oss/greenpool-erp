"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Users,
  Calendar,
  ChevronRight,
  Megaphone,
  UserRound,
  RefreshCcw,
  Handshake,
  Footprints,
  Package,
  type LucideIcon,
} from "lucide-react";
import { targetsApi } from "@/lib/services/sales/targets-api-client";
import { AppTopBar } from "@/components/AppTopBar";
import { MonthDetailModal } from "./MonthDetailModal";
import { StaffTargetModal } from "./StaffTargetModal";

/* ============================================================
   Types + Mock data
   ============================================================ */

type UserRole =
  | "ceo"
  | "business_director"
  | "branch_manager"
  | "sale"
  | "admin";

type CurrentUser = {
  uid: string;
  name: string;
  role: UserRole;
  branchIds: string[];
};

type SaleRevenue = {
  saleId: string;
  saleName: string;
  target: number;
  actual: number;
  revenueByMonth?: number[];        // 12 numbers (actual revenue per month)
  monthlyTargets?: number[];        // 12 numbers (QLCS-set target per month)
  newCustomers: number;
  renewCustomers: number;
  upsellCustomers: number;
  // Phần 2B — Lead per sale per month
  totalLeads?: number;
  totalClosed?: number;
  leadsByMonth?: number[];
  closedByMonth?: number[];
};

type BranchRevenue = {
  branchId: string;
  branchName: string;
  sales: SaleRevenue[];
  // Real data từ Firestore (Phase 6.D adapter). Khi có, dùng thay vì mock seeded.
  byMonth?: { month: number; revenue: number; leads: number; closed: number; target?: number | null; leadsBySource?: Record<LeadSource, number>; closedBySource?: Record<LeadSource, number> }[];
  /** PHẦN 3 dashboard: cơ cấu SL gói + Section 1C doanh số gói (per package × 12 tháng). */
  packageQuantities?: {
    packageId: string;
    packageName: string;
    groupId: string;
    groupName: string;
    qtyByMonth: number[];
    totalYearQty: number;
    revenueByMonth: number[];
    totalYearRevenue: number;
  }[];
  realSources?: {
    source: LeadSource;
    leads: number;
    closed: number;
    notClosed: number;
    targetLeadsByMonth?: number[] | null;
    targetLeadsYear?: number;
  }[];
  // Phase 6.I — admin-set targets
  yearTarget?: number;
  monthTargets?: number[] | null;
  yearLeadTarget?: number;
  /** Cảnh báo lệch doanh thu per-sale (packageSales) vs per-package (packageQuantities).
   *  month=0 = tổng năm, 1-12 = từng tháng. Chỉ chứa entry có lệch > 1000đ. */
  revenueDiscrepancies?: { month: number; revenuePerSale: number; revenuePerPackage: number; diff: number }[];
};

type LeadSource = "MKT" | "Sale" | "Renew" | "Referral" | "Walk-in";

type SourceStat = {
  source: LeadSource;
  targetLeads: number;
  actualLeads: number;
  actualClosed: number;     // số chốt thật — hiển thị bên cạnh tổng (anh chốt 2026-05-30)
  closeRatePct: number;
};

const SOURCE_LABEL: Record<LeadSource, string> = {
  MKT: "Phòng MKT",
  Sale: "Cá nhân Sale",
  Renew: "Renew",
  Referral: "Referral",
  "Walk-in": "Walk-in",
};

const SOURCE_ICON: Record<LeadSource, LucideIcon> = {
  MKT: Megaphone,
  Sale: UserRound,
  Renew: RefreshCcw,
  Referral: Handshake,
  "Walk-in": Footprints,
};

/* ============================================================
   Mock helpers cho Detail modal
   ============================================================ */

type MonthlyRow = {
  month: number;
  target: number;
  actual: number;
  leadsBySource: Record<LeadSource, number>;
  closedBySource: Record<LeadSource, number>;
};

const SOURCE_LIST: LeadSource[] = ["MKT", "Sale", "Renew", "Referral", "Walk-in"];

/** 12 tháng cho 1 cơ sở — dùng thẳng data thật từ adaptReport. Không synthesize.
 *  Branch chưa có byMonth → trả 12 tháng zero (an toàn hơn fake random). */
function getMonthlyBranchData(branch: BranchRevenue): MonthlyRow[] {
  if (!branch.byMonth || branch.byMonth.length === 0) {
    return Array.from({ length: 12 }, (_, i) => {
      const leadsBySource = {} as Record<LeadSource, number>;
      const closedBySource = {} as Record<LeadSource, number>;
      SOURCE_LIST.forEach((s) => { leadsBySource[s] = 0; closedBySource[s] = 0; });
      return { month: i + 1, target: 0, actual: 0, leadsBySource, closedBySource };
    });
  }
  const yearActual = branch.sales.reduce((a, s) => a + s.actual, 0);
  const yearTargetFromSales = branch.sales.reduce((a, s) => a + s.target, 0);
  return branch.byMonth.map((m) => {
    // Target tháng: ưu tiên m.target admin-set; fallback phân bổ yearTarget theo share doanh số.
    let targetMonth = 0;
    if (typeof m.target === 'number' && m.target > 0) {
      targetMonth = m.target;
    } else if (yearTargetFromSales > 0) {
      const share = yearActual > 0 ? m.revenue / yearActual : 1 / 12;
      targetMonth = Math.round(yearTargetFromSales * share);
    }
    // Lead + closed per source per month — DATA THẬT từ adaptReport.
    const leadsBySource = {} as Record<LeadSource, number>;
    const closedBySource = {} as Record<LeadSource, number>;
    SOURCE_LIST.forEach((s) => {
      leadsBySource[s] = m.leadsBySource?.[s] ?? 0;
      closedBySource[s] = m.closedBySource?.[s] ?? 0;
    });
    return { month: m.month, target: targetMonth, actual: m.revenue, leadsBySource, closedBySource };
  });
}

/** Tổng số lead theo nguồn của 1 sale (cả năm) — phân bổ từ actual của sale */
const DEFAULT_VIEWER: CurrentUser = {
  uid: "ceo_001",
  name: "Tổng giám đốc",
  role: "ceo",
  branchIds: [],
};

const branches: BranchRevenue[] = [
  {
    branchId: "branch_001",
    branchName: "Cơ sở 1 (20 Thụy Khuê)",
    sales: [
      { saleId: "sale_001", saleName: "Nguyễn Minh Anh", target: 90_000_000, actual: 74_000_000, newCustomers: 18, renewCustomers: 12, upsellCustomers: 6 },
      { saleId: "sale_002", saleName: "Trần Thu Hà",     target: 80_000_000, actual: 63_000_000, newCustomers: 14, renewCustomers: 10, upsellCustomers: 5 },
      { saleId: "sale_003", saleName: "Lê Đức Nam",      target: 75_000_000, actual: 42_000_000, newCustomers: 9,  renewCustomers: 6,  upsellCustomers: 2 },
    ],
  },
  {
    branchId: "branch_002",
    branchName: "Cơ sở 2 (Bể Bơi Bốn Mùa Hoàng Mai)",
    sales: [
      { saleId: "sale_004", saleName: "Hoàng Bảo Châu",   target: 85_000_000, actual: 91_000_000, newCustomers: 20, renewCustomers: 14, upsellCustomers: 7 },
      { saleId: "sale_005", saleName: "Vũ Minh Quân",     target: 75_000_000, actual: 70_000_000, newCustomers: 15, renewCustomers: 11, upsellCustomers: 5 },
      { saleId: "sale_006", saleName: "Đặng Hương Giang", target: 70_000_000, actual: 56_000_000, newCustomers: 12, renewCustomers: 8,  upsellCustomers: 4 },
    ],
  },
  {
    branchId: "branch_003",
    branchName: "Cơ sở 3 (24 Nguyễn Cơ Thạch)",
    sales: [
      { saleId: "sale_007", saleName: "Ngô Thanh Tùng",  target: 95_000_000, actual: 38_000_000, newCustomers: 7,  renewCustomers: 4, upsellCustomers: 2 },
      { saleId: "sale_008", saleName: "Mai Phương Thảo", target: 85_000_000, actual: 46_000_000, newCustomers: 9,  renewCustomers: 5, upsellCustomers: 3 },
      { saleId: "sale_009", saleName: "Đỗ Anh Tú",       target: 80_000_000, actual: 52_000_000, newCustomers: 10, renewCustomers: 6, upsellCustomers: 2 },
    ],
  },
  {
    branchId: "branch_004",
    branchName: "Cơ sở 4 (Green Pool CTT Mỹ Đình)",
    sales: [
      { saleId: "sale_010", saleName: "Phan Thu Trang", target: 75_000_000, actual: 68_000_000, newCustomers: 13, renewCustomers: 9, upsellCustomers: 4 },
      { saleId: "sale_011", saleName: "Lưu Hải Nam",    target: 70_000_000, actual: 61_000_000, newCustomers: 12, renewCustomers: 8, upsellCustomers: 3 },
    ],
  },
  {
    branchId: "branch_005",
    branchName: "Cơ sở 5 (Green Pool Thanh Trì)",
    sales: [
      { saleId: "sale_012", saleName: "Tạ Minh Đức",    target: 80_000_000, actual: 72_000_000, newCustomers: 15, renewCustomers: 8, upsellCustomers: 5 },
      { saleId: "sale_013", saleName: "Nguyễn Khánh Vy", target: 75_000_000, actual: 58_000_000, newCustomers: 11, renewCustomers: 7, upsellCustomers: 4 },
    ],
  },
];

/* ============================================================
   Utils
   ============================================================ */

// Format đầy đủ — luôn dấu chấm tách nghìn (vi-VN), KHÔNG rút gọn về "tr/tỷ" để tổng khớp chính xác.
// Trước đây compact format gây sum != year-total vì rounding.
function formatMoney(value: number) {
  return value.toLocaleString('vi-VN');
}

function getRate(actual: number, target: number) {
  if (!target) return 0;
  return Math.round((actual / target) * 100);
}
function getStatus(rate: number) {
  if (rate >= 90) return "Đạt";
  if (rate >= 60) return "Cần chú ý";
  return "Nguy cơ";
}

type StatusKey = "good" | "warning" | "risk";
function statusKey(rate: number): StatusKey {
  if (rate >= 90) return "good";
  if (rate >= 60) return "warning";
  return "risk";
}
const STATUS_CHIP: Record<StatusKey, string> = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  risk: "border-rose-200 bg-rose-50 text-rose-700",
};
const STATUS_TEXT: Record<StatusKey, string> = {
  good: "text-emerald-700",
  warning: "text-amber-700",
  risk: "text-rose-700",
};
const STATUS_BAR_HEX: Record<StatusKey, string> = {
  good: "#059669",     // emerald-600
  warning: "#d97706",  // amber-600
  risk: "#e11d48",     // rose-600
};
const BRAND_EMERALD = "#059669";

function canViewAll(user: CurrentUser) {
  return user.role === "ceo" || user.role === "business_director" || user.role === "admin";
}

/* ============================================================
   Reusable atoms — light + brand
   ============================================================ */

function StatusChip({ rate }: { rate: number }) {
  const k = statusKey(rate);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_CHIP[k]}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_BAR_HEX[k] }} />
      {getStatus(rate)} · {rate}%
    </span>
  );
}

/** Bar light theme — track emerald-50 + border, fill hex màu */
function Bar({
  pct,
  hexOverride,
  size = "md",
}: {
  pct: number;
  hexOverride?: string;
  size?: "sm" | "md" | "lg";
}) {
  const heightPx = size === "lg" ? 12 : size === "sm" ? 6 : 8;
  const w = Math.max(0, Math.min(pct, 100));
  const hex = hexOverride || STATUS_BAR_HEX[statusKey(pct)];
  return (
    <div
      className="relative w-full overflow-hidden rounded-full"
      style={{
        height: `${heightPx}px`,
        backgroundColor: "#ecfdf5", // emerald-50
        border: "1px solid #a7f3d0", // emerald-200
      }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${w}%`, backgroundColor: hex }}
      />
    </div>
  );
}

/** Dot scale 10 chấm — visual nhẹ nhàng cho rating/percent */
function DotScale({ pct, hex }: { pct: number; hex: string }) {
  const filled = Math.round(pct / 10);
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 10 }).map((_, i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full"
          style={{
            backgroundColor: i < filled ? hex : "#e2e8f0", // slate-200
          }}
        />
      ))}
    </span>
  );
}

function TrendBadge({ deltaPct }: { deltaPct: number }) {
  const up = deltaPct >= 0;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
      up ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
    }`}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {up ? "+" : ""}{deltaPct.toFixed(1).replace('.', ',')}%
    </span>
  );
}

/* ============================================================
   System Progress Cards (Tháng / Năm)
   ============================================================ */

function SystemProgressCard({
  scope,
  period,
  rate,
  target,
  actual,
  trendDeltaPct,
}: {
  scope: "month" | "year";
  period: string;
  rate: number;
  target: number;
  actual: number;
  trendDeltaPct?: number;
}) {
  const k = statusKey(rate);
  const remaining = Math.max(0, target - actual);
  const isMonth = scope === "month";
  const achievedPct = Math.max(0, Math.min(rate, 100));

  return (
    <article className="relative overflow-hidden rounded-xl border-2 border-emerald-200 bg-white p-5 shadow-sm">
      {/* Brand top stripe */}
      <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-cyan-400" aria-hidden />

      {/* Header */}
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${
            isMonth ? "bg-emerald-50 text-emerald-700" : "bg-cyan-50 text-cyan-700"
          }`}>
            {isMonth ? <BarChart3 size={18} /> : <Calendar size={18} />}
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Tiến độ doanh số {isMonth ? "tháng" : "năm"} {period}
            </h2>
            <p className="text-xs text-slate-500">
              {isMonth ? "Doanh thu trong tháng đang chọn" : "Lũy kế từ đầu năm"}
            </p>
          </div>
        </div>
        {trendDeltaPct !== undefined && <TrendBadge deltaPct={trendDeltaPct} />}
      </header>

      {/* 2 KPI cân đối: tỷ lệ hoàn thành | còn thiếu */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
          <div className={`text-xl sm:text-2xl md:text-3xl font-bold tabular-nums leading-tight ${STATUS_TEXT[k]}`}>
            {rate}%
          </div>
          <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Tỷ lệ hoàn thành
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 min-w-0">
          {/* 2026-06-11: smoother size jump — base→xl→2xl thay vì sm→lg→3xl (nhảy 3 step gây hỗn loạn) */}
          <div className="text-base sm:text-xl md:text-2xl font-bold tabular-nums leading-tight text-slate-900 whitespace-nowrap overflow-hidden">
            {formatMoney(remaining)}
          </div>
          <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Còn thiếu
          </div>
        </div>
      </div>

      {/* Comparison bars: Mục tiêu (baseline) & Thực đạt */}
      <div className="space-y-3">
        <CompareBar label="Mục tiêu" value={formatMoney(target)} widthPct={100} hex="#cbd5e1" />
        <CompareBar
          label="Thực đạt"
          value={formatMoney(actual)}
          widthPct={achievedPct}
          hex={STATUS_BAR_HEX[k]}
          highlight
        />
      </div>
    </article>
  );
}

/** Bar so sánh với label trái + value phải — light theme */
function CompareBar({
  label,
  value,
  widthPct,
  hex,
  highlight,
}: {
  label: string;
  value: string;
  widthPct: number;
  hex: string;
  highlight?: boolean;
}) {
  const w = Math.max(0, Math.min(widthPct, 100));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-slate-600">{label}</span>
        <span
          className={`font-bold tabular-nums ${highlight ? "" : "text-slate-700"}`}
          style={highlight ? { color: hex } : undefined}
        >
          {value}
        </span>
      </div>
      <div
        className="relative w-full overflow-hidden rounded-full"
        style={{
          height: "12px",
          backgroundColor: "#ecfdf5", // emerald-50
          border: "1px solid #a7f3d0", // emerald-200
        }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${w}%`, backgroundColor: hex }}
        />
        {highlight && (
          <span
            className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums text-white"
            style={{ textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}
          >
            {Math.round(w)}%
          </span>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Discrepancy Warning — cảnh báo lệch per-sale vs per-package
   ============================================================ */

function fmtMoney(n: number): string {
  return n.toLocaleString('vi-VN') + 'đ';
}

function DiscrepancyWarning({
  discrepancies,
}: { discrepancies?: { month: number; revenuePerSale: number; revenuePerPackage: number; diff: number }[] }) {
  const [open, setOpen] = useState(false);
  if (!discrepancies || discrepancies.length === 0) return null;
  const yearEntry = discrepancies.find((d) => d.month === 0);
  const monthEntries = discrepancies.filter((d) => d.month > 0);
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-700 ring-1 ring-rose-200 text-[10px] font-bold hover:bg-rose-100"
        title="Lệch doanh thu — click xem chi tiết"
      >
        ⚠ {discrepancies.length}
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-full mt-1 z-50 w-[320px] rounded-lg bg-white ring-1 ring-rose-300 shadow-lg p-3 text-left text-[11px] font-normal text-slate-700"
        >
          <div className="font-bold text-rose-700 mb-1.5 text-xs flex items-center justify-between">
            <span>⚠ Doanh thu lệch giữa 2 nguồn</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-slate-700 leading-none text-base"
              aria-label="Đóng"
            >×</button>
          </div>
          <div className="text-[10px] text-slate-500 mb-2 leading-snug">
            Tổng từ <strong>per-sale</strong> (mỗi NV bán) cần bằng tổng từ <strong>per-package</strong> (mỗi gói).
            Lệch = data nhập sai 1 trong 2 chỗ → cần kiểm tra.
          </div>
          {yearEntry && (
            <div className="rounded bg-rose-50 ring-1 ring-rose-200 p-2 mb-1.5">
              <div className="font-semibold text-rose-800 mb-1">📅 Tổng năm</div>
              <div className="grid grid-cols-3 gap-1 tabular-nums">
                <div><span className="text-slate-500">Per-sale:</span><br/>{fmtMoney(yearEntry.revenuePerSale)}</div>
                <div><span className="text-slate-500">Per-package:</span><br/>{fmtMoney(yearEntry.revenuePerPackage)}</div>
                <div className="text-rose-700 font-bold"><span className="text-slate-500">Lệch:</span><br/>{yearEntry.diff > 0 ? '+' : ''}{fmtMoney(yearEntry.diff)}</div>
              </div>
            </div>
          )}
          {monthEntries.length > 0 && (
            <div>
              <div className="font-semibold text-slate-700 mb-1">Lệch theo tháng:</div>
              <div className="max-h-[200px] overflow-y-auto space-y-1">
                {monthEntries.map((d) => (
                  <div key={d.month} className="flex items-center justify-between rounded bg-amber-50 ring-1 ring-amber-200 px-2 py-1">
                    <span className="font-semibold text-amber-800">T{d.month}</span>
                    <span className="text-[10px] text-slate-500">
                      Sale: {fmtMoney(d.revenuePerSale)} · Gói: {fmtMoney(d.revenuePerPackage)}
                    </span>
                    <span className="text-rose-700 font-bold ml-1">{d.diff > 0 ? '+' : ''}{fmtMoney(d.diff)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

/* ============================================================
   Branch Card
   ============================================================ */

function BranchCard({
  branch,
  month,
  year,
  onClick,
  wide = false,
}: {
  branch: BranchRevenue;
  month: number;
  year: number;
  onClick: () => void;
  /** QLCS-only-1-branch view: card kéo dài cả hàng + thêm 2 bar chart ngang theo sale */
  wide?: boolean;
}) {
  // Year totals — lấy thẳng từ data.firebase aggregate (không nhân thêm hệ số nào).
  const yearTarget = branch.yearTarget ?? 0;
  const yearActual = branch.sales.reduce((s, x) => s + x.actual, 0);
  const yearRate = getRate(yearActual, yearTarget);

  // Month totals — lấy đúng tháng đang xem từ monthTargets[] và byMonth[].
  const monthIdx = Math.max(0, Math.min(11, month - 1));
  const monthTarget = branch.monthTargets?.[monthIdx] ?? 0;
  const monthActual = branch.byMonth?.[monthIdx]?.revenue ?? 0;
  const monthRate = getRate(monthActual, monthTarget);

  // Real data: lead/closed thật từ salesEntries + target lead thật từ admin (salesTargets).
  // Khi chưa có data → 0/0/0%.
  const sources: SourceStat[] = SOURCE_LIST.map((src) => {
    const rs = branch.realSources?.find((x) => x.source === src);
    const actualLeads = rs?.leads ?? 0;
    const closed = rs?.closed ?? 0;
    return {
      source: src,
      targetLeads: rs?.targetLeadsYear ?? 0,
      actualLeads,
      actualClosed: closed,
      closeRatePct: actualLeads > 0 ? Math.round((closed / actualLeads) * 100) : 0,
    };
  });

  return (
    <article className={`group relative overflow-hidden rounded-xl border-2 border-emerald-200 bg-white p-5 shadow-sm transition hover:border-emerald-400 hover:shadow-md ${wide ? 'md:col-span-2 xl:col-span-3' : ''}`}>
      {/* Brand left stripe */}
      <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-emerald-500 via-emerald-400 to-cyan-400" aria-hidden />

      {/* Header */}
      <header className="mb-4 flex items-start justify-between gap-3 pl-1">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900 truncate flex items-center gap-1.5">
            {branch.branchName}
            <DiscrepancyWarning discrepancies={branch.revenueDiscrepancies} />
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">Lũy kế năm {year}</p>
        </div>
        <StatusChip rate={yearRate} />
      </header>

      {/* Big number — 2026-06-11: bump mobile lên text-lg để đọc rõ; target text-[11px] đồng nhất khoá nhỏ */}
      <div className="mb-3 min-w-0">
        <div className="text-lg sm:text-xl md:text-2xl font-bold tabular-nums text-slate-900 whitespace-nowrap overflow-hidden">
          <span>{formatMoney(yearActual)}</span>
          <span className="ml-1.5 text-[11px] sm:text-xs md:text-sm font-normal text-slate-500 tabular-nums">
            / {formatMoney(yearTarget)}
          </span>
        </div>
      </div>

      {/* 2 bars */}
      <div className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-slate-500">Năm {year}</span>
            <span className={`font-semibold tabular-nums ${STATUS_TEXT[statusKey(yearRate)]}`}>
              {yearRate}%
            </span>
          </div>
          <Bar pct={yearRate} />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-slate-500">Tháng {month}</span>
            <span className={`font-semibold tabular-nums ${STATUS_TEXT[statusKey(monthRate)]}`}>
              {monthRate}% · {formatMoney(monthActual)}
            </span>
          </div>
          <Bar pct={monthRate} />
        </div>
      </div>

      {/* Source list — Mock-Frame 2026-06-12: grid 4 cột cố định để thanh tiến độ,
          số count và % LUÔN CÙNG 1 HÀNG. Không flex-wrap. Mobile vẫn fit. */}
      <div className="mt-4 border-t border-slate-100 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Nguồn khách hàng
          </h4>
          <span className="text-[10px] text-slate-400">tổng · chốt / chưa chốt · tỷ lệ</span>
        </div>
        <ul className="space-y-2">
          {sources.map((s) => {
            const Icon = SOURCE_ICON[s.source];
            const notClosed = Math.max(0, s.actualLeads - s.actualClosed);
            const closeHex = STATUS_BAR_HEX[statusKey(s.closeRatePct * 1.5)];
            // Thanh tiến độ = % chốt trên tổng lead nguồn này (cap 100)
            const barPct = Math.min(100, Math.max(0, s.closeRatePct));
            return (
              <li
                key={s.source}
                className="grid grid-cols-[18px_minmax(64px,80px)_1fr_minmax(80px,auto)_32px] items-center gap-x-2 text-xs"
              >
                {/* 1. Icon */}
                <Icon size={13} className="text-slate-400" />
                {/* 2. Tên nguồn */}
                <span className="truncate font-medium text-slate-700">
                  {SOURCE_LABEL[s.source]}
                </span>
                {/* 3. Thanh tiến độ — chiếm flex-1 */}
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${barPct}%`, backgroundColor: closeHex }}
                    title={`${s.closeRatePct}% chốt`}
                  />
                </div>
                {/* 4. Số count: tổng · chốt / chưa chốt — tabular-nums giữ cột */}
                <span className="text-right tabular-nums whitespace-nowrap text-[11px]">
                  <span className="text-slate-400">{s.actualLeads.toLocaleString("vi-VN")}</span>
                  <span className="text-slate-300 mx-0.5">·</span>
                  <span className="font-semibold text-emerald-700" title="Đã chốt">{s.actualClosed.toLocaleString("vi-VN")}</span>
                  <span className="text-slate-300 mx-0.5">/</span>
                  <span className="font-semibold text-amber-700" title="Chưa chốt">{notClosed.toLocaleString("vi-VN")}</span>
                </span>
                {/* 5. % rate */}
                <span
                  className="text-right text-[11px] font-bold tabular-nums"
                  style={{ color: closeHex }}
                >
                  {s.closeRatePct}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Footer link */}
      <button
        type="button"
        onClick={onClick}
        className="mt-4 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
      >
        Xem chi tiết theo sale & tháng
        <ChevronRight size={13} />
      </button>
    </article>
  );
}

/** Bar chart ngang — so sánh giá trị giữa các sale. Dùng cho QLCS view (doanh số/lead năm). */
function SaleHorizontalBarChart({
  title,
  data,
  color,
  formatValue,
  unit,
}: {
  title: string;
  data: { name: string; value: number; sub?: string }[];
  color: string;
  formatValue: (v: number) => string;
  unit?: string;
}) {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const max = Math.max(...sorted.map((d) => d.value), 1);
  const hasData = sorted.some((d) => d.value > 0);
  return (
    <div>
      <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </h4>
      {!hasData ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-3 py-4 text-center text-[11px] text-slate-400">
          Chưa có dữ liệu
        </div>
      ) : (
        <ul className="space-y-1.5">
          {sorted.map((d) => {
            const pct = (d.value / max) * 100;
            return (
              <li key={d.name} className="flex items-center gap-2 text-xs">
                {/* Tên Sale: cho phép wrap (xuống dòng) nếu dài hơn 11rem ~ 176px,
                    không truncate. Đảm bảo tên Sale dài (vd "Nguyễn Thị Thanh Huyền")
                    luôn hiển thị đầy đủ — anh chốt 2026-06-02. */}
                <span className="w-44 shrink-0 font-medium text-slate-700 break-words leading-tight" title={d.name}>
                  {d.name}
                </span>
                <div className="relative h-5 flex-1 overflow-hidden rounded bg-slate-100">
                  <div
                    className="h-full rounded transition-[width] duration-500"
                    style={{ width: `${Math.max(2, pct)}%`, backgroundColor: color }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-700">
                  {formatValue(d.value)}{unit ? ` ${unit}` : ''}
                  {d.sub && <span className="ml-1 block text-[10px] font-normal text-slate-400">{d.sub}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ============================================================
   Branch Detail Modal
   ============================================================ */

/** Mini cột vertical chart cho 12 tháng (Mục tiêu + Thực đạt) */
function MonthlyRevenueChart({ rows }: { rows: MonthlyRow[] }) {
  const max = Math.max(...rows.map((r) => Math.max(r.target, r.actual)), 1);
  const H = 130;
  return (
    <div className="overflow-x-auto">
      <div
        className="flex items-end gap-2 px-1"
        style={{ height: H + 24 }}
      >
        {rows.map((r) => {
          const tH = (r.target / max) * H;
          const aH = (r.actual / max) * H;
          const rate = getRate(r.actual, r.target);
          const aHex = STATUS_BAR_HEX[statusKey(rate)];
          return (
            <div key={r.month} className="flex min-w-[22px] sm:min-w-[36px] flex-1 flex-col items-center">
              <div className="flex h-[130px] items-end gap-1">
                <div
                  className="w-3 rounded-t-sm transition-[height] duration-500"
                  style={{ height: `${Math.max(2, tH)}px`, backgroundColor: "#cbd5e1" }}
                  title={`MT: ${formatMoney(r.target)}`}
                />
                <div
                  className="w-3 rounded-t-sm transition-[height] duration-500"
                  style={{ height: `${Math.max(2, aH)}px`, backgroundColor: aHex }}
                  title={`TĐ: ${formatMoney(r.actual)} · ${rate}%`}
                />
              </div>
              <div className="mt-1 text-[10px] font-semibold text-slate-600">T{r.month}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Bar chart per sale */
function ChartLegend() {
  return (
    <div className="flex items-center gap-3 text-[10px] text-slate-500">
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "#cbd5e1" }} /> Mục tiêu
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "#059669" }} /> Thực đạt
      </span>
    </div>
  );
}

// Phối màu theo nguồn (brand-friendly, emerald lead).
const SOURCE_HEX: Record<LeadSource, string> = {
  MKT: "#10b981",        // emerald-500
  Sale: "#3b82f6",       // blue-500
  Renew: "#f59e0b",      // amber-500
  Referral: "#a855f7",   // purple-500
  "Walk-in": "#ef4444",  // red-500
};

function LeadSourceLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-600">
      {SOURCE_LIST.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SOURCE_HEX[s] }} />
          {SOURCE_LABEL[s]}
        </span>
      ))}
    </div>
  );
}

/** Stacked bar chart: lead theo nguồn (12 tháng) */
function MonthlyLeadChart({ rows }: { rows: MonthlyRow[] }) {
  const monthTotals = rows.map((r) =>
    SOURCE_LIST.reduce((a, s) => a + (r.leadsBySource[s] || 0), 0),
  );
  const max = Math.max(...monthTotals, 1);
  const H = 130;
  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-2 px-1" style={{ height: H + 28 }}>
        {rows.map((r, idx) => {
          const total = monthTotals[idx];
          const totalH = (total / max) * H;
          return (
            <div key={r.month} className="flex min-w-[22px] sm:min-w-[36px] flex-1 flex-col items-center">
              <div
                className="flex w-6 flex-col-reverse overflow-hidden rounded-t-sm transition-[height] duration-500"
                style={{ height: `${Math.max(2, totalH)}px` }}
                title={`T${r.month}: ${total} lead`}
              >
                {SOURCE_LIST.map((s) => {
                  const leads = r.leadsBySource[s] || 0;
                  if (leads === 0) return null;
                  const segH = (leads / Math.max(1, total)) * totalH;
                  return (
                    <div
                      key={s}
                      style={{ height: `${segH}px`, backgroundColor: SOURCE_HEX[s] }}
                      title={`${SOURCE_LABEL[s]}: ${leads}`}
                    />
                  );
                })}
              </div>
              <div className="mt-1 text-[10px] font-semibold text-slate-600">T{r.month}</div>
              <div className="text-[9px] tabular-nums text-slate-400">{total}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BranchDetailModal({
  branch,
  month,
  year,
  onClose,
  currentUser,
}: {
  branch: BranchRevenue;
  month: number;
  year: number;
  onClose: () => void;
  currentUser: CurrentUser;
}) {
  // QLCS-of-this-branch hoặc CEO/GD được sửa staff targets
  const canEditStaffTargets =
    canViewAll(currentUser) ||
    (currentUser.role === 'branch_manager' && currentUser.branchIds.includes(branch.branchId));
  const [staffTargetOpen, setStaffTargetOpen] = useState(false);
  // Month totals đúng tháng đang xem
  const monthIdx = Math.max(0, Math.min(11, month - 1));
  const monthTarget = branch.monthTargets?.[monthIdx] ?? 0;
  const monthActual = branch.byMonth?.[monthIdx]?.revenue ?? 0;
  const monthRate = getRate(monthActual, monthTarget);

  // 12 tháng + tổng năm (lấy trực tiếp từ aggregate)
  const monthlyRows = useMemo(() => getMonthlyBranchData(branch), [branch]);
  const yearTarget = branch.yearTarget ?? 0;
  const yearActual = branch.sales.reduce((s, x) => s + x.actual, 0);
  const yearRate = getRate(yearActual, yearTarget);

  // Drill-down state: tháng đang xem chi tiết (mở MonthDetailModal)
  const [drillMonth, setDrillMonth] = useState<number | null>(null);

  // Tổng lead theo nguồn cả năm
  const yearSourceTotals = useMemo(() => {
    const out = { MKT: 0, Sale: 0, Renew: 0, Referral: 0, "Walk-in": 0 } as Record<LeadSource, number>;
    monthlyRows.forEach((r) => {
      SOURCE_LIST.forEach((s) => { out[s] += r.leadsBySource[s]; });
    });
    return out;
  }, [monthlyRows]);

  return (
    <div
      className="fixed inset-0 z-30 flex items-start justify-center bg-slate-900/40 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative my-6 w-full max-w-6xl overflow-hidden rounded-2xl border-2 border-emerald-300 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Brand top stripe */}
        <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-cyan-400" aria-hidden />

        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{branch.branchName}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Năm {year} · {branch.sales.length} sale · Đang xem chi tiết
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </header>

        {/* Hero KPIs — Phase 13.16.5: mobile px-3 py-3 gap-2 cho gọn */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 border-b border-slate-100 bg-emerald-50/40 px-3 py-3 sm:px-6 sm:py-4 md:grid-cols-4">
          <KpiTile label="Mục tiêu năm" value={formatMoney(yearTarget)} />
          <KpiTile label="Thực đạt năm" value={formatMoney(yearActual)} hex={STATUS_BAR_HEX[statusKey(yearRate)]} />
          <KpiTile label="% Hoàn thành năm" value={`${yearRate}%`} hex={STATUS_BAR_HEX[statusKey(yearRate)]} />
          <KpiTile label={`Tháng ${month}/${year}`} value={`${formatMoney(monthActual)} · ${monthRate}%`} sub={`MT: ${formatMoney(monthTarget)}`} />
        </div>

        <div className="space-y-6 sm:space-y-8 px-3 sm:px-6 py-4 sm:py-5">
          {/* ╔══════════════════════════════════════════════════════════╗
              ║  PHẦN 1 — DOANH SỐ (Revenue)                              ║
              ║  1A: Tổng theo tháng · 1B: Theo Sale theo tháng           ║
              ╚══════════════════════════════════════════════════════════╝ */}
          <MajorSectionHeader
            icon={BarChart3}
            title="PHẦN 1 — DOANH SỐ"
            subtitle="Tổng doanh thu theo tháng + chi tiết từng Sale"
            color="emerald"
          />
          <div className="space-y-4 pl-1 border-l-4 border-emerald-300/60 -ml-1">

          {/* ===== Section 1A: Doanh thu tổng từng tháng ===== */}
          <section className="overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm">
            <header className="flex items-center justify-between gap-3 flex-wrap border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-emerald-700" />
                <h3 className="text-sm font-bold text-emerald-900">
                  1A — Doanh thu tổng từng tháng <span className="text-emerald-600/70">(12 tháng)</span>
                </h3>
              </div>
              <ChartLegend />
            </header>

            <div className="p-4">
              <MonthlyRevenueChart rows={monthlyRows} />

              <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs tabular-nums">
                  <thead>
                    <tr className="bg-emerald-50/80 text-emerald-900">
                      <th className="px-3 py-2.5 text-left font-semibold">Tháng</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Mục tiêu</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Thực đạt</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Chênh lệch</th>
                      <th className="px-3 py-2.5 text-right font-semibold">% Hoàn thành</th>
                      <th className="px-3 py-2.5 text-center font-semibold">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyRows.map((r, idx) => {
                      const rate = getRate(r.actual, r.target);
                      const sk = statusKey(rate);
                      const diff = r.actual - r.target;
                      return (
                        <tr
                          key={r.month}
                          onClick={() => setDrillMonth(r.month)}
                          title="Click để xem chi tiết tháng (sale × doanh số)"
                          className={`border-t border-slate-100 hover:bg-emerald-100/60 cursor-pointer transition ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}
                        >
                          <td className="px-3 py-2 font-semibold text-slate-800">
                            <span className="inline-flex items-center gap-1.5">
                              T{r.month}
                              <span className="text-[9px] font-normal text-emerald-600 opacity-0 group-hover:opacity-100">📋</span>
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-slate-600 whitespace-nowrap">{formatMoney(r.target)}</td>
                          <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${STATUS_TEXT[sk]}`}>{formatMoney(r.actual)}</td>
                          <td className="px-3 py-2 text-right font-medium whitespace-nowrap" style={{ color: diff >= 0 ? '#059669' : '#ef4444' }}>
                            {diff >= 0 ? '+' : ''}{formatMoney(Math.abs(diff))}
                          </td>
                          <td className={`px-3 py-2 text-right font-bold ${STATUS_TEXT[sk]}`}>{rate}%</td>
                          <td className="px-3 py-2 text-center">
                            <span
                              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                              style={{ backgroundColor: STATUS_BAR_HEX[sk] + '20', color: STATUS_BAR_HEX[sk] }}
                            >
                              {getStatus(rate)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {/* Tổng năm */}
                    <tr className="border-t-2 border-emerald-300 bg-gradient-to-r from-emerald-100/80 to-teal-50">
                      <td className="px-3 py-2.5 font-bold text-emerald-900">Cả năm</td>
                      <td className="px-3 py-2.5 text-right font-bold text-slate-800 whitespace-nowrap">{formatMoney(yearTarget)}</td>
                      <td className="px-3 py-2.5 text-right font-bold whitespace-nowrap" style={{ color: STATUS_BAR_HEX[statusKey(yearRate)] }}>
                        {formatMoney(yearActual)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold whitespace-nowrap" style={{ color: (yearActual - yearTarget) >= 0 ? '#059669' : '#ef4444' }}>
                        {(yearActual - yearTarget) >= 0 ? '+' : ''}{formatMoney(Math.abs(yearActual - yearTarget))}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold" style={{ color: STATUS_BAR_HEX[statusKey(yearRate)] }}>
                        {yearRate}%
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                          style={{ backgroundColor: STATUS_BAR_HEX[statusKey(yearRate)] + '25', color: STATUS_BAR_HEX[statusKey(yearRate)] }}
                        >
                          {getStatus(yearRate)}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ===== Section 1B: Doanh số tháng theo Sale (chart + table + QLCS target) ===== */}
          <SaleMonthlyRevenueSection
            branch={branch}
            canEditTarget={canEditStaffTargets}
            onEditTarget={() => setStaffTargetOpen(true)}
          />

          {/* ===== Section 1C: Doanh số theo gói × 12 tháng (per-package breakdown) ===== */}
          <PackageRevenueMonthlySection branch={branch} />

          </div>{/* end Phần 1 wrapper */}

          {/* ╔══════════════════════════════════════════════════════════╗
              ║  PHẦN 2 — LEAD                                            ║
              ║  2A: Tổng lead theo nguồn · 2B: Lead theo Sale per tháng  ║
              ╚══════════════════════════════════════════════════════════╝ */}
          <MajorSectionHeader
            icon={Megaphone}
            title="PHẦN 2 — LEAD"
            subtitle="Tổng lead theo nguồn + chi tiết theo Sale từng tháng"
            color="amber"
          />
          <div className="space-y-4 pl-1 border-l-4 border-amber-300/60 -ml-1">

          {/* ===== Section 2A: Lead theo nguồn (12 tháng) ===== */}
          <section className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
            <header className="flex items-center justify-between gap-3 flex-wrap border-b border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <BarChart3 size={16} className="text-amber-700" />
                <h3 className="text-sm font-bold text-amber-900">
                  2A — Tổng Lead theo nguồn <span className="text-amber-600/70">(12 tháng)</span>
                </h3>
              </div>
              <LeadSourceLegend />
            </header>

            <div className="p-4">
              <MonthlyLeadChart rows={monthlyRows} />

              <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs tabular-nums">
                  <thead>
                    <tr className="bg-emerald-50/80 text-emerald-900">
                      <th className="px-3 py-2.5 text-left font-semibold sticky left-0 bg-emerald-50/80 z-10">Tháng</th>
                      {SOURCE_LIST.map((s) => {
                        const Icon = SOURCE_ICON[s];
                        return (
                          <th key={s} className="px-2 py-2.5 text-right font-semibold">
                            <div className="inline-flex items-center gap-1 justify-end">
                              <Icon size={11} style={{ color: SOURCE_HEX[s] }} />
                              <span>{SOURCE_LABEL[s]}</span>
                            </div>
                          </th>
                        );
                      })}
                      <th className="px-3 py-2.5 text-right font-semibold bg-emerald-100/70">Tổng lead</th>
                      <th className="px-3 py-2.5 text-right font-semibold bg-emerald-100/70">Tổng chốt</th>
                      <th className="px-3 py-2.5 text-right font-semibold bg-emerald-100/70">% Chốt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyRows.map((r, idx) => {
                      let totalLead = 0;
                      let totalClosed = 0;
                      SOURCE_LIST.forEach((s) => {
                        totalLead += r.leadsBySource[s];
                        totalClosed += r.closedBySource[s];
                      });
                      const totalClosePct = totalLead > 0 ? Math.round((totalClosed / totalLead) * 100) : 0;
                      const closeHex = STATUS_BAR_HEX[statusKey(totalClosePct * 1.5)];
                      return (
                        <tr key={r.month} className={`border-t border-slate-100 hover:bg-emerald-50/30 ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}>
                          <td className={`px-3 py-2 font-semibold text-slate-800 sticky left-0 z-10 ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}>T{r.month}</td>
                          {SOURCE_LIST.map((s) => (
                            <SourceCell key={s} leads={r.leadsBySource[s]} closed={r.closedBySource[s]} />
                          ))}
                          <td className="px-3 py-2 text-right font-bold text-slate-800 bg-emerald-50/40">{totalLead}</td>
                          <td className="px-3 py-2 text-right font-bold bg-emerald-50/40" style={{ color: closeHex }}>{totalClosed}</td>
                          <td className="px-3 py-2 text-right font-bold bg-emerald-50/40" style={{ color: closeHex }}>{totalClosePct}%</td>
                        </tr>
                      );
                    })}
                    {/* Tổng năm — sum trực tiếp các tháng, không fake */}
                    {(() => {
                      let yTotalLead = 0;
                      let yTotalClosed = 0;
                      const yClosedBySource = {} as Record<LeadSource, number>;
                      SOURCE_LIST.forEach((s) => { yClosedBySource[s] = 0; });
                      monthlyRows.forEach((r) => {
                        SOURCE_LIST.forEach((s) => {
                          yClosedBySource[s] += r.closedBySource[s];
                        });
                      });
                      SOURCE_LIST.forEach((s) => {
                        yTotalLead += yearSourceTotals[s];
                        yTotalClosed += yClosedBySource[s];
                      });
                      const yTotalClosePct = yTotalLead > 0 ? Math.round((yTotalClosed / yTotalLead) * 100) : 0;
                      const yCloseHex = STATUS_BAR_HEX[statusKey(yTotalClosePct * 1.5)];
                      return (
                        <tr className="border-t-2 border-emerald-300 bg-gradient-to-r from-emerald-100/80 to-teal-50">
                          <td className="px-3 py-2.5 font-bold text-emerald-900 sticky left-0 bg-emerald-100/80 z-10">Cả năm</td>
                          {SOURCE_LIST.map((s) => (
                            <SourceCell key={s} leads={yearSourceTotals[s]} closed={yClosedBySource[s]} bold />
                          ))}
                          <td className="px-3 py-2.5 text-right font-bold text-emerald-900 bg-emerald-200/40">{yTotalLead}</td>
                          <td className="px-3 py-2.5 text-right font-bold bg-emerald-200/40" style={{ color: yCloseHex }}>{yTotalClosed}</td>
                          <td className="px-3 py-2.5 text-right font-bold bg-emerald-200/40" style={{ color: yCloseHex }}>{yTotalClosePct}%</td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ===== Section 2B: Lead theo Sale theo tháng ===== */}
          <LeadBySaleMonthSection branch={branch} />

          </div>{/* end Phần 2 wrapper */}

          {/* ╔══════════════════════════════════════════════════════════╗
              ║  PHẦN 3 — SỐ LƯỢNG GÓI DỊCH VỤ (Cơ cấu)                  ║
              ║  Per package × 12 tháng (độc lập với doanh số per sale)  ║
              ╚══════════════════════════════════════════════════════════╝ */}
          <MajorSectionHeader
            icon={Package}
            title="PHẦN 3 — SỐ LƯỢNG GÓI DỊCH VỤ"
            subtitle="Cơ cấu gói bán được theo tháng — phân tích sản phẩm chủ lực"
            color="purple"
          />
          <div className="space-y-4 pl-1 border-l-4 border-purple-300/60 -ml-1">
            <PackageQuantitySection branch={branch} />
          </div>
        </div>
      </div>

      {/* Drill-down: chi tiết tháng (sale × doanh số) */}
      {drillMonth !== null && (
        <MonthDetailModal
          branchId={branch.branchId}
          branchName={branch.branchName}
          year={year}
          month={drillMonth}
          onClose={() => setDrillMonth(null)}
        />
      )}

      {/* Đặt mục tiêu Sale per tháng (QLCS / admin) */}
      {staffTargetOpen && (
        <StaffTargetModal
          year={year}
          branchId={branch.branchId}
          branchName={branch.branchName}
          sales={(branch.sales ?? [])
            .filter((s) => s.saleId !== '__aggregate')
            .map((s) => ({ saleId: s.saleId, saleName: s.saleName }))}
          onClose={() => setStaffTargetOpen(false)}
        />
      )}
    </div>
  );
}

/** Cell trong bảng nguồn — hiển thị 3 số: lead / chốt / tỷ lệ chốt */
function SourceCell({
  leads,
  closed,
  bold,
}: {
  leads: number;
  closed: number;
  bold?: boolean;
}) {
  // Tỷ lệ chốt = closed/leads (data thật, không fake). Color multiplier 1.5 chỉ cho UI threshold.
  const ratePct = leads > 0 ? Math.round((closed / leads) * 100) : 0;
  const hex = STATUS_BAR_HEX[statusKey(ratePct * 1.5)];
  return (
    <td className="py-2 text-right tabular-nums">
      <div className={`leading-tight ${bold ? "font-bold text-slate-800" : "text-slate-700"}`}>
        {leads}
      </div>
      <div className="text-[10px] leading-tight text-slate-500">
        <span style={{ color: hex, fontWeight: 600 }}>{closed}</span> · {ratePct}%
      </div>
    </td>
  );
}

function KpiTile({ label, value, sub, hex }: { label: string; value: string; sub?: string; hex?: string }) {
  // Phase 13.16.7: whitespace-nowrap giữ số VND nguyên dòng, font nhỏ vừa đủ thay vì break-all.
  return (
    <div className="rounded-lg border border-emerald-100 bg-white px-2.5 py-2 sm:px-3 sm:py-2.5 min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 truncate">{label}</div>
      <div
        className="mt-0.5 text-xs sm:text-sm md:text-lg font-bold tabular-nums leading-tight whitespace-nowrap overflow-hidden"
        style={hex ? { color: hex } : { color: "#0f172a" }}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-slate-500 whitespace-nowrap overflow-hidden">{sub}</div>}
    </div>
  );
}


// ============================================================================
// MajorSectionHeader — thanh header lớn phân chia 2 block lớn (Phần 1 / Phần 2)
// ============================================================================
function MajorSectionHeader({
  icon: Icon, title, subtitle, color,
}: {
  icon: any; title: string; subtitle?: string; color: 'emerald' | 'amber' | 'purple';
}) {
  const COLOR_MAP = {
    emerald: { bg: 'from-emerald-600 to-teal-600', shadow: 'shadow-emerald-200/50', iconBg: 'bg-emerald-700/30' },
    amber:   { bg: 'from-amber-600 to-orange-600',  shadow: 'shadow-amber-200/50',   iconBg: 'bg-amber-700/30' },
    purple:  { bg: 'from-purple-600 to-fuchsia-600', shadow: 'shadow-purple-200/50', iconBg: 'bg-purple-700/30' },
  }[color];
  return (
    <div className={`rounded-xl bg-gradient-to-r ${COLOR_MAP.bg} text-white px-5 py-3 shadow-md ${COLOR_MAP.shadow} flex items-center gap-3`}>
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${COLOR_MAP.iconBg}`}>
        <Icon size={20} />
      </div>
      <div>
        <h2 className="text-base font-extrabold tracking-wide leading-tight">{title}</h2>
        {subtitle && <p className="text-xs opacity-90 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// ============================================================================
// PHẦN 1B — Doanh số tháng theo Sale (chart cột + table có mục tiêu QLCS)
// ============================================================================
const MONTH_HEX_PALETTE = [
  '#10b981', '#3b82f6', '#f59e0b', '#a855f7', '#ef4444',
  '#06b6d4', '#84cc16', '#ec4899', '#0ea5e9', '#f97316',
  '#14b8a6', '#8b5cf6', '#f43f5e', '#22c55e', '#6366f1',
];

function SaleMonthlyRevenueSection({ branch, canEditTarget, onEditTarget }: {
  branch: BranchRevenue;
  canEditTarget?: boolean;
  onEditTarget?: () => void;
}) {
  // Loại sale aggregate ra khỏi chart per-sale
  const sales = useMemo(
    () => (branch.sales ?? []).filter((s) => s.saleId !== '__aggregate'),
    [branch.sales],
  );

  if (sales.length === 0) {
    return null;
  }

  // Per-sale doanh số tháng + target. Nếu sale thiếu revenueByMonth (data cũ) → mảng 0.
  const rows = sales.map((s, idx) => ({
    saleId: s.saleId,
    saleName: s.saleName,
    months: s.revenueByMonth ?? Array(12).fill(0),
    targets: s.monthlyTargets ?? Array(12).fill(0),
    yearActual: (s.revenueByMonth ?? []).reduce((a, n) => a + (n || 0), 0),
    yearTarget: (s.monthlyTargets ?? []).reduce((a, n) => a + (n || 0), 0),
    color: MONTH_HEX_PALETTE[idx % MONTH_HEX_PALETTE.length],
  }));

  // Sum actual theo tháng (cho chart Y axis max + tổng dưới bảng)
  const totalByMonth = Array(12).fill(0).map((_, m) => rows.reduce((a, r) => a + (r.months[m] || 0), 0));
  const totalTargetByMonth = Array(12).fill(0).map((_, m) => rows.reduce((a, r) => a + (r.targets[m] || 0), 0));
  const totalActualYear = totalByMonth.reduce((a, n) => a + n, 0);
  const totalTargetYear = totalTargetByMonth.reduce((a, n) => a + n, 0);

  return (
    <section className="overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 flex-wrap border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-emerald-700" />
          <h3 className="text-sm font-bold text-emerald-900">
            Doanh số tháng theo Sale <span className="text-emerald-600/70">({sales.length} sale)</span>
          </h3>
        </div>
        {canEditTarget && (
          <button
            onClick={onEditTarget}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 shadow-sm"
          >
            ✏️ Đặt mục tiêu Sale
          </button>
        )}
      </header>

      <div className="p-4 space-y-4">
        {/* Table: Sale × T1..T12, mỗi cell hiện ĐẦY ĐỦ số VND (không rút gọn) — sum khớp tổng năm. */}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="text-[11px] tabular-nums" style={{ minWidth: 'max-content' }}>
            <thead className="bg-emerald-50/80 text-emerald-900">
              <tr>
                <th className="px-2 py-2 text-left font-semibold sticky left-0 bg-emerald-50 z-10 min-w-[160px]">Sale</th>
                {Array.from({ length: 12 }, (_, i) => (
                  <th key={i} className="px-2 py-2 text-center font-semibold min-w-[120px]">T{i + 1}</th>
                ))}
                <th className="px-2 py-2 text-center font-semibold bg-emerald-100 min-w-[140px]">Cả năm</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const rowBg = idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white';
                const yearRate = r.yearTarget > 0 ? Math.round((r.yearActual / r.yearTarget) * 100) : 0;
                return (
                  <tr key={r.saleId} className={`border-t border-slate-100 hover:bg-emerald-50/30 ${rowBg}`}>
                    <td className={`px-2 py-1.5 font-semibold text-slate-800 sticky left-0 z-10 ${rowBg}`}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-sm shrink-0" style={{ backgroundColor: r.color }} />
                        <span className="truncate">{r.saleName}</span>
                      </span>
                    </td>
                    {r.months.map((actual, m) => {
                      const target = r.targets[m] || 0;
                      const rate = target > 0 ? Math.round((actual / target) * 100) : 0;
                      const empty = actual === 0 && target === 0;
                      return (
                        <td key={m} className="px-2 py-1.5 text-right whitespace-nowrap">
                          {empty ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            <div className="leading-tight">
                              <div className="font-bold text-emerald-700 tabular-nums">{actual.toLocaleString('vi-VN')}</div>
                              <div className="text-[10px] text-slate-500 tabular-nums">
                                MT: {target > 0 ? target.toLocaleString('vi-VN') : '—'}
                                {target > 0 && <span className={` ml-1 font-semibold ${rate >= 90 ? 'text-emerald-700' : rate >= 60 ? 'text-amber-700' : 'text-rose-700'}`}>{rate}%</span>}
                              </div>
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-right bg-emerald-50/60 font-bold whitespace-nowrap">
                      <div className="text-emerald-800 tabular-nums">{r.yearActual.toLocaleString('vi-VN')}</div>
                      <div className="text-[10px] text-slate-500 font-normal tabular-nums">
                        MT: {r.yearTarget > 0 ? r.yearTarget.toLocaleString('vi-VN') : '—'}
                        {r.yearTarget > 0 && <span className={`ml-1 font-semibold ${yearRate >= 90 ? 'text-emerald-700' : yearRate >= 60 ? 'text-amber-700' : 'text-rose-700'}`}>{yearRate}%</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gradient-to-r from-emerald-100 to-teal-50 font-bold text-emerald-900">
              <tr className="border-t-2 border-emerald-300">
                <td className="px-2 py-2 sticky left-0 bg-emerald-100 z-10">Tổng cơ sở</td>
                {totalByMonth.map((v, m) => {
                  const tgt = totalTargetByMonth[m];
                  const rate = tgt > 0 ? Math.round((v / tgt) * 100) : 0;
                  return (
                    <td key={m} className="px-2 py-2 text-right whitespace-nowrap">
                      <div className="tabular-nums">{v > 0 ? v.toLocaleString('vi-VN') : '—'}</div>
                      {tgt > 0 && (
                        <div className="text-[10px] font-normal opacity-80 tabular-nums">
                          MT {tgt.toLocaleString('vi-VN')} <span className={rate >= 90 ? 'text-emerald-800' : rate >= 60 ? 'text-amber-800' : 'text-rose-700'}>· {rate}%</span>
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="px-2 py-2 text-right bg-emerald-200/60 whitespace-nowrap">
                  <div className="text-sm tabular-nums">{totalActualYear.toLocaleString('vi-VN')}</div>
                  <div className="text-[10px] font-normal opacity-80 tabular-nums">
                    MT {totalTargetYear > 0 ? totalTargetYear.toLocaleString('vi-VN') : '—'}
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="text-[11px] text-slate-500">
          📌 Mục tiêu tháng theo Sale do <strong>QLCS</strong> nhập ở trang <em>Quản lý mục tiêu</em>.
          Mỗi ô hiển thị <span className="text-emerald-700 font-semibold">thực đạt</span> · MT (mục tiêu) · % hoàn thành.
        </p>
      </div>
    </section>
  );
}

// ============================================================================
// SECTION 2B — Lead theo Sale theo từng tháng
// ============================================================================
function LeadBySaleMonthSection({ branch }: { branch: BranchRevenue }) {
  const sales = useMemo(
    () => (branch.sales ?? []).filter((s) => s.saleId !== '__aggregate'),
    [branch.sales],
  );
  if (sales.length === 0) return null;

  const rows = sales.map((s, idx) => ({
    saleId: s.saleId,
    saleName: s.saleName,
    leads: s.leadsByMonth ?? Array(12).fill(0),
    closed: s.closedByMonth ?? Array(12).fill(0),
    totalLeads: s.totalLeads ?? 0,
    totalClosed: s.totalClosed ?? 0,
    color: MONTH_HEX_PALETTE[idx % MONTH_HEX_PALETTE.length],
  }));

  const totalLeadsByMonth = Array(12).fill(0).map((_, m) => rows.reduce((a, r) => a + (r.leads[m] || 0), 0));
  const totalClosedByMonth = Array(12).fill(0).map((_, m) => rows.reduce((a, r) => a + (r.closed[m] || 0), 0));
  const yearLeads = totalLeadsByMonth.reduce((a, n) => a + n, 0);
  const yearClosed = totalClosedByMonth.reduce((a, n) => a + n, 0);
  const yearRate = yearLeads > 0 ? Math.round((yearClosed / yearLeads) * 100) : 0;

  return (
    <section className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 flex-wrap border-b border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-amber-700" />
          <h3 className="text-sm font-bold text-amber-900">
            2B — Lead theo Sale theo tháng <span className="text-amber-600/70">({sales.length} sale)</span>
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-600">
          {rows.map((r) => (
            <span key={r.saleId} className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: r.color }} />
              <span className="truncate max-w-[100px]">{r.saleName}</span>
            </span>
          ))}
        </div>
      </header>

      <div className="p-4 space-y-4">
        <SaleLeadStackedChart rows={rows} totalByMonth={totalLeadsByMonth} />

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-[11px] tabular-nums">
            <thead className="bg-amber-50/80 text-amber-900">
              <tr>
                <th className="px-2 py-2 text-left font-semibold sticky left-0 bg-amber-50 z-10 min-w-[140px]">Sale</th>
                {Array.from({ length: 12 }, (_, i) => (
                  <th key={i} className="px-1 py-2 text-center font-semibold min-w-[70px]">T{i + 1}</th>
                ))}
                <th className="px-2 py-2 text-center font-semibold bg-amber-100 min-w-[100px]">Cả năm</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const rowBg = idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white';
                const rate = r.totalLeads > 0 ? Math.round((r.totalClosed / r.totalLeads) * 100) : 0;
                return (
                  <tr key={r.saleId} className={`border-t border-slate-100 hover:bg-amber-50/30 ${rowBg}`}>
                    <td className={`px-2 py-1.5 font-semibold text-slate-800 sticky left-0 z-10 ${rowBg}`}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-sm shrink-0" style={{ backgroundColor: r.color }} />
                        <span className="truncate">{r.saleName}</span>
                      </span>
                    </td>
                    {r.leads.map((leads, m) => {
                      const closed = r.closed[m] || 0;
                      const empty = leads === 0 && closed === 0;
                      const pct = leads > 0 ? Math.round((closed / leads) * 100) : 0;
                      return (
                        <td key={m} className="px-1 py-1.5 text-center">
                          {empty ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            <div className="leading-tight">
                              <div className="font-bold text-amber-700">
                                <span>{leads}</span><span className="mx-0.5 text-slate-400">/</span><span className="text-emerald-700">{closed}</span>
                              </div>
                              <div className="text-[9px] text-slate-500">{pct}% chốt</div>
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-center bg-amber-50/60 font-bold">
                      <div className="text-amber-800">
                        <span>{r.totalLeads}</span><span className="mx-0.5 text-slate-400">/</span><span className="text-emerald-700">{r.totalClosed}</span>
                      </div>
                      <div className="text-[9px] text-slate-500 font-normal">{rate}% chốt</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gradient-to-r from-amber-100 to-orange-50 font-bold text-amber-900">
              <tr className="border-t-2 border-amber-300">
                <td className="px-2 py-2 sticky left-0 bg-amber-100 z-10">Tổng cơ sở</td>
                {totalLeadsByMonth.map((leads, m) => {
                  const closed = totalClosedByMonth[m];
                  const pct = leads > 0 ? Math.round((closed / leads) * 100) : 0;
                  return (
                    <td key={m} className="px-1 py-2 text-center">
                      <div>{leads > 0 ? `${leads}/${closed}` : '—'}</div>
                      {leads > 0 && <div className="text-[9px] font-normal opacity-80">{pct}%</div>}
                    </td>
                  );
                })}
                <td className="px-2 py-2 text-center bg-amber-200/60">
                  <div className="text-base">{yearLeads}/{yearClosed}</div>
                  <div className="text-[9px] font-normal opacity-80">{yearRate}% chốt</div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-[11px] text-slate-500">
          📌 Mỗi ô: <span className="text-amber-700 font-semibold">tổng lead</span> / <span className="text-emerald-700 font-semibold">chốt</span> · % tỷ lệ chốt.
        </p>
      </div>
    </section>
  );
}

// ============================================================================
// PHẦN 3 — SỐ LƯỢNG GÓI DỊCH VỤ (cơ cấu per package × 12 tháng)
// Independent với doanh thu — data từ collection `packageQuantities`.
// ============================================================================
// ============================================================================
// Section 1C — DOANH SỐ theo gói × 12 tháng (PHẦN 1, đặt sau SaleMonthlyRevenueSection)
// Data: branch.packageQuantities[].revenueByMonth (từ collection packageQuantities, field revenue)
// ============================================================================
function PackageRevenueMonthlySection({ branch }: { branch: BranchRevenue }) {
  const rows = useMemo(
    () => (branch.packageQuantities ?? []).filter((r) => r.totalYearRevenue > 0),
    [branch.packageQuantities],
  );

  // Group rows by groupId — sort group desc theo tổng revenue, gói trong nhóm desc theo year revenue.
  const grouped = useMemo(() => {
    const byGroup = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!byGroup.has(r.groupId)) byGroup.set(r.groupId, []);
      byGroup.get(r.groupId)!.push(r);
    }
    return Array.from(byGroup.entries()).map(([gid, items]) => ({
      groupId: gid,
      groupName: items[0].groupName,
      items: [...items].sort((a, b) => b.totalYearRevenue - a.totalYearRevenue),
      groupTotal: items.reduce((s, x) => s + x.totalYearRevenue, 0),
    })).sort((a, b) => b.groupTotal - a.groupTotal);
  }, [rows]);

  const totalByMonth = useMemo(
    () => Array(12).fill(0).map((_, m) => rows.reduce((a, r) => a + (r.revenueByMonth[m] || 0), 0)),
    [rows],
  );
  const grandTotalYear = totalByMonth.reduce((a, n) => a + n, 0);

  if (rows.length === 0) {
    return (
      <section className="overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm">
        <header className="px-4 py-2.5 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100">
          <h3 className="text-sm font-bold text-emerald-900">1C — Doanh số theo gói × tháng</h3>
        </header>
        <div className="py-10 text-center text-slate-400 text-sm">
          Chưa có dữ liệu doanh số theo gói cho năm này.
          <div className="text-xs mt-1">
            Bấm <strong>+ Nhập dữ liệu</strong> ở <a href="/doanh-so/nhap" className="text-emerald-700 underline">/doanh-so/nhap</a> → "Bảng nhập doanh số theo gói dịch vụ".
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 flex-wrap border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Package size={16} className="text-emerald-700" />
          <h3 className="text-sm font-bold text-emerald-900">
            1C — Doanh số theo gói × tháng <span className="text-emerald-600/70">({rows.length} gói · {grouped.length} nhóm)</span>
          </h3>
        </div>
        <div className="text-[11px] text-slate-500">
          Tổng cả năm: <strong className="text-emerald-700">{formatMoney(grandTotalYear)}</strong>
        </div>
      </header>

      <div className="p-4">
        {/* Số liệu hiện ĐẦY ĐỦ (toLocaleString vi-VN) — không rút gọn để sum khớp chính xác.
            Table dùng minWidth: max-content + overflow-x-auto → kéo ngang khi không đủ diện tích. */}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="text-[11px] tabular-nums" style={{ minWidth: 'max-content' }}>
            <thead className="bg-emerald-50/80 text-emerald-900">
              <tr>
                <th className="px-2 py-2 text-left font-semibold sticky left-0 bg-emerald-50 z-10 min-w-[140px]">Nhóm</th>
                <th className="px-2 py-2 text-left font-semibold min-w-[200px]">Gói dịch vụ</th>
                {Array.from({ length: 12 }, (_, i) => (
                  <th key={i} className="px-2 py-2 text-center font-semibold min-w-[110px]">T{i + 1}</th>
                ))}
                <th className="px-2 py-2 text-center font-semibold bg-emerald-100 min-w-[140px]">Cả năm</th>
                <th className="px-2 py-2 text-center font-semibold bg-emerald-100 min-w-[60px]">% cơ cấu</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ groupId, groupName, items, groupTotal }) => (
                <Fragment key={groupId}>
                  {items.map((r, idx) => {
                    const pct = grandTotalYear > 0 ? Math.round((r.totalYearRevenue / grandTotalYear) * 100) : 0;
                    const rowBg = idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white';
                    return (
                      <tr key={r.packageId} className={`border-t border-slate-100 hover:bg-emerald-50/30 ${rowBg}`}>
                        {idx === 0 && (
                          <td rowSpan={items.length} className={`px-2 py-1.5 font-semibold text-emerald-900 align-top sticky left-0 z-10 bg-emerald-50/40 border-r border-emerald-100`}>
                            {groupName}
                            <div className="text-[10px] font-normal text-slate-500 mt-0.5">
                              {items.length} gói · {groupTotal.toLocaleString('vi-VN')}
                            </div>
                          </td>
                        )}
                        <td className="px-2 py-1.5 text-slate-800">{r.packageName}</td>
                        {r.revenueByMonth.map((rev, m) => (
                          <td key={m} className="px-2 py-1.5 text-right whitespace-nowrap">
                            {rev > 0
                              ? <span className="font-semibold text-emerald-700">{rev.toLocaleString('vi-VN')}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                        ))}
                        <td className="px-2 py-1.5 text-right font-bold text-emerald-800 bg-emerald-50/60 whitespace-nowrap">
                          {r.totalYearRevenue > 0 ? r.totalYearRevenue.toLocaleString('vi-VN') : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-center text-slate-500 bg-emerald-50/60">
                          {pct > 0 ? `${pct}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
            <tfoot className="bg-gradient-to-r from-emerald-100 to-teal-50 font-bold text-emerald-900">
              <tr className="border-t-2 border-emerald-300">
                <td colSpan={2} className="px-2 py-2 sticky left-0 bg-emerald-100 z-10">Tổng cơ sở</td>
                {totalByMonth.map((v, m) => (
                  <td key={m} className="px-2 py-2 text-right whitespace-nowrap">{v > 0 ? v.toLocaleString('vi-VN') : '—'}</td>
                ))}
                <td className="px-2 py-2 text-right bg-emerald-200/60 whitespace-nowrap">{grandTotalYear.toLocaleString('vi-VN')}</td>
                <td className="px-2 py-2 text-center bg-emerald-200/60">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          📌 Doanh số per package per month — nhập tại form "Bảng nhập doanh số theo gói dịch vụ" (/doanh-so/nhap).
          Khác Section 1B (per-Sale) — section 1C này phân tích sản phẩm bán chạy theo gói.
        </p>
      </div>
    </section>
  );
}

function PackageQuantitySection({ branch }: { branch: BranchRevenue }) {
  const rows = useMemo(() => branch.packageQuantities ?? [], [branch.packageQuantities]);

  // Group rows by groupName để render rowspan
  const grouped = useMemo(() => {
    const byGroup = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!byGroup.has(r.groupId)) byGroup.set(r.groupId, []);
      byGroup.get(r.groupId)!.push(r);
    }
    return Array.from(byGroup.entries()).map(([groupId, items]) => ({
      groupId,
      groupName: items[0].groupName,
      items,
    }));
  }, [rows]);

  // Tổng SL per tháng (sum across all packages của branch) — for tfoot + chart
  const totalByMonth = useMemo(
    () => Array(12).fill(0).map((_, m) => rows.reduce((a, r) => a + (r.qtyByMonth[m] || 0), 0)),
    [rows],
  );
  // Tổng cả năm theo group
  const groupYearTotals = useMemo(() => {
    const out = new Map<string, number>();
    grouped.forEach(({ groupId, items }) => {
      out.set(groupId, items.reduce((a, r) => a + r.totalYearQty, 0));
    });
    return out;
  }, [grouped]);
  const grandYearQty = totalByMonth.reduce((a, n) => a + n, 0);

  if (rows.length === 0) {
    return (
      <section className="overflow-hidden rounded-xl border border-purple-200 bg-white shadow-sm">
        <header className="px-4 py-2.5 bg-gradient-to-r from-purple-50 to-fuchsia-50 border-b border-purple-100">
          <h3 className="text-sm font-bold text-purple-900">📦 Cơ cấu gói dịch vụ theo tháng</h3>
        </header>
        <div className="py-10 text-center text-slate-400 text-sm">
          Chưa có dữ liệu SL gói cho năm này.
          <div className="text-xs mt-1">
            Bấm <strong>+ Nhập dữ liệu</strong> ở <a href="/doanh-so/nhap" className="text-purple-700 underline">/doanh-so/nhap</a> → cuộn xuống "Bảng nhập số lượng gói dịch vụ".
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-purple-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 flex-wrap border-b border-purple-100 bg-gradient-to-r from-purple-50 to-fuchsia-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Package size={16} className="text-purple-700" />
          <h3 className="text-sm font-bold text-purple-900">
            Cơ cấu SL gói theo tháng <span className="text-purple-600/70">({rows.length} gói · {grouped.length} nhóm)</span>
          </h3>
        </div>
        <div className="text-[11px] text-slate-500">
          Tổng cả năm: <strong className="text-purple-700">{grandYearQty.toLocaleString('vi-VN')}</strong> gói
        </div>
      </header>

      <div className="p-4 space-y-4">
        {/* Bảng: Package × 12 tháng + tổng cả năm + % cơ cấu */}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-[11px] tabular-nums">
            <thead className="bg-purple-50/80 text-purple-900">
              <tr>
                <th className="px-2 py-2 text-left font-semibold sticky left-0 bg-purple-50 z-10 min-w-[140px]">Nhóm</th>
                <th className="px-2 py-2 text-left font-semibold min-w-[200px]">Gói dịch vụ</th>
                {Array.from({ length: 12 }, (_, i) => (
                  <th key={i} className="px-1 py-2 text-center font-semibold min-w-[50px]">T{i + 1}</th>
                ))}
                <th className="px-2 py-2 text-center font-semibold bg-purple-100 min-w-[70px]">Cả năm</th>
                <th className="px-2 py-2 text-center font-semibold bg-purple-100 min-w-[60px]">% cơ cấu</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ groupId, groupName, items }) => (
                <Fragment key={groupId}>
                  {items.map((r, idx) => {
                    const pct = grandYearQty > 0 ? Math.round((r.totalYearQty / grandYearQty) * 100) : 0;
                    const rowBg = idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white';
                    return (
                      <tr key={r.packageId} className={`border-t border-slate-100 hover:bg-purple-50/30 ${rowBg}`}>
                        {idx === 0 && (
                          <td rowSpan={items.length} className={`px-2 py-1.5 font-semibold text-purple-900 align-top sticky left-0 z-10 bg-purple-50/40 border-r border-purple-100`}>
                            {groupName}
                            <div className="text-[10px] font-normal text-slate-500 mt-0.5">
                              {items.length} gói · {(groupYearTotals.get(groupId) ?? 0).toLocaleString('vi-VN')}
                            </div>
                          </td>
                        )}
                        <td className="px-2 py-1.5 text-slate-800">{r.packageName}</td>
                        {r.qtyByMonth.map((q, m) => (
                          <td key={m} className="px-1 py-1.5 text-center">
                            {q > 0
                              ? <span className="font-semibold text-purple-700">{q}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                        ))}
                        <td className="px-2 py-1.5 text-center font-bold text-purple-800 bg-purple-50/60">
                          {r.totalYearQty > 0 ? r.totalYearQty : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-center text-slate-500 bg-purple-50/60">
                          {pct > 0 ? `${pct}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
            <tfoot className="bg-gradient-to-r from-purple-100 to-fuchsia-50 font-bold text-purple-900">
              <tr className="border-t-2 border-purple-300">
                <td colSpan={2} className="px-2 py-2 sticky left-0 bg-purple-100 z-10">Tổng cơ sở</td>
                {totalByMonth.map((v, m) => (
                  <td key={m} className="px-1 py-2 text-center">{v > 0 ? v : '—'}</td>
                ))}
                <td className="px-2 py-2 text-center bg-purple-200/60">{grandYearQty}</td>
                <td className="px-2 py-2 text-center bg-purple-200/60">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="text-[11px] text-slate-500">
          📌 SL gói nhập tại <a href="/doanh-so/nhap" className="text-purple-700 underline">/doanh-so/nhap</a> (form "Bảng nhập số lượng gói dịch vụ", theo tháng).
          Số liệu tách hẳn khỏi doanh số per Sale — phục vụ phân tích sản phẩm chủ lực.
        </p>
      </div>
    </section>
  );
}

function SaleLeadStackedChart({
  rows, totalByMonth,
}: {
  rows: { saleId: string; saleName: string; leads: number[]; color: string }[];
  totalByMonth: number[];
}) {
  const max = Math.max(...totalByMonth, 1);
  const H = 140;
  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-2 px-1" style={{ height: H + 28 }}>
        {totalByMonth.map((monthTotal, m) => {
          const colH = (monthTotal / max) * H;
          return (
            <div key={m} className="flex min-w-[44px] flex-1 flex-col items-center">
              <div className="flex w-7 flex-col-reverse overflow-hidden rounded-t-sm" style={{ height: `${Math.max(2, colH)}px` }}>
                {rows.map((r) => {
                  const v = r.leads[m] || 0;
                  if (v === 0) return null;
                  const segH = (v / Math.max(1, monthTotal)) * colH;
                  return (
                    <div
                      key={r.saleId}
                      style={{ height: `${segH}px`, backgroundColor: r.color }}
                      title={`${r.saleName} · T${m + 1}: ${v} lead`}
                    />
                  );
                })}
              </div>
              <div className="mt-1 text-[10px] font-semibold text-slate-600">T{m + 1}</div>
              <div className="text-[9px] tabular-nums text-slate-400">{monthTotal > 0 ? monthTotal : '—'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   Main Page
   ============================================================ */

interface StaleDiscrepancy {
  branchId: string;
  branchName: string;
  year: number;
  month: number;
  diff: number;
  perSaleRev: number;
  perPkgRev: number;
  createdAt: string;
}

interface RevenueDashboardPageProps {
  viewer?: CurrentUser;
  // Khi truyền, dùng data thật từ Firestore. Nếu undefined, fallback mock.
  realBranches?: BranchRevenue[];
  // Year hiển thị mặc định trên UI — khớp với year đã fetch ở server (page.tsx).
  initialYear?: number;
  // Discrepancies (chênh lệch per-Sale vs per-Gói) > 24h chưa fix — chỉ admin (CEO/GĐ KD) thấy.
  staleDiscrepancies?: StaleDiscrepancy[];
}

export function RevenueDashboardPage({ viewer, realBranches, initialYear, staleDiscrepancies = [] }: RevenueDashboardPageProps = {}) {
  const router = useRouter();
  const currentUser: CurrentUser = viewer ?? DEFAULT_VIEWER;
  const branchesData: BranchRevenue[] = realBranches ?? branches;
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(initialYear ?? new Date().getFullYear());
  const [showTargetModal, setShowTargetModal] = useState(false);


  function changeYear(y: number) {
    setYear(y);
    // Reload server data theo year mới (qua URL).
    router.push(`/doanh-so?year=${y}`);
  }
  const [keyword, setKeyword] = useState("");
  const [selectedBranch, setSelectedBranch] = useState<BranchRevenue | null>(null);

  const visibleBranches = useMemo(() => {
    let result = branchesData;
    if (!canViewAll(currentUser) && currentUser.role === "branch_manager") {
      result = result.filter((b) => currentUser.branchIds.includes(b.branchId));
    }
    if (currentUser.role === "sale") {
      result = result
        .map((b) => ({ ...b, sales: b.sales.filter((s) => s.saleId === currentUser.uid) }))
        .filter((b) => b.sales.length > 0);
    }
    if (keyword.trim()) {
      const q = keyword.trim().toLowerCase();
      result = result.filter(
        (b) =>
          b.branchName.toLowerCase().includes(q) ||
          b.sales.some((s) => s.saleName.toLowerCase().includes(q))
      );
    }
    return result;
  }, [branchesData, currentUser, keyword]);

  // System TỔNG NĂM = sum yearTarget + sum revenue cả năm
  const yearlyTarget = visibleBranches.reduce((s, b) => s + (b.yearTarget ?? 0), 0);
  const yearlyActual = visibleBranches.reduce((s, b) => s + b.sales.reduce((a, x) => a + x.actual, 0), 0);
  const yearlyRate = getRate(yearlyActual, yearlyTarget);

  // System TỔNG THÁNG đang xem = sum monthTargets[month-1] + sum byMonth[month-1].revenue
  const sysMonthIdx = Math.max(0, Math.min(11, month - 1));
  const systemTarget = visibleBranches.reduce((s, b) => s + (b.monthTargets?.[sysMonthIdx] ?? 0), 0);
  const systemActual = visibleBranches.reduce((s, b) => s + (b.byMonth?.[sysMonthIdx]?.revenue ?? 0), 0);
  const systemRate = getRate(systemActual, systemTarget);

  // Tăng trưởng so với tháng trước (tháng 1 → so với T12 năm trước = không có data → null).
  // Nếu là T1, hoặc tháng trước = 0 → không hiển thị badge.
  const prevMonthActual = sysMonthIdx > 0
    ? visibleBranches.reduce((s, b) => s + (b.byMonth?.[sysMonthIdx - 1]?.revenue ?? 0), 0)
    : 0;
  const monthTrendDeltaPct: number | undefined = sysMonthIdx > 0 && prevMonthActual > 0
    ? ((systemActual - prevMonthActual) / prevMonthActual) * 100
    : undefined;

  return (
    // Phase 13.16 (2026-06-06): bỏ <main min-h-screen> (nested DOM invalid + không scroll
    // được khi AppShell đã h-[100dvh] overflow-hidden). Dùng pattern chuẩn: AppTopBar sticky +
    // <div flex-1 overflow-y-auto> wrap body để scroll bên trong.
    <>
      <AppTopBar
        title="Doanh số"
        subtitle="Mục tiêu & thực đạt · 5 cơ sở"
        icon="barChart"
      />

      <div className="flex-1 overflow-y-auto bg-slate-50 text-slate-900">
      {/* Body */}
      <div className="mx-auto max-w-7xl px-5 py-6">
        {/* Banner cảnh báo: chênh lệch doanh số per-Sale vs per-Gói > 24h chưa xử lý — chỉ admin thấy */}
        {staleDiscrepancies.length > 0 && (
          <div className="mb-5 rounded-xl border-2 border-rose-300 bg-rose-50 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="text-2xl">⚠️</div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-rose-900">
                  Chênh lệch doanh số chưa xử lý ({staleDiscrepancies.length} mục) — đã quá 24h
                </h3>
                <p className="text-xs text-rose-800/80 mt-0.5">
                  Doanh số nhập theo Sale ≠ Doanh số nhập theo Gói. Người nhập đã được cảnh báo realtime nhưng chưa sửa.
                </p>
                <ul className="mt-2.5 space-y-1.5">
                  {staleDiscrepancies.map((d) => {
                    const hoursOld = Math.floor((Date.now() - new Date(d.createdAt).getTime()) / 3600_000);
                    return (
                      <li key={`${d.branchId}_${d.year}_${d.month}`} className="text-xs flex flex-wrap items-center gap-x-2 gap-y-1 bg-white/60 rounded px-3 py-2 border border-rose-200">
                        <span className="font-bold text-rose-900 sm:min-w-[180px]">{d.branchName}</span>
                        <span className="text-slate-600">T{d.month}/{d.year}</span>
                        <span className="text-slate-500 break-words">
                          per-Sale: <strong className="text-emerald-700">{d.perSaleRev.toLocaleString('vi-VN')}₫</strong>
                          {' · '}per-Gói: <strong className="text-blue-700">{d.perPkgRev.toLocaleString('vi-VN')}₫</strong>
                          {' · '}chênh <strong className="text-rose-700">{d.diff.toLocaleString('vi-VN')}₫</strong>
                        </span>
                        <span className="sm:ml-auto text-rose-600 font-semibold">+{hoursOld}h</span>
                        <a href={`/doanh-so/nhap?branchId=${d.branchId}&year=${d.year}&month=${d.month}`}
                           className="text-rose-700 hover:text-rose-900 underline font-semibold">
                          → Mở
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Filters (title đã ở AppTopBar) */}
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-end">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col">
              <span className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Tháng</span>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="h-9 rounded-lg border-2 border-emerald-200 bg-white px-2.5 text-sm outline-none focus:border-emerald-500"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>Tháng {m}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col">
              <span className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Năm</span>
              <select
                value={year}
                onChange={(e) => changeYear(Number(e.target.value))}
                className="h-9 rounded-lg border-2 border-emerald-200 bg-white px-2.5 text-sm outline-none focus:border-emerald-500"
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
            {canViewAll(currentUser) && (
              <button
                onClick={() => setShowTargetModal(true)}
                className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                Đặt mục tiêu
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="mb-5 flex max-w-md items-center gap-2 rounded-lg border-2 border-emerald-200 bg-white px-3 py-2 focus-within:border-emerald-500">
          <Search size={16} className="text-slate-400" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Tìm cơ sở hoặc sale…"
            className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
          {keyword && (
            <button onClick={() => setKeyword("")} className="text-slate-400 hover:text-slate-700">
              <X size={14} />
            </button>
          )}
        </div>

        {/* System cards — Năm lên trên, Tháng dưới, mỗi card 1 hàng full width */}
        {canViewAll(currentUser) && (
          <section className="mb-5 space-y-4">
            <SystemProgressCard
              scope="year"
              period={`${year}`}
              rate={yearlyRate}
              target={yearlyTarget}
              actual={yearlyActual}
            />
            <SystemProgressCard
              scope="month"
              period={`${month}/${year}`}
              rate={systemRate}
              target={systemTarget}
              actual={systemActual}
              trendDeltaPct={monthTrendDeltaPct}
            />
          </section>
        )}

        {/* Branch grid */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Users size={15} className="text-emerald-700" />
            <h2 className="text-sm font-bold text-slate-900">Doanh số theo cơ sở</h2>
            <span className="text-xs text-slate-500">({visibleBranches.length})</span>
          </div>

          {visibleBranches.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white py-12 text-center">
              <p className="text-sm text-slate-500">Không có cơ sở nào khớp bộ lọc.</p>
            </div>
          ) : (
            <>
              {/* 2026-06-12: tăng diện tích mỗi BranchCard — 2 col từ lg (~1024px),
                  3 col từ 2xl (~1536px). Trước đây 3 col bắt đầu từ xl (1280) gây
                  card hẹp khiến thanh tiến độ + số bị chen lệch hàng. */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                {visibleBranches.map((branch) => (
                  <BranchCard
                    key={branch.branchId}
                    branch={branch}
                    month={month}
                    year={year}
                    onClick={() => setSelectedBranch(branch)}
                    // QLCS chỉ thấy 1 cơ sở → kéo dài full hàng (card chỉ rộng, 2 chart per-sale render ở 2 section riêng dưới).
                    wide={currentUser.role === 'branch_manager' && visibleBranches.length === 1}
                  />
                ))}
              </div>

              {/* QLCS-only: 2 card RIÊNG bên dưới — so sánh sale qua bar chart ngang. Tách hẳn khỏi BranchCard.
                  Include __aggregate sentinel (data nhập theo tháng không gắn sale) — đổi label "Tổng (nhập theo tháng)"
                  để sum bar chart === tổng năm BranchCard, không bị "lệch" do bỏ aggregate. */}
              {currentUser.role === 'branch_manager' && visibleBranches.length === 1 && (() => {
                const perSale = (visibleBranches[0].sales ?? [])
                  .map((s) => ({
                    name: s.saleId === '__aggregate' ? 'Tổng (nhập theo tháng)' : s.saleName,
                    revenue: s.actual ?? 0,
                    leads: s.totalLeads ?? 0,
                    closed: s.totalClosed ?? 0,
                  }));
                return (
                  // Anh chốt 2026-06-02: stack dọc 1 cột (không side-by-side) → mỗi ô full width
                  // → tên Sale dài (vd "Nguyễn Thị Thanh Huyền") có chỗ hiển thị đầy đủ.
                  // Thứ tự: Doanh số trước (trên), Lead sau (dưới).
                  <div className="mt-4 flex flex-col gap-4">
                    <div className="rounded-xl border-2 border-emerald-200 bg-white p-5 shadow-sm">
                      <SaleHorizontalBarChart
                        title={`Tổng doanh số năm ${year} theo Sale`}
                        data={perSale.map((s) => ({ name: s.name, value: s.revenue }))}
                        color="#059669"
                        formatValue={formatMoney}
                      />
                    </div>
                    <div className="rounded-xl border-2 border-amber-200 bg-white p-5 shadow-sm">
                      <SaleHorizontalBarChart
                        title={`Tổng lead năm ${year} theo Sale`}
                        data={perSale.map((s) => ({
                          name: s.name,
                          value: s.leads,
                          sub: s.leads > 0 ? `chốt ${s.closed} · ${Math.round((s.closed / s.leads) * 100)}%` : undefined,
                        }))}
                        color="#f59e0b"
                        formatValue={(v) => v.toLocaleString('vi-VN')}
                        unit="lead"
                      />
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </section>

        <div className="mt-6 text-center text-[11px] text-slate-400">
          UI mock — Green Pool Team Work
        </div>
      </div>

      {/* Detail modal */}
      {selectedBranch && (
        <BranchDetailModal
          branch={selectedBranch}
          month={month}
          year={year}
          currentUser={currentUser}
          onClose={() => setSelectedBranch(null)}
        />
      )}

      {/* Target modal (admin) */}
      {showTargetModal && canViewAll(currentUser) && (
        <TargetModal
          year={year}
          branches={branchesData}
          onClose={() => setShowTargetModal(false)}
        />
      )}
      </div>
    </>
  );
}

// ============================================================================
// Target Modal — admin nhập mục tiêu năm per branch
// 2 tabs: (1) Doanh số 5cs × 12 tháng — (2) Lead per cơ sở: 5 nguồn × 12 tháng
// ============================================================================

const MONTH_LABELS = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'];
const TARGET_LEAD_SOURCES: LeadSource[] = ['MKT', 'Sale', 'Renew', 'Referral', 'Walk-in'];

type MoneyMap = Record<string, number[]>;                          // branchId → 12 numbers
type LeadMap = Record<string, Record<LeadSource, number[]>>;       // branchId → source → 12 numbers

function zeros12() { return Array(12).fill(0); }
function sumArr(a: number[]) { return a.reduce((s, n) => s + (Number(n) || 0), 0); }

function TargetModal({ year, branches, onClose }: {
  year: number;
  branches: BranchRevenue[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'revenue' | 'lead'>('revenue');
  const [activeBranch, setActiveBranch] = useState<string>(branches[0]?.branchId ?? '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Revenue map: branchId → 12 months
  const [moneyMap, setMoneyMap] = useState<MoneyMap>(() => {
    const m: MoneyMap = {};
    branches.forEach((b) => { m[b.branchId] = zeros12(); });
    return m;
  });

  // Lead map: branchId → source → 12 months
  const [leadMap, setLeadMap] = useState<LeadMap>(() => {
    const m: LeadMap = {};
    branches.forEach((b) => {
      m[b.branchId] = {} as Record<LeadSource, number[]>;
      TARGET_LEAD_SOURCES.forEach((s) => { m[b.branchId][s] = zeros12(); });
    });
    return m;
  });

  // Load existing targets
  useEffect(() => {
    targetsApi.list(year)
      .then((rows) => {
        setMoneyMap((prev) => {
          const next = { ...prev };
          rows.forEach((r) => {
            if (r.monthTargets && r.monthTargets.length === 12) next[r.branchId] = [...r.monthTargets];
          });
          return next;
        });
        setLeadMap((prev) => {
          const next = { ...prev };
          rows.forEach((r) => {
            if (r.leadTargets) {
              next[r.branchId] = next[r.branchId] ?? ({} as Record<LeadSource, number[]>);
              TARGET_LEAD_SOURCES.forEach((s) => {
                const arr = r.leadTargets?.[s];
                next[r.branchId][s] = Array.isArray(arr) && arr.length === 12 ? [...arr] : zeros12();
              });
            }
          });
          return next;
        });
      })
      .catch((e) => setError('Load lỗi: ' + e.message))
      .finally(() => setLoading(false));
  }, [year]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const entries = branches.map((b) => ({
        year,
        branchId: b.branchId,
        monthTargets: moneyMap[b.branchId] ?? zeros12(),
        leadTargets: leadMap[b.branchId] ?? undefined,
      }));
      await targetsApi.bulkUpsert(entries);
      onClose();
      if (typeof window !== 'undefined') window.location.reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // Derived totals
  const revenueYearTotals = useMemo(() => {
    const out: Record<string, number> = {};
    branches.forEach((b) => { out[b.branchId] = sumArr(moneyMap[b.branchId] ?? zeros12()); });
    return out;
  }, [moneyMap, branches]);
  const revenueMonthTotals = useMemo(() => {
    const arr = zeros12();
    branches.forEach((b) => {
      const m = moneyMap[b.branchId] ?? zeros12();
      for (let i = 0; i < 12; i++) arr[i] += Number(m[i] || 0);
    });
    return arr;
  }, [moneyMap, branches]);
  const revenueGrandTotal = revenueMonthTotals.reduce((a, n) => a + n, 0);

  const leadGridForBranch = leadMap[activeBranch] ?? {} as Record<LeadSource, number[]>;
  const leadMonthTotalsForBranch = useMemo(() => {
    const arr = zeros12();
    TARGET_LEAD_SOURCES.forEach((s) => {
      const m = leadGridForBranch[s] ?? zeros12();
      for (let i = 0; i < 12; i++) arr[i] += Number(m[i] || 0);
    });
    return arr;
  }, [leadGridForBranch]);
  const leadYearTotalsForBranch = useMemo(() => {
    const out = {} as Record<LeadSource, number>;
    TARGET_LEAD_SOURCES.forEach((s) => { out[s] = sumArr(leadGridForBranch[s] ?? zeros12()); });
    return out;
  }, [leadGridForBranch]);
  const leadGrandTotalForBranch = leadMonthTotalsForBranch.reduce((a, n) => a + n, 0);

  function setRevenueCell(branchId: string, monthIdx: number, val: number) {
    setMoneyMap((prev) => {
      const arr = [...(prev[branchId] ?? zeros12())];
      arr[monthIdx] = Math.max(0, Math.floor(val));
      return { ...prev, [branchId]: arr };
    });
  }
  function setLeadCell(branchId: string, source: LeadSource, monthIdx: number, val: number) {
    setLeadMap((prev) => {
      const branch = { ...(prev[branchId] ?? {} as Record<LeadSource, number[]>) };
      const arr = [...(branch[source] ?? zeros12())];
      arr[monthIdx] = Math.max(0, Math.floor(val));
      branch[source] = arr;
      return { ...prev, [branchId]: branch };
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1280px] max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header — brand gradient */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Đặt mục tiêu năm {year}</h2>
            <p className="text-xs text-emerald-50/90 mt-0.5">Nhập mục tiêu từng tháng cho 5 cơ sở — hệ thống tự tổng hợp thành mục tiêu năm</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none">✕</button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4 bg-white border-b border-slate-200">
          <div className="flex items-end gap-1">
            {[
              { k: 'revenue' as const, label: 'Doanh số (VND)', icon: '💰' },
              { k: 'lead' as const, label: 'Lead theo nguồn', icon: '👥' },
            ].map((t) => (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition ${
                  tab === t.k
                    ? 'bg-emerald-50 text-emerald-700 border-t-2 border-x border-emerald-500'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="mr-1.5">{t.icon}</span>{t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6 bg-slate-50/50">
          {loading ? (
            <div className="text-center text-slate-500 py-16">Đang tải dữ liệu mục tiêu...</div>
          ) : error ? (
            <div className="text-sm text-rose-700 bg-rose-50 p-3 rounded-lg border border-rose-200 mb-4">{error}</div>
          ) : tab === 'revenue' ? (
            // ===== TAB 1: REVENUE 5 cơ sở × 12 tháng =====
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-xs tabular-nums">
                  <thead className="bg-gradient-to-b from-slate-100 to-slate-50 text-slate-700">
                    <tr>
                      <th className="text-left px-3 py-2.5 font-semibold sticky left-0 bg-slate-100 z-10 min-w-[180px] border-r border-slate-200">Cơ sở</th>
                      {MONTH_LABELS.map((m) => (
                        <th key={m} className="px-2 py-2.5 font-semibold text-center min-w-[110px]">{m}</th>
                      ))}
                      <th className="px-3 py-2.5 font-bold text-center bg-emerald-100 text-emerald-800 min-w-[130px] border-l border-emerald-300">Tổng năm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branches.map((b) => (
                      <tr key={b.branchId} className="border-t border-slate-100 hover:bg-emerald-50/30">
                        <td className="px-3 py-2 font-medium text-slate-800 sticky left-0 bg-white z-10 border-r border-slate-200">{b.branchName}</td>
                        {MONTH_LABELS.map((_, i) => (
                          <td key={i} className="px-1.5 py-1">
                            <input
                              type="number"
                              min={0}
                              step={1_000_000}
                              value={moneyMap[b.branchId]?.[i] ?? 0}
                              onChange={(e) => setRevenueCell(b.branchId, i, Number(e.target.value))}
                              className="w-full text-right px-2 py-1.5 border border-slate-200 rounded-md focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none text-xs"
                            />
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right font-bold text-emerald-700 bg-emerald-50/70 border-l border-emerald-200">
                          {revenueYearTotals[b.branchId]?.toLocaleString('vi-VN') ?? 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gradient-to-b from-emerald-100 to-emerald-50 font-bold text-emerald-900">
                    <tr className="border-t-2 border-emerald-300">
                      <td className="px-3 py-2.5 sticky left-0 bg-emerald-100 z-10 border-r border-emerald-300">Tổng hệ thống</td>
                      {revenueMonthTotals.map((v, i) => (
                        <td key={i} className="px-2 py-2.5 text-right">{v.toLocaleString('vi-VN')}</td>
                      ))}
                      <td className="px-3 py-2.5 text-right text-base bg-emerald-200/70 border-l border-emerald-300">
                        {revenueGrandTotal.toLocaleString('vi-VN')}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex items-center gap-4">
                <span>💡 Đơn vị: <b>VND</b> · Bước nhập: 1,000,000</span>
                <span>·  Mục tiêu năm = tổng 12 tháng (tự tính)</span>
              </div>
            </div>
          ) : (
            // ===== TAB 2: LEAD per branch — 5 nguồn × 12 tháng =====
            <div className="space-y-4">
              {/* Branch selector — chips */}
              <div className="flex flex-wrap gap-2">
                {branches.map((b) => (
                  <button
                    key={b.branchId}
                    onClick={() => setActiveBranch(b.branchId)}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-full border transition ${
                      activeBranch === b.branchId
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-700'
                    }`}
                  >
                    {b.branchName}
                  </button>
                ))}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-4 py-2.5 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-slate-200 text-sm font-semibold text-slate-700">
                  {branches.find((b) => b.branchId === activeBranch)?.branchName ?? activeBranch} — Mục tiêu lead {year}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs tabular-nums">
                    <thead className="bg-gradient-to-b from-slate-100 to-slate-50 text-slate-700">
                      <tr>
                        <th className="text-left px-3 py-2.5 font-semibold sticky left-0 bg-slate-100 z-10 min-w-[160px] border-r border-slate-200">Nguồn</th>
                        {MONTH_LABELS.map((m) => (
                          <th key={m} className="px-2 py-2.5 font-semibold text-center min-w-[78px]">{m}</th>
                        ))}
                        <th className="px-3 py-2.5 font-bold text-center bg-emerald-100 text-emerald-800 min-w-[100px] border-l border-emerald-300">Tổng năm</th>
                      </tr>
                    </thead>
                    <tbody>
                      {TARGET_LEAD_SOURCES.map((src) => {
                        const Icon = SOURCE_ICON[src];
                        return (
                          <tr key={src} className="border-t border-slate-100 hover:bg-emerald-50/30">
                            <td className="px-3 py-2 sticky left-0 bg-white z-10 border-r border-slate-200">
                              <div className="flex items-center gap-2 text-slate-800 font-medium">
                                <Icon className="w-4 h-4 text-emerald-600" />
                                <span>{SOURCE_LABEL[src]}</span>
                              </div>
                            </td>
                            {MONTH_LABELS.map((_, i) => (
                              <td key={i} className="px-1 py-1">
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={leadGridForBranch[src]?.[i] ?? 0}
                                  onChange={(e) => setLeadCell(activeBranch, src, i, Number(e.target.value))}
                                  className="w-full text-right px-1.5 py-1.5 border border-slate-200 rounded-md focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none text-xs"
                                />
                              </td>
                            ))}
                            <td className="px-3 py-2 text-right font-bold text-emerald-700 bg-emerald-50/70 border-l border-emerald-200">
                              {leadYearTotalsForBranch[src].toLocaleString('vi-VN')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gradient-to-b from-emerald-100 to-emerald-50 font-bold text-emerald-900">
                      <tr className="border-t-2 border-emerald-300">
                        <td className="px-3 py-2.5 sticky left-0 bg-emerald-100 z-10 border-r border-emerald-300">Tổng tháng</td>
                        {leadMonthTotalsForBranch.map((v, i) => (
                          <td key={i} className="px-2 py-2.5 text-right">{v.toLocaleString('vi-VN')}</td>
                        ))}
                        <td className="px-3 py-2.5 text-right text-base bg-emerald-200/70 border-l border-emerald-300">
                          {leadGrandTotalForBranch.toLocaleString('vi-VN')}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500">
                  💡 Đơn vị: <b>số lead</b> · Mục tiêu năm theo nguồn = tổng 12 tháng · Chuyển sang cơ sở khác để nhập tiếp
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-white flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {tab === 'revenue' ? (
              <>Tổng mục tiêu doanh số <b className="text-emerald-700">{revenueGrandTotal.toLocaleString('vi-VN')} VND</b> / năm</>
            ) : (
              <>Tổng mục tiêu lead cơ sở này <b className="text-emerald-700">{leadGrandTotalForBranch.toLocaleString('vi-VN')}</b> lead / năm</>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Hủy</button>
            <button
              onClick={save}
              disabled={saving || loading}
              className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
            >
              {saving ? 'Đang lưu...' : `Lưu mục tiêu ${year}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

