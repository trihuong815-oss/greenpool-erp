# Roadmap — Green Pool ERP v2

Lộ trình đưa app từ MVP lên enterprise-grade. Theo [Senior Architect Audit 2026-06-07](#).

## Tổng quan timeline

| Phase | Mục tiêu | Calendar |
|---|---|---|
| **A — Quick Wins** | Production visibility + security baseline + perf top wins | 1-2 tuần |
| **B — Foundation** | Tests + types + permission truth-source + split mega-clients | 6-10 tuần |
| **C — Scale Ready** | Observability + DR + feature flags + ADR | 4-6 tuần |
| **UI-1 to UI-4** | Design system + mobile native-feel + desktop pro | 4-6 tuần |

**Tổng ước tính**: ~4 tháng full-time hoặc ~6 tháng incremental.

---

## Phase A — Quick Wins (đang chạy)

### Day 1 — Foundation + Cleanup (TRONG TUẦN)
- [ ] Tạo ROADMAP.md track tiến độ
- [ ] Xóa `supabase/` folder (migration đã hoàn tất Phase 5)
- [ ] Archive `scripts/check-*.ts` cũ vào `scripts/_archive/`
- [ ] Rename `data.firebase.ts` → `data.ts` (sales)
- [ ] `next.config.js`: thêm `experimental.optimizePackageImports: ['lucide-react','recharts']`
- [ ] Verify bundle size giảm

### Day 2 — Performance quick wins
- [ ] `useNotiCounts` poll 60s → 180s + pause `document.hidden` (giảm 66% cost)
- [ ] `export const revalidate = 60` cho `/dashboard`
- [ ] Composite index `techWork: kind + assigneeIds (array-contains) + createdAt`
- [ ] `limit(100)` cho conversation listener trong NotiCountsProvider
- [ ] Verify Firestore reads/page giảm qua Firebase Console

### Day 3-4 — Security CRITICAL (firestore.rules + storage.rules)
- [ ] **CRITICAL**: rename `profiles/{uid}` → `users/{uid}` trong rules (rules đã dead vì collection đổi tên)
- [ ] Update field names: `role_code` → `roleId`, `facility_id` → `branchId`, `department_id` → `departmentId`
- [ ] Test rules với `@firebase/rules-unit-testing` trước khi deploy
- [ ] Deploy rules: `firebase deploy --only firestore:rules,storage`
- [ ] Verify mọi role read/write theo design

### Day 5 — Session security
- [ ] DELETE `/api/auth/session`: call `auth.revokeRefreshTokens(uid)` trước khi clear cookie
- [ ] Add "Logout all devices" button trong `/bao-mat`
- [ ] Server-side 2FA enforce: middleware reject session khi ADMIN/CEO/GD chưa enroll

### Day 6 — CSP hardening + middleware
- [ ] Tạo `middleware.ts`: CSP nonce per-request + Origin check non-GET
- [ ] `next.config.js`: drop `'unsafe-inline'` + `'unsafe-eval'` cho script-src
- [ ] Audit `dangerouslySetInnerHTML` (QR SVG → đổi sang `<img>` data URL)
- [ ] Verify CSP không break Firebase SDK / FCM

### Day 7 — CI gate
- [ ] `.github/workflows/quality.yml`: typecheck + lint + build trên PR + push main
- [ ] Block merge khi fail
- [ ] Add `firebase deploy --only firestore:rules` step

### Day 8 — Sentry
- [ ] Install `@sentry/nextjs`
- [ ] Wrap API + client
- [ ] Source maps upload
- [ ] Filter PII (email, name)
- [ ] Test alert Slack/email

### Day 9-10 — Test infrastructure
- [ ] Vitest setup
- [ ] 5 tests core:
  - Sales aggregation invariants (sum byMonth === sum sales)
  - Permission matrix (`canRead/canWrite` per role)
  - Approval chain transitions
  - Push noti pipeline (parseApproverEntry)
  - Badge sync invariant (total = chat + tasks + tw + checklist)

### Phase A Exit Criteria
- [ ] Security CRITICAL fixed (S1-S5)
- [ ] Firestore reads giảm ≥ 50%
- [ ] CI gate block PR fail typecheck/lint/build
- [ ] Sentry alert tự động email anh khi error
- [ ] 5 tests xanh trong CI
- [ ] Architecture Score: 4.7 → 6.5

---

## Phase B — Foundation (sau Phase A)

(Chi tiết update sau khi Phase A xong)

## Phase C — Scale Ready (sau Phase B)

(Chi tiết update sau)

## Phase UI-1 to UI-4 — Polish

(Chi tiết update khi bắt đầu)

---

## Progress Log

### 2026-06-07
- ✅ Audit toàn bộ codebase (4 agents parallel)
- ✅ Architecture Score Card công bố: 4.7/10
- ✅ Roadmap finalized + duyệt
- 🔄 Start Day 1: foundation + cleanup
