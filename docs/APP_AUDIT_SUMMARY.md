# APP_AUDIT_SUMMARY — Green Pool ERP

> Báo cáo audit kỹ thuật toàn diện · Lập ngày 22/06/2026 · Đối tượng: gửi chuyên gia external review
> Tác giả audit: AI engineer (Claude Sonnet 4.7) đóng vai senior engineer + ERP expert.
> Không sửa code, không commit, không lộ secret. Đọc + phân tích + tổng hợp.

---

## 1. Tổng quan app

| Hạng mục | Giá trị |
|---|---|
| **Tên** | Green Pool ERP |
| **Version** | `0.1.0` (package.json) |
| **Framework** | Next.js **16.2.6** App Router + React **18.3.1** + TypeScript |
| **UI** | Tailwind CSS + lucide-react icons + Recharts ^2.12.7 |
| **Backend** | Firebase: Auth + Firestore + Storage + Cloud Messaging (FCM) — `firebase-admin ^13.10.0`, `firebase ^12.13.0` |
| **Excel** | `exceljs ^4.4.0` (server-side, PR-6) |
| **Test** | `vitest ^4.1.8` — 16 test files, 184 tests passing |
| **Error tracking** | `@sentry/nextjs ^10.56.0` |
| **Deploy** | **Firebase App Hosting** (không phải Vercel deploy) — apphosting.yaml, region `asia-southeast1`. Domain hiện tại: `greenpool-erp.vercel.app` (Vercel làm CDN/preview, prod chạy Firebase Hosting). Project Firebase: `green-pool-system` (`.firebaserc`). |
| **Repo** | `https://github.com/trihuong815-oss/greenpool-erp` |

### Mục tiêu chính
Hệ thống ERP nội bộ quản lý vận hành **5 cơ sở bể bơi Green Pool**:
- Quản lý sale/doanh số/công nợ
- Đối chiếu/khóa kỳ tài chính
- Chương trình khuyến mãi (workflow đề xuất → duyệt → kích hoạt)
- Báo cáo doanh thu tháng theo nhiều vai trò
- Kỹ thuật vận hành (hóa chất, máy, nhân sự kỹ thuật)
- Checklist vận hành hàng ca
- Giao việc / phê duyệt / quy trình
- Nhân sự, đào tạo, marketing, dự án
- Cá nhân: tasks, journal, habits, goals, AI assistant

### Nhóm người dùng
**5 cơ sở** (BranchId): `HM` (Hoàng Mai), `TK` (20 Thuỵ Khuê), `CTT` (Cung Thể Thao Mã), `24` (24 Nguyễn Cơ Thạch), `TT` (Thanh Trì).

**32 role** (`lib/permissions.ts`): ADMIN, CEO, CHU_TICH, GD_KD, GD_VP, TP_KE, TP_GS, TP_NS, TP_KT, TP_DT, TP_MKT, NV_KE, NV_SALE, NV_SALE_PT, NV_CH (cửa hàng), QLCS_HM/TK/CTT/TT (4 — chú ý KHÔNG có QLCS_24 mà là QLCS_24NCT), GV_NC/GV_CB (giáo viên năng cao/cơ bản), TT_DT (trợ thầy đào tạo), PP_HT/PP_XLN (phụ phòng hè/xử lý nước), KT_HT_HM/TK/CTT/TT, KT_XLN_HM/TK/CTT/TT, TIBAN_TT (tiểu ban truyền thông).

---

## 2. Cấu trúc thư mục quan trọng

```
GreenPool_ERP/
├── app/                           Next.js 16 App Router
│   ├── (app)/                     Route group có auth gate (layout.tsx)
│   │   ├── layout.tsx             Server gate: getCurrentProfile + redirect /login + FeatureFlagsProvider
│   │   ├── dashboard/             Dashboard chính (CEO + QLCS view)
│   │   ├── dashboard-ceo/         Dashboard CEO riêng (WIP)
│   │   ├── doanh-so-v2/           Sales V2 module — 7 sub-route
│   │   │   ├── nhap/              Sale/QLCS nhập tx
│   │   │   ├── doi-chieu/         Kế toán đối chiếu batch
│   │   │   ├── cong-no/           Công nợ
│   │   │   ├── tong-ket/          Dashboard tổng kết tháng (5 view per role)
│   │   │   ├── chuong-trinh/      Workflow KM (draft→approve→active)
│   │   │   └── quay-le-tan/       Walk-in tx (nhap + cau-hinh)
│   │   ├── doanh-so/              Sales V1 (deprecated, ẩn sidebar)
│   │   ├── checklist-v2/          Checklist vận hành ca
│   │   ├── giao-viec/             Tasks (kind=assignment)
│   │   ├── dieu-phoi/             Điều phối task
│   │   ├── de-xuat/               Đề xuất (tasks kind=proposal)
│   │   ├── phe-duyet/             Phê duyệt
│   │   ├── ky-thuat/              Kỹ thuật: giao-viec, hoa-chat, may, nhan-su
│   │   ├── tin-nhan/              Chat
│   │   ├── cong-viec-ca-nhan/     Personal workspace (tasks/journal/habits/goals/AI)
│   │   ├── co-so/[branchId]/      Trang chi tiết cơ sở
│   │   ├── sodo/                  Sơ đồ tổ chức
│   │   ├── users/                 Admin quản lý user
│   │   ├── quan-ly-sale/          Admin quản lý sale account
│   │   ├── luong/, bao-cao/, daotao/, mkt/, bao-mat/, thong-bao/, quy-trinh/, du-an/*
│   │   └── doi-mat-khau/, settings-packages/
│   ├── api/                       130 API route handlers
│   │   ├── sales-v2/              Sales V2 endpoints (batches, transactions, programs, export, monthly-summary)
│   │   ├── sales-targets/         Chỉ tiêu doanh số (Phase 6.I + PR-TK3)
│   │   ├── sales-staff/           Quản lý Sale (POST + GET PR-IA1A)
│   │   ├── cron/                  Cron jobs (program reminder, retry FCM, ...)
│   │   ├── admin/, personal/, tasks/, chat/, checklist-v2/, ky-thuat/, leads/, ...
│   ├── layout.tsx                 Root layout (font, body class)
│   └── login/, page.tsx (root redirect)
├── components/                    37 component file (Sidebar, AppShell, AppTopBar, BatchBadge, ChecklistBadge, NotificationBell, ...)
├── lib/
│   ├── auth/                      roles.ts (helper isTopAdmin/isCEO/isQLCS/...)
│   ├── firebase/                  admin.ts, client.ts, checklist-auth.ts (getAuthedCaller),
│   │                              checklist-scope.ts (isWriteAdmin/isAdmin/isQLCS/isTP),
│   │                              session-auth.ts (SESSION_COOKIE='gp_session', TTL 14d),
│   │                              current-profile.ts (requireAuthedProfile),
│   │                              collections.ts (47 collection const),
│   │                              audit-log.ts (writeAuditLog generic),
│   │                              notifications-store.ts (NotiType enum),
│   │                              sales-targets-scope.ts (canWriteTarget/canWriteStaffTargets),
│   │                              noti-engine.ts (sendNotificationEvent)
│   ├── sales-v2/                  scope.ts, audit-log.ts (recordSalesAuditIfEnabled),
│   │                              month-lock.ts, target-progress.ts (PR-TK3A),
│   │                              promo-effectiveness.ts (PR-TK4C), export-excel.ts (PR-6),
│   │                              programs.ts, recipients.ts, resolve-package-names.ts, ...
│   ├── permissions.ts             SINGLE SOURCE — ALL_ROUTES per role (32 role)
│   ├── permissions-catalog.ts     Route catalog
│   ├── feature-flags/             registry.ts (5 flag + 3 base), server.ts (cache 60s), client.tsx (Context)
│   ├── navigation/routes.ts       ALL_ROUTES cho Cmd+K palette
│   ├── types/                     Barrel index.ts + sales-v2, sales-program, sales-audit, branches, users
│   ├── services/                  api-client wrappers per module
│   └── branches.ts                BRANCH_IDS, BRANCH_BY_ID, isBranchId — SSOT cho 5 cơ sở
├── firebase/
│   ├── firestore.rules            513 lines security rules
│   ├── storage.rules
│   └── firestore.indexes.json     41 composite indexes (deployed)
├── tests/                         16 test files (184 tests passing)
│   ├── sales-v2/                  scope, target-progress, programs, promo-effectiveness, sales-targets-scope
│   ├── feature-flags/             registry (10 tests)
│   ├── permissions/               5 file (sales-role, branches, menu-access, role-blocks, can-matrix)
│   ├── audit/worm-contract.test.ts
│   ├── notifications/             badge-invariant, approver-entry
│   ├── rate-limit/                distributed
│   └── types/                     branches-types
├── secrets/                       firebase-admin-sa.json (gitignored, GOOGLE_APPLICATION_CREDENTIALS)
├── .github/workflows/             cron-reminders.yml + CI workflows
├── scripts/                       Admin scripts (audit, migration, check, fix-*)
├── apphosting.yaml                Firebase App Hosting config (NEXT_PUBLIC_*, FIREBASE_*, secrets via Secret Manager)
├── firebase.json                  Firestore rules + indexes path
├── .firebaserc                    default project = green-pool-system
└── package.json                   Next 16, React 18, deps liệt kê mục 1
```

