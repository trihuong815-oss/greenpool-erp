# Green Pool ERP — UI Design System

> **Trạng thái:** Khoá chuẩn sau PR-UI-PIXEL-MATCH B1–B6 (2026-06-26).
> **Bắt buộc tuân thủ cho mọi PR UI mới.**
> **Override chỉ khi có lý do nghiệp vụ rõ ràng — ghi rõ trong PR report.**

---

## 1. Triết lý UI

Green Pool ERP đi theo 4 nguyên tắc cốt lõi:

1. **Minimal ERP** — tối giản, sạch, nhiều khoảng trắng. Không gradient lớn. Không màu mè.
2. **Observation-first** — giao diện trả lời câu hỏi quản trị (bao nhiêu việc quá hạn? bao nhiêu chờ duyệt?), nổi bật việc cần chú ý.
3. **Action-oriented** — người dùng nhìn vào biết cần làm gì tiếp theo. Nút hành động chính rõ.
4. **Mỗi khối UI phải có mục đích** — KHÔNG thêm card/chart/table "cho có".

**Reference mockup:** `green-pool-prototype-sau-toi-uu.html` (Claude Projects).

---

## 2. Layout chuẩn mỗi page

Thứ tự khối từ trên xuống:

```
┌─────────────────────────────────────────────┐
│  AppTopBar (sticky, h-16)                    │  ← icon + title + breadcrumb + bell + UserMenu
├─────────────────────────────────────────────┤
│  Sidebar │   Content area                    │
│  (240px) │  ┌──────────────────────────────┐ │
│          │  │ PageHeader (optional)        │ │  ← nếu cần layer riêng
│          │  ├──────────────────────────────┤ │
│          │  │ Observation KPI (StatCard)   │ │  ← 3-5 KPI quan trọng
│          │  │ Risk / Bottleneck / Alert    │ │  ← chỉ hiện khi có
│          │  │ Working Table (TableWrap)    │ │  ← bảng xử lý chính
│          │  │ Action bar                   │ │  ← nút primary emerald
│          │  └──────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

---

## 3. Component bắt buộc dùng

Import từ `@/components/ui`:

```ts
import {
  PageHeader, StatCard, SegmentSummary, StatusPill,
  TableWrap, Num, formatVnd, formatMillion,
  FilterPanel, Field, Drawer,
} from '@/components/ui';
import { toneOf } from '@/lib/status';
import { displayName, objectLabel } from '@/lib/display-name';
```

### 3.1 `<PageHeader>`

**Khi nào:** header trang/module có icon + breadcrumb + title + subtitle + actions slot.

**Spec:**
- Icon ô vuông `h-10 w-10 rounded-md bg-emerald-50 text-emerald-700`
- Breadcrumb: `text-[11px] text-slate-400`
- Title: `text-[17px] font-bold text-slate-900`
- Subtitle: `text-[12.5px] text-slate-500`
- Actions: `ml-auto flex gap-2`

**KHÔNG:** tự code header inline cho page mới. Tái dùng `<PageHeader>` hoặc `<AppTopBar>`.

### 3.2 `<StatCard>` (KPI)

**Khi nào:** mọi KPI / số liệu tóm tắt.

**Spec:** white card `border border-slate-200`, label uppercase 11px, value `font-mono text-2xl tabular-nums`, icon ô vuông 28x28.

**Tone** (`StatCardTone`):
- `default` — slate (trung tính)
- `success` — emerald (tốt/hoàn tất/doanh số/thực thu)
- `warning` — amber (chờ/cảnh báo/đang làm)
- `danger` — rose (quá hạn/rủi ro/công nợ/từ chối)
- `info` — sky (đang xử lý/đã gửi/thông tin)

**KHÔNG:** tạo `KpiCard` riêng cho mỗi page. Nếu đã có inline cũ → wrap `<StatCard>` (xem B3 commits).

### 3.3 `<SegmentSummary>`

**Khi nào:** dải gộp nhiều trạng thái (vd 7 trạng thái đề xuất, các bước checklist).

**Spec:** 1 card chia đều N ô, value `font-mono text-xl tabular`, label uppercase 11px, border separator giữa.

**KHÔNG:** dùng grid 5-7 `<StatCard>` riêng nếu dữ liệu là cùng họ trạng thái.

### 3.4 `<StatusPill>`

**Khi nào:** mọi trạng thái nghiệp vụ (draft / pending / approved / done / rejected / locked...).

**Spec:** `rounded-full px-2.5 py-0.5 text-xs ring-1 ring-inset`. Tone qua `toneOf(status)` taxonomy.

**KHÔNG:** hardcode `bg-amber-50 text-amber-700 ring-amber-200` ở mỗi page. Add mapping vào `lib/status.ts` STATUS_TONE.

### 3.5 `<TableWrap>` + `<Num>` + helpers

**Khi nào:** mọi `<table>` UI.

**Spec:**
- Wrap `<table>` trong `<TableWrap>` → tự `overflow-x-auto` + `border-separate border-spacing-0 text-[13px]`
- Header: `bg-slate-50 text-[11px] uppercase text-slate-500`
- Số tiền/số lượng: `<Num>{...}</Num>` hoặc class `font-mono tabular-nums text-right`
- Format tiền: `formatVnd(n)` cho cell bảng (full "73.000.000")

**KHÔNG:** quên `overflow-x-auto`. KHÔNG để bảng vỡ mobile.

### 3.6 `<FilterPanel>` + `<Field>`

**Khi nào:** filter nâng cao của list/report.

**Spec:** card `border-slate-200 bg-white p-4` + collapse advanced + chips + Apply/Clear buttons.

**KHÔNG:** copy-paste filter inline nếu cùng pattern. Mở rộng `<FilterPanel>` qua props `advanced`/`chips`.

### 3.7 `<Drawer>`

**Khi nào:** detail panel slide từ phải (xem chi tiết tx / phiếu chi / proposal...).

**Spec:** overlay `bg-slate-900/40` + panel `max-w-md/xl/3xl` + ESC + scroll lock.

**KHÔNG:** code `fixed inset-0` raw mới. Dùng `<Drawer>` chuẩn.

---

## 4. Quy tắc màu

| Tone | Hex | Khi nào dùng |
|---|---|---|
| **Emerald** | `#1f9d6b` (brand-600) | Action chính / active / link / success / hoàn tất / doanh số |
| **Amber** | `#d97706` (warn) | Chờ duyệt / nháp / cảnh báo nhẹ / đang làm |
| **Rose** | `#dc2626` (danger) | Quá hạn / từ chối / rủi ro cao / công nợ / lỗi |
| **Sky** | `#2563eb` (info) | Đang xử lý / đã gửi / thông tin |
| **Slate** | gray-500/600/900 | Trung tính / text phụ / placeholder |
| **Violet** | `#7c3aed` | Locked / đã chốt (riêng cho khoá) |

