# Firebase Migration Plan — Checklist Module

Tài liệu này mô tả kế hoạch chuyển backend module Checklist từ **Supabase**
sang **Firebase (Firestore + Storage + Cloud Functions)**. Phase scaffolding
hiện tại chỉ tạo nền và types; **chưa import dữ liệu thật**.

---

## 1. Mapping Supabase → Firestore

| Supabase (Postgres) | Firestore | Ghi chú |
| --- | --- | --- |
| `checklist_templates` | `checklistTemplates/{templateId}` | Top-level collection |
| `checklist_template_items` | `checklistTemplates/{templateId}/items/{itemId}` | Subcollection — tránh array lớn |
| `checklist_instances` | `checklistInstances/{instanceId}` | Top-level. Index `(facility_id, date)` + `(department_id, date)` |
| `checklist_instance_items` | `checklistInstances/{instanceId}/items/{itemId}` | Subcollection |
| `checklist_evidence_files` | `checklistInstances/{instanceId}/evidenceFiles/{fileId}` | Subcollection — auto-delete sau 7 ngày |
| `checklist_audit_log` | `checklistAuditLogs/{logId}` | Top-level append-only. Index `(instance_id, created_at desc)` |

### Quy tắc khoá phụ

- Subcollection được chọn (thay vì lưu items trong field array trên parent)
  để tránh quy mô item lớn dẫn đến doc quá 1MB. Subcollection cho phép phân
  trang, query riêng, và RLS riêng.
- `checklistAuditLogs` để **top-level** vì cần query liên-instance (vd
  "tất cả action của user X trong khoảng thời gian"), và RLS dễ áp dụng hơn.

---

## 2. Document shapes

### `checklistTemplates/{templateId}`

```ts
{
  name: string                  // 'SEED-MVP-HM-AT-M-OP' hoặc tên người dùng đặt
  role_label: string            // 'NV Kinh doanh'
  block_id: 'KD' | 'VP'
  active: boolean
  department_id: string | null  // 'KT', 'DT', null
  shift_type: 'morning' | 'afternoon' | 'evening' | 'night' | 'allday' | null
  checklist_group: string       // 'An toàn vệ sinh cơ sở'
  checklist_type: 'opening' | 'handover' | 'closing' | 'incident' | 'custom'
  scheduled_time: string | null // 'HH:mm:ss'
  deadline_time: string | null
  evidence_type: 'none' | 'photo' | 'signature' | 'file' | 'note'
  facility_scope: 'specific' | 'all'
  facility_ids: string[]        // ['HM','TK',...] hoặc [] nếu facility_scope='all'
  reviewer_role_code: string | null
  assigned_role_code: string | null
  created_at: Timestamp
  created_by: string | null     // uid
  updated_at: Timestamp
}
```

### `checklistTemplates/{templateId}/items/{itemId}`

```ts
{
  content: string
  sort_order: number
  requires_file: boolean
  is_required: boolean
  requires_note: boolean
  created_at: Timestamp
}
```

### `checklistInstances/{instanceId}`

```ts
{
  template_id: string             // ref doc id, KHÔNG dùng DocumentReference để
                                  // tiện migrate JSON
  assigned_to: string | null      // uid
  reviewer_id: string | null

  facility_id: string             // 'HM'
  facility_name: string           // 'Green Pool Hoàng Mai' — cache

  department_id: string | null
  department_name: string | null
  checklist_group: string
  specialty_group: string | null  // 'KT_HT', 'KT_XLN', 'DT'

  date: string                    // 'YYYY-MM-DD' (giữ string dễ query equality)
  shift_type: string | null
  shift_label: string | null      // 'Ca sáng'
  checklist_type: string

  scheduled_at: Timestamp | null
  deadline_at: Timestamp | null

  status: 'pending' | 'in_progress' | 'submitted' | 'approved' | 'rejected'
        | 'overdue' | 'failed'

  submitted_at: Timestamp | null
  submitted_by: string | null
  reviewed_at: Timestamp | null
  approved_at: Timestamp | null
  approved_by: string | null
  review_note: string | null

  general_note: string | null
  incident_report: string | null

  assigned_display_name: string | null
  actual_operator_name: string | null
  actual_operator_role: string | null
  actual_operator_note: string | null

  reviewer_name: string | null
  reviewer_role: string | null
  functional_reviewer_id: string | null
  functional_reviewer_name: string | null
  functional_reviewer_role: string | null

  account_type: 'personal' | 'shared_shift' | 'qlcs' | null
  created_at: Timestamp
}
```

### `checklistInstances/{instanceId}/items/{itemId}`