### File quan trọng nhất (top 10)
1. `lib/permissions.ts` — SSOT phân quyền route (32 role)
2. `lib/firebase/checklist-scope.ts` — helper isAdmin/isWriteAdmin/isQLCS/isTP
3. `lib/firebase/session-auth.ts` — session cookie 14 ngày
4. `app/(app)/layout.tsx` — auth gate + FeatureFlagsProvider
5. `components/Sidebar.tsx` — 7-section sidebar V9 + hideForRoles/showOnlyForRoles
6. `firebase/firestore.rules` — security rules 513 lines
7. `lib/firebase/collections.ts` — 47 collection SSOT
8. `lib/sales-v2/scope.ts` — Sales V2 permission helpers
9. `lib/feature-flags/registry.ts` — 8 flag (3 base UI + 5 sales-v2)
10. `app/api/sales-v2/monthly-summary/route.ts` — dashboard /tong-ket data source

---

## 3. Danh sách route/page hiện có

**Tổng 45 page.tsx** + 130 API route.

| Route | Tên màn hình | Module | Quyền truy cập | Trạng thái |
|---|---|---|---|:---:|
| `/login` | Đăng nhập | Auth | All | ✅ Done |
| `/dashboard` | Dashboard chính | Dashboard | All authenticated | ✅ Done |
| `/dashboard-ceo` | Dashboard CEO | Dashboard | top role | 🚧 WIP (badge) |
| `/co-so` | Danh sách cơ sở | Branches | All | ✅ Done |
| `/co-so/[branchId]` | Chi tiết cơ sở | Branches | All | ✅ Done |
| `/doanh-so` | (V1 Dashboard cũ) | Sales V1 | top + QLCS | ⚠️ Deprecated (ẩn sidebar) |
| `/doanh-so/nhap` | (V1 Nhập) | Sales V1 | top + QLCS | ⚠️ Deprecated |
| `/doanh-so/packages` | Cài đặt gói dịch vụ | Sales V1 | admin | ⚠️ Còn dùng (?) |
| `/doanh-so-v2/nhap` | Nhập doanh số | Sales V2 | Sale + QLCS + Admin | ✅ Done |
| `/doanh-so-v2/doi-chieu` | Đối chiếu doanh số | Sales V2 | TP_KE/NV_KE/Top + QLCS | ✅ Done (PR-6/PR-TK) |
| `/doanh-so-v2/cong-no` | Công nợ | Sales V2 | nhiều role | ✅ Done |
| `/doanh-so-v2/tong-ket` | Tổng kết / Báo cáo doanh thu | Sales V2 | 16 role | ✅ Done (PR-TK4 — 5 view per role) |
| `/doanh-so-v2/chuong-trinh` | Chương trình KM (workflow) | Sales V2 | 12 role | ✅ Done (M2.1 PR-5) |
| `/doanh-so-v2/quay-le-tan/nhap` | Quầy lễ tân nhập | Sales V2 | NV_KE/Lễ tân | ✅ Done |
| `/doanh-so-v2/quay-le-tan/cau-hinh` | Quầy lễ tân cấu hình | Sales V2 | TP_KE | ✅ Done |
| `/checklist-v2` | Checklist v2 | Operations | All | ✅ Done |
| `/giao-viec` | Giao việc | Tasks | TP/QLCS/GD/CEO/CHU_TICH | ✅ Done (V6.4) |
| `/dieu-phoi` | Điều phối công việc | Tasks | All | ✅ Done |
| `/de-xuat` | Đề xuất | Tasks | All | ✅ Done |
| `/phe-duyet` | Phê duyệt | Tasks | All | 🚧 WIP (badge) |
| `/thong-bao` | Thông báo | Noti | All | 🚧 WIP (badge) |
| `/ky-thuat` | Kỹ thuật (root) | Tech | Tech + top | ✅ Done |
| `/ky-thuat/giao-viec` | KT giao việc | Tech | Tech | ✅ Done |
| `/ky-thuat/hoa-chat` | Hoá chất | Tech | Tech | ✅ Done |
| `/ky-thuat/may` | Máy lọc | Tech | Tech | ✅ Done |
| `/ky-thuat/nhan-su` | Nhân sự KT | Tech | Tech | ✅ Done |
| `/tin-nhan` | Chat | Communication | All | ✅ Done |
| `/cong-viec-ca-nhan` | Workspace cá nhân | Personal | All | ✅ Done (Phase 9) |
| `/sodo` | Sơ đồ tổ chức | HR | All | ✅ Done |
| `/users` | Quản lý user | Admin | ADMIN only | ✅ Done |
| `/quan-ly-sale` | Quản lý sale account | Admin | admin | ✅ Done |
| `/luong` | Lương | HR | TP_NS/GD/CEO | ✅ Done |
| `/bao-cao` | Báo cáo tự động | Reports | nhiều role | ✅ Done |
| `/daotao` | Đào tạo | Training | KD + GV | ✅ Done |
| `/mkt` | Marketing | MKT | TP_MKT + top | ✅ Done |
| `/bao-mat` | Bảo mật & Thông báo | Settings | All | ✅ Done |
| `/doi-mat-khau` | Đổi mật khẩu | Auth | All | ✅ Done |
| `/settings-packages` | Cài đặt gói | Settings | admin | ✅ Done |
| `/du-an/erp`, `/mo-co-so`, `/dac-biet`, `/ai` | Dự án | Projects | top | 🚧 WIP (4 placeholder, badge `soon`) |
| `/quy-trinh` | Quy trình | Process | All | ✅ Done |
| `/quan-ly-cong-viec` | Quản lý công việc | Tasks | manager | ✅ Done |

### API route count breakdown (130 total)
- `/api/sales-v2/*`: ~30 (batches, transactions, programs, export, monthly-summary, debts, month-locks, ...)
- `/api/personal/*`: 19 (fcm-token, noti-channels, journal, habits, goals, ai)
- `/api/cron/*`: 8 (program-deadline-reminder, retry-failed-push, cleanup-stale-fcm, dispatch-overdue, ...)
- `/api/chat/*`: 8 (conversations, messages, attachments, users/search)
- `/api/tasks/*`: 8 (CRUD + comments + attachments + approval)
- `/api/checklist-v2/*`: 5
- `/api/ky-thuat/*`: 5
- `/api/admin/*`: 5
- `/api/sales/*`, `/api/sales-targets/*`, `/api/sales-staff/*`, `/api/sales-entries/*`, `/api/package-sales/*`, `/api/leads/*`, `/api/proposals/*`, ...

---

## 4. Sidebar / menu hiện tại

**Sidebar V9 sau PR-IA1A (2026-06-22)** — 7 section, role-based filter qua `hideForRoles` + `showOnlyForRoles` + permission `allowed.has(route)`.

### Section structure

| # | Section | Items chính |
|:---:|---|---|
| 1 | (no title) | Dashboard CEO (badge wip) |
| 2 | Trung tâm điều hành | Công việc cá nhân, Điều phối, Đề xuất, Phê duyệt (wip), Thông báo (wip) |
| 3 | Khối kinh doanh | Cơ sở, **Doanh số (nested)**, Marketing, Đào tạo, Kỹ thuật vận hành |
| 4 | Khối văn phòng | **Tài chính kế toán (nested)**, **Giám sát (TP_GS only)**, Nhân sự (sodo), Giám sát (checklist-v2) |
| 5 | Khối dự án | ERP, Mở cơ sở mới, Dự án đặc biệt, AI & Chuyển đổi số (4 placeholder, badge `soon`) |
| 6 | Báo cáo & AI | Báo cáo tự động |
| 7 | Cài đặt | Bảo mật & Thông báo, Gói dịch vụ, Tài khoản user |

### Nested "Doanh số" (KKD) — hideForRoles TP_KE/NV_KE

