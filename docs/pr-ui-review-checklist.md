# PR UI Review Checklist — Green Pool ERP

> **Bắt buộc** cho mọi PR có file `.tsx` thay đổi.
> Reviewer copy-paste checklist này vào PR comment, tick từng item.
> Spec đầy đủ: `docs/green-pool-ui-design-system.md`.

---

## ☑ Component & Layout

- [ ] **1. PageHeader / AppTopBar:** page có dùng `<PageHeader>` từ `@/components/ui` hoặc `<AppTopBar>` chuẩn chưa? (KHÔNG tự code header inline mới.)
- [ ] **2. StatCard:** mọi KPI / số liệu tóm tắt dùng `<StatCard tone={...}>` chưa? Tone đúng semantic (success/danger/warning/info/default)?
- [ ] **3. SegmentSummary:** dải gộp nhiều trạng thái (≥5 ô cùng họ) có dùng `<SegmentSummary>` không, hay vẫn là grid `<StatCard>` riêng?
- [ ] **4. StatusPill:** mọi trạng thái nghiệp vụ dùng `<StatusPill tone={toneOf(status)}>` chưa? Mapping status → tone đã add vào `lib/status.ts` chưa?
- [ ] **5. TableWrap:** mọi `<table>` được wrap bởi `<TableWrap>` để có `overflow-x-auto` chưa? Bảng nhiều cột có vỡ mobile không?
- [ ] **6. Number cells:** số tiền/số lượng dùng `<Num>` hoặc class `font-mono tabular-nums text-right` chưa? Căn phải?
- [ ] **7. FilterPanel:** filter nâng cao dùng `<FilterPanel>` + `<Field>` chưa, hay copy-paste pattern ad-hoc?
- [ ] **8. Drawer:** detail panel side-slide dùng `<Drawer>` chưa, hay code `fixed inset-0` raw mới?

---

## ☑ Format & Copy

- [ ] **9. Format tiền KPI:** dashboard top-level dùng `formatMillion(n)` ("73 tr", "57,5 tr", "1,56 tỷ") chưa?
- [ ] **10. Format tiền bảng:** cell bảng dùng `formatVnd(n)` ("73.000.000") + suffix "đ" tự thêm nếu cần?
- [ ] **11. Decimal:** dùng dấu phẩy thập phân VN (`57,5`) — KHÔNG dùng dấu chấm (`57.5`)?
- [ ] **12. Khoảng trắng đơn vị:** `73 tr`, `1,56 tỷ` — KHÔNG `73tr`/`1,56tỷ`?
- [ ] **13. Phần trăm:** `46,8%` — KHÔNG `46.8%`?

---

## ☑ Không lộ ngôn ngữ kỹ thuật

- [ ] **14. UUID / hash:** không hiển thị UUID dài (`51cd3c82-cce3-4ce1-...`) thẳng ra UI. Dùng `displayName()` + `technicalIdTooltip()` (đưa vào `title=`)?
- [ ] **15. Tên collection:** không lộ `salesAuditLogs`, `branchDailyExpenses`, `dailyCashflowReports` ra UI. Dùng nhãn nghiệp vụ ("Nhật ký doanh số", "Phiếu chi", "Báo cáo thu-chi")?
- [ ] **16. Code reference:** không lộ `PR-7B`, `Phase 13.5`, commit hash, `tolerant string`, `client-side/server-side` trong tooltip/label/banner?
- [ ] **17. Object type:** dùng `objectLabel(kind, code)` để hiển thị "Giao dịch #1042" thay vì "Tx kuCsXg..."?

---

## ☑ Màu sắc

- [ ] **18. Gradient lớn:** KHÔNG dùng `bg-gradient-to-r from-X to-Y` trên button/card/header. Chỉ solid emerald cho action.
- [ ] **19. Pastel ring KPI:** KHÔNG dùng `bg-amber-50 ring-amber-200` trang trí KPI card — chỉ semantic cho `<StatusPill>`.
- [ ] **20. Emerald usage:** emerald chỉ cho action/active/success — KHÔNG cho nền card decoration.
- [ ] **21. Tone semantic đúng:** quá hạn = rose, chờ = amber, đang xử lý = sky, hoàn tất = emerald, khoá = violet?

---

## ☑ Observation & UX

- [ ] **22. Card "làm cho có":** mỗi card/KPI/section có trả lời 1 câu hỏi quản trị cụ thể không? Nếu chỉ trang trí → bỏ.
- [ ] **23. Empty state:** khi không có data, có hiển thị "Không có dữ liệu phù hợp" + nút action (vd "Xóa lọc") chưa? KHÔNG để bảng trắng.
- [ ] **24. Banner dài:** helper/intro/note có ≤2 dòng không? Nếu dài → rút gọn thành "helper strip" 1 dòng.
- [ ] **25. Action button:** nút primary chính của page có nổi bật + dễ thấy không?

---

## ☑ Responsive & Accessibility

- [ ] **26. Mobile:** bảng nhiều cột có `overflow-x-auto` chưa? Filter có stack vertical trên mobile chưa?
- [ ] **27. Touch target:** button trên mobile ≥40x40px?
- [ ] **28. Font size:** KHÔNG có `text-[9px]/text-[10px]/text-[11px]` (rule CLAUDE.md). Tối thiểu `text-xs` (12px). `text-[11px]` ngoại lệ chỉ cho label uppercase metadata.
- [ ] **29. Icon size:** KHÔNG có `size={9}/{10}/{11}`. Tối thiểu `size={12}`.

---

## ☑ Không ảnh hưởng nghiệp vụ

- [ ] **30. Logic / API / Permission:** PR có sửa file logic / route / API / permission / Firestore không?
  - Nếu CÓ: phải tách PR khác (`feat:` thay vì `style:`).
  - Nếu KHÔNG: ghi rõ "0 file logic" trong report.
- [ ] **31. Props signature:** thay đổi `<StatCard>` / `<Drawer>` / component shared có giữ tương thích callsite cũ không? Có TS error không?
- [ ] **32. Test pass:** `npx tsc --noEmit` clean? `npx vitest run` 914/914 (hoặc số hiện tại) pass?

---

## ☑ Health gate

- [ ] **33. Quality Gate CI** (TypeScript Check + Vitest Unit Tests + Firestore Rules Compile + Next.js Build) **completed/success**?
- [ ] **34. App Hosting Rollout** thành công?
- [ ] **35. Manual smoke** trang chính (ít nhất /cong-viec-ca-nhan + 1 page liên quan PR)?

---

## ☑ Report format bắt buộc trong PR description

```markdown
# PR-... Report

1. Files changed (count + list)
2. Pages updated
3. Pages NOT updated and reason
4. Confirmation:
   - Logic unchanged
   - API unchanged
   - Permission unchanged
   - Route unchanged
   - Data model unchanged
   - Calculation unchanged
5. Visual Acceptance Check (chấm x/10 từng màn ảnh hưởng)
6. Tests result
7. TypeScript result
8. Manual smoke result
9. Any regression?
10. Commit hash
11. Git status
12. Deploy status
13. Recommendation next step
```

---

## Reference

- **Design system spec:** `docs/green-pool-ui-design-system.md`
- **Component primitives:** `components/ui/` (PageHeader, StatCard, StatusPill, TableWrap, FilterPanel, Drawer)
- **Helpers:** `lib/status.ts` (toneOf), `lib/display-name.ts` (displayName, objectLabel)
- **Mockup HTML reference:** `Claude/Projects/Chuyên gia chuẩn hoá .../green-pool-prototype-sau-toi-uu.html`