```ts
{
  template_item_id: string
  content: string                 // cache content tại thời điểm tạo
  sort_order: number
  requires_file: boolean
  is_required: boolean
  requires_note: boolean
  is_checked: boolean
  checked_at: Timestamp | null
  checked_by: string | null       // uid
  note: string | null
  file_urls: string[]             // mảng path trong storage
  created_at: Timestamp
  updated_at: Timestamp
}
```

### `checklistInstances/{instanceId}/evidenceFiles/{fileId}`

```ts
{
  item_id: string | null
  facility_id: string | null
  uploaded_by: string             // uid
  uploaded_by_name: string | null
  file_name: string
  file_path: string               // path trong bucket
  mime_type: string | null
  file_size: number | null
  created_at: Timestamp
  expires_at: Timestamp           // = created_at + 7d (Cloud Function set)
  deleted_at: Timestamp | null
}
```

### `checklistAuditLogs/{logId}`

```ts
{
  instance_id: string             // index
  action: 'submit' | 'approve' | 'reject'
        | 'upload_file' | 'remove_file'
        | 'check_item' | 'uncheck_item' | 'reopen'
  actor_id: string                // uid
  actor_name: string | null
  actor_role: string | null
  details: object | null          // tự do — chứa item_id, reason, file_size, …
  created_at: Timestamp           // server timestamp
}
```

---

## 3. Quyền truy cập — phản chiếu RLS Supabase

| Vai trò | Read scope | Write tick/submit | Approve/Reject |
| --- | --- | --- | --- |
| `CEO`, `GD_KD`, `GD_VP` | Toàn hệ thống | Toàn hệ thống | Có |
| `QLCS_*` | `facility_id` của mình | `facility_id` của mình | `facility_id` của mình |
| `TP_*` (chuyên môn) | `department_id` của mình | Đọc only (không tick thay) | Theo dõi, không duyệt mặc định |
| `shared_shift` (Lễ tân ca, KT ca) | Khớp 3 chiều `facility_id + department_id + shift_type` | Khớp 3 chiều | Không |
| Nhân viên thường | Chỉ instance có `assigned_to = uid` | Chỉ instance của mình | Không |

**Logic kiểm tra trong Firestore rules** (chi tiết xem
`firebase/firestore.rules`):

- `userProfile()` đọc `profiles/{uid}` để biết role/facility/department/shift
- `matchesUserScope(instanceData)` áp dụng cho mọi read/write trên instance
- `isTerminalStatus(s)` chặn tick khi status ∈ `(submitted, approved, failed)`
- Audit log: chỉ cho insert (actor_id = current uid), không cho update/delete

**Storage rules** (xem `firebase/storage.rules`):

- Path quy ước: `checklist-evidence/{facilityId}/{instanceId}/{itemId}/{ts}_{filename}`
- MIME whitelist: `image/jpeg | image/png | image/webp | application/pdf`
- Size: ảnh ≤ 5MB, PDF ≤ 10MB
- Read: admin hoặc QLCS-cùng-facility hoặc instance tồn tại (mềm — siết
  hơn cần check role qua subquery firestore.exists)
- Delete: admin hoặc owner (lưu owner trong metadata khi upload)

---

## 4. Cloud Functions cần triển khai

### 4.1. `generateDailyChecklistInstances`

- Schedule: `0 5 * * *` (5h sáng hằng ngày, timezone `Asia/Ho_Chi_Minh`)
- Logic:
  1. Lấy mọi `checklistTemplates` có `active = true`
  2. Với mỗi (template × facility áp dụng), tạo `checklistInstances`
     ngày hôm đó nếu chưa có (idempotent qua composite key
     `template_id + facility_id + date + shift_type`)
  3. Tạo subcollection `items` từ template items
  4. Set `status='pending'`, `scheduled_at`, `deadline_at` chuẩn HCM
- Chú ý timezone: dùng `Intl.DateTimeFormat` với `timeZone='Asia/Ho_Chi_Minh'`
  để xác định "hôm nay" theo VN. Không hardcode UTC.

### 4.2. `submitChecklist(instanceId, payload)`

- Callable function (HTTPS) — kiểm tra `context.auth` + scope tương tự rules
- Validate `actual_operator_name` + `actual_operator_role` bắt buộc
- Set `status`, `submitted_at`, `submitted_by`, snapshot operator info
- Ghi audit log `submit`

### 4.3. `approveChecklist(instanceId, note)` / `rejectChecklist(instanceId, reason)`

- Callable, kiểm tra `canApproveAny()` + scope facility/role
- Update status + approved_at/approved_by hoặc rejected
- Ghi audit log tương ứng
- Có thể chia 2 function cho rõ; hoặc 1 function với `action` arg

### 4.4. `uploadChecklistEvidence` (optional)