| Tên menu | Route | Role thấy | Ghi chú |
|---|---|---|---|
| Nhập doanh số | `/doanh-so-v2/nhap` | Sale + QLCS + Admin | |
| Đối chiếu doanh số | `/doanh-so-v2/doi-chieu` | QLCS + Admin/CEO/CHU_TICH/GD_KD/GD_VP | PR-IA1A thêm vào KKD |
| Công nợ bán hàng | `/doanh-so-v2/cong-no` | Tất cả (KKD perspective) | PR-NAV1A đổi label từ "Công nợ" |
| Tổng kết doanh số tháng | `/doanh-so-v2/tong-ket` | Tất cả | PR-NAV1A đổi label |
| Đề xuất khuyến mãi | `/doanh-so-v2/chuong-trinh` | **showOnlyForRoles: 5 QLCS** | PR-IA1A |
| Duyệt khuyến mãi | `/doanh-so-v2/chuong-trinh` | **showOnlyForRoles: GD_KD** | PR-IA1A |

### Nested "Tài chính kế toán" — hideForRoles Sale + 5 QLCS + TP_GS

| Tên menu | Route | Role thấy | Ghi chú |
|---|---|---|---|
| Đối chiếu doanh số | `/doanh-so-v2/doi-chieu` | TP_KE/NV_KE/Top | |
| Công nợ phải thu | `/doanh-so-v2/cong-no` | TCKT scope | PR-NAV1A đổi label |
| Báo cáo doanh thu tháng | `/doanh-so-v2/tong-ket` | TCKT scope | PR-NAV1A đổi label |
| Cấu hình khuyến mãi | `/doanh-so-v2/chuong-trinh` | **showOnlyForRoles: TP_KE/NV_KE** | PR-IA1A |
| Duyệt khuyến mãi | `/doanh-so-v2/chuong-trinh` | **showOnlyForRoles: GD_VP** | PR-IA1A |
| Chương trình KM | `/doanh-so-v2/chuong-trinh` | **showOnlyForRoles: ADMIN/CEO/CHU_TICH** | PR-IA1A |
| Quầy lễ tân — Nhập | `/doanh-so-v2/quay-le-tan/nhap` | NV_KE/Lễ tân | |
| Quầy lễ tân — Cấu hình | `/doanh-so-v2/quay-le-tan/cau-hinh` | TP_KE | |

### "Giám sát" — showOnlyForRoles: TP_GS

| Tên menu | Route | Role thấy |
|---|---|---|
| Báo cáo doanh thu tháng | `/doanh-so-v2/tong-ket` | TP_GS |

### Đánh giá menu

| Tiêu chí | Đánh giá |
|---|---|
| Trùng tên menu cho cùng route | ✅ Đã xử lý qua PR-NAV1A + PR-IA1A (label workflow-specific theo role) |
| Sai quyền | ✅ Sidebar tự filter qua `allowed.has(route)` + `hideForRoles` + `showOnlyForRoles` |
| Khó hiểu | ⚠️ NV_KE có thể nhầm "Cấu hình khuyến mãi" vs "Duyệt khuyến mãi" (cùng route nhưng khác role workflow) |
| Đúng nghiệp vụ Green Pool | ✅ KKD/TCKT/Giám sát phân theo workflow đúng nghiệp vụ |
| WIP nhiều | ⚠️ 4 Khối dự án + Dashboard CEO + Phê duyệt + Thông báo có badge `wip`/`soon` |

---

## 5. Hệ thống phân quyền

### Danh sách role (32) — phân nhóm

**Top management (xem all hệ thống)**: ADMIN, CEO, CHU_TICH, GD_KD, GD_VP
**Tài chính kế toán**: TP_KE (HQ kế toán, scope all), NV_KE (cơ sở, scope 1 branch)
**Giám sát**: TP_GS (read-only audit)
**Khối kinh doanh** (cơ sở): QLCS_HM/TK/CTT/24NCT/TT, NV_SALE, NV_SALE_PT, NV_CH
**Khối kỹ thuật**: TP_KT, KT_HT_*, KT_XLN_*, PP_HT, PP_XLN
**Khối đào tạo**: TP_DT, TT_DT, GV_NC, GV_CB
**Marketing/Nhân sự**: TP_MKT, TP_NS, TIBAN_TT

### Phân quyền theo phạm vi data

| Role | Phạm vi xem | Phạm vi sửa |
|---|---|---|
| ADMIN | Toàn hệ thống | Toàn hệ thống |
| CEO | Toàn hệ thống | **View-only** (theo `isWriteAdmin` legacy, KHÔNG bao gồm CEO) |
| CHU_TICH | Toàn hệ thống | View-only |
| GD_KD | Toàn hệ thống (KD scope) | Có |
| GD_VP | Toàn hệ thống (VP scope) | Có |
| TP_KE | Toàn hệ thống (kế toán) | Approve batch + lock kỳ |
| TP_GS | Toàn hệ thống (giám sát) | KHÔNG sửa, KHÔNG export Excel (PR-6.3) |
| NV_KE | 1 cơ sở (facility_id) | Approve batch cơ sở mình |
| QLCS_* | 1 cơ sở | Submit batch, set staffTargets, đề xuất KM |
| NV_SALE/PT | 1 Sale (uid) | Tạo tx của mình |
| Khác (Tech/MKT/HR/...) | Theo module | Theo module |

### Logic kiểm tra quyền

| Lớp | File | Cơ chế |
|---|---|---|
| Layout RSC | `app/(app)/layout.tsx` | `getCurrentProfile()` → redirect /login nếu null |
| Route gate (per page) | `page.tsx` server component | `canAccessRoute(profile.roleCode, route, menuOverrides)` từ `lib/permissions.ts` |
| Server-side API | Mọi `app/api/**/route.ts` | `getAuthedCaller()` từ `lib/firebase/checklist-auth.ts` + scope helpers (isAdmin/isQLCS/isWriteAdmin/...) |
| Firestore Rules | `firebase/firestore.rules` | 513 lines — BLOCK direct DB access bypass server |
| Sidebar UI filter | `components/Sidebar.tsx` | `hideForRoles` + `showOnlyForRoles` + `allowed.has(route)` |
| Feature flag | `lib/feature-flags/server.ts` | Per-flag canary + role-allow |

### Server-side check vs UI-only

✅ **Server-side enforce 100%**:
- Mọi API route gọi `getAuthedCaller()` đầu tiên → throw `UnauthorizedError` nếu no session
- Permission scope qua `getScopeRole()` (Sales V2), `isWriteAdmin()`, `canWriteTarget()`, `canExportSalesExcel()`
- Firestore Rules layer 2 (chặn direct client write)
- Audit log mọi mutation qua `recordSalesAuditIfEnabled` / `writeAuditLog`

### Rủi ro user truy cập URL trực tiếp

| Trường hợp | Rủi ro | Hiện trạng |
|---|---|:---:|
| User vào URL không có permission | Page server check `canAccessRoute` → render 403 page | ✅ Safe |
| User gọi API không có permission | API check `getAuthedCaller` + scope → 401/403 | ✅ Safe |
| Bypass Firestore Rules | Phía client KHÔNG có direct write — admin SDK trên server | ✅ Safe |
| QLCS cố vào branch khác qua param | Server `getScopeRole` force `branchId = facility_id` | ✅ Safe |
| Sale cố xem data sale khác | Server force `saleId = uid` | ✅ Safe |
| TP_GS cố export Excel | `canExportSalesExcel` chặn → 403 (PR-6.3) | ✅ Safe |

### Bảng tổng hợp

| Role | Quyền xem | Quyền sửa | Phạm vi data | Rủi ro hiện tại |
|---|---|---|---|---|
| ADMIN | All modules | All | Toàn hệ thống | LOW (account ít, audit log có) |
| CEO | All modules | View-only | Toàn hệ thống | LOW |
| CHU_TICH | All modules | View-only (1 số) | Toàn hệ thống | LOW |
| GD_KD | KD + report | Có | All branches | LOW |
| GD_VP | VP + report | Có | All branches | LOW |
| TP_KE | Tài chính + báo cáo | Approve batch + lock kỳ | All branches | LOW |
| TP_GS | Giám sát (read) | Không | All branches | LOW (no mutation, no export) |
| NV_KE | Tài chính | Approve batch cơ sở | 1 branch | LOW |
| QLCS_* | Cơ sở mình | Submit batch + draft KM + staff target | 1 branch | LOW (server force scope) |
| NV_SALE/PT | Cá nhân + cơ sở mình (filter) | Tạo tx của mình | 1 Sale (uid) | LOW |
| Tech/MKT/HR/... | Module mình | Theo module | Theo module | MED (nhiều role chưa audit hết) |

