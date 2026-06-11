# CLAUDE.md — Green Pool ERP · AI Working Guide

> Tài liệu này dành cho Claude (AI assistant) làm việc trên repo này.  
> Cập nhật lần cuối: 11/06/2026 · Sprint ~19 commits

---

## 1. PROJECT OVERVIEW

**App:** Green Pool ERP — hệ thống quản lý chuỗi cơ sở bể bơi  
**URL:** https://greenpool-erp.vercel.app (Firebase App Hosting via Vercel adapter)  
**Repo:** https://github.com/trihuong815-oss/greenpool-erp  
**Tech stack:** Next.js 14 (App Router) · TypeScript · Firebase (Firestore, Auth) · Tailwind CSS  
**Owner / Admin:** Nguyễn Văn Hướng — QUẢN TRỊ VIÊN HỆ THỐNG

---

## 2. USER (ADMIN) IDENTITY

| Field | Value |
|-------|-------|
| Tên | Nguyễn Văn Hướng |
| Vai trò | QUẢN TRỊ VIÊN HỆ THỐNG (ADMIN) |
| Quyền | CEO / ADMIN — thấy toàn bộ module, Liên khối, TopBottleneck |

---

## 3. CRITICAL CONSTRAINTS — KHÔNG VI PHẠM

1. **KHÔNG bỏ metric Axit (pH)** khỏi KTDashboardSection — user cần theo dõi lượng sử dụng
2. **KHÔNG thêm menu sidebar mới** không cần thiết
3. **KHÔNG phá vỡ TypeScript types** — phải kiểm tra interface trước khi patch
4. **PHẢI verify SHA hiện tại** trước mỗi commit PUT (fetch SHA → dùng SHA đó)
5. **"Đề xuất" đã bị ẩn** khỏi module Điều phối — KHÔNG khôi phục lại
6. **CEO không cần thấy số liệu thô kỹ thuật** — Dashboard ưu tiên KPI nghiệp vụ
7. **Dashboard thứ tự section:** Điều phối → Doanh số → KT → Cơ sở

---

## 4. MODULES & ROUTES

| Module | Route | Mô tả |
|--------|-------|-------|
| Dashboard | /dashboard | KPI tổng hợp: Điều phối, Doanh số, KT, Cơ sở |
| Điều phối công việc | /giao-viec | Nhiệm vụ, Giao việc, Liên khối (KHÔNG có Đề xuất) |
| Kỹ thuật | /ky-thuat | Theo dõi hoá chất, thiết bị, pH/Clo |
| Cơ sở | /co-so | Quản lý cơ sở vật chất, hồ bơi |
| Doanh số | /doanh-so | Báo cáo doanh thu, thống kê |

---

## 5. KEY FILES

```
app/(app)/
  dashboard/
    page.tsx                  — fetch data, truyền props
    DashboardContent.tsx      — toàn bộ UI dashboard
    KTDashboardSection.tsx    — section kỹ thuật (CÓ Axit)
    data.kythuat.ts           — KyThuatSummary interface
  giao-viec/
    page.tsx                  — fetch taskCounts
    GiaoViecClient.tsx        — toàn bộ UI điều phối công việc
lib/
  services/tasks/api-client.ts  — Task interface, fetchTasks
```

---

## 6. KEY INTERFACES

### TaskCounts (DashboardContent.tsx)
```typescript
interface TaskCounts {
  total?: number;
  active?: number;
  done?: number;
  overdue?: number;        // thêm sprint 2
  pendingApproval?: number; // thêm sprint 2
  todo?: number;           // thêm sprint 2
  checklistSent?: number;
  checklistUnread?: number;
}
```

### RevenueSummary (DashboardContent.tsx)
```typescript
interface RevenueSummary {
  month?: number;
  year?: number;
  monthPct?: number;  // thêm sprint 2
  yearPct?: number;   // thêm sprint 2
}
```

### KyThuatSummary — property đúng (data.kythuat.ts)
```typescript
// ĐÚNG:
system.cloTotal       // KHÔNG dùng totalClo
system.locCapTotal    // KHÔNG dùng totalMayLoc
system.nhietCapTotal  // KHÔNG dùng totalMayNhiet
```

---

## 7. MODULE ĐIỀU PHỐI CÔNG VIỆC — STATE HIỆN TẠI

### CategoryCards (chỉ hiện 3):
- ✅ Nhiệm vụ của tôi
- ✅ Giao việc
- ✅ Liên khối
- ❌ Đề xuất (ĐÃ XOÁ — KHÔNG khôi phục)

### Tabs:
- Nhiệm vụ của tôi
- Giao việc
- Chờ duyệt
- Liên khối (chỉ ADMIN/CEO)

### View modes:
- List (default)
- Kanban
- Flow (luồng công việc với nhiều thành viên — GitBranch icon)

### Admin-only sections:
- **TopBottleneckSection**: top 5 phòng/cơ sở có nhiều việc quá hạn nhất

---