Nếu dùng signed upload URL:
- Callable trả `{ uploadUrl, fields, expectedPath }` cho client upload trực tiếp
- Sau khi upload xong, client gọi `confirmEvidence(filePath, fileSize, mimeType)`
  để insert document vào `evidenceFiles/`

Hoặc cách đơn giản hơn: client gọi `storage.ref().put(file)` trực tiếp
với Storage rules đã siết — rồi gọi 1 callable để insert metadata. **Cách
này khớp với pattern Supabase hiện tại**, dễ migrate.

### 4.5. `cleanupChecklistEvidenceAfter7Days`

- Schedule: `0 3 * * *` (3h sáng hằng ngày)
- Logic:
  1. Query `evidenceFiles` có `expires_at < now()` và `deleted_at IS NULL`
  2. Với mỗi file: gọi `bucket.file(file_path).delete()`
  3. Set `deleted_at = now()` trên document
- Ưu điểm so với pg_cron + plpgsql: function này XOÁ ĐƯỢC object thực tế
  trên storage (firebase-admin SDK có quyền).

### 4.6. `writeChecklistAuditLog` (optional helper)

- Internal callable / direct write — gói chung field `created_at = serverTimestamp()`
- Nếu để client ghi trực tiếp qua rules: đảm bảo `actor_id = uid`, không cho
  override timestamp.

---

## 5. Rủi ro & cách giảm thiểu

| Rủi ro | Mức độ | Giảm thiểu |
| --- | --- | --- |
| **Mất phân quyền nếu rules chưa chặt** | Cao | Test bằng Firebase emulator. Mỗi role có test case. Cấm dùng `allow read, write: if true;` bừa bãi. |
| **Duplicate checklist khi generate daily** | Trung bình | Idempotent qua composite key. Function dùng `getDocs` filter trước khi `addDoc`. Lưu key `{template}-{facility}-{date}-{shift}` làm doc id. |
| **Sai timezone Asia/Ho_Chi_Minh** | Cao | Cloud Function set timezone trong config. Mọi `scheduled_at/deadline_at` lưu Timestamp (UTC) nhưng tính từ `date + time` trong múi VN. UI render dùng `toLocaleString('vi-VN')`. |
| **Upload public quá rộng** | Cao | Bucket private hoàn toàn. Truy cập qua signed URL (`getDownloadURL` từ client có auth, hoặc `generateSignedUrl` từ admin). MIME + size limit ở rules. |
| **Audit log thiếu dữ liệu** | Trung bình | Mọi write business logic phải kèm `writeAuditLog`. Cloud Function set `created_at = FieldValue.serverTimestamp()`. Trigger Firestore `onCreate` cho instance/items để fallback. |
| **Cost: read-heavy operations** | Trung bình | Cache reference data (facilities, departments, roles) ở localStorage hoặc fetch 1 lần/session. Tránh listenable real-time toàn bộ collection — chỉ subscribe khi cần. |
| **Migrate dữ liệu cũ** | Cao | Phase tiếp theo: export Supabase → JSON → import Firestore bằng admin script. Giữ tham chiếu `legacy_supabase_id` để rollback. |

---

## 6. Thứ tự rollout đề xuất

1. **Đã làm**: scaffolding + service abstraction + docs + rules (file
   `firebase/firestore.rules`, `firebase/storage.rules`)
2. **Tiếp theo**:
   - Cài `firebase` + `firebase-admin` package
   - Thêm env Firebase vào `.env.local`
   - Uncomment các import trong `lib/firebase/*.ts`
   - Tạo project Firebase + bật Firestore + Storage + Cloud Functions
   - Export dữ liệu reference (facilities, departments, roles, profiles) từ
     Supabase sang JSON; import vào Firestore
3. **Sau khi có dữ liệu reference**:
   - Implement `firebaseChecklistService` thật
   - Test bằng emulator
   - Bật `NEXT_PUBLIC_DATA_BACKEND=firebase` ở 1 môi trường staging
4. **Cuối cùng**:
   - Export `checklist_templates` + `checklist_template_items` → import Firestore
   - Triển khai `generateDailyChecklistInstances` để bắt đầu sinh instance
     từ ngày X
   - Chạy song song Supabase + Firebase 1-2 ngày để đối chiếu
   - Tắt Supabase write ở module Checklist (giữ read-only để tham chiếu)

---

## 7. Env vars cần bổ sung

```bash
# Backend picker
NEXT_PUBLIC_DATA_BACKEND=supabase   # hoặc 'firebase' khi sẵn sàng

# Firebase Client (public)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin (server-only)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

`FIREBASE_PRIVATE_KEY` chú ý escape `\n`. Khi load trong code đã được
`replace(/\\n/g, '\n')` ở `lib/firebase/admin.ts`.