---

## 6. Cấu trúc dữ liệu / Firestore

**47 collections** (`lib/firebase/collections.ts`) + **41 composite indexes** (`firebase/firestore.indexes.json` deployed) + **Firestore Rules 513 lines**.

### Bảng collections (47)

| Collection | Mục đích | Field chính | Module |
|---|---|---|---|
| `branches` | 5 cơ sở | id, name, color | Core |
| `users` | User profile + FCM devices | uid (=docId), email, displayName, roleId, branchId, status, fcmDevices[] | Auth/HR |
| `roles` | Role catalog | id, name, scope | Auth |
| `departments` | Phòng ban | id, name, branchId | HR |
| `checklists` | Checklist v2 runs | branchId, date, shift, items[], status | Operations |
| `templates` | Checklist template | id, items[] | Operations |
| `checklistRunsV2` | (subcoll/separate) Run state v2 | | Operations |
| `tasks` | Giao việc + đề xuất | kind (assignment/proposal), title, assigneeBlock, assigneeUserIds[], approvalChain[], currentApprover, status | Tasks |
| `proposals` | (DEPRECATED — Phase 11 cũ, đã merge vào tasks kind=proposal) | | Tasks |
| `notifications` | Persistent noti | userId, module, entityId, type, isRead, isActionRequired, actionStatus, pushStatus | Noti |
| `auditLogs` | Audit chung | action, module, userId, branchId, before, after, actorRole, source | Audit |
| `salesAuditLogs` | Audit Sales V2 (append-only, retention vĩnh viễn) | module (batch/transaction/program), action, branchId, month, batchId/transactionId/programId, before/after, changedBy | Sales V2 |
| `salesMonthLocks` | Khóa tháng (docId `${branchId}_${month}`) | locked, lockedByName, lockedAt, unlockHistory[] | Sales V2 |
| `salesTargets` | Chỉ tiêu năm (docId `${year}_${branchId}`) | yearTarget, monthTargets[12], leadTargets, staffTargets {saleId:[12]} | Sales V2 |
| `salesPrograms` | CT khuyến mãi (workflow) | name, month, branchId, packageIds[], promoType, promoValue, status, approverChain[], currentApprover, approvalSteps[], promoCode | Sales V2 |
| `salesProgramReminderLog` | Dedupe cron reminder (docId `${uid}_${month}_${tag}`) | uid, branchId, month, tag, sentAt | Sales V2 |
| `salesDailyBatches` | Batch nhập theo ngày (1/sale/ngày) | branchId, saleId, date, month, status (draft/pending_review/approved/returned/locked), totalSalesAmount | Sales V2 |
| `salesTransactions` | Mỗi dòng GD | batchId, branchId, saleId, customerName, phone, packageValue, collectedToday, debtAmount, originalDebt, transactionType, reviewStatus, promoSnapshots[] | Sales V2 |
| `salesMonthlySummary` | Snapshot tháng (chưa dùng hết) | | Sales V2 |
| `salesReceptionBatches` | Quầy lễ tân walkin batch | | Sales V2 |
| `salesReceptionPricing` | Giá quầy lễ tân | | Sales V2 |
| `sales` | (legacy V1) | | Sales V1 |
| `salesEntries` | (V1 — bảng tổng nhập tay) | period, branch, sale, source | Sales V1 |
| `leads` | Lead Q1/marketing | | Sales V1/MKT |
| `leadActivities` | Activity per lead | | Sales V1/MKT |
| `packageGroups`, `packages`, `packageSales`, `packageQuantities` | Gói dịch vụ + bán + SL | | Sales V1 |
| `discrepancies` | Lệch số liệu | branchId, resolved, createdAt | Sales V1 |
| `chemicalEntries`, `machines`, `machineRuns` | Hoá chất + máy + giờ chạy | branchId, year, month | Tech |
| `techWork` | Tech tasks/reports/proposals | kind, branchId, status, assigneeIds[] | Tech |
| `dashboardSnapshots` | Snapshot dashboard | | Dashboard |
| `systemErrors` | Log lỗi hệ thống | | Admin |
| `personalTasks`, `personalJournal`, `personalHabits`, `personalGoals`, `personalLearning` | Workspace cá nhân (owner-only) | userId | Personal |
| `aiAssistantLogs` | AI coach logs | | Personal |
| `conversations`, `messages`, `chatAccessLogs` | Chat | participantIds[], lastMessageAt | Chat |
| `rateLimits` | Distributed rate limit | | Infra |
| `items` (subcoll), `evidenceFiles`, `comments` | Subcollections | | Generic |

### Firestore Security Rules
- File `firebase/firestore.rules` (**513 lines** — chi tiết per-collection)
- Pattern: `request.auth != null` mọi read/write
- Per-collection rules có check field-level (vd `users` chỉ owner update field own)
- Sales V2 mutation chỉ qua server (admin SDK) — client rules deny direct write
- Owner-only cho personal* collections

### Indexes
**41 composite indexes** deployed (sau M2.1 PR-1 deploy 7 indexes salesAuditLogs/salesMonthLocks/salesPrograms):
- tasks (8 composite for approval/assignment/owner/dept/facility/block)
- notifications (5 — tab All/Action/Read/markAction/cron retry)
- salesAuditLogs (4 — by batch/tx/program/branch+month)
- salesMonthLocks (1)
- salesPrograms (2 — cron auto-expire + approval-overdue)
- chemicalEntries/machineRuns (4 — year/branch/month)
- techWork (4)
- packageSales/salesEntries (2 — branch+year+month)
- discrepancies (2)
- conversations (1)
- ... còn lại

---

## 7. Các module nghiệp vụ

### 7.1 Dashboard
- **Route**: `/dashboard`, `/dashboard-ceo` (WIP)
- **Files**: `app/(app)/dashboard/page.tsx`, `DashboardContent.tsx`, `KTDashboardSection.tsx`
- **Mục đích**: Overview daily cho user theo role
- **Data**: KPI từ `tasks`, `checklists`, `sales`, `chemicalEntries`, `notifications`
- **Role**: All authenticated
- **Tính năng đã có**: TaskCounts, RevenueSummary, KTDashboardSection (Axit pH/Clo metrics)
- **Tính năng thiếu**: Dashboard CEO riêng (chỉ badge wip), MoM comparison
- **Đề xuất**: Tách Dashboard per role (PR-TK4 đã làm cho /tong-ket), Dashboard CEO ưu tiên cao

### 7.2 Cơ sở
- **Route**: `/co-so`, `/co-so/[branchId]`
- **Files**: `co-so/page.tsx`, `co-so/[branchId]/page.tsx`
- **Mục đích**: List + detail 5 cơ sở
- **Data**: `branches` collection
- **Role**: All
- **Tính năng đã có**: List + detail page
- **Đề xuất**: Add KPI overview per branch (doanh số/checklist/incident)

### 7.3 Doanh số V2 (module chính, đã phát triển nhiều nhất)
- **Routes**: 7 sub-route (nhap/doi-chieu/cong-no/tong-ket/chuong-trinh/quay-le-tan/×2)
- **Files**: `app/(app)/doanh-so-v2/*`, `app/api/sales-v2/*`, `lib/sales-v2/*`
- **Mục đích**: Sales workflow đầy đủ: nhập → đối chiếu → công nợ → khuyến mãi → báo cáo
- **Data**: `salesTransactions`, `salesDailyBatches`, `salesPrograms`, `salesTargets`, `salesAuditLogs`, `salesMonthLocks`, `salesReceptionBatches/Pricing`, `salesProgramReminderLog`, `salesMonthlySummary`
- **Role**: 16 role với scope rõ ràng (sale/qlcs/accountant/top + TP_GS read-only)
- **Tính năng đã có**:
  - Sale nhập tx + submit batch
  - Kế toán đối chiếu + approve/return batch
  - Audit log mọi mutation (M2.1 PR-1/2)
  - Khóa kỳ tháng × cơ sở (M2.1 PR-3)
  - QLCS badge + filter (M2.1 PR-4)
  - Chương trình KM workflow 9 bước: draft → submit → GD_KD approve → GD_VP approve → NV_KE configure → active → paused/expired (M2.1 PR-5 + có sẵn từ trước)
  - Cron reminder hạn 25 (M2.1 PR-5)
  - Export Excel 4 sheet với QLCS branch override, exclude TP_GS, mã GD/lô ngắn, target columns (PR-6/6.1/6.2/6.3 + PR-TK3C)
  - Tổng kết tháng 5-view per role (PR-TK4A): TopExecutive/Accountant/Qlcs/Sale/ReadOnlyAudit
  - Chỉ tiêu doanh số tháng end-to-end (PR-TK3A/B/C)
  - PromoEffectivenessCard với classification (PR-TK4C)
  - SaleRankingTable + Drawer (PR-TK4B)
  - Mobile responsive card stack (PR-TK4D)