**Quy tắc cứng:**
- ❌ KHÔNG gradient lớn (`bg-gradient-to-r from-X to-Y`). Trừ trường hợp avatar tier hierarchy hoặc icon decoration nhỏ.
- ❌ KHÔNG pastel ring nhiều màu để trang trí KPI. Chỉ dùng pastel ring cho `<StatusPill>` semantic.
- ❌ KHÔNG dùng emerald cho nền card hay icon trang trí. Emerald chỉ cho action/active.

---

## 5. Quy tắc số tiền

| Vị trí | Format | Helper |
|---|---|---|
| KPI dashboard top-level | `73 tr`, `57,5 tr`, `1,56 tỷ` | `formatMillion(n)` |
| Bảng kế toán / phiếu chi | `73.000.000đ`, `2.450.000đ` | `formatVnd(n)` + `đ` |
| Số lượng / count | `18`, `9`, `7 việc` | `.toString()` |

**Quy tắc cứng:**
- Mọi số tiền/số lượng trong table phải **căn phải** + `tabular-nums`.
- Dùng `<Num>` wrapper hoặc class `font-mono tabular-nums text-right`.
- Decimal: **dấu phẩy thập phân VN** (`57,5` không phải `57.5`).
- Khoảng trắng giữa số và đơn vị (`73 tr` không phải `73tr`).

---

## 6. Quy tắc text UI

**TUYỆT ĐỐI KHÔNG hiển thị ra UI:**

| ❌ Không dùng | ✅ Đổi thành |
|---|---|
| `API` / `Firestore` / `server-side` / `client-side` | "Hệ thống" / bỏ |
| `PR-7B` / `Phase 13.5` / commit hash | bỏ |
| `UUID` / `Tx_kuCsXgAbCdEfGhIj...` | Ẩn vào tooltip + `displayName()` |
| `salesAuditLogs` / `branchDailyExpenses` | "Nhật ký doanh số" / "Phiếu chi" |
| `mockup` / `html` / "green-pool-ui-mockup.html" | bỏ hoàn toàn |
| `internal id` dài | "Mã nội bộ" + tooltip |

