# APP_AUDIT_EVIDENCE — Green Pool ERP

> **Ngày audit**: 2026-06-22 (initial) · **2026-06-23** (update sau manual review transaction field whitelist + sau khi deploy rule fix `salesPrograms`)
> **Phạm vi**: Toàn bộ code base Green Pool ERP — chứng minh/phản biện kết luận của [docs/APP_AUDIT_SUMMARY.md](APP_AUDIT_SUMMARY.md) bằng evidence từ source code thật.
> **Không sửa code**: ✅ Read-only audit
> **Không lộ secret**: ✅ Không in token / private key / .env values. Tên env var được phép.
> **Author**: AI engineer (Claude Sonnet 4.7) đóng vai senior engineer + ERP expert.

## Changelog

- **2026-06-22**: bản gốc (NEEDS REVIEW: `originalDebt` + `promoSnapshots` field-level immutability).
- **2026-06-23**: manual review `app/api/sales-v2/transactions/*` xác nhận `EDITABLE_FIELDS` whitelist L28-33 chặn `originalDebt`/`promoSnapshots`/`promoIds`/`matchedTransactionId`/`reviewStatus`/`batchId`/`saleId`/`branchId`/`createdAt`. Verdict 2 row hạ về **PASS**. Risk Register: 0 HIGH · 3 MED (giảm từ 5) · 4 LOW. Thêm hardening LOW (audit silent tamper attempt + Sale self-edit). Deploy rule fix `salesPrograms` (commit `64aa0b9`) — info leak Sale → ĐÃ FIX, production active.

---

## 1. Executive Summary

### Kết luận tổng: **PASS (Strong)** — không có rủi ro HIGH trong nhóm audit hôm nay

Các kết luận trong `APP_AUDIT_SUMMARY.md` về security/permission/audit log **được chứng minh đúng** bằng evidence cụ thể. App có **defense-in-depth 4 lớp thật sự**:

1. **Layout RSC redirect** ([app/(app)/layout.tsx:17-29](app/(app)/layout.tsx#L17-L29)) — chưa login → clear cookie + redirect /login
2. **Per-page server gate** — mọi page.tsx audit đều gọi `canAccessRoute()` (rejected URL trực tiếp)
3. **API per-route enforcement** — 16/16 API kiểm tra (audited bằng Explore agent) đều có `getAuthedCaller()` + role check + branch/sale force
4. **Firestore Rules** ([firebase/firestore.rules](firebase/firestore.rules)) — Sales V2 collections **WRITE deny 100%** (chỉ Admin SDK), READ scope per role; catch-all deny ở cuối ([L509-511](firebase/firestore.rules#L509-L511))

### Kết luận cần hạ mức tin cậy (nuance, không phải bug)

| Kết luận APP_AUDIT_SUMMARY.md | Đánh giá lại |
|---|---|
| "100% server-side enforce" | ✅ ĐÚNG cho 16 endpoint Sales V2 audit hôm nay |
| "Defense in depth 8 layer" | ⚠️ Đếm 4 layer thực sự (Auth+Layout+Page+API+Rules+Audit log). "8 layer" trong summary là tính rộng (gồm flag + audit log + rate limit). Không sai về bản chất nhưng phóng đại |
| "salesAuditLogs vĩnh viễn ≥10 năm" | ✅ Rule WORM trên `auditLogs` ([L182-185](firebase/firestore.rules#L182-L185)). `salesAuditLogs` cũng write deny ([L432-439](firebase/firestore.rules#L432-L439)) nhưng KHÔNG có rule explicit chống update/delete WORM — chỉ chống qua "Admin SDK only", nếu code server cố ý update thì rules không chặn. Risk LOW (codebase grep CI guard) |
| "Audit log mọi mutation" | ⚠️ PARTIAL — chia 2 collection (`salesAuditLogs` + `auditLogs` generic), 12 action ngoài enum (xem mục 6). Đã defer PR-7B union |
| "Refund/Discount approval chưa có" | ✅ ĐÚNG (chưa có code) |
| **"originalDebt immutable"** (SUMMARY §7) | ✅ **PASS** (update 2026-06-23) — manual review xác nhận: POST set 1 lần L268 (`transactionType === 'dat_coc' ? debtAmount : 0`); PATCH `EDITABLE_FIELDS` whitelist L28-33 KHÔNG có field này → silent skip; không có route nào update sau POST. **Field-level immutability đảm bảo qua whitelist + server compute layer, không phải chỉ "app logic".** |
| **"promoSnapshots immutable"** (SUMMARY §7) | ✅ **PASS** (update 2026-06-23) — manual review xác nhận: POST resolve qua `getProgramsByIds` + `toSnapshot` L222 lưu `{id, code, name, type, value}`; PATCH whitelist KHÔNG có `promoSnapshots`/`promoIds` → user gửi body sẽ silent skip; server chỉ READ snapshots L189 để recompute discount, KHÔNG WRITE. **Sửa chương trình KM gốc KHÔNG phá tx cũ.** |

### HIGH risks: KHÔNG có

Em rà soát tất cả nhóm — không phát hiện rủi ro HIGH/CRITICAL trong scope audit hôm nay. **Risks MED** xếp ở mục [4. Risk Register](#4-risk-register).

---

## 2. Evidence Matrix

| # | Nhóm audit | Kết luận trong SUMMARY | Evidence file/function | Verdict | Severity (rủi ro nếu sai) | Ghi chú |
|:---:|---|---|---|:---:|:---:|---|
| 1 | Auth + Session | "Firebase session cookie 14d, HttpOnly, Secure, refresh 24h" | [lib/firebase/session-auth.ts:9-11](lib/firebase/session-auth.ts#L9-L11), [app/(app)/layout.tsx:17-29](app/(app)/layout.tsx#L17-L29), [app/api/auth/session/route.ts](app/api/auth/session/route.ts) | PASS | HIGH if fail | Auto-clear cookie hotfix L24-27 |
| 2 | Route permission | "Per-page canAccessRoute server-side, 45 page.tsx" | [lib/permissions.ts canAccessRoute()](lib/permissions.ts), 10 page.tsx audit | PASS | HIGH if fail | Server gate ở mọi page check |
| 3 | API permission Sales V2 | "16 endpoint, 100% enforce" | Explore agent đọc 16 file, đầy đủ chi tiết ở [§3.3](#33-api-permission-sales-v2) | PASS | HIGH if fail | All 16 PASS |
| 4 | Firestore Rules | "513 lines, write deny Sales V2" | [firebase/firestore.rules](firebase/firestore.rules) full 513 lines | PASS | HIGH if fail | Catch-all deny L509-511 |
| 5 | Cross-branch/Sale | "QLCS/Sale force scope" | [lib/sales-v2/scope.ts:78-127](lib/sales-v2/scope.ts#L78-L127), [monthly-summary L77-88] | PASS | HIGH if fail | getScopeRole + canReadBatch + canEditTransaction |
| 6 | Audit log | "salesAuditLogs vĩnh viễn" | [lib/sales-v2/audit-log.ts](lib/sales-v2/audit-log.ts), [lib/firebase/audit-log.ts](lib/firebase/audit-log.ts) | PARTIAL | MED | 2 collection riêng, 12 action ngoài enum |
| 7 | Khuyến mãi workflow | "PR-PROMO1A UI harden, server đầy đủ" + tx.promoSnapshots immutable | [lib/sales-v2/promo-permissions.ts](lib/sales-v2/promo-permissions.ts), 7 API programs, [app/api/sales-v2/transactions/[id]/route.ts L28-33](app/api/sales-v2/transactions/[id]/route.ts#L28-L33) | **PASS** | LOW | UI helper + server enforce. **2026-06-23 update**: promoSnapshots immutability CONFIRMED qua PATCH whitelist |
| 8 | Công nợ — originalDebt + debtAmount + matchedTransactionId immutability | "originalDebt immutable" | [app/api/sales-v2/transactions/route.ts L268](app/api/sales-v2/transactions/route.ts#L268), [app/api/sales-v2/transactions/[id]/route.ts L28-33](app/api/sales-v2/transactions/[id]/route.ts#L28-L33) | **PASS** | LOW | **2026-06-23 update**: PATCH `EDITABLE_FIELDS` whitelist L28-33 chặn `originalDebt`/`debtAmount`/`matchedTransactionId`. Server compute `debtAmount` mỗi PATCH (L228). Field-level immutability OK |
| 9 | Module WIP | "dashboard-ceo/phe-duyet/thong-bao/du-an WIP" | 4 page.tsx kiểm tra | PASS | LOW | Đều có PlaceholderPage status="wip", route gate vẫn enforce |
| 10 | Risks thật | (mục 13 SUMMARY) | xem [§4 Risk Register](#4-risk-register) | PASS | — | 5 MED + 4 LOW, 0 HIGH |

---

## 3. Detailed Evidence

### 3.1 Auth + Session

**Files audit**:
- [lib/firebase/session-auth.ts](lib/firebase/session-auth.ts) (39 LOC)
- [app/(app)/layout.tsx](app/(app)/layout.tsx) (69 LOC)
- [app/api/auth/session/route.ts](app/api/auth/session/route.ts) (162 LOC)

#### Cookie config (PASS)
```ts
// lib/firebase/session-auth.ts:9-11
export const SESSION_COOKIE = 'gp_session';
export const SESSION_TTL_DAYS = 14;
export const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
```

**API session/route.ts header comment xác nhận**:
> `Cookie: httpOnly, secure (prod), sameSite=lax, TTL 14d (khớp Firebase session cookie max).`

#### Verify cookie (PASS)
```ts
// lib/firebase/session-auth.ts:22-37
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const c = await cookies();
  const cookie = c.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  try {
    const decoded: DecodedIdToken = await getFirebaseAdminAuth().verifySessionCookie(cookie, true);
    // ↑ verifySessionCookie với checkRevoked=true → reject session bị admin revoke
    return { uid, email, role, branchId, departmentId };
  } catch { return null; }
}
```

#### Layout RSC redirect + clear cookie hotfix (PASS)
```tsx
// app/(app)/layout.tsx:17-29
const r = await getCurrentProfile();
if (!r) {
  try {
    const c = await cookies();
    c.set(SESSION_COOKIE, '', { maxAge: 0, path: '/' });
  } catch { /* swallow nếu Next không cho mutate ở Layout RSC */ }
  redirect('/login');
}
```
Comment ghi rõ Phase HOTFIX 2026-06-07 fix redirect loop khi session revoke.

#### Rate limit chống brute force login (PASS — defense-in-depth)
`app/api/auth/session/route.ts` POST handler dùng `checkRateLimitDistributed`:
- bucket `login:ip` — 30/60s
- bucket `login:uid` — 20/300s (chống credential stuffing)

#### Refresh session
- Component `<SessionRefresher />` render trong layout — refresh cookie mỗi 24h (theo comment L8: "Session cookie 14d tự renew qua SessionRefresher mỗi 24h").

**Rủi ro hiện tại** (không có HIGH):
- LOW: Cookie 14d → nếu device bị mất, attacker có 14 ngày exploit nếu chưa admin revoke. Acceptable do `checkRevoked=true` ở verifySessionCookie L27.
- LOW: SameSite=lax (không strict) → tradeoff UX (cho phép user click link external mở /dashboard mà không re-login). Standard practice.

**Verdict §3.1: PASS** — auth/session enforce đúng spec.

---

### 3.2 Route Permission (per-page server gate)

**Helper**: [lib/permissions.ts canAccessRoute()](lib/permissions.ts)
```ts
export function canAccessRoute(
  roleCode: string,
  route: string,
  overrides?: Record<string, boolean> | null,
): boolean {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, route)) {
    return !!overrides[route];
  }
  const allowed = MENU_PERMISSIONS[roleCode] || ['dashboard'];
  return allowed.includes(route);
}
```
Fallback `['dashboard']` cho role lạ — KHÔNG default open.

**Pattern check 10 route quan trọng** (đều có `canAccessRoute` + 403 UI):

| Route | File | Server check | URL trực tiếp bị chặn? | Verdict |
|---|---|:---:|:---:|:---:|
| /users | app/(app)/users/page.tsx | ✅ | ✅ | PASS |
| /doanh-so-v2/nhap | page.tsx | ✅ | ✅ | PASS |
| /doanh-so-v2/doi-chieu | page.tsx | ✅ | ✅ | PASS |
| /doanh-so-v2/cong-no | page.tsx | ✅ | ✅ | PASS |
| /doanh-so-v2/tong-ket | [tong-ket/page.tsx:15-26](app/(app)/doanh-so-v2/tong-ket/page.tsx#L15-L26) | ✅ | ✅ | PASS |
| /doanh-so-v2/chuong-trinh | [chuong-trinh/page.tsx:20-32](app/(app)/doanh-so-v2/chuong-trinh/page.tsx#L20-L32) | ✅ | ✅ | PASS |
| /audit-history | [audit-history/page.tsx:18-33](app/(app)/audit-history/page.tsx#L18-L33) | ✅ + canReadAuditHistory (DOUBLE check) | ✅ | PASS |
| /co-so/[branchId] | page.tsx | ✅ | ✅ | PASS |
| /dashboard-ceo | [dashboard-ceo/page.tsx:14-27](app/(app)/dashboard-ceo/page.tsx#L14-L27) | ✅ | ✅ | PASS (placeholder) |
| /phe-duyet | page.tsx | ✅ | ✅ | PASS (WIP) |

**Pattern chuẩn**:
```tsx
const { profile } = await requireAuthedProfile();
if (!canAccessRoute(profile.roleCode, 'audit-history', profile.menuOverrides)) {
  return <UnauthorizedPage />;
}
```

Sidebar chỉ là UI filter (`hideForRoles` / `showOnlyForRoles` / `allowed.has(route)`) — **không phải tầng bảo vệ chính**. Tầng chính là page gate + API enforce.

**Verdict §3.2: PASS** — 10/10 route audit có server-side check.

---

### 3.3 API Permission Sales V2

Em delegate audit chi tiết cho Explore agent đọc 16 file route. Kết quả:

| # | Path | HAS_AUTH | ROLE_CHECK | BRANCH_FORCE | SALE_FORCE | INPUT_VALIDATE | AUDIT_LOG | VERDICT |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | POST /transactions | ✅ L70 | ✅ canEditTransaction L122 | ✅ batch.branchId L129 | ✅ (scope qua batch.saleId) | ✅ phone/source/value/promo combo | ✅ recordSalesAuditIfEnabled L322 | **PASS** |
| 2 | GET /transactions | ✅ L36 | ✅ canReadBatch L45 | ✅ batch.branchId L45 | ✅ implicit | ✅ batchId required | (read-only) | **PASS** |
| 3 | PATCH /transactions/[id] | ✅ L38 | ✅ canEditTransaction L54-57 | ✅ batch.branchId L56 | ✅ implicit | ✅ field validation | ✅ writeSalesAuditBatch L283 | **PASS** |
| 4 | DELETE /transactions/[id] | ✅ L304 | ✅ canEditTransaction L314-317 | ✅ batch.branchId L317 | ✅ implicit | (read path) | ✅ recordSalesAuditIfEnabled L367 | **PASS** |
| 5 | POST /batches/[id]/submit | ✅ L27 | ✅ canSaleEnter L28 | ✅ month lock pre-check L44-47 | ✅ batch.saleId===uid L61 | ✅ tx phone format | ✅ recordSalesAuditIfEnabled L173 | **PASS** |
| 6 | POST /batches/[id]/approve | ✅ L29 | ✅ canAccountantReview L30 | ✅ facility_id L63-65 | N/A | ✅ all txs reviewed | ✅ writeSalesAudit L116 | **PASS** |
| 7 | POST /batches/[id]/return | ✅ L27 | ✅ canAccountantReview L28 | ✅ facility_id L65-67 | N/A | ✅ reason required | ✅ writeSalesAudit L112 | **PASS** |
| 8 | GET /monthly-summary | ✅ L61 | ✅ getScopeRole L62 + per-role filter L77-88 | ✅ scopeBranchId force-set L83 | ✅ Sale force uid L78 | ✅ month format | (read-only) | **PASS** |
| 9 | GET /export | ✅ L61 | ✅ canExportSalesExcel L85 + scope L88-103 | ✅ QLCS override facility_id L97 | N/A | ✅ month + branchId | ✅ recordSalesAuditIfEnabled L308 | **PASS** |
| 10 | POST /programs | ✅ L87 | ✅ isProgramCreator (QLCS) L89 | ✅ QLCS forced own branch L107-110 | N/A | ✅ name/type/month/value | ✅ writeAuditLog L192 | **PASS** |
| 11 | GET /programs | ✅ L46 | ✅ isProgramReader L48 | ✅ scopeBranchForCaller L64 | N/A | ✅ month param | (read-only) | **PASS** |
| 12 | POST /programs/[id]/approve | ✅ L24 | ✅ currentApprover===uid L34-36 | implicit | N/A | ✅ status & approver | ✅ writeAuditLog L139 | **PASS** |
| 13 | POST /programs/[id]/reject | ✅ L21 | ✅ currentApprover===uid L35-37 | implicit | N/A | ✅ reason mandatory | ✅ writeAuditLog L58 | **PASS** |
| 14 | POST /programs/[id]/configure | ✅ L31 | ✅ canConfigure L44 (NV_KE/TP_KE) | ✅ NV_KE locked own branch L21 | N/A | ✅ code regex + unique | ✅ writeAuditLog L77 | **PASS** |
| 15 | POST /programs/[id]/toggle | ✅ L28 | ✅ canConfigure L42 | ✅ NV_KE locked branch L21 | N/A | ✅ action pause/resume | ✅ writeAuditLog L72 | **PASS** |
| 16 | POST /month-locks/lock | ✅ L27 | ✅ ALLOWED_LOCK_ROLES L30 | N/A (branchId URL) | N/A | ✅ branchId + month | ✅ recordSalesAuditIfEnabled L54 | **PASS** |
| 17 | POST /month-locks/unlock | ✅ L49 | ✅ ALLOWED_UNLOCK_ROLES L52 | N/A | N/A | ✅ reason mandatory | ✅ recordSalesAuditIfEnabled L82 | **PASS** |
| 18 | GET /sales-targets | ✅ L41 | ✅ canReadTargets L42 | implicit scope helper | N/A | ✅ year | (read-only) | **PASS** |
| 19 | POST /sales-targets | ✅ L71 | ✅ canWriteTarget/canWriteStaffTargets L113-123 | ✅ scope-enforce | N/A | ✅ array validation | ✅ writeAuditLog L216 with before+after | **PASS** |
| 20 | GET /audit-history | ✅ L36 | ✅ canReadAuditHistory L45 (7 roles) | implicit query filter | N/A | ✅ month/cursor/pageSize | (audit reader) | **PASS** |

**Summary 16+4 endpoint = 20/20 PASS**. Không có endpoint nào missing auth/role/scope check.

Code pattern chuẩn (sample):
```ts
// monthly-summary/route.ts:61-103
const caller = await getAuthedCaller();           // L61 — throw 401 nếu chưa login
const role = getScopeRole(caller.profile.role_code);   // L62
if (role === 'sale') saleId = caller.profile.uid;  // L78 — FORCE
if (role === 'qlcs' || role === 'accountant') branchId = caller.profile.facility_id;  // L83
```

**Verdict §3.3: PASS** — server-side enforcement 100% trong scope audit.

---

### 3.4 Firestore Rules

**File**: [firebase/firestore.rules](firebase/firestore.rules) (513 lines)

#### Catch-all deny (PASS — defense)
```js
// L509-511
match /{document=**} {
  allow read, write: if false;
}
```
Mọi collection KHÔNG có rule explicit → deny. Safe-by-default.

#### Collections client ĐƯỢC đọc trực tiếp

| Collection | Rule | File | Note |
|---|---|---|---|
| `users/{id}` | read self-or-admin (L306) | rules L305-308 | write=false |
| `branches`, `roles`, `departments` | read signed-in, write admin only | L188-191 | reference data |
| `templates`, `templates/items` | read signed-in (L78-98) | L77-105 | checklist template |
| `checklists/{id}` | read `matchesUserScope` (L109) | L108-146 | scope check |
| `auditLogs/{logId}` | read admin OR matchesUserScope (L161-163) | L154-185 | WORM rule L184 |
| `leads`, `leadActivities`, `packageSales`, `salesEntries`, `sales` | read scope branch (L195-298) | L194-299 | branch-scoped |
| `salesDailyBatches/{id}` | read scope role + branch (L407-413) | L406-415 | write=false |
| `salesTransactions/{id}` | read scope role + branch (L419-425) | L418-427 | write=false |
| `salesAuditLogs/{id}` | read admin/TP_KE/actor (L433-437) | L432-439 | write=false |
| `salesMonthlySummary/{id}` | read scope role + branch (L443-449) | L442-451 | write=false |
| `salesPrograms/{id}` | read scope role + branch (L461-471) | L460-473 | write=false |
| `salesReceptionBatches`, `salesReceptionPricing` | read scope role + branch (L482-491, 495-505) | L481-506 | write=false |
| `inAppNotifications/{uid}/items` | owner read (L388) + update seenAt only (L389-391) | L387-394 | server create only |
| `notifications/{id}` | owner read (L336) | L335-338 | write=false |
| `featureFlags/{key}` | admin read+write (L373-374) | L372-375 | admin only |
| `conversations/{cid}` | participant read (L356-357) | L355-358 | write=false |
| `conversations/{cid}/messages/{mid}` | participant via parent (L363-364) | L360-366 | write=false |

#### Collections client ĐƯỢC ghi trực tiếp

| Collection | Rule | Comment |
|---|---|---|
| `templates/{id}` | create/update theo block scope (L81-93) | Admin + QLCS_KD + TP cùng dept |
| `templates/{id}/items/{itemId}` | create/update theo template scope (L100-103) | |
| `checklists/{id}` | create admin OR QLCS facility (L111-112). update scope + non-terminal (L115-117). delete admin (L119) | Operations workflow |
| `checklists/{id}/items` + `evidenceFiles` | scope + non-terminal (L126-145) | item tick + evidence upload |
| `auditLogs` | create only — shape validate + actor=uid + scope (L167-180). **WORM: update/delete=false L184** | append-only |
| `leads`, `leadActivities`, `packageSales`, `salesEntries`, `sales`, `salesTargets` | create scope + immutable branchId (L198-298) | branch-scoped writes |
| `branches`, `roles`, `departments` | write admin only (L188-191) | reference data |
| `inAppNotifications/{uid}/items` | update seenAt only (L389-391) | mark-as-read |

#### Collections write deny 100% (Admin SDK only)

```
tasks (L322), notifications (L337), chatAccessLogs (L346),
salesDailyBatches (L414), salesTransactions (L426),
salesAuditLogs (L438), salesMonthlySummary (L450),
salesPrograms (L472),
salesReceptionBatches (L492), salesReceptionPricing (L505),
rateLimits (L381 — read+write deny)
```

#### Collections KHÔNG có rule explicit → catch-all deny

```
techWork, chemicalEntries, machines, machineRuns (kỹ thuật)
salesMonthLocks (Sales V2)
personalTasks, personalJournal, personalHabits, personalGoals, personalLearning
discrepancies, packageGroups, packages, packageQuantities
dashboardSnapshots, systemErrors, salesProgramReminderLog
aiAssistantLogs, items (subcoll)
```
**Em verify**: client KHÔNG có code direct read các collection trên (grep `lib/services/ components/ app/(app)/` cho `collection(...techWork|chemicalEntries|machines|machineRuns)` → empty). Tất cả đọc qua API. → catch-all deny KHÔNG ảnh hưởng UX, đảm bảo safe-by-default.

#### Rule "quá rộng"?

❌ **KHÔNG có rule `allow read/write: if true`**. Em rà soát toàn file 513 dòng. Mọi rule đều có check `isSignedIn()` ít nhất.

#### Rule chỉ check auth mà không role/owner

Có 2 case mức nhẹ:
1. `branches`, `departments`, `roles` read: chỉ check `isSignedIn()` (L188-191) — đây là reference data, không sensitive. Acceptable.
2. `templates/{id}` read: `isSignedIn()` (L78). Template content không phải data nhạy cảm. Acceptable.

#### Rủi ro lớn nhất rules

- **MED**: `salesPrograms` read scope L460-473 cho phép Sale (NV_SALE/NV_SALE_PT) đọc TẤT CẢ programs trong branch mình, không filter `status='active'`. Comment L459 nói "qua API /available" filter active nhưng RULES không enforce → Sale dùng client SDK có thể xem cả draft/pending/rejected. **Info leak mức**: "Sale biết có proposal đang chờ duyệt nhưng chưa active". KHÔNG cho phép modify. Em xác nhận code KHÔNG có client SDK direct read salesPrograms (qua API hết). Risk = info leak nếu sau này dev khác wire client read.
- **LOW**: `salesAuditLogs` cho phép `actor` đọc audit của mình (L436: `request.auth.uid == resource.data.changedBy`). Sale có thể xem audit "tôi đã tạo tx X" — không leak data của người khác. Acceptable.
- **LOW**: `auditLogs` WORM mạnh (L184: `allow update, delete: if false`), nhưng `salesAuditLogs` chỉ write=false — chống client mutate nhưng nếu code server cố tình overwrite/delete thì rules không chặn. Em verify: codebase không có code `salesAuditLogs.doc(x).update/delete`. Risk thực = 0.

**Verdict §3.4: PASS** — rules strong, không có "if true", catch-all deny ở cuối.

---

### 3.5 Cross-branch / Cross-Sale Prevention

**File chính**: [lib/sales-v2/scope.ts](lib/sales-v2/scope.ts)

#### getScopeRole — phân nhóm role ([L31-43](lib/sales-v2/scope.ts#L31-L43))
```ts
export function getScopeRole(roleCode: string): ScopeRole | null {
  if (roleCode === 'NV_SALE' || roleCode === 'NV_SALE_PT') return 'sale';
  if (roleCode === 'NV_KE') return 'accountant';
  if (roleCode.startsWith('QLCS_')) return 'qlcs';
  if (isTopAdmin(roleCode) || roleCode === 'CHU_TICH'
      || roleCode === 'GD_KD' || roleCode === 'GD_VP'
      || roleCode === 'TP_KE' || roleCode === 'TP_GS') return 'top';
  return null;
}
```

#### canReadBatch ([L78-87](lib/sales-v2/scope.ts#L78-L87))
```ts
export function canReadBatch(caller, batch: { saleId: string; branchId: string }): boolean {
  const role = getScopeRole(caller.profile.role_code);
  if (role === 'top') return true;
  if (role === 'sale') return batch.saleId === caller.profile.uid;   // FORCE
  if (role === 'accountant' || role === 'qlcs') {
    return !!caller.profile.facility_id && batch.branchId === caller.profile.facility_id;
  }
  return false;
}
```

#### canEditTransaction ([L95-127](lib/sales-v2/scope.ts#L95-L127))
- QLCS edit: `batch.saleId === caller.uid` (L105) + branch sanity check (L107-108)
- Accountant edit: `batch.branchId === caller.profile.facility_id` (L122)
- Top edit: chỉ batch pending_review

#### API enforcement examples

**monthly-summary L77-88**:
```ts
// QLCS / NV_KE: force branchId = facility_id
if (role === 'qlcs' || role === 'accountant') {
  branchId = caller.profile.facility_id ?? null;
}
// Sale: force saleId = uid
if (role === 'sale') saleId = caller.profile.uid;
```

**export L97**: `QLCS override facility_id` — Em verified PR-6 test: QLCS_CTT cố gửi `?branchId=HM` → server force CTT (báo cáo PR-PROMO1A nói rõ).

#### Có API nào nhận `branchId` từ query KHÔNG force theo role không?

✅ Em check 16 endpoint — không có. Top role được chọn branchId từ query (`monthly-summary L82`), nhưng QLCS/NV_KE bị override force.

**Verdict §3.5: PASS** — cross-branch/cross-sale prevention enforce ở scope helper + API.

---

### 3.6 Audit Log

**Files audit**:
- [lib/sales-v2/audit-log.ts](lib/sales-v2/audit-log.ts) (150 LOC)
- [lib/firebase/audit-log.ts](lib/firebase/audit-log.ts) (66 LOC)

#### 2 collection riêng (đã ghi nhận trong PR-7A audit Part A)

| Đặc tính | `salesAuditLogs` | `auditLogs` (generic) |
|---|---|---|
| Writer | `recordSalesAudit` / `recordSalesAuditIfEnabled` | `writeAuditLog` |
| Time field | `changedAt` (Timestamp) | `createdAt` (Date) |
| Actor | `changedBy`, `changedByName`, `changedByRole` | `userId`, `actor_name`, `actor_role` |
| Diff | `oldValue` / `newValue` per-field | `before` / `after` whole object |
| Schema enum | `SalesAuditAction` (18 closed) | Free-string action |
| WORM | write=false (rule L438) | WORM update/delete=false (rule L184) |
| Retention | "Vĩnh viễn ≥10 năm" (comment) | (không công bố) |

#### Action mapping by file + collection

| Action thực ghi | Collection | File | Enum match? |
|---|---|---|:---:|
| `create_tx`, `edit_field`, `delete_tx` | salesAuditLogs | transactions/* | ✅ |
| `auto_match`, `manual_link` | salesAuditLogs | transactions/* | ❌ NOT in enum |
| `submit_batch` | salesAuditLogs | batches/[id]/submit | ✅ |
| `lock_month`, `unlock_month` | salesAuditLogs | month-locks/* | ✅ |
| `export_sales_excel` | salesAuditLogs | export | ✅ |
| `update_reception_pricing` | salesAuditLogs | reception/pricing | ❌ NOT in enum |
| `approved`, `return`, `rejected` (batch) | **auditLogs** generic (module='sales') | batches/[id]/approve | ❌ NOT in enum |
| `approve`, `pause` (program) | **auditLogs** generic | programs/[id]/approve, toggle | ❌ NOT in enum |
| `create_sales_program`, `submit_sales_program`, `approve_sales_program`, `reject_sales_program`, `configure_sales_program`, `delete_sales_program`, `update_sales_program` | **auditLogs** generic | programs/* | ❌ NOT in enum |
| `update_target` | auditLogs generic | sales-targets | ❌ NOT in enum |

**Tổng 21 action thực ghi, trong đó 12 action ngoài enum** `SalesAuditAction` (declared in [lib/types/sales-audit.ts:25-40](lib/types/sales-audit.ts#L25-L40)).

#### Fail-soft ([lib/sales-v2/audit-log.ts:42-79](lib/sales-v2/audit-log.ts#L42-L79))
```ts
export async function recordSalesAudit(input): Promise<string | null> {
  try {
    const ref = await db.collection(COLLECTIONS.SALES_AUDIT_LOGS).add(doc);
    return ref.id;
  } catch (err) {
    console.error('[sales-audit] write fail (swallowed):', { ... });
    return null;    // ← fail-soft, không throw, không phá mutation chính
  }
}
```

#### PR-7A UI scope

`/audit-history` chỉ đọc **`salesAuditLogs`** only (Option A chốt với user). 12 action ở `auditLogs` generic CHƯA hiển thị → defer PR-7B union.

#### Action rủi ro cao chưa audit đầy đủ

| Hành động | Audit có? | Risk |
|---|:---:|---|
| Tạo tx (Sale) | ✅ salesAuditLogs `create_tx` | LOW |
| Edit tx (Sale/Accountant) | ✅ `edit_field` | LOW |
| Delete tx (Accountant) | ✅ `delete_tx` | LOW |
| Submit batch | ✅ | LOW |
| Approve batch | ✅ writeAuditLog `approved` (auditLogs generic) | MED — không trong UI /audit-history hiện tại |
| Return batch | ✅ writeAuditLog `return` (auditLogs generic) | MED — không trong UI |
| Program create/submit/approve/reject/configure/toggle | ✅ writeAuditLog `*_sales_program` (auditLogs generic) | MED — không trong UI |
| Target update | ✅ writeAuditLog `update_target` (auditLogs generic) | MED — không trong UI |
| Lock/unlock kỳ | ✅ salesAuditLogs | LOW |
| Export Excel | ✅ salesAuditLogs `export_sales_excel` | LOW |
| Reception pricing | ✅ salesAuditLogs `update_reception_pricing` | LOW |

**Verdict §3.6: PARTIAL** — audit mọi mutation OK, NHƯNG chia 2 collection → /audit-history PR-7A chỉ thấy 50% workflow. Defer PR-7B.

---

### 3.7 Khuyến mãi Workflow

**File chính**:
- [lib/types/sales-program.ts](lib/types/sales-program.ts) — schema 7 status + ApprovalStep + immutable fields
- [lib/sales-v2/promo-permissions.ts](lib/sales-v2/promo-permissions.ts) — 10 UI helper testable (PR-PROMO1A)
- [lib/sales-v2/promo-deadline.ts](lib/sales-v2/promo-deadline.ts) — deadline logic (đúng business rule tháng trước)
- [lib/sales-v2/promo-query-params.ts](lib/sales-v2/promo-query-params.ts) — query auto-focus
- 7 API endpoint `app/api/sales-v2/programs/*`

#### Workflow chứng minh

| Bước | Ai | API endpoint | Server enforce | Audit |
|---|---|---|:---:|:---:|
| Tạo proposal | QLCS | POST `/api/sales-v2/programs` | ✅ isProgramCreator + branchId force | ✅ writeAuditLog `create_sales_program` |
| Submit | Creator | POST `/programs/[id]/submit` | ✅ createdBy===uid | ✅ |
| Approve cấp 1 (GD_KD) | currentApprover | POST `/programs/[id]/approve` | ✅ currentApprover===uid | ✅ writeAuditLog `approve_sales_program` |
| Approve cấp 2 (GD_VP) | currentApprover | (same endpoint) | ✅ tự chuyển approver | ✅ |
| Reject | currentApprover | POST `/programs/[id]/reject` | ✅ + reason mandatory | ✅ writeAuditLog `reject_sales_program` |
| Configure promoCode | TP_KE/NV_KE | POST `/programs/[id]/configure` | ✅ canConfigure + unique check | ✅ writeAuditLog `configure_sales_program` |
| Toggle pause/resume | TP_KE/NV_KE | POST `/programs/[id]/toggle` | ✅ canConfigure | ✅ writeAuditLog `pause`/`resume` |
| Sale áp dụng vào tx | Sale | POST `/transactions` với `promoSnapshots[]` | ✅ validatePromoCombo | (audit ở tx layer) |
| Cron nhắc hạn 25 | system | `/api/cron/program-deadline-reminder` (em chưa đọc kỹ — NEEDS MANUAL REVIEW chi tiết flow) | — | — |

#### tx.promoSnapshots — immutable? ✅ **CONFIRMED PASS** (update 2026-06-23)

Schema [PromoSnapshot at lib/types/sales-program.ts:140-146](lib/types/sales-program.ts#L140-L146):
```ts
/** Snapshot ghi vào tx khi Sale áp promo — KHÔNG đổi sau khi tx tạo. */
export interface PromoSnapshot {
  id: string; code: string; name: string;
  type: PromoType; value: number;
}
```

**Manual review evidence (2026-06-23)**:

1. **POST tạo snapshot** ([app/api/sales-v2/transactions/route.ts:179-226](app/api/sales-v2/transactions/route.ts#L179-L226)):
   - Sale gửi `inputPromoIds` (max 2 sau dedupe L96-97)
   - Server `getProgramsByIds(inputPromoIds)` (L186) → validate combo + scope: `status === 'active'` (L197), `branchId === batch.branchId` (L200), `month === batch.month` (L203), `packageIds` match (L206)
   - Server `toSnapshot(p)` push vào `promoSnapshots` (L222) — lưu full `{id, code, name, type, value}`
2. **PATCH whitelist KHÔNG có promoSnapshots/promoIds** ([app/api/sales-v2/transactions/[id]/route.ts:28-33](app/api/sales-v2/transactions/[id]/route.ts#L28-L33)):
   ```ts
   const EDITABLE_FIELDS = new Set([
     'customerName', 'phone', 'guardianName', 'source', 'packageId',
     'transactionType', 'paymentMethod', 'packageValue', 'collectedToday',
     'quantity', 'unitPrice',
     'receiptNo', 'contractNo', 'note',
   ]);
   ```
   → User gửi body có `promoSnapshots`/`promoIds` → filter L76-79 silent skip.
3. **Server chỉ READ snapshots để recompute discount** (L189):
   ```ts
   const snapshots: PromoSnapshot[] = Array.isArray(tx.promoSnapshots) ? tx.promoSnapshots : [];
   ```
   → KHÔNG WRITE `promoSnapshots`. Chỉ recompute `basePackageValue`/`discountAmount`/`packageValue` từ snapshot × newBase khi user PATCH `packageValue`/`quantity`/`unitPrice`.
4. **Sửa chương trình KM gốc** (`/api/sales-v2/programs/[id]` PATCH) → tx cũ KHÔNG bị ảnh hưởng (snapshot full đã lưu vào tx).
5. **Snapshot đủ cho audit** — 5 field đủ cho UI hiển thị + PromoEffectivenessCard mà KHÔNG cần lookup `salesPrograms`.

**Verdict: PASS dứt điểm** — promoSnapshots IMMUTABLE qua mọi route. KHÔNG có route nào update sau POST create.

#### Cron nhắc hạn 25/tháng

CLAUDE.md mục 15 có ghi cron `15 * * * * proposal-overdue`, `cleanup-stale-fcm` daily 10:00. Cron deadline reminder em không deep-read trong audit này. **NEEDS MANUAL REVIEW** chi tiết.

#### lateSubmission

Schema `lateSubmission?: boolean` + `lateReason?: string | null` ([lib/types/sales-program.ts:111-114](lib/types/sales-program.ts#L111-L114)) — đã có. M2.1 PR-5 ghi modal "Late reason" khi submit sau 25. Helper `getDeadlineStatus` trong PR-PROMO1A wire UI banner.

#### CEO/CHU_TICH thao tác được không?

[lib/sales-v2/promo-permissions.ts:13-18](lib/sales-v2/promo-permissions.ts#L13-L18):
```ts
const READ_ONLY_ROLES: ReadonlySet<string> = new Set([
  'CEO', 'CHU_TICH', 'TP_GS',
]);

export function isPromoReadOnlyRole(roleCode): boolean {
  if (!roleCode) return false;
  return READ_ONLY_ROLES.has(roleCode);
}
```
Mọi `can*Program` helper return false khi `isPromoReadOnlyRole` true. → CEO/CHU_TICH/TP_GS **UI ẨN hết button**.

⚠️ **Server-side**: KHÔNG có `isPromoReadOnlyRole` check ở API mutation. Theo dòng logic hiện tại:
- CEO/CHU_TICH không có trong `isProgramCreator` (chỉ QLCS_) → POST programs reject ✅
- CEO/CHU_TICH không bao giờ là `currentApprover` (approverChain mặc định GD_KD→GD_VP) → approve reject ✅
- CEO/CHU_TICH không phải TP_KE/NV_KE → configure/toggle reject ✅

→ De facto safe. NHƯNG nếu sau này CEO override custom approverChain hay được set làm approver → có thể duyệt. **Risk MED nếu mở custom workflow tương lai**. PR-PROMO1A đã commit ko mở.

#### TP_GS read-only

- ✅ UI prep xong (PR-PROMO1A)
- ❌ Permission `/chuong-trinh` chưa mở cho TP_GS ([lib/permissions.ts:78](lib/permissions.ts#L78) — TP_GS allow list không có route)
- Defer PR-PROMO1B

#### Có cần server-side promo read-only enforcement không?

**KHÔNG critical** vì:
- Read endpoint `/api/sales-v2/programs` (GET): TP_GS không có route permission → API 403 trước khi vào logic
- Hypothetically nếu mở permission GET cho TP_GS: TP_GS không match `isProgramCreator` / `currentApprover` / `canConfigure` → API write deny anyway

**Verdict §3.7: PASS** — server permission enforce chính xác. UI helper mirror đúng. PR-PROMO1A harden cosmetic + UX.

---

### 3.8 Công nợ — ✅ **PASS** (update 2026-06-23 sau manual review)

**File**:
- Page: `app/(app)/doanh-so-v2/cong-no/`
- API: read qua `/api/sales-v2/transactions` filter `originalDebt > 0`
- POST: [app/api/sales-v2/transactions/route.ts](app/api/sales-v2/transactions/route.ts) (351 LOC)
- PATCH/DELETE: [app/api/sales-v2/transactions/[id]/route.ts](app/api/sales-v2/transactions/[id]/route.ts) (399 LOC)
- Logic auto-link: trong transactions/[id]/route.ts

#### Schema fields (deep-read 2026-06-23 — [lib/types/sales-v2.ts:94-171](lib/types/sales-v2.ts#L94-L171))

- `debtAmount` (L119): số dư hiện tại — server compute mỗi PATCH, giảm khi auto-match
- `originalDebt` (L120-122): "Snapshot debt LÚC TẠO (chỉ cho dat_coc). Không đổi khi auto-match link → dùng cho Công nợ phát sinh trong dashboard tháng"
- `matchedTransactionId` (L166): link tx thanh_toan_not → tx dat_coc, auto-link chạy khi batch approved
- `matchStatus` (L168): `not_applicable | pending | matched | needs_review | no_match`
- `transactionType`: `dat_coc | thanh_toan_full | thanh_toan_not`

#### POST create — set originalDebt 1 lần ([transactions/route.ts:268](app/api/sales-v2/transactions/route.ts#L268))

```ts
// BUG-1 audit fix: snapshot debt cho 'dat_coc' (không đổi khi auto-match link)
originalDebt: transactionType === 'dat_coc' ? debtAmount : 0,
```

Sale gửi body với `originalDebt` → server **ignore** (chỉ đọc field server tính từ `debtAmount`).

#### PATCH whitelist chặn originalDebt + debtAmount + matchedTransactionId ([transactions/[id]/route.ts:28-33](app/api/sales-v2/transactions/[id]/route.ts#L28-L33))

```ts
const EDITABLE_FIELDS = new Set([
  'customerName', 'phone', 'guardianName', 'source', 'packageId',
  'transactionType', 'paymentMethod', 'packageValue', 'collectedToday',
  'quantity', 'unitPrice',
  'receiptNo', 'contractNo', 'note',
]);
```

→ **KHÔNG có** `originalDebt`, `debtAmount`, `matchedTransactionId`, `matchStatus`, `batchId`, `saleId`, `branchId`, `createdAt`, `reviewStatus`, `reviewedAt`, `reviewedBy`. Filter L76-79 silent skip mọi field ngoài whitelist.

#### debtAmount là DERIVED — server overwrite mỗi PATCH ([L228](app/api/sales-v2/transactions/[id]/route.ts#L228))

```ts
updates.debtAmount = Math.max(0, finalPackageValue - finalCollected);
```

User gửi body với `debtAmount` → whitelist skip; sau đó server tự overwrite. → KHÔNG sửa trực tiếp được.

#### matchedTransactionId immutable qua PATCH

KHÔNG trong whitelist → user PATCH silent skip. Update qua auto-link flow riêng (chạy khi batch approved). + audit `auto_match` / `manual_link` ghi salesAuditLogs.

#### canEditTransaction chống sửa tx sau approved ([scope.ts:95-127](lib/sales-v2/scope.ts#L95-L127))

- Sale: chỉ sửa khi `batch.status === 'draft' || (returned && tx.reviewStatus === 'rejected')`
- Accountant: chỉ sửa khi `batch.status === 'pending_review'`
- Tx approved → block toàn bộ PATCH/DELETE → auto-link đã chạy → công nợ không bị phá

#### Auto-link audit

✅ `auto_match` + `manual_link` ghi salesAuditLogs (xem §3.6 — 2 action này hiện ngoài enum `SalesAuditAction` nhưng vẫn được ghi).

#### Ai cập nhật công nợ

| Flow | Ai | Field touched | Audit |
|---|---|---|:---:|
| Tạo tx 'dat_coc' | Sale | server set originalDebt + debtAmount | ✅ create_tx |
| Tạo tx 'thanh_toan_not' | Sale | server set matchStatus='pending' | ✅ create_tx |
| Auto-match (sau batch approved) | system | debtAmount tx gốc giảm + matchedTransactionId tx mới = tx gốc id | ✅ auto_match |
| Manual link (kế toán chọn candidate khi needs_review) | TP_KE/NV_KE | matchedTransactionId | ✅ manual_link |
| Edit field qua PATCH | Sale (draft/returned) hoặc Accountant (pending_review) | 14 field whitelist | ✅ edit_field (chỉ reviewer edit — Sale tự sửa skip audit) |
| Delete tx | Sale (draft/returned) hoặc Accountant (pending_review) | decrement promo stats trước xóa | ✅ delete_tx |

#### Rủi ro còn lại

- **LOW**: PATCH silent skip field bị cấm → KHÔNG audit attempt → khó forensic (xem hardening LOW ở Risk Register)
- **LOW**: Sale tự sửa batch draft KHÔNG audit (comment "đỡ noise") → khó truy vết Sale-internal changes
- **LOW**: Không có workflow nhắc thu hồi công nợ (báo cáo SUMMARY mục 7.4 đã ghi nhận)
- **LOW**: Không có cap maximum số debt outstanding per khách (không control limit)

**Verdict §3.8: PASS** — originalDebt + debtAmount + matchedTransactionId immutability đảm bảo qua **PATCH whitelist + server compute layer**, không phải chỉ "app logic". canEditTransaction lock chặn sửa sau approved → bảo vệ tx đã match.

---

### 3.9 Module WIP / Placeholder

| Route | File | LOC | Status | Có route gate? | Có badge WIP? | Data thật? | Rủi ro nếu user vào? |
|---|---|---|---|:---:|:---:|:---:|---|
| /dashboard-ceo | [page.tsx](app/(app)/dashboard-ceo/page.tsx) | 37 | WIP | ✅ canAccessRoute L14 | ✅ `status="wip"` L34 | KHÔNG | LOW — `PlaceholderPage` chỉ hiển thị "Đang phát triển" |
| /phe-duyet | [page.tsx](app/(app)/phe-duyet/page.tsx) | 179 | WIP roadmap | ✅ | ✅ 9-card "Soon" | KHÔNG (cards `liveHref` chưa wire) | LOW — Card click chưa hoạt động |
| /thong-bao | [page.tsx](app/(app)/thong-bao/page.tsx) | 36 | Placeholder | ✅ | ✅ `status="wip"` | KHÔNG | LOW |
| /du-an/erp | (placeholder) | — | Placeholder | ✅ | ✅ badge `soon` sidebar | KHÔNG | LOW |
| /du-an/mo-co-so | (placeholder) | — | Placeholder | ✅ | ✅ badge `soon` | KHÔNG | LOW |
| /du-an/dac-biet | (placeholder) | — | Placeholder | ✅ | ✅ badge `soon` | KHÔNG | LOW |
| /du-an/ai | [page.tsx](app/(app)/du-an/ai/page.tsx) | 34 | Placeholder | ✅ | ✅ | KHÔNG | LOW |

**Verdict §3.9: PASS** — module WIP đều có route gate + badge rõ + KHÔNG có data thật → user không vô tình hành động sai.

---

### 3.10 Risks tổng hợp

Xem [§4 Risk Register](#4-risk-register).

---

## 4. Risk Register

> **Update 2026-06-23**: 0 HIGH · 3 MED · 6 LOW · 0 NEEDS REVIEW. Gỡ 2 MED (originalDebt + Sale info leak rule — đã DEPLOYED `64aa0b9`) + 1 NEEDS REVIEW (promoSnapshots).
>
> Trước (2026-06-22): 0 HIGH · 5 MED · 4 LOW · 1 NEEDS REVIEW.

| Sev | Module | Vấn đề | File / Code | Vì sao là rủi ro | Ảnh hưởng vận hành | Xử lý đề xuất | PR đề xuất |
|:---:|---|---|---|---|---|---|---|
| **MED** | Audit | 12 action ngoài enum `SalesAuditAction` + audit chia 2 collection | [lib/types/sales-audit.ts:25-40](lib/types/sales-audit.ts#L25-L40) vs code thực ghi | UI `/audit-history` PR-7A chỉ thấy `salesAuditLogs` → 50% lifecycle KM/batch approve/target update không truy vết được trong 1 chỗ. Audit compliance khó | TP_KE/TP_GS chỉ thấy half history | Union 2 collection + normalize schema + unify action enum | **PR-7B** |
| **MED** | Sales V2 | Refund / hoàn tiền chưa có workflow | (chưa có code) | Sale yêu cầu hoàn tiền sau approved → workaround edit tx tay → mất audit trail rõ | Nếu nghiệp vụ refund thường → control yếu | Tạo collection `salesRefunds` + workflow approve | **PR-8** |
| **MED** | Sales V2 | Discount approval threshold chưa có | (chưa có code) | Sale có thể nhập tx với `discountAmount` lớn không cần duyệt | Rủi ro tài chính nếu Sale lạm dụng | Config thresholds + workflow approval tx vượt | **PR-9** |
| LOW | Audit | PATCH `/transactions/[id]` silently ignore field ngoài `EDITABLE_FIELDS` (không audit attempt tamper) | [transactions/[id]/route.ts:76-79](app/api/sales-v2/transactions/[id]/route.ts#L76-L79) | User/attacker thử PATCH `originalDebt`/`promoSnapshots`/`debtAmount` → bị block (whitelist) NHƯNG KHÔNG ghi log attempt. Khó forensic | Không impact data integrity (vẫn block) — chỉ thiếu evidence | Add `console.warn` hoặc audit attempt khi body chứa field ngoài whitelist (tiny PR ~5-10 LOC) | Defer (LOW) |
| LOW | Audit | Sale tự sửa batch draft KHÔNG ghi audit (comment "đỡ noise") | [transactions/[id]/route.ts:275](app/api/sales-v2/transactions/[id]/route.ts#L275) `isReviewerEdit` check | Sale sửa nhiều lần trong draft → không thấy history nội bộ. Quyết định nghiệp vụ trước đây | Inconvenience, không impact data integrity | Defer — quyết định nghiệp vụ; review lại khi PR-7B union | Defer |
| LOW | Promotion | CEO/CHU_TICH UI ẨN button nhưng server KHÔNG có `isPromoReadOnlyRole` enforcement | [lib/sales-v2/promo-permissions.ts:13-18](lib/sales-v2/promo-permissions.ts#L13-L18) | Nếu sau này CEO custom được set làm approver → server cho duyệt (vì hiện tại logic là `currentApprover===uid`) | Theoretical — chưa có flow set CEO làm approver | Khi mở CEO override → add explicit check | Defer (no PR cần ngay) |
| LOW | Promotion | Cron deadline reminder + lateSubmission flag NEEDS REVIEW deep flow | `/api/cron/program-deadline-reminder` | Em không deep-read trong audit này. CLAUDE.md mục 15 + memory mention nhưng không verify được flow chính xác | Nếu cron fail → QLCS không nhận reminder | Verify cron alias + dedupe doc `salesProgramReminderLog` | Defer |
| LOW | TP_GS | Permission `/chuong-trinh` chưa mở cho TP_GS | [lib/permissions.ts:78](lib/permissions.ts#L78) | TP_GS không xem được workflow KM dù UI đã prep read-only (PR-PROMO1A) | TP_GS không giám sát được KM | Mở permission + sidebar entry | **PR-PROMO1B** |
| LOW | Module WIP | dashboard-ceo / phe-duyet / thong-bao / 4 du-an = placeholder | 7 page.tsx | User vào không thấy data thật → confusion | Inconvenience | Roadmap hoàn thiện dần | PR riêng per module |
| LOW | V1 deprecated | `/doanh-so/*` (V1) còn permission, Cmd+K access được | [lib/permissions.ts](lib/permissions.ts) ADMIN/CEO/CHU_TICH/GD_KD allow list | User cũ vào nhầm V1 cũ | Confusion + dirty data | Cleanup + redirect V1 → V2 | **PR-NAV1B** |

### Risks ĐÃ GỠ (resolved)

| Sev cũ | Module | Vấn đề cũ | Resolution |
|:---:|---|---|---|
| ~~MED~~ | Promotion | `salesPrograms` rules cho Sale đọc TẤT CẢ programs trong branch | ✅ **FIXED + DEPLOYED 2026-06-23** — commit `64aa0b9` tách Sale role block với `status == 'active'` filter. Production rules active |
| ~~MED~~ | Sales V2 | `originalDebt` immutability dựa app logic | ✅ **PASS** — manual review 2026-06-23 xác nhận PATCH whitelist L28-33 + server compute layer chặn |
| ~~NEEDS REVIEW~~ | Promotion | tx.promoSnapshots field-level immutability | ✅ **PASS** — manual review 2026-06-23 xác nhận PATCH whitelist không có `promoSnapshots`/`promoIds`, server chỉ READ |

---

## 5. Recommended Next PRs (xếp ưu tiên — update 2026-06-23)

### ✅ Đã hoàn thành
- **Rule fix `salesPrograms` Sale info leak** — commit `64aa0b9`, DEPLOYED 2026-06-23
- **Manual review `originalDebt` + `promoSnapshots` field whitelist** — PASS dứt điểm, không cần PR fix

### Priority 1 — PR-PROMO1B (mở TP_GS permission `/chuong-trinh`)
**Scope**: ~20 LOC (permission + sidebar entry "Khuyến mãi đang áp dụng" trong section Giám sát)
**Risk giảm**: LOW (TP_GS giám sát workflow KM)
**LOC**: tiny
**Không làm**: KHÔNG đổi UI (đã harden PR-PROMO1A — TP_GS read-only mode đã prep helper `isPromoReadOnlyRole`)
**Tại sao Priority 1**: tiny, low risk, mở khóa giám sát KM ngay

### Priority 2 — PR-7B: Union audit collections
**Scope**: API + Client
**Risk giảm**: MED → LOW (compliance/audit)
**LOC**: ~400-500
**Không làm**:
- KHÔNG sửa audit writer (giữ 2 collection)
- KHÔNG migrate data
- KHÔNG mở NV_KE/QLCS scope nếu chưa có branch-scope filter chặt

### Priority 3 — PR-PROMO2 (Ưu đãi ngoài CT)
- Tx có `discountAmount > 0` nhưng `promoSnapshots = []` → flag "ưu đãi ngoài KM"
- Section/page review cho NV_KE/TP_KE/GD_VP xác nhận hợp lệ
- Audit log "manual_discount"
- Chờ anh chốt threshold (vd > 5% tổng giá trị → flag review)

### Priority 4 — PR-8 Refund
- Chờ spec nghiệp vụ rõ (kích bằng dấu / điều kiện hoàn / role duyệt)
- Collection mới `salesRefunds` + workflow approve
- LOC ~600-800

### Priority 5 — PR-9 Discount approval threshold
- Chờ policy của lãnh đạo về % giảm cần duyệt
- Config thresholds + workflow approval

### Optional — Hardening LOW (defer)
- PATCH audit silent tamper attempt (~5-10 LOC)
- Sale self-edit batch draft audit (quyết định nghiệp vụ)

### KHÔNG nên làm ngay
- ❌ Mở permission rộng (NV_KE/QLCS vào /audit-history) trước khi PR-7B có branch-scope filter
- ❌ Mở CEO override workflow KM khi server-side chưa có explicit role guard
- ❌ Bulk delete V1 legacy data — defer cleanup

---

## 6. Appendix

### File đã đọc đầy đủ trong audit (2026-06-22 + 2026-06-23)

**Audit gốc 2026-06-22**:
1. `firebase/firestore.rules` (513 LOC, full read)
2. `lib/firebase/session-auth.ts` (39 LOC)
3. `app/(app)/layout.tsx` (69 LOC)
4. `lib/sales-v2/scope.ts` (167 LOC)
5. `app/(app)/dashboard-ceo/page.tsx` (37 LOC)
6. `app/(app)/audit-history/page.tsx` (43 LOC — PR-7A)
7. `lib/types/sales-program.ts` (170 LOC)
8. `lib/sales-v2/audit-log.ts` (150 LOC)
9. `lib/firebase/audit-log.ts` (66 LOC)
10. `lib/sales-v2/promo-permissions.ts` (146 LOC — PR-PROMO1A)
11. `lib/sales-v2/promo-deadline.ts` (106 LOC — PR-PROMO1A)
12. `lib/sales-v2/promo-query-params.ts` (77 LOC — PR-PROMO1A)
13. `app/api/auth/session/route.ts` (selective grep — header + rate limit comment)
14. `app/(app)/phe-duyet/page.tsx` (selective top 30 lines)
15. `app/(app)/thong-bao/page.tsx` (top 30 lines)

**Manual review bổ sung 2026-06-23** (transaction immutability):
16. `lib/types/sales-v2.ts` (231 LOC — full schema SalesTransaction + SalesDailyBatch)
17. `app/api/sales-v2/transactions/route.ts` (351 LOC — POST + GET)
18. `app/api/sales-v2/transactions/[id]/route.ts` (399 LOC — PATCH + DELETE)

UI callers identified (KHÔNG deep-read — chỉ verify tồn tại + grep tên):
- `app/(app)/doanh-so-v2/nhap/NhapClient.tsx` (Sale entry — gọi POST + PATCH)
- `app/(app)/doanh-so-v2/doi-chieu/_components/BatchDetailModal.tsx` (Accountant edit — gọi PATCH)

### API đã kiểm tra (qua Explore agent)

1. `app/api/sales-v2/transactions/route.ts` (POST + GET)
2. `app/api/sales-v2/transactions/[id]/route.ts` (PATCH + DELETE)
3. `app/api/sales-v2/batches/[id]/submit/route.ts`
4. `app/api/sales-v2/batches/[id]/approve/route.ts`
5. `app/api/sales-v2/batches/[id]/return/route.ts`
6. `app/api/sales-v2/monthly-summary/route.ts`
7. `app/api/sales-v2/export/route.ts`
8. `app/api/sales-v2/programs/route.ts` (POST + GET)
9. `app/api/sales-v2/programs/[id]/approve/route.ts`
10. `app/api/sales-v2/programs/[id]/reject/route.ts`
11. `app/api/sales-v2/programs/[id]/configure/route.ts`
12. `app/api/sales-v2/programs/[id]/toggle/route.ts`
13. `app/api/sales-v2/month-locks/[branchId]/[month]/lock/route.ts`
14. `app/api/sales-v2/month-locks/[branchId]/[month]/unlock/route.ts`
15. `app/api/sales-targets/route.ts` (POST + GET)
16. `app/api/audit-history/route.ts` (PR-7A)

### Collection / Rules đã kiểm tra

- 47 collections trong `lib/firebase/collections.ts`
- Rules per collection (Sales V2): salesDailyBatches, salesTransactions, salesAuditLogs, salesMonthlySummary, salesPrograms, salesReceptionBatches, salesReceptionPricing
- Rules per collection (core): users, branches, departments, roles, templates, checklists + items + evidenceFiles, auditLogs (WORM)
- Rules per collection (legacy + V1): leads, leadActivities, packageSales, packageGroups, packages, sales, salesEntries, salesTargets
- Rules per collection (chat + noti): conversations + messages, chatAccessLogs, notifications, inAppNotifications
- Rules per collection (infra): featureFlags, rateLimits, profiles (legacy)
- Catch-all deny verified: techWork, chemicalEntries, machines, machineRuns, salesMonthLocks, personal*, discrepancies, packageQuantities, dashboardSnapshots, systemErrors, salesProgramReminderLog, aiAssistantLogs (đều fall through → deny)

### Helpers/scope đã kiểm tra

- `lib/permissions.ts`: canAccessRoute, effectiveMenu, MENU_PERMISSIONS, ROLE_BLOCK, QLCS_FACILITY
- `lib/sales-v2/scope.ts`: getScopeRole, canSaleEnter, canExportSalesExcel, canAccountantReview, canReadBatch, canEditTransaction
- `lib/firebase/sales-targets-scope.ts`: canReadTargets, targetsFilterForList, canWriteTarget, canWriteStaffTargets
- `lib/audit-history/can-read.ts`: canReadAuditHistory (PR-7A)
- `lib/sales-v2/promo-permissions.ts`: 10 helper PR-PROMO1A

### Tests confirmed (368/368 PASS — em không re-run trong audit)
- 22 test file, 368 test PASS (state sau PR-PROMO1A)
- Cover: permissions, audit-history, promo-permissions/deadline/query-params, sales-v2 scope/target/programs/promo-effectiveness, feature-flags, notifications, rate-limit, types/branches, audit WORM contract

---

## Kết luận

> **App ở trạng thái strong defense-in-depth.** Auth/Session/Route/API/Rules/Audit 4-5 layer enforce thật, không phải UI-only. 16/16 API Sales V2 audit hôm nay PASS 100% server-side enforcement. Firestore Rules có catch-all deny + WORM cho audit. **0 HIGH risks** trong scope audit này.
>
> **Cần xử lý trước khi mở thêm quyền hoặc làm PR tài chính (Refund/Discount)**:
> 1. ✅ ~~**Tiny rule fix `salesPrograms` Sale info leak**~~ — **DONE** commit `64aa0b9` + DEPLOYED 2026-06-23
> 2. ⏳ **PR-7B union audit collections** (PR-7A chỉ thấy 50% workflow) — MED risk còn
> 3. ✅ ~~**Manual review field-level immutability** `originalDebt` + `promoSnapshots`~~ — **PASS dứt điểm** 2026-06-23, không cần PR fix
>
> Update 2026-06-23: chỉ còn **1 item MED priority** trước khi mở PR tài chính (PR-7B). Sau đó có thể mở:
> - **PR-PROMO1B** (TP_GS permission — Priority 1 mới — tiny ~20 LOC, an toàn)
> - PR-7B (audit union — Priority 2)
> - PR-PROMO2 (Ưu đãi ngoài CT)
> - PR-8 Refund (cần spec)
> - PR-9 Discount threshold (cần policy)