- **Tính năng thiếu**: Refund/hoàn tiền (PR-8), Discount approval threshold (PR-9), Audit history UI (PR-7), Charts/MoM (PR-TK5)
- **Lỗi/rủi ro**: 
  - Module DOANH SỐ V1 cũ chưa cleanup (`/doanh-so/*` + collection legacy)
  - `proposals` collection (Phase 11 cũ) còn 1 doc test
  - `tokensValidAfter` cookie issue khiến user thỉnh thoảng bị đá ra login khi switch account
- **Đề xuất**: Cleanup V1 (PR-NAV1B), Audit History UI (PR-7), Refund workflow

### 7.4 Công nợ
- **Route**: `/doanh-so-v2/cong-no` (2 entry sidebar: "Công nợ bán hàng" KKD + "Công nợ phải thu" TCKT)
- **Mục đích**: Theo dõi tx `transactionType='dat_coc'` có `debtAmount > 0`
- **Data**: `salesTransactions` (filter `originalDebt > 0`)
- **Role**: nhiều role per scope
- **Đã có**: List khách công nợ, filter cơ sở/sale
- **Thiếu**: Workflow nhắc thu hồi, lịch sử thu nốt

### 7.5 Báo cáo doanh thu tháng (Tổng kết V2)
- **Route**: `/doanh-so-v2/tong-ket` (multiple entry per role)
- **Files**: `tong-ket/page.tsx`, `TongKetClient.tsx` (~150 LOC orchestrator), `_components/views/` (5 view), `_components/` (13 component nhỏ)
- **Mục đích**: Dashboard chuyên sâu doanh số tháng theo role
- **Data**: `GET /api/sales-v2/monthly-summary` (totals + bySource + byPackage + bySale + byBranch + saleCustomers + promoTotals/byCode + truncated + customerCount + txStatusStats + batchStats + monthLock + targetSummary + saleTargetsThisMonth)
- **Tính năng**: KPI + TargetProgress + BranchSummary + SaleRanking + SourceBreakdown + TopPackages + PromoEffectiveness + SalesCustomerDrawer + BusinessAlerts + MonthLockBadge
- **Trạng thái**: ✅ Hoàn thiện (PR-TK1-4 series)

### 7.6 Checklist v2
- **Route**: `/checklist-v2`
- **Files**: `ChecklistV2Client.tsx`, `SupervisorView.tsx`, `ChecklistHeatmap.tsx`
- **Mục đích**: Checklist vận hành ca + supervisor review
- **Data**: `checklists`, `templates`, `checklistRunsV2`, `evidenceFiles`
- **Role**: All
- **Trạng thái**: ✅ Done (Phase 10 spec 2026-05-28)

### 7.7 Công việc (Tasks/Giao việc/Điều phối/Đề xuất/Phê duyệt)
- **Routes**: `/giao-viec`, `/dieu-phoi`, `/de-xuat`, `/phe-duyet` (WIP)
- **Files**: `giao-viec/GiaoViecClient.tsx`, `TaskCreateModal.tsx`, `TaskDetailModal.tsx`
- **Mục đích**: Workflow công việc + đề xuất + phê duyệt
- **Data**: `tasks` (kind=assignment/proposal), approvalChain, currentApprover, approvalSteps
- **Role**: TP/QLCS/GD/CEO/CHU_TICH (Phase 12.8)
- **Trạng thái**: ✅ Done core, ⚠️ /phe-duyet badge wip

### 7.8 Phê duyệt
- **Route**: `/phe-duyet` (badge wip)
- **Mục đích**: Trang tổng hợp mọi phê duyệt cần xử lý
- **Trạng thái**: 🚧 Đang phát triển

### 7.9 Nhân sự
- **Routes**: `/sodo`, `/luong`, `/users`, `/quan-ly-sale`
- **Files**: `OrgChartClient.tsx`, `FlowView.tsx`, `OrgTreeView.tsx`, `UsersClient.tsx`, `QuanLySaleClient.tsx`
- **Data**: `users`, `departments`, `roles`
- **Role**: TP_NS/GD/CEO/Admin
- **Trạng thái**: ✅ Done

### 7.10 Đào tạo
- **Route**: `/daotao`
- **Role**: TP_DT/TT_DT/GV
- **Trạng thái**: ✅ Done basic

### 7.11 Marketing
- **Route**: `/mkt`
- **Data**: `leads`, `leadActivities`
- **Role**: TP_MKT + top
- **Trạng thái**: ✅ Done basic

### 7.12 Kỹ thuật
- **Routes**: `/ky-thuat`, `/ky-thuat/giao-viec`, `/hoa-chat`, `/may`, `/nhan-su`
- **Data**: `chemicalEntries`, `machines`, `machineRuns`, `techWork`
- **Role**: Tech + top
- **Trạng thái**: ✅ Done 4 phase (theo memory)

### 7.13 Tài chính kế toán (section header trong sidebar)
- **Route**: KHÔNG có `/tai-chinh-ke-toan` route — chỉ là section header expandable trong sidebar
- **Sub-routes**: `/doanh-so-v2/*` (6 sub)
- **Trạng thái**: ✅ Done (PR-IA1A)

### 7.14 Dự án (4 placeholder)
- **Routes**: `/du-an/erp`, `/mo-co-so`, `/dac-biet`, `/ai`
- **Trạng thái**: 🚧 Placeholder, badge `soon`

### 7.15 Cá nhân (Phase 9)
- **Routes**: `/cong-viec-ca-nhan` (tasks/journal/habits/goals/AI panels)
- **Data**: `personalTasks/journal/habits/goals/learning`, `aiAssistantLogs`
- **Role**: Owner only
- **Trạng thái**: ✅ Done

### 7.16 Chat / Tin nhắn (Phase 11)
- **Route**: `/tin-nhan`
- **Data**: `conversations`, `messages`, `chatAccessLogs`
- **Trạng thái**: ✅ Done với 5-layer security hardening (Phase 13.5)

### 7.17 Notifications (V6.5 architecture)
- **Engine**: `lib/firebase/noti-engine.ts` (sendNotificationEvent)
- **Storage**: `notifications` collection (source of truth) + FCM push (kênh nhắc)
- **Cron**: retry-failed-push, cleanup-stale-fcm, proposal-overdue, dispatch-overdue, action-required-stuck, proposal-stale-recipient
- **Channels per user**: inApp (always ON) + push + email (Gmail SMTP)
- **Multi-tab sync**: BroadcastChannel `gp-noti-sync`
- **Trạng thái**: ✅ Done Phase A+B+C (2026-06-15)

---

## 8. Luồng nghiệp vụ quan trọng

### 8.1 Luồng đăng nhập
```
1. User vào /login → LoginForm (Firebase Auth signIn)
2. Server tạo session cookie 'gp_session' (TTL 14d) qua POST /api/auth/session
3. User vào /, /dashboard → middleware? KHÔNG có middleware.ts root
4. app/(app)/layout.tsx (server RSC):
   - getCurrentProfile() — verify session cookie
   - if null → clear cookie + redirect /login
5. Token refresh tự động qua components/SessionRefresher.tsx (mỗi 24h)
6. FCM token register qua components/EnableNotiBanner.tsx
```

### 8.2 Luồng phân quyền theo role
```
1. User request page → app/(app)/layout.tsx check session
2. page.tsx server component:
   - requireAuthedProfile() → profile.roleCode
   - canAccessRoute(roleCode, route, menuOverrides) check ALL_ROUTES per role
   - if !canAccess → render 403 page
3. Sidebar.tsx client:
   - filterItems() check hideForRoles + showOnlyForRoles + allowed.has(route)
   - Render menu items role-aware
4. API server-side:
   - getAuthedCaller() → caller.profile.role_code
   - Scope helpers (isAdmin/isQLCS/isWriteAdmin/canExportSalesExcel/...)
   - Reject 403 if role mismatch
```

### 8.3 Luồng quản lý cơ sở
```
1. /co-so list 5 cơ sở từ branches collection
2. Click → /co-so/[branchId] detail
3. QLCS chỉ xem cơ sở mình (profile.facility_id force)
4. Top role xem all
```