**Khi không có tên user / object:**
- Dùng `displayName(ref)` → fallback "Chưa định danh"
- Dùng `objectLabel(kind, code)` → "Giao dịch #1042" / "Phiếu chi PC-001"
- `technicalIdTooltip(ref)` → đặt vào `title=...` tooltip, KHÔNG hiển thị thẳng

---

## 7. Quy tắc table

- Header: `bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 font-semibold`.
- Padding cell: `px-3.5 py-2.5` (chuẩn) hoặc `px-2 py-1.5` (compact).
- Row border: `border-t border-slate-200` giữa các row.
- Hover: `hover:bg-emerald-50/40` hoặc `hover:bg-slate-50`.
- Zebra row (optional cho bảng dài): `tr:nth-child(even) bg-slate-50`.
- Số tiền: **căn phải + tabular-nums + font-mono**.
- Status: `<StatusPill tone={toneOf(...)}>`.
- Mã kỹ thuật: KHÔNG hiển thị thẳng — dùng `<Num className="text-slate-400 text-[11px]">` hoặc tooltip.
- Empty state: "Không có dữ liệu phù hợp với bộ lọc." + optional nút "Xóa lọc". KHÔNG để bảng trắng gây hiểu nhầm lỗi.

---

## 8. Quy tắc form/filter

- **Label:** `<Field label="...">` từ `@/components/ui` — `text-[11px] uppercase tracking-wide text-slate-500`.
- **Input:** cùng chiều cao (`h-9` chuẩn), border `border-slate-300`, focus `border-emerald-600 ring-2 ring-emerald-50`.
- **Button primary:** `bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-4 py-2 text-[13px] font-semibold`. KHÔNG gradient.
- **Button ghost:** `bg-white border-slate-300 text-slate-700 hover:bg-slate-100`.
- **Filter nâng cao:** dùng `<FilterPanel>` với prop `advanced` + `chips`.

---

## 9. Quy tắc không tạo mới ad-hoc

**KHÔNG tạo mới component nếu đã có chuẩn:**

| ❌ Đừng tạo | ✅ Dùng |
|---|---|
| `KpiCard` mới cho page X | `<StatCard tone={...}>` |
| `StatusBadge` / `StatusChip` mới | `<StatusPill tone={toneOf(...)}>` |
| `Modal` / Drawer `fixed inset-0` raw | `<Drawer open={...}>` |
| `FilterBar` / `AdvancedFilterPanel` mới | `<FilterPanel chips={...}>` |
| `TableWrapper` / `ScrollableTable` mới | `<TableWrap>` |
| `formatCurrency` / `formatVND` mới | `formatVnd(n)` / `formatMillion(n)` |
| `personName(user)` ad-hoc | `displayName(ref)` |

**Nếu BẮT BUỘC tạo mới:**
1. Ghi rõ lý do trong PR report (vì sao primitive hiện tại không đủ).
2. Đề xuất mở rộng primitive thay vì duplicate.
3. Tag reviewer xác nhận trước khi merge.

---

## 10. Quy ước route + permission

Spec UI **KHÔNG đụng** route/permission/data model. Khi UI cần data mới:
- Nếu data đã có trong API: chỉ thêm UI binding.
- Nếu cần API mới: tách PR riêng (`feat:` thay vì `style:`).
- KHÔNG sửa `lib/permissions.ts`, `lib/auth/`, Firestore rules trong PR UI.

---

## Reference

- **Component primitives:** `components/ui/` (PageHeader, StatCard, StatusPill, TableWrap, FilterPanel, Drawer)
- **Helpers:** `lib/status.ts` (toneOf), `lib/display-name.ts` (displayName, objectLabel)
- **Mockup HTML source:** `Claude/Projects/Chuyên gia chuẩn hoá .../green-pool-prototype-sau-toi-uu.html`
- **PR history:** `a28bace` (B1) → `efd3809` (B2) → `70763b3` (B3) → `bf5395b` (B4) → `928a047` (B5) → `a76ea2e` (B6)
- **Review checklist:** `docs/pr-ui-review-checklist.md`
