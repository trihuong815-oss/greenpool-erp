# Green Pool ERP — Điều phối công việc (Cross-Functional Coordination System)

> **Design Document v1.0** — Senior PM Consolidation · 2026-05-31
> Module: `/dieu-phoi` (kế thừa `/giao-viec` + `/de-xuat`)
> Scope: 2 khối · 5 cơ sở · 7 phòng ban · 8 trạng thái workflow · 5 loại điều phối · 5 phạm vi · 4 tier escalation
> Status: APPROVED FOR IMPLEMENTATION — 6 phase / 8 tuần

---

## Mục lục

| # | Mục | Lifecycle | Stream nguồn |
|---|-----|-----------|--------------|
| 1 | [Information Architecture](#1-information-architecture) | 🟡 MODIFY | Foundation |
| 2 | [Database Structure](#2-database-structure) | 🟡 MODIFY | Foundation |
| 3 | [Workflow State Machine](#3-workflow-state-machine) | 🔵 NEW | Foundation |
| 4 | [Permission Matrix](#4-permission-matrix) | 🟡 MODIFY | Foundation |
| 5 | [Dashboard CEO — 30s Test](#5-dashboard-ceo--30s-test) | 🔵 NEW | Dashboards |
| 6 | [Dashboard Giám đốc Khối (KD + VP)](#6-dashboard-giám-đốc-khối-kd--vp) | 🔵 NEW | Dashboards |
| 7 | [Dashboard Trưởng phòng (TP / QLCS)](#7-dashboard-trưởng-phòng-tp--qlcs) | 🔵 NEW | Dashboards |
| 8 | [Danh sách điều phối — Table + Filters](#8-danh-sách-điều-phối--table--filters) | 🟡 MODIFY | Dashboards |
| 9 | [Chi tiết điều phối — Layout 3 cột](#9-chi-tiết-điều-phối--layout-3-cột) | 🟡 MODIFY | Form/Detail |
| 10 | [Form tạo điều phối — Wizard 3 bước](#10-form-tạo-điều-phối--wizard-3-bước) | 🟡 MODIFY | Form/Detail |
| 11 | [Notification Engine + Escalation 4 cấp](#11-notification-engine--escalation-4-cấp) | 🟡 MODIFY + 🔵 NEW | Noti |
| 12 | [Mobile App Layout — Stack + FAB + Bottom Sheet](#12-mobile-app-layout--stack--fab--bottom-sheet) | 🔵 NEW | Form/Detail |
| 13 | [UI Wireframe + UX Flow tổng](#13-ui-wireframe--ux-flow-tổng) | 🔵 NEW | Form/Detail |
| 14 | [Component Library](#14-component-library) | 🔵 NEW | Form/Detail |
| 15 | [Migration plan + Acceptance criteria](#15-migration-plan--acceptance-criteria) | 🔵 NEW | Migration |

---

## Nguyên lý cốt lõi — 4 câu hỏi

Mọi screen của module Điều phối (list, dashboard, detail, card, noti, mobile) **phải hiển thị đủ 4 câu trả lời trong 1 lần nhìn**. Nếu thiếu 1 trong 4 → UI sai spec.

| # | Câu hỏi | Field dữ liệu | Cách hiển thị |
|---|---|---|---|
| 1 | **Owner** — Ai chịu trách nhiệm chính? | `task.ownerUid` + `task.ownerName` | Avatar + tên ở góc trái trên card |
| 2 | **Status** — Đang ở bước nào? | `task.status` (1 trong 8) | Pill màu (xám/xanh/cam/đỏ) + icon |
| 3 | **Waiting For** — Chờ ai làm gì, bao lâu? | `task.waitingFor.{uid, content, sinceHours}` | Banner vàng/đỏ: "⏳ Chờ <name> làm <what> · <Xh>" |
| 4 | **Collaboration** — Ai phối hợp, làm gì? | `task.collaborators[]` | Chip list: "<Đơn vị> · <responsible> · <status>" |

Bên cạnh đó: **mỗi noti push phải trả lời "Tôi mở app để LÀM gì?"**. Nếu không có action cụ thể → không push, chỉ ghi `inAppNotifications`.

---

## 1. Information Architecture

**🟡 MODIFY** · Touches: `Sidebar.tsx`, `BottomNavBar.tsx`, `giao-viec/page.tsx`, `de-xuat/page.tsx`, `cong-viec-ca-nhan/page.tsx`

### Mục tiêu

Định vị lại 3 route hiện hữu thành **một hệ Coordination 3-lớp**:

- Lớp công ty (`/dieu-phoi`) = **command center**
- Lớp đề xuất (`/de-xuat`) = **inbox của approver**
- Lớp cá nhân (`/cong-viec-ca-nhan`) = **to-do list nội bộ**

Cả 3 đọc từ cùng collection `coordinationTasks` nhưng filter khác nhau — **KHÔNG tạo collection riêng**.

### Module tree (route + sub-route)

```
/dieu-phoi                          # Điều phối công việc (chính)
├── ?tab=all                        # Tất cả
├── ?tab=mine-owner                 # Tôi phụ trách (owner=me)
├── ?tab=mine-assigner              # Tôi giao (createdBy=me)
├── ?tab=cross-block                # Liên khối
├── ?tab=waiting-response           # Chờ phản hồi
├── ?tab=waiting-approval           # Chờ duyệt (currentApprover=me)
├── ?tab=overdue                    # Quá hạn
├── ?tab=bottleneck                 # Điểm nghẽn (stuckHours>=24)
├── /[taskId]                       # Drill-down (modal desktop, full page mobile)
├── /tao-moi                        # Form tạo
└── /bang-dieu-khien                # CEO/GĐ Dashboard riêng

/de-xuat                            # Inbox đề xuất (GIỮ, tách 2026-06-03)
├── ?tab=all
├── ?tab=to-superior                # Tôi đề xuất lên trên
├── ?tab=peer                       # Ngang cấp
├── ?tab=cross-block                # Liên khối
└── ?tab=pending-my-approval        # Chờ tôi duyệt

/cong-viec-ca-nhan                  # To-do cá nhân (GIỮ)
├── Việc tôi tự ghi (personalTasks)
└── Việc công ty assign cho tôi (mirror coordinationTasks)
```

### Phân tách 3 lớp

| Lớp | Mục đích | User chính | Nguồn dữ liệu | Hành động chính |
|------|----------|------------|---------------|------------------|
| `/dieu-phoi` | Điều phối công ty | CEO, GĐ, TP, QLCS | `coordinationTasks` | Tạo/Giao/Duyệt/Theo dõi nghẽn |
| `/de-xuat` | Inbox đề xuất | TP, QLCS, GĐ, CEO | `coordinationTasks` WHERE `type IN (de_xuat, phe_duyet)` | Duyệt/Từ chối/Yêu cầu bổ sung |
| `/cong-viec-ca-nhan` | Việc cá nhân + được giao | Mọi role | `personalTasks` + `coordinationTasks` WHERE `assigneeUserIds∋me` | Mark done, ghi note |

**Nguyên tắc**: 1 doc `coordinationTasks` xuất hiện ở `/dieu-phoi` + `/de-xuat` đồng thời nếu phù hợp filter — KHÔNG duplicate doc. Đây là *view layer*, không phải data layer.

### Sitemap + Breadcrumb + Mã việc

```
Trang chủ › Điều hành › Điều phối công việc › [Tab] › [Mã việc]
Trang chủ › Điều hành › Đề xuất › [Tab] › [Mã việc]
Trang chủ › Tổng quan › Công việc cá nhân
```

**Mã việc**: `DPCV-YYYY-NNNN` (Điều Phối Công Việc + năm + STT auto-increment qua transaction counter). Immutable sau tạo, kể cả ADMIN. Hiển thị ở header detail, search được trong CommandPalette ("việc DPCV 42 sao chưa xong?").

### Sidebar (desktop)

```
Điều hành
├── Điều phối công việc   [ListTodo]  ← /dieu-phoi   (badge: bottleneck của tôi)
├── Đề xuất                [Inbox]    ← /de-xuat     (badge: chờ tôi duyệt)
```

Giữ thói quen icon hiện tại (tuân `feedback_ui_layout_conservative`). Badge mở rộng `useNotiCounts()` thêm key `bottleneck` + `pendingApproval`.

### BottomNavBar (mobile)

- Slot 3 = `Điều phối` → `/dieu-phoi` (GIỮ)
- Mặc định mở tab `mine-owner` trên mobile (persona TP/QLCS lướt nhanh)
- FAB `+` tạo nhanh
- 8 tab desktop → render thành **horizontal scroll chip** trên mobile
- `/de-xuat` KHÔNG có slot riêng (đã quyết 2026-06-03), truy cập qua `Khác` → sidebar

### Empty states + onboarding

- Tab `Điểm nghẽn` rỗng → "Tốt! Không có việc nào nghẽn quá 24h."
- Tab `Quá hạn` rỗng → "Mọi việc đang trong deadline."
- Lần đầu vào `/dieu-phoi`: tooltip 3 bước trỏ tới tab `Tôi phụ trách`, nút `+ Tạo điều phối`, icon filter loại

### Khác biệt với cấu trúc cũ

- BỎ tab `Liên khối` top-level riêng → gộp thành filter chip song song (query `scope='lien_khoi'`)
- BỎ entry `de-xuat` ở BottomNavBar (đã quyết)
- THÊM sub-route `/dieu-phoi/bang-dieu-khien` riêng CEO/GĐ
- THÊM mã việc `DPCV-YYYY-NNNN`

---

## 2. Database Structure

**🟡 MODIFY** · Touches: `lib/services/tasks/api-client.ts`, `lib/firebase/tasks-scope.ts`, `app/api/tasks/route.ts`, `firestore.indexes.json`, `firestore.rules`

### Quyết định: ĐỔI TÊN collection `tasks` → `coordinationTasks`

Lý do: spec mới (5 loại × 5 phạm vi × collaborators struct × waitingFor engine × escalationLog) thay đổi quá nhiều field. Migrate qua **dual-read** 1 tuần, tránh sửa schema cũ in-place (risk break sales/checklist — `feedback_no_regression`).

### Document `coordinationTasks/{taskId}`

```json
{
  "id": "DPCV-2026-0042",
  "code": "DPCV-2026-0042",

  "type": "dieu_phoi",
  "_typeEnum": "dieu_phoi | ho_tro | de_xuat | phe_duyet | canh_bao",

  "scope": "lien_khoi",
  "_scopeEnum": "phong_ban | khoi | lien_khoi | lien_co_so | du_an",

  "projectId": null,

  "title": "...",
  "goal": "...",
  "description": "...",
  "expectedDeliverable": "...",

  "ownerUid": "uid_abc",
  "ownerName": "Nguyễn Văn A",
  "ownerRole": "TP_MKT",
  "ownerBlock": "KD",

  "createdBy": "uid_xyz",
  "createdByName": "...",
  "createdByRole": "GD_KD",
  "createdByBlock": "KD",
  "createdAt": "2026-06-12T08:00:00Z",

  "assigneeBlock": "KD",
  "assigneeDeptId": "dept_mkt",
  "assigneeFacilityId": null,
  "assigneeUserIds": ["uid_abc"],

  "crossBlock": true,
  "involvedBlocks": ["KD", "VP"],
  "involvedDeptIds": ["dept_mkt", "dept_ke"],
  "involvedFacilityIds": [],

  "status": "dang_phoi_hop",
  "_statusEnum": "khoi_tao | tiep_nhan | dang_xu_ly | dang_phoi_hop | cho_phan_hoi | cho_phe_duyet | hoan_thanh | dong_ho_so",

  "priority": "high",
  "dueDate": "2026-06-20",
  "progressPct": 30,

  "collaborators": [
    {
      "id": "col_1",
      "unitType": "dept",
      "unitId": "dept_ke",
      "unitLabel": "Phòng Kế toán",
      "responsibleUid": "uid_tp_ke",
      "responsibleName": "Trần B",
      "supportContent": "Xác nhận ngân sách 50tr",
      "deliverable": "Biên bản duyệt ngân sách",
      "deadline": "2026-06-15",
      "status": "dang_thuc_hien",
      "_collabStatusEnum": "cho_xac_nhan | dang_thuc_hien | da_hoan_thanh | bi_chan",
      "updatedAt": "2026-06-13T10:00:00Z",
      "updatedBy": "uid_tp_ke"
    }
  ],

  "waitingFor": {
    "uid": "uid_tp_ke",
    "name": "Trần B (TP Kế toán)",
    "role": "TP_KE",
    "content": "Phê duyệt ngân sách",
    "since": "2026-06-11T08:00:00Z",
    "durationHours": 26,
    "computedAt": "2026-06-12T10:00:00Z"
  },

  "approvalChain": ["role:GD_KD", "role:GD_VP"],
  "approvalsCompleted": [],
  "currentApprover": "role:GD_KD",

  "escalation": {
    "currentTier": 1,
    "_tierEnum": "0=none | 1=owner@24h | 2=TP@48h | 3=GD@72h | 4=CEO@96h",
    "lastEscalatedAt": "2026-06-12T08:05:00Z",
    "nextThresholdAt": "2026-06-13T08:00:00Z"
  },

  "stuckHours": 26,
  "isBottleneck": true,
  "isOverdue": false,
  "isRed": false,

  "closure": {
    "closedAt": null,
    "closedBy": null,
    "summary": null,
    "lessonsLearned": null,
    "attachmentIds": []
  },

  "updatedAt": "2026-06-12T10:00:00Z",
  "updatedBy": "uid_abc",
  "schemaVersion": 2
}
```

### Sub-collections

| Sub-collection | Mục đích | Schema gọn |
|----------------|----------|------------|
| `comments` | Timeline (comment, status change, approval, escalation) | `{kind, uid, name, body, createdAt, meta}` |
| `attachments` | File + biên bản đóng | `{name, url, size, mime, uploadedBy, scope: 'task' \| 'collab:<id>' \| 'closure'}` |
| `escalationLog` | Log mỗi lần escalate | `{tier, escalatedAt, escalatedTo, reason, stuckHours, autoOrManual}` |
| `notiLog` (theo kind) | Cooldown noti | `{kind, lastSentAt, count24h}` |

**Quyết định**: KHÔNG tách `collaborators` ra sub-collection ở v1 — embed array vì spec giới hạn ≤10 collab/task. Re-evaluate nếu trung bình >8 collab/task sau 1 tháng.

### Indexes Firestore composite

| # | Fields | Dùng cho |
|---|--------|----------|
| 1 | `assigneeBlock ASC, status ASC, updatedAt DESC` | Tab `Tất cả` |
| 2 | `ownerUid ASC, status ASC, dueDate ASC` | Tab `Tôi phụ trách` |
| 3 | `createdBy ASC, type ASC, updatedAt DESC` | Tab `Tôi giao` |
| 4 | `crossBlock ASC, status ASC, updatedAt DESC` | Tab `Liên khối` |
| 5 | `currentApprover ASC, status ASC, updatedAt DESC` | Tab `Chờ duyệt` |
| 6 | `status ASC, dueDate ASC` | Tab `Quá hạn` |
| 7 | `isBottleneck ASC, stuckHours DESC` | Tab `Điểm nghẽn` + CEO dashboard |
| 8 | `assigneeDeptId ASC, status ASC, updatedAt DESC` | TP view |
| 9 | `assigneeFacilityId ASC, status ASC, updatedAt DESC` | QLCS view |
| 10 | `type ASC, scope ASC, updatedAt DESC` | CEO summary |
| 11 | `escalation.currentTier ASC, escalation.nextThresholdAt ASC` | Cron escalation |
| 12 | `status IN, updatedAt ASC` | Cron stuck-time computation |
| 13 | `isRed DESC, updatedAt DESC` | RED flag tracking |

Tuân `feedback_production_grade`: KHÔNG in-memory filter — mọi tab có index riêng + `limit(50)` + `orderBy`.

### Migration strategy từ `tasks` cũ

1. **Phase F.0 — Dual-read shim** (2 ngày): API GET đọc cả `tasks` + `coordinationTasks`, merge id-prefix. POST chỉ ghi `coordinationTasks`.
2. **Phase F.1 — Backfill script** (Admin SDK, idempotent):
   - `kind='assignment'` → `type='dieu_phoi'`, `kind='proposal'` → `type='de_xuat'`
   - Map status: `pending_approval`→`cho_phe_duyet`, `pending`→`tiep_nhan`, `in_progress`→`dang_xu_ly`, `requested_revision`→`cho_phan_hoi`, `done`→`hoan_thanh`, `rejected|cancelled`→`dong_ho_so`
   - `ownerUid = assigneeUserIds[0] ?? createdBy`
   - Derive `scope`: `crossBlock=true` → `lien_khoi`, etc.
   - Convert `collaboratorDeptIds + collaboratorRoles` → `collaborators[]`
   - Gán `schemaVersion=2`
3. **Phase F.2 — Dual-write 3 ngày**: cả route ghi 2 nơi, đọc 1 nơi
4. **Phase F.3 — Drop `tasks`** sau 7 ngày ổn định + snapshot backup (`feedback_safe_phased_migrations`)

---

## 3. Workflow State Machine

**🔵 NEW** · Touches: `app/api/tasks/[taskId]/status/route.ts`, `app/api/tasks/[taskId]/approve/route.ts`, `app/api/tasks/[taskId]/close/route.ts`, `app/api/cron/escalate-stuck-tasks/route.ts`

### 8 trạng thái

| Mã | Nhãn VN | Ý nghĩa | KPI |
|----|---------|---------|-----|
| `khoi_tao` | Khởi tạo | Vừa tạo, chưa ai tiếp nhận. ≤1h auto chuyển `tiep_nhan` nếu noti seen | Active |
| `tiep_nhan` | Tiếp nhận | Owner xác nhận "đã nhận" | Active |
| `dang_xu_ly` | Đang xử lý | Owner đang làm, không cần phối hợp | Active |
| `dang_phoi_hop` | Đang phối hợp | ≥1 collaborator đang work | Active |
| `cho_phan_hoi` | Chờ phản hồi | `waitingFor.uid` set. Pause SLA owner, tính SLA waitingFor | Stuck-eligible |
| `cho_phe_duyet` | Chờ phê duyệt | `currentApprover ≠ null` | Stuck-eligible |
| `hoan_thanh` | Hoàn thành | Owner mark done + collaborators all done | Done |
| `dong_ho_so` | Đóng hồ sơ | Terminal. Có biên bản. Read-only | Closed |

Hai trạng thái phụ map vào `dong_ho_so`: `rejected` (bị bác chain duyệt) + `cancelled` (creator huỷ). UI hiển thị `dong_ho_so`, `closure.reason` ghi rõ.

### Bảng transition

```
FROM             →  TO                  AI?                   ĐIỀU KIỆN
────────────────────────────────────────────────────────────────────────────────
(none)           →  khoi_tao            Creator                Tạo task hợp lệ
khoi_tao         →  tiep_nhan           Owner                  Bấm "Tiếp nhận" (auto sau 1h)
khoi_tao         →  cho_phe_duyet       SYSTEM                 approvalChain.length > 0
tiep_nhan        →  dang_xu_ly          Owner                  Bấm "Bắt đầu làm"
dang_xu_ly       →  dang_phoi_hop       SYSTEM                 ∃ collab[i].status = dang_thuc_hien
dang_xu_ly       →  cho_phan_hoi        Owner                  Set waitingFor {uid, content}
dang_xu_ly       →  cho_phe_duyet       Owner                  Submit kết quả lên approver
dang_phoi_hop    →  dang_xu_ly          SYSTEM                 ∀ collab done/bi_chan_resolved
dang_phoi_hop    →  cho_phan_hoi        Owner                  Set waitingFor
cho_phan_hoi     →  dang_xu_ly          Owner / waitingFor.uid Reply hoặc clear waitingFor
cho_phe_duyet    →  dang_xu_ly          Approver               Approve, chain còn bước
cho_phe_duyet    →  hoan_thanh          Approver               Approve bước cuối
cho_phe_duyet    →  cho_phan_hoi        Approver               Request revision
cho_phe_duyet    →  dong_ho_so          Approver               Reject
bất kỳ active    →  dong_ho_so          Creator                Cancel
hoan_thanh       →  dong_ho_so          Creator / GĐ / CEO     Nhập closure.summary + attachments
hoan_thanh       →  dang_xu_ly          GĐ / CEO               Reopen (audit log bắt buộc)
dong_ho_so       →  (none)              —                      Terminal
```

### Side-effects mỗi transition

`POST /api/tasks/[id]/status` chạy 1 transaction Firestore + sau commit fire-and-forget:

1. **Audit log**: append `comments` sub-collection với `kind` tương ứng (`status_change`, `approval`, `revision_request`, `closure`, `reopen`)
2. **Notification fan-out** (Promise.allSettled — `stability_hardening_2026_06_03`):
   - `khoi_tao` → owner + collaborators + currentApprover
   - `tiep_nhan` → creator
   - `dang_phoi_hop` → owner + creator
   - `cho_phan_hoi` → waitingFor.uid (urgency=high)
   - `cho_phe_duyet` → currentApprover
   - `hoan_thanh` → creator + GĐ khối
   - `dong_ho_so` → owner + creator + GĐ khối + (CEO nếu lien_khoi/du_an)
3. **Collaborator status sync**: nếu task chuyển `dong_ho_so` mà collab còn `dang_thuc_hien` → tự set `bi_chan` + log warning
4. **WaitingFor engine**:
   - Vào `cho_phan_hoi` / `cho_phe_duyet`: SET `waitingFor.since = now`, `durationHours = 0`
   - Out: CLEAR `waitingFor = null`
   - Cron `escalate-stuck-tasks` (30 phút/lần) recompute `stuckHours`, `isBottleneck = stuckHours >= 24`, `isOverdue = dueDate < today AND status NOT IN done,closed`
5. **Escalation tier** (cron):
   - 24h → tier 1 → push owner
   - 48h → tier 2 → push TP của owner
   - 72h → tier 3 → push GĐ khối
   - 96h → tier 4 → push CEO + ADMIN, set `isRed=true`
   - Mỗi lần append `escalationLog`, idempotent dựa `escalation.currentTier`
6. **Code generation**: counter `coordinationTasks_counters/{YYYY}` increment qua transaction
7. **Mã việc immutable**: KHÔNG cho đổi `code`, kể cả ADMIN

### Invariants (kiểu `sales_aggregation_formulas`)

| # | Invariant |
|---|-----------|
| I1 | `status = dong_ho_so` ⇒ `closure.closedAt != null` AND `closedBy != null` |
| I2 | `status = cho_phe_duyet` ⇒ `currentApprover != null` |
| I3 | `status = cho_phan_hoi` ⇒ `waitingFor.uid != null` AND `waitingFor.content != null` |
| I4 | `status = dang_phoi_hop` ⇒ ∃ `collaborators[i].status = dang_thuc_hien` |
| I5 | `isBottleneck = true` ⇔ `stuckHours >= 24` AND `status ∈ {cho_phan_hoi, cho_phe_duyet, dang_xu_ly}` |
| I6 | `progressPct = 100` ⇒ `status ∈ {hoan_thanh, dong_ho_so}` |
| I7 | `escalation.currentTier > 0` ⇒ ∃ entry trong `escalationLog` |
| I8 | Mỗi `collaborators[i].deadline <= dueDate` |
| I9 | `task.status='done'` ⇒ ∀ `collaborators[].status='done'` |
| I10 | `task.scope='lien_khoi'` ⇒ ∃ `collaborator.block ≠ task.ownerBlock` |
| I11 | `task.ownerUid != null` luôn (sau Phase 1 backfill) |
| I12 | `escalationLog.length === escalation.currentTier` |

Invariant-check script chạy nightly — log vi phạm vào `auditLogs/invariantChecks`.

---

## 4. Permission Matrix

**🟡 MODIFY** · Touches: `lib/firebase/tasks-scope.ts`, `lib/permissions.ts`, `app/api/tasks/*`, `firestore.rules`

### Quy tắc cốt lõi

1. **Owner duy nhất** — `ownerUid` = 1 người dù `assigneeUserIds` nhiều
2. **CEO/ADMIN không tự duyệt** — creator không duyệt task mình tạo. ADMIN chỉ override khi `closure.reason='system_repair'` + audit log bắt buộc
3. **GĐ override** — GĐ Khối được reopen task `hoan_thanh` → `dang_xu_ly`. GĐ KHÔNG duyệt task mình là creator/owner
4. **CEO read-all** — toàn collection. GĐ chỉ khối + cross-block. TP/QLCS theo dept/facility + tasks mình tạo
5. **Phân tách `canCreate*` theo loại** — thêm `canCreateCoordinationType(profile, type)`

### Bảng Role × Action

```
┌─────────────┬──────┬──────┬──────┬──────┬──────┬──────┬─────┬──────┬──────┬──────┐
│ Role        │ Cre  │ Cre  │ Cre  │ Cre  │ App  │ Rej  │ Req │ Nhắc │ Đóng │ Read │
│             │ ĐP   │ HT   │ ĐX   │ CB   │ rove │ ect  │ Rev │ việc │ HS   │ all  │
├─────────────┼──────┼──────┼──────┼──────┼──────┼──────┼─────┼──────┼──────┼──────┤
│ CEO         │  ✓   │  ✓   │  −   │  ✓   │  C   │  C   │  −  │  ✓   │  ✓   │  ✓   │
│ ADMIN       │  S   │  S   │  ✓   │  S   │  S   │  S   │  S  │  ✓   │  S   │  ✓   │
│ GD_KD       │  ✓K  │  ✓K  │  ✓   │  ✓   │  C   │  C   │  ✓  │  ✓   │  ✓K  │  K   │
│ GD_VP       │  ✓V  │  ✓V  │  ✓   │  ✓   │  C   │  C   │  ✓  │  ✓   │  ✓V  │  V   │
│ TP_*        │  D   │  −   │  ✓   │  D   │  C   │  C   │  ✓  │  ✓C  │  ✓K  │  D   │
│ QLCS_*      │  F   │  −   │  ✓   │  F   │  C   │  C   │  ✓  │  ✓C  │  ✓K  │  F   │
│ NV/GV/TT    │  −   │  −   │  ✓P  │  −   │  −   │  −   │  −  │  ✓C  │  −   │  M   │
│ TIBAN_TT    │  −   │  −   │  −   │  −   │  −   │  −   │  −  │  −   │  −   │  M   │
└─────────────┴──────┴──────┴──────┴──────┴──────┴──────┴─────┴──────┴──────┴──────┘

Legend: Cre ĐP=Điều phối · Cre HT=Hỗ trợ · Cre ĐX=Đề xuất · Cre CB=Cảnh báo
        ✓=all scope · ✓K/V=khối KD/VP · ✓C=mình creator/owner · ✓P=phòng_ban only
        C=match approver chain · D=dept mình · F=facility mình · K/V=block only
        M=mine only · S=system repair (ADMIN bypass + audit) · −=cấm
```

### Quy tắc theo loại điều phối

| Loại | Ai tạo | Phạm vi mặc định | Cần duyệt? |
|------|--------|------------------|------------|
| `dieu_phoi` | CEO, GĐ Khối | Bất kỳ | Không (lệnh hành chính) |
| `ho_tro` | CEO, GĐ Khối | Liên phòng/khối/CS | Không |
| `de_xuat` | ADMIN, GĐ, TP, QLCS, NV (chỉ phòng_ban) | Phòng/Khối/Liên khối | Có (chain) |
| `phe_duyet` | TP, QLCS, GĐ | Theo workflow | Có (chain bắt buộc) |
| `canh_bao` | CEO, GĐ, TP (dept mình), QLCS (cơ sở mình) | Phòng/Khối/CS | Không (alert) |

### Helper signatures mới

```ts
canCreateCoordinationType(profile, type): boolean
canCreateScope(profile, scope, type): boolean
canCloseTask(profile, task): boolean
canReopenTask(profile, task): boolean
canUpdateCollaboratorStatus(profile, task, collabId): boolean
canUpdateCollaboratorDeadline(profile, task, collabId): boolean
canSetWaitingFor(profile, task): boolean
canClearWaitingFor(profile, task): boolean
canReadEscalationLog(profile, task): boolean

// Sample
export function canApproveTask(p: CallerProfile, t: TaskForScope): boolean {
  if (isAdminSystem(p)) return true;
  if (t.createdBy === p.uid) return false;
  if (t.ownerUid === p.uid) return false;
  return matchApprover(t.currentApprover, p.uid, p.role_code);
}

export function canCloseTask(p: CallerProfile, t: TaskForScope): boolean {
  if (isCEO(p) || isAdminSystem(p)) return true;
  if (t.createdBy === p.uid || t.ownerUid === p.uid) return true;
  if (isGD(p) && getBlockOf(p.role_code) === t.assigneeBlock) return true;
  return false;
}
```

### Quy tắc đặc biệt

1. **Owner duy nhất** bắt buộc not-null. Auto = creator nếu không chọn. Chỉ creator + GĐ khối được đổi owner
2. **GĐ override** (reopen / đổi owner / đóng thay creator) → append `comments` kind='override', reason ≥10 ký tự
3. **CEO close-all** ở mọi khối/scope
4. **Approver match** giữ `matchApprover()` Phase B.7 — chain entry `user:uid` / `role:CODE`. CEO chỉ duyệt khi chính danh trong chain
5. **Nhắc việc** cooldown 4h. TP/QLCS chỉ nhắc trên task mình là creator/owner
6. **Đóng hồ sơ**: `closure.summary ≥30 ký tự` + ≥1 attachment nếu type=`phe_duyet`
7. **Cảnh báo (canh_bao)**: KHÔNG có approval chain. Lifecycle ngắn: `khoi_tao → dang_xu_ly → hoan_thanh → dong_ho_so`. Escalate gấp đôi tốc độ (12/24/36/48h)
8. **lien_co_so + du_an**: CEO/GĐ chỉ định tạo. Owner phải là QLCS hoặc TP. ADMIN không tạo
9. **Soft-delete only** — không bulk delete (đúng `feedback_safe_phased_migrations`)
10. **Audit dual-layer**: API route check + firestore.rules mirror — đúng `feedback_production_grade`

Mọi quy tắc trên có ≥1 unit test cho mỗi cell `S/C/D/F/M`.

---

## 5. Dashboard CEO — 30s Test

**🔵 NEW** · Touches: `app/(app)/dieu-phoi/dashboard/CeoDashboard.tsx`, `app/api/tasks/dashboard/ceo/route.ts`

### Mục tiêu 30 giây

CEO mở `/dieu-phoi` → trong 30 giây nắm 5 câu hỏi: việc nào tắc / tắc ở ai / khối nào chậm / cơ sở nào đỏ / việc nào cần duyệt.

### Cấu trúc 5 khối

| # | Khối | Mục đích | Action chính |
|---|------|----------|--------------|
| 1 | CẦN TÔI XỬ LÝ | 4 ô (chờ duyệt / chờ phản hồi / quá hạn / liên khối) | Click → filter list |
| 2 | TÌNH HÌNH ĐIỀU PHỐI | 5 trạng thái (donut + bar cơ sở) | Click segment → filter status |
| 3 | ĐIỂM NGHẼN | Top người/đơn vị giữ việc | Click → filter owner |
| 4 | LIÊN KHỐI KD↔VP | Pipeline cross-block | Click arrow → tab Liên khối |
| 5 | TOP VIỆC CẦN QUAN TÂM | 5 việc tắc lâu nhất | Click row → TaskDetailModal |

### Wireframe Desktop (≥1024px, 12-col grid)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Tổng quan điều phối · 12/06/2026 · [Tạo điều phối ▾] [↻]            │
├──────────────────────────────────────────────────────────────────────┤
│ KHỐI 1 — CẦN TÔI XỬ LÝ                                               │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                  │
│ │ Chờ duyệt│ │Chờ phản  │ │ Quá hạn  │ │Liên khối │                  │
│ │    8     │ │ hồi  12  │ │    5     │ │ chờ tôi 3│                  │
│ │ amber-600│ │ sky-600  │ │ rose-600 │ │violet-600│                  │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘                  │
├──────────────────────────────────────────────────────────────────────┤
│ KHỐI 2 — TÌNH HÌNH ĐIỀU PHỐI (col-span-8) │ KHỐI 3 ĐIỂM NGHẼN (col-4)│
│ Donut 5 segment + legend số tuyệt đối     │ Top người giữ việc:      │
│   • Đang xử lý     45 (37%)               │ 1. P. Đào tạo  ▮▮▮▮ 4   │
│   • Đang phối hợp  18 (15%)               │ 2. P. Nhân sự  ▮▮▮  3   │
│   • Chờ phản hồi   22 (18%)               │ 3. P. Kế toán  ▮▮   2   │
│   • Chờ duyệt       8  (7%)               │ 4. CS 24 NCT   ▮▮   2   │
│   • Hoàn thành     27 (23%)               │ 5. P. MKT      ▮    1   │
│ Bar chart phụ: theo cơ sở (5 cột HM/TK/CTT/24/TT)                    │
├──────────────────────────────────────────────────────────────────────┤
│ KHỐI 4 — LIÊN KHỐI KD↔VP (col-span-12)                               │
│ ┌──────┐ ┌──────────┐ ┌──────────┐ ┌────────┐                       │
│ │Tổng  │ │Đang xử lý│ │Chờ phản  │ │Quá hạn │                       │
│ │ 24   │ │   12     │ │ hồi  8   │ │   4    │                       │
│ └──────┘ └──────────┘ └──────────┘ └────────┘                       │
│ Strip arrow: KD ──→ VP (15)  VP ──→ KD (9)                          │
├──────────────────────────────────────────────────────────────────────┤
│ KHỐI 5 — TOP VIỆC CẦN QUAN TÂM (5 dòng, sort waitingHours DESC)     │
│ ┌──────────────────────┬──────────────┬─────────────┬──────────────┐ │
│ │ Công việc            │ Đang chờ ai  │ Chờ gì      │ Đã chờ       │ │
│ ├──────────────────────┼──────────────┼─────────────┼──────────────┤ │
│ │ Duyệt KPI Q3 2026    │ TP_NS Hà     │ Phê duyệt   │ 96h ●●●●     │ │
│ │ Hợp đồng cơ sở 24    │ TP_KE Linh   │ Phản hồi    │ 72h ●●●      │ │
│ │ Triển khai app mới   │ P. Đào tạo   │ Bàn giao GV │ 48h ●●       │ │
│ └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### Backend payload

```json
GET /api/tasks/dashboard?role=CEO

{
  "actionNeeded": { "pendingApproval": 8, "pendingResponse": 12, "overdue": 5, "crossBlockWaiting": 3 },
  "coordination": { "in_progress": 45, "being_coordinated": 18, "waiting_response": 22, "waiting_approval": 8, "done": 27 },
  "bottlenecks": [
    { "holderId": "dept_dt", "holderName": "P. Đào tạo", "holderType": "dept", "count": 4, "avgWaitHours": 62 }
  ],
  "crossBlock": { "total": 24, "inProgress": 12, "waitingResponse": 8, "overdue": 4, "kdToVp": 15, "vpToKd": 9 },
  "topWatch": [ { "taskId":"...", "title":"...", "waitingForName":"...", "waitingForContent":"...", "waitingHours":96 } ]
}
```

### Bộ quy tắc màu

- Tắc <24h → slate · 24–48h → amber · 48–72h → orange · ≥72h → rose pulse
- Cơ sở đỏ = ≥3 task overdue HOẶC 1 task ≥72h
- Click KHỐI 1 card → set tab + scroll list; KHỐI 3 row → filter `owner=holderId`; KHỐI 5 row → mở TaskDetailModal

### 30s test acceptance

1. Việc nào tắc → KHỐI 5 dòng đầu (sort waitingHours DESC)
2. Tắc ở ai → cột "Đang chờ ai" KHỐI 5 + KHỐI 3 ranking
3. Khối nào chậm → KHỐI 2 donut (segment lớn nhất)
4. Cơ sở nào đỏ → KHỐI 2 bar chart phụ (cột rose)
5. Việc cần duyệt → KHỐI 1 card "Chờ duyệt"

**Measurement**: 5 CEO sessions, ≥4 verbalize đủ 5 info trong ≤30s. p95 dashboard load < 2s.

---

## 6. Dashboard Giám đốc Khối (KD + VP)

**🔵 NEW** · Touches: `app/(app)/dieu-phoi/dashboard/GdKdDashboard.tsx`, `GdVpDashboard.tsx`, `app/api/tasks/dashboard/gd/route.ts`

### 6.1 Dashboard GD_KD

**Phạm vi**: block KD (TP_MKT/DT/KT + QLCS_HM/TK/CTT/24/TT) + việc liên khối có chân ở KD.

```
┌──────────────────────────────────────────────────────────────────────┐
│ GĐ Kinh doanh · Tổng quan điều phối                                  │
├──────────────────────────────────────────────────────────────────────┤
│ KHỐI A — TÔI CẦN PHÊ DUYỆT (col-span-12)                             │
│ Preview top 5 đề xuất chờ tôi (sort priority DESC + waitingHours)   │
│ ┌─────────────────────────────────────────────┬──────────┬────────┐ │
│ │ Tiêu đề · Người gửi · Loại                  │ Đã chờ   │ Action │ │
│ ├─────────────────────────────────────────────┼──────────┼────────┤ │
│ │ Mở thêm lớp Sale CTT · TP_DT · Đề xuất      │ 18h      │ Mở    │ │
│ │ Đổi giáo trình PT 24 · TP_DT · Đề xuất      │ 6h       │ Mở    │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│ [Xem tất cả 12 →]                                                    │
├──────────────────────────────────────────────────────────────────────┤
│ KHỐI B — Heatmap phòng × cơ sở (col-span-8)  │ KHỐI C Liên khối (4) │
│           HM   TK   CTT  24N  TT             │ KD → VP: 8           │
│ MKT      ░    ▒    ▓    ▒    ░               │ VP → KD: 5           │
│ Đào tạo  ▒    ▓    █    ▒    ░               │ Đang chờ phản hồi: 4 │
│ Kỹ thuật ░    ░    ▒    ▒    ░               │ Quá hạn liên khối: 1 │
│ QLCS     ▒    ▓    █    ▓    ▒               │ [Mở tab Liên khối →] │
│  ░=0–1  ▒=2–3  ▓=4–6  █=7+                   │                      │
├──────────────────────────────────────────────────────────────────────┤
│ KHỐI D — KPI phòng ban KD (4 cột MKT/ĐT/KT/QLCS)                     │
│ ┌───────────┬───────────┬───────────┬───────────┐                    │
│ │ MARKETING │ ĐÀO TẠO   │ KỸ THUẬT  │ QLCS (×5) │                    │
│ │ Open 12   │ Open 18   │ Open  9   │ Open 22   │                    │
│ │ Done 8    │ Done 14   │ Done  6   │ Done 19   │                    │
│ │ Overdue 2 │ Overdue 1 │ Overdue 0 │ Overdue 3 │                    │
│ │ Avg wait  │ Avg wait  │ Avg wait  │ Avg wait  │                    │
│ │   18h     │   42h ●   │   12h     │   28h     │                    │
│ └───────────┴───────────┴───────────┴───────────┘                    │
├──────────────────────────────────────────────────────────────────────┤
│ KHỐI E — Điểm nghẽn trong khối KD (top 5)                            │
└──────────────────────────────────────────────────────────────────────┘
```

**Heatmap rule**: Cell color = `open_count + overdue_count × 2`. Bucket 0–1=slate-50, 2–3=amber-200, 4–6=orange-400, 7+=rose-600. Tooltip: '{dept} × {facility}: {open} đang mở, {overdue} quá hạn, {avgH}h trung bình'. Click → filter `dept={x}&facility={y}`.

### 6.2 Dashboard GD_VP

**Phạm vi**: block VP (TP_NS/KE/GS) + việc liên khối có chân ở VP. Khác GD_KD: **KHÔNG có cơ sở** (5 cơ sở thuộc KD). Heatmap đổi sang **theo loại điều phối**.

```
┌──────────────────────────────────────────────────────────────────────┐
│ GĐ Văn phòng · Tổng quan điều phối                                   │
├──────────────────────────────────────────────────────────────────────┤
│ KHỐI A — TÔI CẦN PHÊ DUYỆT (giống GD_KD)                             │
├──────────────────────────────────────────────────────────────────────┤
│ KHỐI B — KPI 3 phòng VP (col-span-12, 3 cột)                         │
│ ┌─────────────────┬─────────────────┬─────────────────┐              │
│ │ NHÂN SỰ         │ KẾ TOÁN         │ GIÁM SÁT        │              │
│ │ Open       9    │ Open      14    │ Open       6    │              │
│ │ Đang phối hợp 3 │ Đang phối hợp 5 │ Đang phối hợp 2 │              │
│ │ Chờ phản hồi 2  │ Chờ phản hồi 4  │ Chờ phản hồi 1  │              │
│ │ Quá hạn    1    │ Quá hạn   2 ●   │ Quá hạn    0    │              │
│ │ Avg wait 24h    │ Avg wait 36h    │ Avg wait 14h    │              │
│ │ Trend ↗ +18%    │ Trend → 0%      │ Trend ↘ −12%    │              │
│ └─────────────────┴─────────────────┴─────────────────┘              │
├──────────────────────────────────────────────────────────────────────┤
│ KHỐI C — Heatmap PHÒNG × LOẠI ĐIỀU PHỐI (col-span-8) │ KHỐI D LK (4)│
│              Đphối Hỗ trợ Đxuất Phê.d Cảnh báo      │ VP → KD: 7   │
│ Nhân sự       ▒     ▓      ░     ▒     ░            │ KD → VP: 11  │
│ Kế toán       ▓     ░      ▒     █     ▒            │ Quá hạn LK: 2│
│ Giám sát      ░     ▒      ░     ░     █            │              │
├──────────────────────────────────────────────────────────────────────┤
│ KHỐI E — Điểm nghẽn VP (top 5)                                       │
├──────────────────────────────────────────────────────────────────────┤
│ KHỐI F — Lịch deadline tuần (7 ngày tới)                             │
│   T2  T3  T4  T5  T6  T7  CN                                         │
│   ●●  ●   ●●● ●   ●●  ●   ─                                          │
│   2   1   3   1   2   1   0                                          │
└──────────────────────────────────────────────────────────────────────┘
```

KHỐI F dot màu = priority. Hover → list 3 task gần nhất. Click ngày → filter `dueDate={date}`. KPI trend so 7 ngày trước (snapshot daily) — phase 1 có thể bỏ.

### Payload GD

```json
GET /api/tasks/dashboard?role=GD_KD

{
  "pendingApproval": { "total": 12, "top5": [...] },
  "heatmap": [{ "deptId":"dept_mkt", "facilityId":"fac_hm", "open":1, "overdue":0, "avgWaitHours":12 }],
  "deptKpi": [{ "deptId":"dept_mkt", "open":12, "done":8, "overdue":2, "avgWaitHours":18 }],
  "crossBlock": { "kdToVp":8, "vpToKd":5, "waitingResponse":4, "overdue":1 },
  "bottlenecks": [...]
}
```

Cache 60s theo `caller.uid`. Server-side aggregation trong `/api/tasks/dashboard/gd`. Không expose dữ liệu khối khác ngoài pipeline liên khối.

---

## 7. Dashboard Trưởng phòng (TP / QLCS)

**🔵 NEW** · Touches: `app/(app)/dieu-phoi/dashboard/TpDashboard.tsx`, `app/api/tasks/dashboard/tp/route.ts`

**Phạm vi TP**: scope phòng + việc cá nhân assigned. Dùng chung cho QLCS (scope cơ sở thay vì phòng).

```
┌──────────────────────────────────────────────────────────────────────┐
│ TP Nhân sự · Tổng quan công việc phòng                               │
├──────────────────────────────────────────────────────────────────────┤
│ KHỐI 1 — 4 KPI HÀNH ĐỘNG (col-span-12)                               │
│ ┌─────────────┬─────────────┬─────────────┬─────────────┐            │
│ │ Chờ tôi     │ Chờ phản hồi│ Quá hạn     │ Đề xuất chờ │            │
│ │ xử lý  6    │   5         │   3 ●●●     │ tôi gửi  2  │            │
│ │ amber-600   │ sky-600     │ rose-600    │ violet-600  │            │
│ └─────────────┴─────────────┴─────────────┴─────────────┘            │
├──────────────────────────────────────────────────────────────────────┤
│ KHỐI 2 — VIỆC PHÒNG TÔI (col-span-8)   │ KHỐI 3 Mini-calendar (4)   │
│ Pie 5-segment                          │  Deadline 7 ngày tới        │
│  • Đang xử lý     12 (50%)             │   T2  T3  T4  T5  T6  T7 CN │
│  • Đang phối hợp   4 (17%)             │   ●●  ─   ●   ●●  ●  ●  ─   │
│  • Chờ phản hồi    3 (12%)             │   2  0   1   2   1  1  0   │
│  • Chờ duyệt       2 (8%)              │   Click ngày → filter       │
│  • Hoàn thành      3 (13%)             │                             │
├──────────────────────────────────────────────────────────────────────┤
│ KHỐI 4 — ĐỀ XUẤT (col-span-12)                                       │
│ ┌────────────────────────┬──────────────────────────────┐            │
│ │ ĐỀ XUẤT TÔI GỬI LÊN    │ ĐỀ XUẤT NHÂN VIÊN GỬI LÊN    │            │
│ │  • Chờ GD_VP duyệt: 2  │  • Tôi cần duyệt: 4         │            │
│ │  • Chờ CEO duyệt:   1  │  • Đã duyệt tuần này: 7     │            │
│ │  • Đã duyệt:        5  │  • Đã từ chối tuần này: 1   │            │
│ │ [Xem tab Tôi giao →]   │ [Xem tab Chờ duyệt →]       │            │
│ └────────────────────────┴──────────────────────────────┘            │
├──────────────────────────────────────────────────────────────────────┤
│ KHỐI 5 — ĐIỂM NGHẼN TRONG PHÒNG (top 5 NV giữ việc)                  │
│ 1. NV Hà    ▮▮▮▮ 4 việc (avg 48h)                                   │
│ 2. NV Nam   ▮▮▮  3 việc (avg 32h)                                   │
└──────────────────────────────────────────────────────────────────────┘
```

### KHỐI 1 logic

- **Chờ tôi xử lý**: status IN ('received','in_progress','being_coordinated') AND assignee=me
- **Chờ phản hồi**: status='waiting_response' AND (assignee=me OR collaboratorUid=me)
- **Quá hạn**: dueDate<today AND status open AND (assignee=me OR dept=myDept). Pulse rose nếu ≥3
- **Đề xuất chờ tôi gửi**: type='de_xuat' AND createdBy=me AND status='cho_phe_duyet'

### Mobile (TP)

4 KPI → 2×2 grid. KHỐI 2 pie compact 60×60px. KHỐI 3 calendar scrollable horizontal. KHỐI 4 thành 2 collapsible card. KHỐI 5 full width.

### QLCS variant

Đổi scope từ `deptId=myDept` sang `facilityId=myFacility`. KHỐI 5 rank theo nhân viên cơ sở. KHỐI 4 ẩn cột phải nếu QLCS không có cấp dưới đề xuất.

---

## 8. Danh sách điều phối — Table + Filters

**🟡 MODIFY** · Touches: `app/(app)/dieu-phoi/DieuPhoiClient.tsx`, `components/TaskListTable.tsx`, `TaskFilterBar.tsx`, `TaskListCard.tsx`

### 8 TAB chính

| # | Tab | Filter backend | Badge |
|---|-----|---------------|-------|
| 1 | Tất cả | scope theo `canReadTask` | tổng task open |
| 2 | Tôi phụ trách | `assigneeUserIds CONTAINS me` AND status open | count |
| 3 | Tôi giao | `createdBy = me` | count |
| 4 | Liên khối | `crossBlock = true` AND chân ở scope tôi | hide nếu không role |
| 5 | Chờ phản hồi | `status = waiting_response` AND (assignee=me OR collab=me) | count |
| 6 | Chờ duyệt | `status = waiting_approval` AND `currentApprover = me` | amber badge |
| 7 | Quá hạn | `dueDate < today` AND status open | rose badge |
| 8 | Điểm nghẽn | `stuckHours >= 24` AND status open | role TP+ only |

Tab 6, 7, 8 **MỚI**. Tab 1 **MỚI**. Giữ 5 tab cũ.

### Filter row

```
┌─────────────────────────────────────────────────────────────────────┐
│ [Loại ▾]  [Khối ▾]  [Trạng thái ▾]  [Phạm vi ▾]  [Ưu tiên ▾]       │
│ 🔍 Tìm theo tiêu đề / chủ trì / phối hợp...                        │
└─────────────────────────────────────────────────────────────────────┘
```

- **Loại**: 5 chip multi-select
- **Khối**: KD / VP / Liên khối — single
- **Trạng thái**: 8 workflow states — multi chip
- **Phạm vi**: 5 chip multi
- **Ưu tiên**: Thấp / TB / Cao — multi
- Search debounce 300ms, full-text title + ownerName + collaboratorNames
- URL sync `?tab=overdue&type=approval&block=KD` để share link

### Table desktop

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ Công việc        │ Loại  │ Chủ trì  │ Phối hợp │ Đang chờ   │ Deadline │ TT │ Ưu │
├────────────────────────────────────────────────────────────────────────────────────┤
│ ▸ Duyệt KPI Q3   │ Phê.d │ TP_NS Hà │ —        │ TP_NS · 96h│ 15/06    │ ●  │ 🔴 │
│   #DPCV-2026-128 │       │          │          │ rose pulse │          │    │    │
│ ▸ Triển khai app │ Đphối │ TP_DT An │ MKT, KT  │ P.MKT · 48h│ 20/06    │ ▷  │ 🟡 │
│ ▸ Mở lớp PT 24   │ Đxuất │ QLCS_24  │ ĐT, NS   │ GD_KD · 12h│ 18/06    │ ⏳ │ 🟡 │
│ ▸ Cảnh báo doanh │ Cbáo  │ GD_KD    │ —        │ QLCS_CTT·6h│ 14/06    │ ❗ │ 🔴 │
│ ▸ Hỗ trợ tuyển GV│ Hỗ.tr │ TP_NS    │ ĐT       │ TP_DT · 18h│ 22/06    │ ▷  │ 🟢 │
└────────────────────────────────────────────────────────────────────────────────────┘
  [< Trước]  Trang 1 / 4  [Sau >]   ·   Hiển thị 25 / 96 việc   ·   [25 ▾]
```

### Cột chi tiết

| Cột | Width | Content | Tương tác |
|-----|-------|---------|-----------|
| Công việc | 28% | Title + #DPCV + scope badge | Click → DetailModal |
| Loại | 8% | Pill 5 màu (sky/emerald/violet/amber/rose) | Click → filter type |
| Chủ trì | 14% | Avatar 24px + tên ngắn | Click → filter owner |
| Phối hợp | 14% | Chip stack tối đa 3 + '+N' | Hover → tooltip full |
| Đang chờ | 14% | 'Tên · Xh' | Hover → 'Đang chờ {name} {content} từ {time}' |
| Deadline | 10% | dd/mm + relative '(còn 2 ngày)' rose nếu <24h | — |
| Trạng thái | 6% | Icon 8 trạng thái | Hover → tên |
| Ưu tiên | 6% | Dot 3 màu | — |

### Empty + Skeleton

- Tab `Quá hạn` empty: '✓ Không có việc quá hạn' emerald-600
- Tab `Chờ duyệt` empty: '✓ Bạn không còn đề xuất nào chờ duyệt' emerald-600
- Skeleton: 5 row table placeholder `bg-slate-100 h-12 rounded`, lock height 480px để tránh CLS. Tab badge hiện '…' khi tải

### Sort & Pagination

- Default sort: tab Quá hạn/Điểm nghẽn → waitingHours DESC. Khác → updatedAt DESC
- Click header column → toggle ASC/DESC
- Pagination cursor-based `lastUpdatedAt + lastId` (Firestore startAfter). Limit [25, 50, 100]

### Backend GET /api/tasks

```
?mode=all|assigned|created|pending_approval|cross_block|waiting_response|waiting_approval|overdue|bottleneck
&type=coordination,support,proposal,approval,alert
&scope=dept,block,cross_block,cross_facility,project
&block=KD|VP
&priority=high,medium,low
&search=...
&cursor=...
&limit=25
```

8 mode tương ứng 8 tab. `overdue` + `bottleneck` MỚI — cần composite index `(status, dueDate)` + `(isBottleneck, stuckHours)`.

### Tương thích module cũ

Giữ Sidebar `/giao-viec` redirect → `/dieu-phoi` (Phase 4). `/de-xuat` dùng chung component table với `type=proposal` pre-applied. KHÔNG xoá DeXuatClient — refactor reuse `TaskListTable` mới. Tuân Sales Module FROZEN — không đụng `/doanh-so`.

---

## 9. Chi tiết điều phối — Layout 3 cột

**🟡 MODIFY** · Touches: `app/(app)/dieu-phoi/TaskDetailModal.tsx`, `app/(app)/dieu-phoi/[taskId]/page.tsx`

Nâng từ Modal sang trang riêng `/dieu-phoi/{id}` (modal vẫn dùng cho quick-preview ở list). 3 cột trả lời đúng 4 câu hỏi: trái=Owner, giữa=Collaboration, phải=Waiting-for + Status.

### Wireframe Desktop (≥1280px)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ← Quay lại    [#DPCV-2026-128]  Mở lớp hè Toán nâng cao         [⋮ Menu]  │
│ ────────────────────────────────────────────────────────────────────────── │
│ [Điều phối]  [Liên khối]  [Cao]   ⏱ Hạn: 30/06/2026   TT: Đang phối hợp  │
├──────────────────┬─────────────────────────────┬───────────────────────────┤
│ CỘT 1 — INFO     │ CỘT 2 — COLLAB (cards)      │ CỘT 3 — ĐIỂM NGHẼN        │
│                  │                             │                           │
│ Chủ trì          │  ┌──── Phòng MKT ─────────┐ │ ⚠ Đang chờ:               │
│ Khối KD          │  │ 👤 Trần V. C — TP_MKT  │ │  Phòng MKT                │
│ P. Đào tạo       │  │ Nội dung: thiết kế     │ │ Chờ: poster + caption     │
│                  │  │   poster + caption     │ │ Đã chờ: 32 giờ            │
│ 👑 Owner         │  │ Bàn giao: 3 poster A3  │ │                           │
│ Nguyễn V. A      │  │ Hạn: 25/06             │ │ [⏰ Nhắc việc]            │
│ TP_DT • KD       │  │ ● Đang xử lý  60%      │ │ (cooldown 4h)             │
│                  │  │ [Cập nhật] [Đã xong]   │ │                           │
│ Hạn chót         │  └────────────────────────┘ │ ─────────────────────── │
│ 30/06/2026       │  ┌──── Cơ sở 24 NCT ──────┐ │ Escalation timer:         │
│ (còn 18 ngày)    │  │ 👤 Lê T. D — QLCS_24   │ │ 24h → Owner ✓ noti       │
│                  │  │ Nội dung: chuẩn bị     │ │ 48h → TP MKT ⏳ 16h     │
│ Ưu tiên: Cao     │  │   phòng học + bàn ghế  │ │ 72h → GĐ KD             │
│ Loại: Điều phối  │  │ Hạn: 28/06             │ │ 96h → CEO               │
│ Phạm vi: Liên   │  │ ● Chờ tiếp nhận         │ │                           │
│   khối           │  │ [Nhận] [Từ chối]        │ │ ─────────────────────── │
│                  │  └────────────────────────┘ │ Tiến độ chung             │
│ Tạo bởi          │                             │ ████████░░░░ 65%         │
│ Trần T. B         │  [+ Thêm đơn vị phối hợp]   │  (TB collaborators)       │
│ TP_DT • 12/06    │                             │                           │
├──────────────────┴─────────────────────────────┴───────────────────────────┤
│  📜 TIMELINE & BÌNH LUẬN                                                    │
│  ● 12/06 14:30 — Trần T. B tạo điều phối                                    │
│  ● 12/06 14:32 — Phòng MKT tiếp nhận (Trần V. C)                            │
│  ● 12/06 16:00 — Cập nhật trạng thái: Đang phối hợp                         │
│  ● 13/06 09:00 — 💬 Trần V. C: "Cần thêm brief về tone…"                    │
│  ● 13/06 21:30 — ⏰ Hệ thống nhắc: 24h chưa cập nhật                        │
│  [💬 Viết bình luận…………………] [Gửi]                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Cột 1 — Info (sticky)

- Chủ trì block + đơn vị (icon khối KD/VP)
- 👑 Owner card — avatar lớn + tên + role + chat icon (mở chat 1-1)
- Hạn chót với badge `còn N ngày` (đỏ nếu <2 ngày, cam nếu <5)
- Ưu tiên / Loại / Phạm vi — chip nhỏ
- Tạo bởi / ngày tạo / ngày cập nhật

### Cột 2 — Collaboration cards (scrollable)

Mỗi card = 1 `<CollaboratorCard>` với 6 field spec + 2 nút:
- **Cập nhật** → mini-form (status + % + comment)
- **Đã xong** → confirm modal → set `status=done`, audit, noti Owner
- Owner thấy badge tiến độ tổng (TB) tự động
- Collab quá hạn riêng → card viền đỏ + chip `Quá hạn`

### Cột 3 — Waiting-for + Escalation

- **WaitingForBanner** đỏ/cam tuỳ thời gian
- 3 dòng spec: Đang chờ ai / nội dung gì / bao lâu
- Nút Nhắc việc dùng logic 4h cooldown + 24h threshold
- **Escalation timer**: 4 tier 24/48/72/96h với ✓ (đã noti) / ⏳ (countdown) / ○ (chưa tới)
- **Tiến độ chung** = avg(collaborator.progress)

### Hành động ở header `[⋮ Menu]`

- Đóng hồ sơ (Owner/CEO khi `status=hoan_thanh`)
- Chuyển Owner (CEO/GĐ)
- Reopen (GĐ/CEO khi `status in {hoan_thanh, dong_ho_so}`)
- Huỷ điều phối (creator + `status=khoi_tao`)
- Xuất PDF báo cáo

### Responsive breakpoints

- ≥1280px: 3 cột (4/5/3 grid units)
- 768-1279px: 2 cột (info + collab), cột 3 collapse thành accordion trên top
- <768px: stack → xem section 12 (Mobile)

---

## 10. Form tạo điều phối — Wizard 3 bước

**🟡 MODIFY** · Touches: `app/(app)/dieu-phoi/TaskCreateModal.tsx`, `lib/services/tasks/api-client.ts`

Form 3 section trả lời đủ 4 câu hỏi spec (Owner / Status / Waiting For / Collaboration). Bắt được **5 loại × 5 phạm vi × 1 Owner duy nhất × collaborator có cấu trúc (6 field bắt buộc)**.

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Tạo điều phối mới                                         [X]   │
├─────────────────────────────────────────────────────────────────┤
│ ┌─ Bước 1/3 ─ THÔNG TIN CHUNG ─────────────────────────────────┐ │
│ │ Tiêu đề*    [____________________________________________]   │ │
│ │ Mô tả       [____________________________________________]   │ │
│ │ Kết quả     [____________________________________________]   │ │
│ │ bàn giao*                                                    │ │
│ │                                                              │ │
│ │ Loại điều phối*  (5 chip — chọn 1)                           │ │
│ │  [Điều phối] [Hỗ trợ] [Đề xuất] [Phê duyệt] [Cảnh báo]       │ │
│ │   emerald    sky      violet    amber       rose             │ │
│ │                                                              │ │
│ │ Phạm vi*  (5 chip — chọn 1)                                  │ │
│ │  [Phòng ban] [Khối] [Liên khối] [Liên cơ sở] [Dự án]         │ │
│ │                                                              │ │
│ │ Ưu tiên   [Thấp] [Trung bình] [Cao]   Deadline [_________]   │ │
│ └──────────────────────────────────────────────────────────────┘ │
│ ┌─ Bước 2/3 ─ CHỦ TRÌ (Owner) ─────────────────────────────────┐ │
│ │ Khối     ( ) KD   ( ) VP   ( ) Liên khối                     │ │
│ │ Đơn vị   [Dropdown phòng ban / cơ sở ▾]                      │ │
│ │ Owner*   ◉ Nguyễn V. A  ○ Trần T. B  ○ Lê V. C  (radio!)     │ │
│ │ ⚠ Chỉ chọn 1 người duy nhất chịu trách nhiệm end-to-end       │ │
│ └──────────────────────────────────────────────────────────────┘ │
│ ┌─ Bước 3/3 ─ ĐƠN VỊ PHỐI HỢP ─────────────────────────────────┐ │
│ │  [+ Thêm đơn vị phối hợp]                                    │ │
│ │ ┌─ Phối hợp #1 ────────────────────────── [Xoá] ────┐         │ │
│ │ │ Đơn vị*          [Phòng MKT ▾]                    │         │ │
│ │ │ Người phụ trách* [Trần V. C — TP_MKT ▾]           │         │ │
│ │ │ Nội dung hỗ trợ* [thiết kế poster + caption_____] │         │ │
│ │ │ Kết quả bàn giao*[3 mẫu poster A3 + 5 caption___] │         │ │
│ │ │ Deadline riêng*  [2026-06-25]                     │         │ │
│ │ │ Trạng thái       Chờ tiếp nhận (auto)             │         │ │
│ │ └───────────────────────────────────────────────────┘         │ │
│ └──────────────────────────────────────────────────────────────┘ │
│  File đính kèm [📎 Chọn file]                                    │
├─────────────────────────────────────────────────────────────────┤
│ [Huỷ]                              [Lưu nháp] [Tạo điều phối →] │
└─────────────────────────────────────────────────────────────────┘
```

### Payload schema

```json
{
  "title": "string (required, max 200)",
  "description": "string",
  "expectedDeliverable": "string (required)",
  "coordinationType": "dieu_phoi|ho_tro|de_xuat|phe_duyet|canh_bao",
  "scope": "phong_ban|khoi|lien_khoi|lien_co_so|du_an",
  "priority": "low|normal|high",
  "dueDate": "ISO date",
  "ownerBlock": "KD|VP",
  "ownerDeptId": "string|null",
  "ownerFacilityId": "string|null",
  "ownerUid": "string (required, single person)",
  "collaborators": [{
    "unitKind": "dept|facility",
    "unitId": "string (required)",
    "responsibleUid": "string (required)",
    "supportContent": "string (required, min 10)",
    "deliverable": "string (required)",
    "deadline": "ISO date (required)",
    "status": "cho_xac_nhan"
  }]
}
```

### Validation rules

- `title.length >= 5`
- `expectedDeliverable.length >= 10`
- `coordinationType !== null && scope !== null`
- `ownerUid !== null && ownerUid !== currentUser.id` (trừ scope=phong_ban)
- Mỗi collaborator: 6 field bắt buộc — server 422 nếu thiếu
- `collaborator.deadline <= task.dueDate`
- `coordinationType=phe_duyet` → ≥1 collaborator role TP/GD
- `scope=lien_khoi` → owner + ≥1 collaborator khác khối

### UX rules

- **Step indicator** top: 1/3 → 2/3 → 3/3, click jump
- **Auto-save draft** mỗi 10s vào localStorage (`task-draft-{uid}`)
- **Owner radio** thay multi-select — fix gap accountability
- **Type chip + Scope chip** tooltip giải thích khi hover
- Sau Lưu: redirect `/dieu-phoi/{id}` (không quay về list)
- Mobile: 3 step thành 3 màn full-screen swipe ngang

---

## 11. Notification Engine + Escalation 4 cấp

**🟡 MODIFY** Engine + **🔵 NEW** Escalation · Touches: `lib/firebase/task-notifications.ts`, `push-notifications.ts`, `in-app-noti.ts`, `app/api/cron/send-reminders/route.ts`, `app/api/cron/escalate-stuck-tasks/route.ts`, `lib/firebase/task-escalation.ts`

### 11.1 Nguyên tắc — "Chỉ push khi người nhận PHẢI hành động"

Mọi noti phải trả lời "Tôi mở app để LÀM gì?". Nếu không có action → chỉ ghi `inAppNotifications`, không push. Quy tắc này chấm dứt FCM spam Phase 13.x.

### Ma trận trigger push (canonical)

| Event | Người nhận | Lý do | Cooldown | Kind |
|---|---|---|---|---|
| Owner mới được giao | `owner` | Tiếp nhận / lên kế hoạch | none | `task_owner_assigned` |
| Collaborator mới | `collab.responsibleUid` | Đọc nội dung, set deadline | none | `task_collab_assigned` |
| Đề xuất cần duyệt | `currentApprover` | Bấm duyệt/từ chối | 4h/task | `task_pending_approval` |
| Có phản hồi chờ Owner | `owner` | Đọc + đẩy task qua bước kế | 4h/task | `task_waiting_owner` |
| Collaborator giao kết quả | `owner` | Tiếp nhận deliverable | none | `task_collab_delivered` |
| Quá hạn (T+0) | `owner` + cc TP | Báo cáo / xin gia hạn | 24h/task | `task_overdue` |
| Reminder D-3 | `owner` + collab có deadline | Chuẩn bị | 1 lần/deadline | `task_deadline_d3` |
| Reminder D-1 | `owner` + collab có deadline | Hoàn thiện gấp | 1 lần/deadline | `task_deadline_d1` |
| Escalation L1/L2/L3/L4 | xem 11.2 | — | xem dưới | `task_escalation_L{n}` |

**KHÔNG push**: status change `pending → in_progress` (chỉ timeline), comment thường (chỉ nếu @mention), view event.

### Cooldown chống spam (đa tầng)

1. **Per (task, kind)**: 4h — lưu `tasks/{id}/notiLog/{kind}`
2. **Per task cap 24h**: max **6 noti**/task/24h cho cùng user. Vượt → chỉ inAppNotifications
3. **Per user cap 24h**: max **40 task-noti**/user/24h. Vượt → digest evening-summary
4. **Quiet hours**: 22:00–06:00 VN → ngoại trừ `task_overdue` + L3/L4 + `alert`, defer tới 06:00

### Payload FCM data-only (chuẩn iOS PWA)

```json
{
  "data": {
    "taskId": "DPCV-2026-0042",
    "kind": "task_collab_assigned",
    "coordType": "support",
    "scope": "cross_block",
    "waitingForUid": "uid_TP_DT",
    "waitingForWhat": "Duyệt mẫu hợp đồng v3",
    "stuckHours": "0",
    "escalationLevel": "0",
    "deepLink": "/dieu-phoi/DPCV-2026-0042?focus=collab",
    "tag": "task-DPCV-2026-0042-collab"
  },
  "webpush": { "headers": { "Urgency": "high", "TTL": "86400" } },
  "apns": { "headers": { "apns-priority": "10" } }
}
```

Dual-write `inAppNotifications/{uid}/items` (Promise.allSettled). Schema thêm `actionRequired: true` để client filter badge "Cần làm".

### Title template (5 loại)

- `coordination` → `📌 Điều phối:`
- `support` → `🤝 Hỗ trợ:`
- `proposal` → `📥 Đề xuất:`
- `approval` → `✅ Duyệt:`
- `alert` → `⚠️ Cảnh báo:` (luôn bypass quiet hours)

### Reminder cron (D-1 / D-3 / Quá hạn)

Đổi từ 5 phút → **30 phút**. Field `reminderSentDates: string[]` idempotent — D-1/D-3/overdue mỗi cái fire **1 lần duy nhất**.

```ts
const tasks = await db.collection('coordinationTasks')
  .where('status', 'in', ['tiep_nhan','dang_xu_ly','dang_phoi_hop','cho_phan_hoi','cho_phe_duyet'])
  .where('dueDate', '<=', new Date(now + 4*24*3600_000))
  .limit(500).get();

for (const t of tasks.docs) {
  const due = t.data().dueDate.toMillis();
  const daysLeft = (due - now) / 86400_000;
  const sent: string[] = t.data().reminderSentDates ?? [];

  if (daysLeft <= -0.5 && !sent.includes('overdue')) { await pushOverdue(...); markSent(t.ref, 'overdue'); }
  else if (daysLeft <= 1 && daysLeft > -0.5 && !sent.includes('D1')) { await pushReminder(..., 'd1'); markSent(t.ref, 'D1'); }
  else if (daysLeft <= 3 && daysLeft > 1 && !sent.includes('D3')) { await pushReminder(..., 'd3'); markSent(t.ref, 'D3'); }

  // Per-collaborator deadlines
  for (const collab of t.data().collaborators ?? []) {
    if (collab.status === 'da_hoan_thanh') continue;
    // ... same logic per collab with key `collab:${collab.id}:D1` etc.
  }
}
```

### 11.2 Escalation Engine 4 cấp

Thay thế manual nudge bằng **automated escalation ladder** — bấm nhắc thay user theo bậc thang quyền lực.

### Bậc thang

| Level | Trigger (`stuckHours`) | Người nhận | Hành động | Title |
|-------|------------------------|-----------|-----------|-------|
| L0 | <24h | (không) | (không) | — |
| L1 | ≥24h | Owner HOẶC `collab.responsibleUid` đang giữ | Push + comment kind=`escalation_l1` | `🟡 Nhắc lần 1: <title>` |
| L2 | ≥48h | TP/QLCS của người giữ + CC owner | Push + comment + `escalated=true` | `🟠 Nhắc cấp 2: TP <name> cần xử lý` |
| L3 | ≥72h | GĐ khối + CC TP + owner | Push + ghi `escalationLog` | `🔴 Nhắc cấp 3: <Khối> tắc` |
| L4 | ≥96h | CEO + ADMIN + CC GĐ | Push (bypass quiet hours) + `task.isRed=true` | `🚨 RED FLAG: việc tắc 4 ngày` |

Sau L4: re-ping CEO mỗi 24h tiếp (level=4), tăng `escalationLog.length`.

### Reset rule

Reset `escalationLevel=0`, `isRed=false`, ghi log `level:0, reason:'resolved'` khi:
- Status chuyển (`tiep_nhan→dang_xu_ly`, `cho_phan_hoi→dang_xu_ly`, …)
- Owner/approver thêm comment có nội dung (không phải kind=`nudge`)
- Collaborator update status (`cho_xac_nhan → dang_thuc_hien`)
- Task done/closed/cancelled

Reset hook vào `/api/tasks/[id]/status` + `/approve` + `/comments` POST.

### Cron `app/api/cron/escalate-stuck-tasks/route.ts`

Schedule **mỗi 30 phút**. Yêu cầu header `Authorization: Bearer ${CRON_SECRET}`.

```ts
const LEVELS = [
  { level: 1, minHours: 24, notify: 'owner_or_collab' },
  { level: 2, minHours: 48, notify: 'tp_of_stuck' },
  { level: 3, minHours: 72, notify: 'gd_of_block' },
  { level: 4, minHours: 96, notify: 'ceo_admin' },
];

export async function GET(req: NextRequest) {
  assertCronSecret(req);
  const cutoff24h = new Date(Date.now() - 24 * 3600_000);

  const stuck = await db.collection('coordinationTasks')
    .where('status', 'in', ['tiep_nhan','dang_xu_ly','dang_phoi_hop','cho_phan_hoi','cho_phe_duyet'])
    .where('updatedAt', '<=', cutoff24h)
    .orderBy('updatedAt', 'asc')
    .limit(300).get();

  for (const doc of stuck.docs) {
    const t = doc.data();
    const stuckHours = (Date.now() - t.updatedAt.toMillis()) / 3600_000;
    const currentLevel = t.escalation?.currentTier ?? 0;
    const target = LEVELS.filter(L => stuckHours >= L.minHours).pop();
    if (!target || target.level <= currentLevel) continue;

    const wf = await resolveWaitingFor(t);
    const recipients = await resolveEscalationRecipients(target.notify, t, wf);
    if (recipients.uids.length + recipients.roleEntries.length === 0) continue;

    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      if ((fresh.data()?.escalation?.currentTier ?? 0) >= target.level) throw new Error('ALREADY_FIRED');
      tx.update(doc.ref, {
        'escalation.currentTier': target.level,
        'escalation.lastEscalatedAt': new Date(),
        isRed: target.level >= 4,
      });
      tx.set(doc.ref.collection('escalationLog').doc(), {
        tier: target.level, escalatedAt: new Date(),
        reason: `stuck_${target.minHours}h`,
        stuckHours: Math.round(stuckHours),
        waitingFor: wf,
        notifiedUids: recipients.uids,
        notifiedRoleEntries: recipients.roleEntries,
        triggeredBy: 'cron',
      });
    }).catch(e => { if (e.message !== 'ALREADY_FIRED') throw e; });

    await Promise.allSettled([
      pushToUsers(recipients.uids, payload),
      pushToApproverEntries(recipients.roleEntries, payload),
      doc.ref.collection('comments').add({
        authorId: 'system', kind: `escalation_l${target.level}`,
        body: `Tự động leo cấp L${target.level} — đã chờ ${Math.round(stuckHours)}h.`,
      }),
    ]);
  }
}
```

### `resolveEscalationRecipients` logic

| Tier | notify key | Logic |
|---|---|---|
| L1 | `owner_or_collab` | Collab → `collab.responsibleUid`; approver → `currentApprover`; else owner |
| L2 | `tp_of_stuck` | Tra `users/{stuckUid}.departmentId` → tìm `TP_*` cùng dept. QLCS → GĐ khối |
| L3 | `gd_of_block` | Resolve block task → `GD_KD` hoặc `GD_VP` (role entry) |
| L4 | `ceo_admin` | Role entries `role:CEO` + `role:ADMIN` |

### Tương quan với `nudge` route

Manual nudge giữ nguyên cho case khẩn (cooldown 4h):
- Manual: user bấm, 1 người, không leo cấp
- Auto: cron, bậc thang, ghi log

Manual nudge thành công → **KHÔNG reset** `escalationLevel` (việc vẫn tắc). Comment/status thật → reset.

### Acceptance criteria

- [ ] Test E2E: 20 task cùng owner trong 1h → user nhận ≤6 push, còn lại vào inAppNotifications
- [ ] Quiet hours: noti L1 fire 23:00 → defer tới 06:00, kiểm tra emulator clock
- [ ] D-1 reminder fire đúng 1 lần dù cron chạy 48 lần
- [ ] Task -25h → L1, log 1 entry. Re-cron → KHÔNG fire lại (idempotent)
- [ ] Task -49h, level=1 → L2, log thêm entry, notify TP
- [ ] Owner add comment → level reset 0, log `reason:resolved`
- [ ] Task >96h → `isRed=true`, CEO push kể cả 23:00
- [ ] Transaction race 2 cron tick gần nhau → chỉ 1 thành công, log 1 entry

### Audit log mới

| Action | Trigger | Payload |
|---|---|---|
| `escalate_task_l1..l4` | cron | `{ stuckHours, waitingFor, notified }` |
| `reset_escalation` | status/comment/collab update | `{ from_level, by_action }` |
| `noti_capped` | hit 6/24h cap | `{ taskId, kind, suppressed }` |
| `mark_red` | L4 trigger | `{ stuckHours }` |
| `dashboard_view` | CEO/GĐ mở dashboard | `{ filter, time_spent }` (sample 10%) |

---

## 12. Mobile App Layout — Stack + FAB + Bottom Sheet

**🔵 NEW** · Touches: `app/(app)/dieu-phoi/GiaoViecClient.tsx`, `mobile/TaskCardMobile.tsx`, `components/ui/BottomNavBar.tsx`

CEO/GĐ thường xem nhanh khi đi tỉnh — mobile (<768px) phải đủ 4 câu hỏi mà không scroll hơn 2 lần/task.

### Wireframe List view

```
┌──────────────────────────────┐
│ ← Điều phối CV       🔔 (3)  │
│ ──────────────────────────── │
│ ┌────────────────────────────┐│
│ │ ⚠ 4 tắc · 2 quá hạn · 7 chờ││  ← KPI strip
│ │ duyệt              [Xem→]  ││
│ └────────────────────────────┘│
│                              │
│ ◀──[Tất cả][Tôi PT][Tôi giao]│
│   [Liên khối][Chờ PH][Chờ DT]│  ← Tabs scroll-x
│   [Quá hạn][Điểm nghẽn]──▶  │
│                              │
│ ┌─ TASK CARD ────────────────┐│
│ │ [Điều phối] [Cao] ⚠ 32h    ││
│ │ Mở lớp hè Toán nâng cao    ││
│ │ 👑 Nguyễn V. A — TP_DT     ││  ← Owner row
│ │ ⏳ Chờ Phòng MKT · 32h     ││  ← Waiting row
│ │ ████░░░░░░ 40%   📎2 💬5  ││  ← Progress + counts
│ │ Hạn 30/06 (còn 18 ngày)    ││
│ └────────────────────────────┘│
│                       ┌────┐ │
│                       │ ＋ │ │  ← FAB
│                       └────┘ │
├──────────────────────────────┤
│ 🏠  ✓  [📋]  💬  ⋯           │  ← BottomNavBar
└──────────────────────────────┘
```

### Wireframe Detail (accordion)

```
┌──────────────────────────────┐
│ ← Chi tiết         [⋮ Menu] │
│ ──────────────────────────── │
│ [Điều phối][Liên khối][Cao] │
│ Mở lớp hè Toán nâng cao     │
│ ⏱ Hạn: 30/06 (còn 18 ngày)  │
│ Trạng thái: Đang phối hợp   │
├──────────────────────────────┤
│ ⚠ ĐIỂM NGHẼN — luôn mở      │  ← Always-open block
│ Chờ: Phòng MKT              │
│ Chờ gì: poster + caption    │
│ Đã chờ: 32 giờ              │
│ [⏰ Nhắc việc]              │
├──────────────────────────────┤
│ ▸ 👑 Chủ trì                │  ← Accordion 1
├──────────────────────────────┤
│ ▾ 🤝 Đơn vị phối hợp (3)    │  ← Accordion 2 (mở mặc định)
│   ┌──────────────────────┐ │
│   │ Phòng MKT — TP_MKT   │ │
│   │ ● Đang xử lý 60%     │ │
│   │ Hạn 25/06 [Cập nhật] │ │
│   └──────────────────────┘ │
│   ┌──────────────────────┐ │
│   │ CS 24 NCT — QLCS_24  │ │
│   │ ● Chờ tiếp nhận      │ │
│   │ [Nhận] [Từ chối]     │ │
│   └──────────────────────┘ │
├──────────────────────────────┤
│ ▸ 📜 Timeline (8)            │  ← Accordion 3
├──────────────────────────────┤
│ ▸ 💬 Bình luận (5)           │  ← Accordion 4
└──────────────────────────────┘
│ [💬 ………………] [Gửi]           │  ← Sticky composer
└──────────────────────────────┘
```

### Mobile-specific rules

- **KPI strip**: 1 dòng compact `4 tắc · 2 quá hạn · 7 chờ duyệt`
- **Tabs 8** scroll horizontal sticky (no wrap)
- **TaskCardMobile** đủ 4 câu hỏi trong 5 dòng:
  1. Chip Type + Priority + Waiting badge
  2. Title (2 dòng max)
  3. 👑 Owner (1 dòng)
  4. ⏳ Waiting-for (1 dòng, đỏ nếu >24h)
  5. Progress bar + counts + due
- **Tap card** → push `/dieu-phoi/{id}` (animated slide)
- **Tap waiting badge** → action sheet `[Nhắc việc] [Xem chi tiết]`
- **FAB tạo mới**: bottom-right, ẩn khi scroll down, hiện khi scroll up (Material pattern)
- **Pull-to-refresh**
- **Đẩy noti FCM mở app** → deep-link đúng task + auto scroll điểm nghẽn
- **Detail accordion**: Điểm nghẽn LUÔN mở đầu, không thể collapse
- **Swipe trái card** → quick action `Nhắc việc`
- **Swipe phải card** → `Đánh dấu đã xem`
- **Haptic feedback** đổi tab + tap action (rung 10ms)
- **Bottom sheet** thay modal cho `Cập nhật trạng thái` collaborator — slide từ dưới 90% màn

---

## 13. UI Wireframe + UX Flow tổng

**🔵 NEW** · Touches: `app/(app)/dieu-phoi/GiaoViecClient.tsx`, `app/api/tasks/route.ts`

### Persona test

- **Trần T. B (TP_DT)** — Creator, muốn mở lớp hè Toán nâng cao
- **Nguyễn V. A (TP_DT)** — Owner end-to-end
- **Trần V. C (TP_MKT)** — collaborator 1 (poster)
- **Lê T. D (QLCS_24NCT)** — collaborator 2 (phòng học)
- **Phạm V. E (GD_KD)** — supervisor xem dashboard

### Flow 5 bước end-to-end

```
┌─────────────────────────────────────────────────────────────────────┐
│ Bước 1 — TẠO ĐIỀU PHỐI (Trần T. B — TP_DT)                          │
│ ─────────────────────────────────────────────────────────────────── │
│  /dieu-phoi → [+ Tạo mới]                                            │
│  Step 1/3: title="Mở lớp hè Toán", type=dieu_phoi, scope=lien_khoi  │
│           priority=high, dueDate=30/06                              │
│  Step 2/3: ownerBlock=KD, ownerDept=DT, ownerUid=NguyenVA           │
│  Step 3/3: + Phòng MKT (Trần V. C, "poster+caption", 25/06)         │
│            + CS 24 NCT (Lê T. D, "chuẩn bị phòng học", 28/06)       │
│  [Tạo] → POST /api/tasks (status=khoi_tao)                           │
│         → server set status=tiep_nhan cho Owner (auto-assign)        │
│         → FCM noti tới Owner + 2 collaborators + GD_KD              │
│         → Inbox in-app 4 record (dual-channel)                       │
└──────────────────────────┬──────────────────────────────────────────┘
                           ↓
┌──────────────────────────┴──────────────────────────────────────────┐
│ Bước 2 — TIẾP NHẬN (Owner & Collaborators song song)                │
│ ─────────────────────────────────────────────────────────────────── │
│ Owner Nguyễn V. A:                                                  │
│  Mobile noti → tap → /dieu-phoi/DPCV-2026-0042                      │
│  Detail page mở → tap [Nhận điều phối]                              │
│  → status: tiep_nhan → dang_xu_ly                                   │
│  → server emit notifyTaskStatusChanged → creator + collaborators    │
│                                                                     │
│ Trần V. C (MKT):                                                    │
│  Mobile: card hiển thị badge "Chờ tiếp nhận" cam                    │
│  Tap collab card → [Nhận] → collab status: cho_xac_nhan → dang_thuc │
│  → progress=0 → có thể bắt đầu Cập nhật                             │
│  → task status auto: dang_xu_ly → dang_phoi_hop                     │
└──────────────────────────┬──────────────────────────────────────────┘
                           ↓
┌──────────────────────────┴──────────────────────────────────────────┐
│ Bước 3 — XỬ LÝ + PHỐI HỢP (status = dang_phoi_hop)                  │
│ ─────────────────────────────────────────────────────────────────── │
│ Trần V. C upload 1 poster nháp → [Cập nhật]                         │
│  Bottom sheet: progress=40%, comment="poster A1 draft, cần feedback"│
│ → server append TaskComment kind=status_change                       │
│ → noti tới Owner (waiting reduced)                                  │
│                                                                     │
│ Lê T. D không động gì 32h → cron escalate-stuck-tasks:              │
│  - Set task.waitingFor.uid=LeTD, content="chuẩn bị phòng"           │
│  - Set waitingFor.since=now-32h, durationHours=32                   │
│  - 24h passed → L1 fire: FCM noti tới chính Lê T. D                 │
│  - 32h<48h → L2 chưa tới                                            │
│  - Log escalationLog tier=1                                         │
└──────────────────────────┬──────────────────────────────────────────┘
                           ↓
┌──────────────────────────┴──────────────────────────────────────────┐
│ Bước 4 — OWNER GIÁM SÁT + GĐ XEM DASHBOARD                           │
│ ─────────────────────────────────────────────────────────────────── │
│ Owner mở /dieu-phoi/DPCV-2026-0042:                                  │
│  - Cột 3: ⚠ Đang chờ Lê T. D · "chuẩn bị phòng học" · 32h           │
│  - Tiến độ chung 30% (MKT 60% + CS24 0% / 2)                        │
│  - Tap [Nhắc việc] → noti tới Lê T. D + nudgeCount++                │
│                                                                     │
│ GĐ Phạm V. E mở dashboard /dieu-phoi (tab "Điểm nghẽn"):            │
│  - Donut KD/VP/Liên khối                                            │
│  - List bottleneck: Task DPCV-128 đứng đầu (32h chờ)                │
│  - 30s biết: tắc ở Lê T. D, cơ sở 24, deadline 30/06               │
└──────────────────────────┬──────────────────────────────────────────┘
                           ↓
┌──────────────────────────┴──────────────────────────────────────────┐
│ Bước 5 — HOÀN THÀNH + ĐÓNG HỒ SƠ                                     │
│ ─────────────────────────────────────────────────────────────────── │
│ Lê T. D upload ảnh phòng → [Đã xong] → collab status=da_hoan_thanh  │
│ Trần V. C upload 3 poster final → [Đã xong] → da_hoan_thanh         │
│ → server: all collabs done && Owner progress=100                    │
│ → status auto: dang_phoi_hop → cho_phe_duyet                        │
│ → Owner Nguyễn V. A submit → currentApprover=TP_DT(creator)         │
│ → Creator approve → status=hoan_thanh                               │
│ → noti creator + GD_KD                                              │
│                                                                     │
│ Sau 7 ngày không tranh chấp → CEO/Owner bấm [Đóng hồ sơ]            │
│   + nhập closure.summary ≥30 ký tự + attach biên bản                │
│ → status=dong_ho_so, read-only                                      │
│ → Task ẩn list mặc định, xem được ở /dieu-phoi?tab=archive          │
└─────────────────────────────────────────────────────────────────────┘
```

### Cross-functional touchpoints

| Bước | Actor | Action | Module liên quan |
|------|-------|--------|------------------|
| 1 | TP_DT | Tạo | `/dieu-phoi` form |
| 1 | Server | Noti 4 user | `task-notifications.ts` |
| 2 | Owner | Nhận | `/api/tasks/[id]/status` |
| 2 | Collab | Nhận riêng | `/api/tasks/[id]/collaborators/[unitId]/accept` |
| 3 | Cron | Escalate | `/api/cron/escalate-stuck-tasks` |
| 3 | Collab | Cập nhật | `/api/tasks/[id]/collaborators/[unitId]/update` |
| 4 | Owner | Nhắc | `/api/tasks/[id]/nudge` |
| 4 | GĐ | Xem | `/api/tasks/dashboard/gd` |
| 5 | Owner | Đóng | `/api/tasks/[id]/close` |

### Edge cases UX

- **Collab từ chối**: bottom sheet hỏi lý do → noti Owner + creator + reset card
- **Đổi Owner giữa chừng**: confirm modal 2 lần (CEO/GĐ only) → audit log + noti cũ + mới
- **Hết deadline mà chưa xong**: badge đỏ overdue, vẫn cho update nhưng marked late
- **Owner nghỉ phép**: TP cấp trên thấy nút "Delegate Owner" tạm thời

### Mobile Task Card visibility audit

```
┌─────────────────────────────────────────────────────────────┐
│ [Avatar Owner] Nguyễn Thị A · QLCS HM        🔴 RED 96h+   │ ← Owner + flag
│ ✅ Duyệt: Mở rộng giờ vận hành bể 24NCT                     │ ← Coord type + title
│ ┌─ STATUS ───────────────────────────────────────────────┐  │
│ │ 🟠 Đang chờ phê duyệt · L3 (GĐ khối)                  │  │ ← Status pill + escalation
│ └────────────────────────────────────────────────────────┘  │
│ ⏳ Chờ GĐ KD duyệt mẫu hợp đồng v3 · 78h                    │ ← Waiting For
│ 🤝 Phối hợp: Phòng KT (Lan · in_progress · D-1)             │ ← Collab
│            Phòng KE (Bình · pending · quá hạn 2h) 🔴        │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ Khởi tạo 2026-06-09 · Hạn 2026-06-15 · 7 escalations       │
└─────────────────────────────────────────────────────────────┘
```

---

## 14. Component Library

**🔵 NEW** · Vị trí: `components/coordination/`

12 component mới + 4 component cập nhật. TypeScript strict, no `any`, server-safe.

### 12 Component MỚI

**1. `<TypeChip>`** — 5 màu emerald/sky/violet/amber/rose, icon `Network|Handshake|Lightbulb|CheckCheck|AlertTriangle`. Props: `{ type: CoordinationType; size?: 'sm'|'md'; clickable?: boolean }`.

**2. `<ScopeChip>`** — 5 màu slate/indigo/fuchsia/cyan/teal, icon `Building2|Layers|GitBranch|MapPin|Briefcase`.

**3. `<StatusBadge>`** — 8 trạng thái rõ rệt + pulse animation cho waiting status. Hover tooltip giải thích next-step.

**4. `<PriorityChips>`** — 3 chip click-to-select interactive. Kế thừa pattern hiện tại của TaskCreateModal.

**5. `<OwnerSelector>`** — Radio (KHÔNG multi-select). Props:
```ts
{
  block: 'KD'|'VP';
  scopeUnit: { kind: 'dept'|'facility'; id: string };
  users: User[];
  value: string | null;
  onChange: (uid: string) => void;
  excludeSelf?: boolean;
}
```
UI: list radio + avatar + tên + role badge. Search box top khi user > 10. Empty state.

**6. `<CollaboratorCard>`** — 6 field spec + 2 nút action. Viền đổi màu theo collab.status. Quá hạn → viền đỏ + chip `Quá hạn`.

**7. `<WaitingForBanner>`** — 3 dòng spec, auto-update mỗi 60s. Background tone: <24h xám, 24-48h cam, >48h đỏ pulse. Nút Nhắc việc disabled khi cooldown.

**8. `<EscalationTimer>`** — 4 tier ladder dọc với ✓ / ⏳ / ○. Countdown realtime tới tier kế (HH:MM:SS).

**9. `<CoordinationTable>`** — Sticky header, virtualized scroll (react-window) nếu > 50 rows.

**10. `<DonutByBlock>`** — Pure SVG, no chart lib (giảm bundle). 3 arc + center label. Click arc → filter.

**11. `<BottleneckList>`** — Sort desc theo stuckHours. Empty state: "Không có điểm nghẽn — tất cả đang chạy đúng tiến độ".

**12. `<NudgeButton>`** — Cooldown 4h + 24h threshold. Disabled với tooltip rõ ràng. Animation rung khi click thành công.

### 4 Component CẬP NHẬT

- **`<TaskCardMobile>`** (modify): thêm row WaitingForBanner compact + Owner avatar row + swipe-action
- **`<TaskCreateModal>`** (modify): refactor thành wizard 3 step, inject TypeChip/ScopeChip/OwnerSelector/CollaboratorCard
- **`<TaskDetailModal>`** (modify → split): tách thành `<TaskDetailLayout>` 3-col + `<TaskDetailAccordion>` mobile
- **`<TabsBar>`** (new mini): hỗ trợ 8 tab + scroll-x mobile. Active có badge count + underline animated. Keyboard nav (←/→)

### Tree path

```
components/coordination/
  index.ts                 — barrel export
  TypeChip.tsx
  ScopeChip.tsx
  StatusBadge.tsx
  PriorityChips.tsx
  OwnerSelector.tsx
  CollaboratorCard.tsx
  WaitingForBanner.tsx
  EscalationTimer.tsx
  CoordinationTable.tsx
  DonutByBlock.tsx
  BottleneckList.tsx
  NudgeButton.tsx
  TabsBar.tsx
  TaskCardMobile.tsx
  __tests__/
    StatusBadge.test.tsx
    OwnerSelector.test.tsx
    WaitingForBanner.test.tsx
```

### Dependencies

- `lucide-react` (đã có) — icons
- `date-fns` cho duration format (đã có)
- KHÔNG thêm chart lib — DonutByBlock SVG thuần
- KHÔNG thêm swipe lib nặng — touch handlers thuần

---

## 15. Migration plan + Acceptance criteria

**🔵 NEW** · Touches: 15+ files (xem stream Migration)

### 15.1 Migration 6 phase / 8 tuần

Tuân `feedback_safe_phased_migrations.md` + `feedback_no_regression.md`: KHÔNG bulk delete, KHÔNG xoá field cũ cho đến Phase 5, dual-write Phase 0-2.

#### Phase 0 — Schema Foundation (Tuần 1)

Bổ sung field MỚI vào Firestore với default values, KHÔNG đụng UI/API logic.

```json
{
  "coordinationType": null,
  "scope": null,
  "ownerUid": null,
  "ownerName": null,
  "waitingFor": null,
  "stuckHours": 0,
  "escalationLevel": 0,
  "escalationHistory": []
}
```

**Mapping cũ → mới** (đọc-only):

| Cũ | Mới (derived) |
|----|---------------|
| `kind='proposal'` | `coordinationType='de_xuat'` |
| `kind='assignment' + assigneeBlock != createdByBlock` | `coordinationType='dieu_phoi', scope='lien_khoi'` |
| `kind='assignment' + collaboratorDeptIds.length>0` | `coordinationType='ho_tro'` |
| `currentApprover` set | `coordinationType='phe_duyet'` |
| `priority='high' + status='pending' > 48h` | `coordinationType='canh_bao'` (computed) |

Script: `scripts/migrate-tasks-phase0.ts` — batch 500 docs/lần, idempotent.

**Rủi ro**: Firestore index quota khi tạo composite index. **Rollback**: Field optional → drop bằng script `unset`.

#### Phase 1 — Collaborators Struct + Backfill (Tuần 2)

Reshape `collaboratorRoles{}` (flat) → `collaborators[]` (structured), giữ field cũ READ-ONLY.

Dual-write 4 tuần. Backfill `scripts/backfill-collaborators.ts`:
- Đọc `collaboratorDeptIds[] + collaboratorFacilityIds[] + collaboratorRoles{}`
- Sinh `collaborators[]` với `responsibleUid` = TP của dept / QLCS của facility
- `deadlineAt = task.dueDate`, `status='cho_xac_nhan'`
- Idempotent: skip nếu `collaborators[].length>0`

**Rủi ro**: responsibleUid sai khi dept không có TP active. **Mitigation**: Default về `ownerUid`, log danh sách cần thủ công.

#### Phase 2 — UI Parallel Build /dieu-phoi (Tuần 3-4)

Tạo route MỚI `/dieu-phoi` song song. Feature flag `FEATURE_COORDINATION_V2` env-based.

```
app/(app)/dieu-phoi/
├── page.tsx                    # Server: load profile + tabs
├── DieuPhoiClient.tsx          # 8 tabs + dashboard CEO
├── components/
│   ├── CoordinationKPIBar.tsx
│   ├── BottleneckPanel.tsx
│   ├── WaitingForBadge.tsx
│   ├── CollaboratorRow.tsx
│   └── EscalationTimeline.tsx
├── CoordinationCreateModal.tsx
└── CoordinationDetailModal.tsx
```

Sidebar: thêm `Điều phối` (Network icon) BÊN CẠNH `giao-viec` cũ 2 tuần test. BottomNav: giữ `giao-viec`, thêm `/dieu-phoi` trong sidebar Khác.

#### Phase 3 — Cron Escalation Engine (Tuần 5)

Hai cron job mới (Vercel cron):
```
*/15 * * * *  /api/cron/compute-stuck-time
*/30 * * * *  /api/cron/escalate-stuck-tasks
```

Cron đầu chạy `dryRun=true`, log count → confirm → bật real. Disable qua `ESCALATION_ENABLED=false`.

#### Phase 4 — Cut-over (Tuần 6)

- Bật `FEATURE_COORDINATION_V2=true` cho tất cả users
- `/giao-viec` → 301 redirect → `/dieu-phoi` (giữ deep link `/giao-viec/[taskId]` → `/dieu-phoi/[taskId]`)
- Sidebar: ẩn entry `giao-viec` cũ
- Monitor 1 tuần: error rate, support tickets, NPS in-app

**Rollback**: Set flag false → sidebar hiện lại, redirect tắt. Schema dual-write nên data đồng bộ.

#### Phase 5 — Cleanup (Tuần 8, sau prod ổn định ≥7 ngày)

Khớp pattern `5.D destructive đợi chạy ổn vài ngày` của Supabase→Firebase migration.

- Drop `collaboratorRoles{}, collaboratorDeptIds[], collaboratorFacilityIds[]`
- Drop `TaskKind='general'`
- Xoá `app/(app)/giao-viec/`
- Xoá file mapping legacy trong tasks-scope
- Drop composite index cũ không dùng

Giữ READ fallback trong serializer thêm 30 ngày.

### 15.2 Acceptance Criteria

#### Test Case 1 — 30s CEO Dashboard

**Setup**: Seed 200 tasks; 15 tasks `stuckHours>24` (5 ở TP_MKT, 4 ở QLCS_HM, 6 ở GD_VP); 3 tasks `currentApprover=CEO_UID`; Khối VP 25% overdue, KD 8%; Cơ sở HM 6 task đỏ, TK 1.

**Steps**: CEO login → /dieu-phoi → đo từ click → first paint → CEO verbalize được 5 info.

**BottleneckPanel** (top section, sticky):
```
┌──────────────────────────────────────────────────────────────┐
│ ĐIỂM NGHẼN HÔM NAY                          [Cập nhật 12:03]  │
├──────────────────────────────────────────────────────────────┤
│ 15 việc tắc │ 3 chờ tôi duyệt │ Khối VP -25% │ Cơ sở HM đỏ  │
│  >24h       │  >2 ngày        │ chậm tiến độ │  6 task       │
├──────────────────────────────────────────────────────────────┤
│ TẮC TẠI AI:                                                   │
│  ● TP_MKT (Trần B)     5 việc  ████████░░  trung bình 38h    │
│  ● QLCS_HM (Lê C)      4 việc  ██████░░░░  trung bình 52h    │
│  ● GD_VP (Phạm D)      6 việc  █████████░  trung bình 71h ⚠ │
│ [Xem chi tiết →]  [Nhắc tất cả]  [Eskate ngay]               │
└──────────────────────────────────────────────────────────────┘
```

**Pass**: ≥4/5 sessions verbalize đủ 5 info ≤30s. p95 dashboard load TTI < 2s. 0 task `stuckHours>24` mà không xuất hiện.

#### Test Case 2 — Cross-Block Coordination Flow

**Steps**: TP_DT tạo điều phối liên khối → đúng người nhận noti → từng collab update → tự chuyển `cho_phe_duyet`.

**Expected**: Bước 6 chỉ TP_MKT + QLCS_HM nhận, KHÔNG bắn TP_NS/TP_KE. Status transition logged kind=`status_change, auto=true`. 4 câu hỏi luôn hiển thị trong detail modal.

**Pass**: 100% steps pass, 0 wrong recipient, status auto-transition trong 1s sau collab cuối done.

#### Test Case 3 — Escalation Ladder 24/48/72/96h

**Setup**: 4 task seed stuck 25h / 50h / 74h / 100h.

**Expected**:

| Task | Level trước | sau | Recipient |
|------|-------------|-----|-----------|
| A | 0 | 1 | ownerUid + assignees |
| B | 1 | 2 | TP của dept owner |
| C | 2 | 3 | GĐ Khối |
| D | 3 | 4 | CEO + ADMIN |

Re-run cron 5 phút sau: 0 push thêm (idempotent). Push payload có `data.escalationLevel` để service worker style noti khác cấp.

**Invariants** (`tests/invariants/coordination-invariants.ts`):
- `escalationLevel === floor(stuckHours / 24)` (clamped 0-4)
- `escalationHistory.length === escalationLevel`
- Recipient KHÔNG trùng giữa các level

**Pass**: 4/4 escalate đúng cấp, 0 duplicate, idempotent. False-positive <5% trong 1 tuần prod.

#### Test Case 4 — 4-Question Visibility Audit

| Screen | Owner | Status | Waiting For | Collab |
|--------|-------|--------|-------------|--------|
| Dashboard list row | Avatar + tên | Badge | Icon + hours | Count badge |
| Detail modal | Block top | Block top | Block waitingFor | Section riêng |
| Bottleneck panel | Cột | Cột | Cột | Cột count |
| Mobile bottom sheet | Header | Header | Subheader | Tab Collab |
| Notification body | Mention | Mention | Reason | Số collab pending |

**Measurement**: Visual regression (Percy/Chromatic) snapshot 10 screen. Accessibility: mỗi element có `aria-label` chứa keyword.

**Pass**: 100% screen có đủ 4 element, không ẩn dưới >1 click.

### 15.3 KPI thành công module (đo sau 30 ngày prod)

| KPI | Target | Cách đo |
|-----|--------|---------|
| % task có `ownerUid` | 100% | Firestore query `where ownerUid == null` = 0 |
| % task có ≥1 collaborator đủ 6 field | ≥90% | Aggregate query |
| Escalation false-positive | <5% | User feedback button "Không tắc" |
| Time-to-info CEO dashboard | ≤30s p80 | Session recording 20 sessions |
| NPS quản lý (TP+GĐ+CEO) | ≥4/5 | Survey in-app sau 30 ngày |
| % task `closed/archived` đúng workflow | ≥85% | Status transition log |
| Mean Time To Resolve overdue | Giảm ≥30% so baseline | Compare 30 ngày trước vs sau |
| Crash/error rate `/dieu-phoi` | <0.5% sessions | Sentry/Vercel analytics |
| Dashboard latency p95 | ≤800ms | `/api/tasks/dashboard` với 5000 tasks |
| Noti spam | ≤6 push/task/24h/user | Test 20 task cùng owner trong 1h |

### 15.4 Invariants chạy cron daily

Vi phạm bất kỳ → Slack/FCM alert ADMIN + auto-create issue trong `auditLogs/invariantChecks`:

1. `sum(stuckByUser) === stuckTotal` trong bottleneck-summary
2. `task.status='hoan_thanh'` ⇒ ∀ `collaborators[].status='da_hoan_thanh'`
3. `task.escalationLevel > 0` ⇒ `escalationHistory.length === escalationLevel`
4. `task.coordinationType='phe_duyet'` ⇒ `currentApprover != null`
5. `task.scope='lien_khoi'` ⇒ ∃ `collaborators[].block !== task.ownerBlock`
6. `task.ownerUid != null` luôn (sau Phase 1 backfill)
7. `task.status='dong_ho_so'` ⇒ `closure.summary.length >= 30`
8. `task.isBottleneck=true` ⇔ `stuckHours >= 24 AND status open`

---

## Roadmap đề xuất

| Phase | Tuần | Ưu tiên | Nội dung chính | Owner | Exit criteria |
|-------|------|---------|----------------|-------|---------------|
| **Phase 1 — Schema + Backfill** | T1-2 | P0 (blocker) | Rename `tasks` → `coordinationTasks`, thêm field mới optional, backfill collaborators struct. Dual-read shim. Composite index 1-13 deploy. | Backend (BE) | 100% docs có default field, 0 read error, dual-read xanh 3 ngày |
| **Phase 2 — UI Parallel /dieu-phoi** | T3-4 | P0 | Build route `/dieu-phoi` song song, 8 tabs + CEO/GĐ/TP dashboard, TaskCreateModal wizard 3 step, TaskDetailLayout 3 cột. Feature flag `FEATURE_COORDINATION_V2`. Component library 12 mới. | Frontend (FE) | 8 tab + 4-question render đủ, visual regression pass, role-based test pass |
| **Phase 3 — Notification + Escalation** | T5 | P1 (UX critical) | Notification engine refactor: cooldown đa tầng, quiet hours, payload data-only mở rộng. Cron escalate-stuck-tasks 4 tier. Reminder D-1/D-3/overdue idempotent. Audit log mới. | BE | Dry-run cron OK, real run 1 ngày 0 bomb, E2E test escalation pass |
| **Phase 4 — Cut-over + Monitor** | T6-7 | P1 | Bật flag toàn user, 301 redirect `/giao-viec` → `/dieu-phoi`, ẩn sidebar entry cũ. Monitor 1 tuần: error rate, support tickets, NPS. Buffer hotfix tuần T7. | FE + BE | Redirect work, NPS không drop, crash rate <0.5%, 30s CEO test pass ≥4/5 |
| **Phase 5 — Cleanup + Optimize** | T8+ | P2 | Drop `collaboratorRoles{}`, `collaboratorDeptIds[]`, `collaboratorFacilityIds[]`, `TaskKind='general'`. Xoá `app/(app)/giao-viec/`. Drop composite index cũ. Trend KPI 7 ngày cho GĐ dashboard. Optimization query/cache. | BE | Field cũ drop, route cũ xoá, prod ổn ≥7 ngày, invariant nightly green |

**Ước lượng tổng**: 8 tuần (1 BE senior + 1 FE senior + 0.5 QA + 0.2 PM oversight). Buffer 1 tuần T7 cho hotfix.

**Critical path**: Phase 1 → 2 → 3 sequential. Phase 4 phụ thuộc 1+2+3 xong. Phase 5 sau Phase 4 + 7 ngày soak.

**Risk register**:
- R1 (HIGH): Composite index quota Firestore → mitigate: dry-run trước, không tạo 13 index cùng lúc, deploy 4 index/lần
- R2 (HIGH): Backfill responsibleUid sai → mitigate: default về ownerUid + log để gán thủ công, không block migration
- R3 (MEDIUM): Cron escalation bomb 2k task cũ → mitigate: dry-run + flag `ESCALATION_ENABLED`, run lần đầu vào weekend
- R4 (MEDIUM): User confuse 2 entry `/giao-viec` + `/dieu-phoi` 2 tuần → mitigate: banner trên `/giao-viec` "Thử bản mới", tutorial 3-step
- R5 (LOW): Regression sales/checklist → mitigate: `feedback_no_regression`, isolated module, sales FROZEN không đụng

**Sign-off cần có trước Phase 4 cut-over**: CEO + GD_KD + GD_VP + 2 TP đại diện (KD + VP) + 1 QLCS đại diện.