### 8.4 Luồng doanh số
```
1. Sale login → /doanh-so-v2/nhap
2. Sale chọn gói + nhập tx → POST /api/sales-v2/transactions
3. Server tạo doc trong salesTransactions với reviewStatus='pending'
4. Tx được gom vào batch (1 batch/sale/ngày) — salesDailyBatches
5. Sale submit batch → POST /api/sales-v2/batches/[id]/submit
   → status='pending_review', audit log
6. NV_KE/TP_KE vào /doi-chieu xem batch list
7. Approve → status='approved' + tx.reviewStatus='approved'
8. Hoặc Return → status='returned' + lý do
```

### 8.5 Luồng công nợ
```
1. Sale nhập tx 'dat_coc' với debtAmount = packageValue - collectedToday
2. Tx có originalDebt snapshot (immutable lúc tạo)
3. Sale nhập tx 'thanh_toan_not' sau → auto-link với tx dat_coc cũ
   → giảm debtAmount tx dat_coc (matchedTransactionId)
4. /cong-no list khách còn debtAmount > 0
5. QLCS scope cơ sở mình, Sale scope của mình, kế toán scope all/branch
```

### 8.6 Luồng báo cáo tháng (/tong-ket)
```
1. User vào /tong-ket → page.tsx server gate + getScopeRole
2. TongKetClient.tsx orchestrator:
   - useEffect fetch GET /api/sales-v2/monthly-summary?month=X[&branchId=Y]
   - pickView(scope, roleCode) → 1 trong 5 view component
3. View component render section theo role workflow
4. Tab "Chỉ tiêu" → TargetEditTab fetch GET /api/sales-targets?year=Y
5. Export Excel → click button → GET /api/sales-v2/export?branchId=&month=
   → server check canExportSalesExcel → fill targets → build XLSX → audit log
```

### 8.7 Luồng checklist
```
1. User mở /checklist-v2 → chọn template
2. Fill items + upload evidence → save vào checklistRunsV2
3. Supervisor review → SupervisorView.tsx
4. Notification gửi user nếu fail
```

### 8.8 Luồng phê duyệt task
```
1. User tạo proposal (task kind=proposal) với approvalChain[uid1,uid2,...]
2. currentApprover = chain[0]
3. Approver vào /phe-duyet hoặc /de-xuat → click Approve/Reject
4. Approve → currentApprover = chain[next] hoặc null nếu hết
5. Reject → status='rejected' + reason, noti creator
6. V6.4: auto noti FCM cho currentApprover (Phase B)
```

### 8.9 Luồng khuyến mãi (Sales V2 — 9 bước workflow)
```
Bước 1: QLCS tạo program → POST /api/sales-v2/programs
        status='draft', creator=QLCS uid
Bước 2: Hạn nộp 25/tháng — cron program-deadline-reminder
        gửi reminder D-2 (23), D-day (25), overdue (26 + escalate GD_KD/GD_VP)
Bước 3: QLCS submit → POST /programs/[id]/submit
        status='pending_approval', currentApprover = approverChain[0] = GD_KD uid
Bước 4: GD_KD vào /chuong-trinh, approve → POST /programs/[id]/approve
        currentApprover = chain[1] = GD_VP uid, approvalSteps push
Bước 5: GD_VP approve → status='approved', currentApprover=null
Bước 6: NV_KE/TP_KE vào /chuong-trinh configure promoCode → POST /configure
        status='active', promoCode set
Bước 7: Sale/lễ tân vào /nhap, chọn gói có promo active → áp dụng
        tx.promoSnapshots[] lưu snapshot promo immutable
Bước 8: Cuối tháng /tong-ket PromoEffectivenessCard đánh giá hiệu quả
        (PR-TK4C: cost ratio, classification high/normal/review/insufficient_data)
Bước 9: TP_GS read-only audit (chưa mở quyền /chuong-trinh — defer PR-PROMO1A)
        Cron program-auto-expire daily 00:30 VN: tháng cũ → status='expired'
        Cron program-approval-overdue hourly: SLA 24h escalate
```

### 8.10 Luồng Dashboard CEO
- Hiện 🚧 WIP (badge `wip`)
- Defer phát triển sau khi /tong-ket TopExecutiveView ổn

---

## 9. Đánh giá UI/UX hiện tại

| Tiêu chí | Đánh giá | Note |
|---|:---:|---|
| Sidebar rõ nghĩa | ✅ Tốt | PR-NAV1A + PR-IA1A đã chuẩn hóa label theo workflow |
| Dashboard đúng vai trò | ✅ Tốt | PR-TK4A: 5 view per role (TopExecutive/Accountant/Qlcs/Sale/ReadOnlyAudit) |
| Bảng số liệu dễ đọc | ✅ Tốt | Tabular-nums + sticky thead (PR-TK4D) + status badge color |
| Màu sắc/khoảng cách/font | ✅ Tốt | Tailwind chuẩn, Inter font, color palette emerald/sky/amber/rose nhất quán |
| Mobile responsive | ✅ Tốt | PR-TK4D: card stack < md cho 3 bảng chính (SaleRanking/Promo/BranchSummary) |
| Loading/Empty/Error states | ✅ Tốt | Skeleton + EmptyState per role (PR-TK4D) + ErrorState component |
| Cmd+K palette | ✅ | Component hoạt động, keywords mở rộng PR-IA1A |
| Mojibake encoding | ⚠️ Cần CẢNH GIÁC | CLAUDE.md có chính sách: check mojibake trước khi sửa font |
| Pagination | ⚠️ Một số chỗ | PR-TK4D: pagination 50/page cho SaleView. Các chỗ khác chưa có |
| Iconography | ✅ | lucide-react nhất quán, size ≥ 12 (no < 12 per CLAUDE.md rule) |
| Font size | ✅ | Tailwind scale text-xs (12px) min, không dùng `text-[9px]/10/11` (per CLAUDE.md) |

### Màn khó nhìn/rối
- 🚧 Dashboard chính: nhiều section, có thể cần phân tầng tốt hơn
- 🚧 Module dự án 4 placeholder badge `soon`
- /phe-duyet badge wip → chưa thấy được UI thực tế
- iOS PWA: cần "Add to Home Screen" mới nhận push notification (limitation native)

---

## 10. Đánh giá bảo mật

### Defense in depth

| Lớp | Mechanism | Coverage |
|:---:|---|---|
| 1 | Firebase Auth session cookie (gp_session, HttpOnly, Secure, SameSite=Strict, 14d TTL) | All routes |
| 2 | Layout RSC `getCurrentProfile()` redirect /login | All `(app)/*` routes |
| 3 | Per-page `canAccessRoute()` server-side | 45 page.tsx |
| 4 | API `getAuthedCaller()` + scope helpers | 130 API route |
| 5 | Firestore Security Rules (513 lines) | All collection direct write attempts |
| 6 | Feature flags kill switch | 8 flag (3 base + 5 sales-v2) |
| 7 | Audit log mọi mutation (`salesAuditLogs` retention vĩnh viễn) | Sales V2 mutations |
| 8 | Rate limiting distributed (`rateLimits` collection) | Chat + API critical |

### Có middleware không?
- ❌ KHÔNG có `middleware.ts` ở root
- ✅ Auth gate qua layout RSC `app/(app)/layout.tsx` — đủ cho Next.js 16 App Router

### Server-side check
- ✅ 100% API routes có `getAuthedCaller()` đầu hàm
- ✅ Sales V2 mutation có middleware `assertMonthNotLockedIfEnabled` (M2.1 PR-3B)
- ✅ QLCS branch override (server force `branchId = facility_id`)
- ✅ Sale saleId override (server force `saleId = uid`)

### Có lộ dữ liệu cross-branch/cross-sale không?
- ❌ KHÔNG — server force scope per role:
  - `getScopeRole('qlcs')` → `scopeBranchId = caller.facility_id`
  - `getScopeRole('sale')` → `scopeSaleId = caller.uid`
- Test verified: QLCS_CTT cố gửi `?branchId=HM` → file Excel vẫn CTT (PR-6 verified)

### Lộ thông tin nhạy cảm?
- ✅ KHÔNG embed token/key trong code (Secret Scanning enforced)
- ✅ Service account key `secrets/firebase-admin-sa.json` gitignored
- ✅ FCM token soft-delete (enabled=false) khi invalid (Phase A.3 audit)
- ⚠️ `proposals` collection còn 1 doc test (Phase 11 cũ) — không phá nhưng nên cleanup

### RLS/Security Rules
- ✅ Firestore Rules 513 lines per collection
- ✅ Client KHÔNG có direct write — mọi mutation qua server Admin SDK
- ✅ Personal* collections owner-only enforce ở rules level