## 8. DASHBOARD PIPELINE SECTION

`WorkflowPipelineSection` trong DashboardContent.tsx bao gồm:
- Pipeline bar: 4 bước (Tạo → Phân công → Thực hiện → Hoàn thành)
- Alert banners: overdue, pendingApproval
- TOP Điểm nghẽn (phòng/cơ sở bị trễ nhiều nhất)

---

## 9. FLOW VIEW — LUỒNG CÔNG VIỆC

Components trong GiaoViecClient.tsx:
- `MemberAvatar`: avatar với initials, màu theo trạng thái (done/active/pending/skipped)
- `FlowConnector`: đường nối ngang giữa các bước
- `FlowTaskCard`: card với timeline ngang: Người tạo → Người duyệt(s) → Người thực hiện → Kết thúc
- `FlowView`: container nhóm task theo status (active/done/terminal)

Props:
```typescript
FlowView: { tasks: Task[]; users: User[]; currentUserId: string }
```

---

## 10. SPRINT WORKFLOW PATTERN

### Mỗi sprint thực hiện theo pattern:
```
1. Restore token: window._ghToken = 'ghp_...'
2. Fetch SHA: GET /repos/.../contents/{path}  → lấy .sha
3. Đọc content: atob(data.content) → patch
4. Encode: btoa(unescape(encodeURIComponent(newContent)))
5. PUT commit: { message, content: encoded, sha }
6. Verify build: GET /commits/main/check-runs → check TypeScript + Next.js + App Hosting
7. Nếu lỗi: GET /check-runs/{id}/annotations → đọc lỗi chi tiết → patch lại
```

### Token (expires 18/06/2026):
```
ghp_XXXX...XXXX  ← lấy từ GitHub Settings > Developer tokens (expires 18/06/2026, tên: greenpool-claude-sprint2, scope: repo)
```
> Sau mỗi navigate: `window._ghToken = 'ghp_XXXX...XXXX  ← lấy từ GitHub Settings > Developer tokens (expires 18/06/2026, tên: greenpool-claude-sprint2, scope: repo)'`

---

## 11. BUILD VERIFY COMMANDS

```javascript
// Check build status
(async () => {
  const r = await fetch('https://api.github.com/repos/trihuong815-oss/greenpool-erp/commits/main/check-runs', {
    headers: { Authorization: `token ${window._ghToken}`, Accept: 'application/vnd.github.v3+json' }
  });
  const d = await r.json();
  return d.check_runs.map(c => c.name + ': ' + c.conclusion);
})();
```

---

## 12. COMMIT HISTORY (Session 1-2)

| Commit | Nội dung |
|--------|----------|
| Sprint 1-4 (pre-session) | Sidebar, Dashboard KPI, BottomNavBar, fetchTaskCounts, checklistUnread |
| `282e56ee` | Fix TS interfaces + WorkflowPipeline section on Dashboard |
| `dce3a6d8` | Fix JSX comment `}` in DashboardContent |
| `361276d6` | Fix JSX comment `}` in GiaoViecClient |
| `0a684e3e` | TOP Điểm nghẽn + overdue per-dept in GiaoViecClient |
| `afcd0ac6` | Fix yearPct + system.cloTotal/locCapTotal/nhietCapTotal |
| `b1a6c872` | Fix deptId/deptName/inProgress in perDeptStats |
| `de42b9a8` | FlowView — luồng công việc với nhiều thành viên |
| `b5b7b703` | Fix FlowView/FlowTaskCard TypeScript props |
| `577df5d1` | Ẩn tab Đề xuất khỏi module Điều phối |
| `33834009` | Fix restore showAssignmentTab wrapper after Đề xuất removal |
| (current) | Tạo CLAUDE.md |

---

## 13. KNOWN BUGS & FIXES

| Lỗi | Fix |
|-----|-----|
| `overdue/pendingApproval/todo` missing từ TaskCounts | Thêm optional fields vào interface |
| `monthPct/yearPct` missing từ RevenueSummary | Thêm optional fields vào interface |
| `totalClo` sai property | Dùng `system.cloTotal` |
| JSX comment thiếu `}` | Sửa `{/* ... */` → `{/* ... */}` |
| `deptId/deptName` sai prop names | Dùng `id/name` theo Task interface |
| FlowView `users` type mismatch | Dùng `User[]` type, thêm `currentUserId` |
| Sau khi xóa Đề xuất: JSX orphan | Khôi phục `{showAssignmentTab && (` wrapper |

---

## 14. TASKS BACKLOG (Có thể làm tiếp)

- [ ] Populate real data cho `overdue`, `pendingApproval`, `todo` trong fetchTaskCounts
- [ ] Cải thiện FlowView UI theo mockup cụ thể
- [ ] Banner cảnh báo chênh lệch doanh số trong Điều phối
- [ ] Dark mode support
- [ ] Mobile optimization cho FlowView

---

*File này được Claude tự động tạo và cập nhật. Không chỉnh sửa thủ công.*