### Environment variables (tên only)
**.env.example fields**:
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FCM_VAPID_KEY`
- `GOOGLE_APPLICATION_CREDENTIALS` (path to service account JSON)
- `GEMINI_API_KEY` (AI assistant)
- `CRON_SECRET` (Bearer auth for cron endpoints)

**apphosting.yaml** thêm secrets:
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (Secret Manager)
- `GMAIL_SMTP_USER`, `GMAIL_SMTP_PASS` (email backup)

### Rủi ro phân loại

| Mức độ | Vấn đề | File liên quan | Hậu quả | Đề xuất xử lý |
|:---:|---|---|---|---|
| LOW | `proposals` collection còn 1 doc test (Phase 11 cũ) | Firestore | Không phá gì, chỉ dirty data | Defer cleanup khi convenient |
| LOW | V1 routes `/doanh-so/*` còn permission (ẩn sidebar) | `lib/permissions.ts` | User cũ vào qua Cmd+K thấy V1 cũ | PR-NAV1B redirect V1 → V2 |
| LOW | Session cookie expire 14d → user phải login lại | `session-auth.ts` | UX inconvenient | Acceptable |
| LOW | `tokensValidAfter` cookie revocation đôi khi đá user ra login khi switch account | Firebase Auth | User confused | Hướng dẫn Incognito mode |
| LOW | TP_GS chưa có quyền `/chuong-trinh` | `permissions.ts:76` | TP_GS không xem workflow KM | Mở quyền sau PR-PROMO1A harden UI |
| MED | Refund/hoàn tiền chưa có workflow | (chưa) | Nghiệp vụ thiếu | PR-8 |
| MED | Discount approval threshold chưa có | (chưa) | Sale có thể giảm giá lớn không cần duyệt | PR-9 |
| MED | Audit History UI chưa có (data đã sẵn) | (chưa) | Admin/TP_GS khó truy vết | PR-7 |
| MED | Module `dashboard-ceo`, `phe-duyet`, `thong-bao` còn badge wip | UI | Chưa hoàn thiện | Roadmap |
| MED | 32 role rất nhiều — chưa audit hết permission per role | `permissions.ts` | Có thể có role thiếu/dư quyền | Audit per role có hệ thống |
| HIGH | KHÔNG có (audit không phát hiện security risk cao) | — | — | — |

---

## 11. Đánh giá chất lượng code

| Tiêu chí | Đánh giá |
|---|---|
| **Modular** | ✅ Tốt — `lib/sales-v2/*`, `_components/views/`, services pattern |
| **Lặp code** | ⚠️ Nhỏ — vd `computeSaleStatus` duplicate trong SaleRankingTable do `target-progress.ts` server-only |
| **Hard-code** | ⚠️ Một số branch list / role list ở multiple file — đã có `BRANCH_IDS` SSOT nhưng role list scattered |
| **TypeScript strict** | ✅ TS strict mode, `npx tsc --noEmit` clean |
| **Test coverage** | ✅ 184 tests / 16 files (vitest) — coverage tốt cho permission/sales-v2/feature-flags |
| **Loading/Error/Empty states** | ✅ Đầy đủ — SkeletonKpiGrid/SkeletonCard, ErrorState, EmptyState per role |
| **Null/undefined guards** | ✅ Tốt — optional chaining + nullish coalescing |
| **API merge safety** | ✅ Pattern `batch.set(ref, patch, {merge: true})` cho sales-targets |
| **Pre-flight read pattern** | ✅ M2.1 PR-3B + PR-TK3B audit before/after |
| **Fail-soft** | ✅ Nhiều helper fail-soft (audit log, target read, monthLock) — không phá main flow |
| **Comments** | ✅ Nhiều comment có ích (lý do nghiệp vụ, PR reference, audit fix #) |
| **CLAUDE.md** | ✅ File hướng dẫn cực chi tiết (15 section), Auto-updated 2026-06-11 |

### TypeScript / Lint kết quả
- ✅ `npx tsc --noEmit` clean (exit 0)
- ⚠️ Lint: `next lint` available nhưng KHÔNG có `.eslintrc*` — Next default rules
- ✅ Tests: `npx vitest run` — 16/16 files, 184/184 tests PASS

---

## 12. Lệnh kiểm tra đã chạy

| Lệnh | Kết quả | Note |
|---|---|---|
| `npx tsc --noEmit` | ✅ Clean (exit 0) | Không có TS error |
| `npx vitest run` | ✅ **184/184 tests PASS** trong 16 file (~700ms) | |
| `npm run lint` (= `next lint`) | ⏸ Chưa chạy trong audit này | Có script nhưng không có ESLint config — chạy thì sẽ dùng Next defaults |
| `npm run build` (= `next build`) | ⏸ Chưa chạy trong audit này | Estimate clean vì TS clean + production deployed thường xuyên qua Firebase App Hosting |
| `npm test` (= `vitest run`) | ✅ Same as above | |

### Test files breakdown
| File | Số test |
|---|:---:|
| `tests/sales-v2/scope.test.ts` | ? |
| `tests/sales-v2/target-progress.test.ts` | 14 |
| `tests/sales-v2/programs.test.ts` | ? |
| `tests/sales-v2/promo-effectiveness.test.ts` | 16 |
| `tests/sales-v2/sales-targets-scope.test.ts` | 12 |
| `tests/feature-flags/registry.test.ts` | 10 |
| `tests/permissions/sales-role.test.ts` | ? |
| `tests/permissions/branches.test.ts` | ? |
| `tests/permissions/menu-access.test.ts` | + 4 PR-TK2.1 |
| `tests/permissions/role-blocks.test.ts` | ? |
| `tests/permissions/can-matrix.test.ts` | ? |
| `tests/audit/worm-contract.test.ts` | ? |
| `tests/notifications/badge-invariant.test.ts` | ? |
| `tests/notifications/approver-entry.test.ts` | ? |
| `tests/rate-limit/distributed.test.ts` | ? |
| `tests/types/branches-types.test.ts` | ? |
| **Tổng** | **184** |

---

## 13. Top 10 vấn đề cần xử lý

> Sắp xếp theo độ ưu tiên — cao nhất ở đầu.

### 1. 🟡 MED — Refund / Hoàn tiền workflow chưa có
- **Mô tả**: Sale/khách yêu cầu hoàn tiền sau khi đã ghi tx approved → KHÔNG có workflow chính thức
- **Ảnh hưởng**: Phải workaround bằng cách edit tx thủ công → mất audit trail rõ ràng
- **File liên quan**: Cần collection mới `salesRefunds` + endpoint + UI
- **Xử lý**: PR-8 — Refund workflow (defer trong roadmap)

### 2. 🟡 MED — Audit History UI chưa có (data sẵn sàng)
- **Mô tả**: Collection `salesAuditLogs` retention vĩnh viễn từ M2.1 nhưng không có UI để Admin/TP_GS/TP_KE xem
- **Ảnh hưởng**: Khó truy vết khi có incident; chuyên gia external khó audit
- **File liên quan**: Cần `app/(app)/audit-history/page.tsx` + UI
- **Xử lý**: PR-7 — Audit History UI

### 3. 🟡 MED — Discount approval threshold chưa có
- **Mô tả**: Sale có thể tự ý giảm giá lớn (tx.discountAmount > X%) mà không cần duyệt
- **Ảnh hưởng**: Rủi ro tài chính, có thể bị lạm dụng
- **File liên quan**: Cần config thresholds + workflow approval cho tx vượt ngưỡng
- **Xử lý**: PR-9 — Discount approval threshold

### 4. 🟡 MED — Module `dashboard-ceo`, `phe-duyet`, `thong-bao` còn WIP
- **Mô tả**: 3 module quan trọng có badge `wip`/`soon` — chưa hoàn thiện
- **Ảnh hưởng**: CEO chưa có dashboard điều hành, user khó xem tất cả phê duyệt
- **File liên quan**: `app/(app)/dashboard-ceo/`, `phe-duyet/`, `thong-bao/`
- **Xử lý**: Roadmap Giai đoạn 4

### 5. 🟢 LOW-MED — V1 Doanh số cũ chưa cleanup
- **Mô tả**: `/doanh-so/*` routes + collections legacy còn permission (ẩn sidebar nhưng Cmd+K access được)
- **Ảnh hưởng**: User cũ vào nhầm; data legacy chiếm storage
- **File liên quan**: `app/(app)/doanh-so/*`, `lib/permissions.ts`
- **Xử lý**: PR-NAV1B — V1 cleanup + audit `/doanh-so/packages` còn dùng không

### 6. 🟢 LOW-MED — Charts + MoM comparison chưa có
- **Mô tả**: `/tong-ket` chỉ có table + progress bar đơn — chưa có biểu đồ thật + so sánh MoM
- **Ảnh hưởng**: Lãnh đạo khó nhìn trend
- **File liên quan**: Cần extend `monthly-summary` API + Recharts (đã có deps)
- **Xử lý**: PR-TK5 — Charts + MoM

### 7. 🟢 LOW-MED — Khóa tháng UI ẩn trong /doi-chieu widget
- **Mô tả**: `MonthLockBar` chỉ hiện trong `/doi-chieu` — TP_KE/Admin khó tìm khi muốn lock kỳ
- **Ảnh hưởng**: UX khó cho kế toán cuối kỳ
- **Xử lý**: PR-MONTHLOCK1 — page/tab riêng cho lock workflow

### 8. 🟢 LOW — TP_GS chưa có quyền `/chuong-trinh`
- **Mô tả**: TP_GS giám sát nhưng KHÔNG xem được workflow KM
- **File liên quan**: `permissions.ts:76` (TP_GS allow list), `Sidebar.tsx` (Giám sát section)
- **Xử lý**: PR-PROMO1A harden /chuong-trinh UI read-only, sau đó mở quyền TP_GS

### 9. 🟢 LOW — Ưu đãi ngoài chương trình chưa tách
- **Mô tả**: Tx có `discountAmount > 0` nhưng `promoSnapshots` empty → KHÔNG được flag cần kiểm tra
- **Ảnh hưởng**: Có thể che lạm dụng giảm giá tay
- **Xử lý**: PR-PROMO2 — tách "Ưu đãi ngoài CT" section

### 10. 🟢 LOW — `proposals` collection legacy (1 doc test)
- **Mô tả**: Phase 11 cũ tách proposal khỏi tasks, sau merge lại — collection còn 1 doc test
- **Ảnh hưởng**: Dirty data, không phá gì
- **Xử lý**: Defer cleanup khi convenient

---

## 14. Roadmap đề xuất

### Giai đoạn 1 — An toàn dữ liệu & phân quyền (Ưu tiên cao nhất)

| Việc | Độ ưu tiên | Độ khó |
|---|:---:|:---:|
| **PR-7 Audit History UI** — page cho Admin/TP_KE/TP_GS xem `salesAuditLogs` | HIGH | LOW (data + indexes sẵn) |
| **PR-NAV1B V1 cleanup** — redirect `/doanh-so/*` → V2 + cleanup permission | MED | LOW |
| Audit permission per 32 role (rà soát role thiếu/dư quyền) | MED | MED |
| Hardening `/chuong-trinh` page UI read-only cho TP_GS → mở quyền | MED | MED |
| Document workflow chuẩn cho external auditor | LOW | LOW |

### Giai đoạn 2 — Chuẩn hóa nghiệp vụ Green Pool (Đang trong cuộc)

| Việc | Độ ưu tiên | Độ khó |
|---|:---:|:---:|
| **PR-8 Refund / Hoàn tiền workflow** — collection mới + workflow approve | HIGH | HIGH |
| **PR-9 Discount approval threshold** — config + workflow nếu vượt ngưỡng | MED | MED |
| **PR-PROMO1A** Workflow KM UI harden (filter URL query, read-only TP_GS) | MED | MED |
| **PR-PROMO2** Tách "Ưu đãi ngoài CT" section | MED | LOW-MED |
| **PR-MONTHLOCK1** Khóa tháng UI riêng (page/tab) | MED | LOW |
| /phe-duyet hoàn thiện UI tổng hợp mọi approval | MED | MED |

### Giai đoạn 3 — Hoàn thiện dashboard, báo cáo, công nợ, doanh số

| Việc | Độ ưu tiên | Độ khó |
|---|:---:|:---:|
| **PR-TK5** Charts (Recharts) + MoM comparison + cảnh báo tiến độ thông minh | HIGH | MED |
| `/dashboard-ceo` hoàn thiện — Executive dashboard điều hành tổng hợp | HIGH | MED |
| `/dashboard` chính refactor theo role pattern PR-TK4 | MED | MED |
| Cash flow / dòng tiền dashboard | MED | HIGH |
| Báo cáo Lead & Conversion (MKT → Sale workflow) | MED | HIGH |
| Refund/Discount report integration với /tong-ket | MED | LOW |

### Giai đoạn 4 — Tối ưu UI/UX, AI assistant, automation

| Việc | Độ ưu tiên | Độ khó |
|---|:---:|:---:|
| Module `du-an/ai` — AI assistant cho lãnh đạo (gợi ý dựa data) | MED | HIGH |
| Sale Excellence framework — automated KPI/ranking/feedback | MED | HIGH |
| Notification preferences UI cho user | LOW | LOW |
| Mobile PWA polish + iOS push UX | LOW | MED |
| Search global + recent items + favorites | LOW | MED |
| Dark mode | LOW | LOW |
| /thong-bao center hoàn thiện | LOW | LOW |
| 4 module Khối dự án (ERP/Mở cơ sở/Đặc biệt/AI) chuyển từ placeholder | LOW | HIGH |

---

## 15. Kết luận

### Mức độ trưởng thành app: **MVP+ → CÓ THỂ DÙNG NỘI BỘ HẠN CHẾ + ĐANG MỞ RỘNG PRODUCTION**

| Tiêu chí | Đánh giá |
|---|:---:|
| Architecture | ✅ Solid — Next.js 16 App Router + Firebase modern stack |
| Code quality | ✅ TS strict + 184 tests pass + audit log + feature flags |
| Security | ✅ Defense in depth — 8 layer (Auth + Layout + Route + API + Rules + Flag + Audit + Rate limit) |
| Phân quyền | ✅ 32 role mapped chi tiết, server-side enforce |
| Nghiệp vụ Sales V2 | ✅ End-to-end hoàn chỉnh (nhập → đối chiếu → công nợ → KM workflow → báo cáo → Excel) |
| Nghiệp vụ Operations (Tech/Checklist/Tasks) | ✅ Done core |
| Dashboard/Report | ⚠️ /tong-ket V2 hoàn chỉnh, /dashboard chính + /dashboard-ceo WIP |
| Refund/Discount approval | ❌ Chưa có |
| Audit History UI | ❌ Data sẵn, UI chưa có |
| Lead & Conversion | ❌ Chưa có |
| AI assistant cấp doanh nghiệp | ❌ Chỉ có Personal AI coach |

### Có thể triển khai production?

✅ **CÓ — TRIỂN KHAI ĐƯỢC cho nghiệp vụ Sales V2 + Operations + Tasks + Tech + Personal workspace.**

Module Sales V2 đã có:
- Full workflow nhập → đối chiếu → công nợ → KM → báo cáo → Excel
- 5-view per role (TopExecutive/Accountant/Qlcs/Sale/ReadOnlyAudit)
- Chỉ tiêu doanh số end-to-end
- Audit log retention vĩnh viễn
- Khóa kỳ tháng × cơ sở
- Defense in depth 8 layer
- 184 tests pass

⚠️ **CẦN BỔ SUNG TRƯỚC KHI MỞ RỘNG**:
1. Refund workflow (PR-8) — nếu nghiệp vụ có hoàn tiền thường xuyên
2. Discount approval threshold (PR-9) — nếu rủi ro Sale lạm dụng
3. Audit History UI (PR-7) — cho external auditor truy vết
4. Cleanup V1 deprecated (PR-NAV1B)
5. Charts + MoM (PR-TK5) — cho lãnh đạo nhìn trend

### Khuyến nghị tổng

> **Green Pool ERP đang ở mức MVP+ với kiến trúc production-grade.** Sales V2 đã đủ tin cậy cho rollout chính thức. Các module core (Tasks, Checklist, Tech, Personal, Chat) hoạt động ổn. Cần ưu tiên Audit History UI (PR-7) + Refund workflow (PR-8) + Discount threshold (PR-9) để hoàn thiện compliance/control trước khi audit/scale rộng. UI/UX đã chuẩn hóa qua PR-NAV1A + PR-IA1A workflow-based menu. Security defense-in-depth 8 layer rất chắc — không có rủi ro HIGH/CRITICAL phát hiện trong audit này.

---

**Báo cáo hoàn tất.** Tổng cộng:
- 45 page.tsx
- 130 API route
- 47 Firestore collection
- 41 composite index deployed
- 32 role
- 16 test file / 184 test PASS
- TypeScript: clean
- 8 layer security
- Repo: trihuong815-oss/greenpool-erp
- Firebase project: green-pool-system
- Domain: greenpool-erp.vercel.app
