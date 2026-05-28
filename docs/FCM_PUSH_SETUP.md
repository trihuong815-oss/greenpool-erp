# FCM Push Notifications — Hướng dẫn setup

Module `/cong-viec-ca-nhan` hỗ trợ push notification background qua FCM + Service Worker. Anh cần làm 3 bước sau để kích hoạt:

## 1. Lấy VAPID key trên Firebase Console

1. Mở [Firebase Console](https://console.firebase.google.com/project/green-pool-system/settings/cloudmessaging)
2. Tab **Cloud Messaging**
3. Cuộn xuống mục **Web Push certificates**
4. Bấm nút **"Generate key pair"**
5. Copy key (dạng `BNxxx...` dài ~88 ký tự)

## 2. Local development

Thêm vào `.env.local`:

```bash
NEXT_PUBLIC_FCM_VAPID_KEY=BNxxx...
CRON_SECRET=<random-string-32-ky-tu-tro-len>
```

Tạo CRON_SECRET random:
```bash
openssl rand -hex 32
```

Restart dev server.

## 3. Production (Firebase App Hosting)

Upload secrets lên Cloud Secret Manager:

```bash
# VAPID key (paste key khi prompt)
firebase apphosting:secrets:set NEXT_PUBLIC_FCM_VAPID_KEY

# CRON_SECRET (paste random string khi prompt)
firebase apphosting:secrets:set CRON_SECRET

# Grant App Hosting backend access cả 2 secret
firebase apphosting:secrets:grantaccess NEXT_PUBLIC_FCM_VAPID_KEY --backend greenpool-erp
firebase apphosting:secrets:grantaccess CRON_SECRET --backend greenpool-erp
```

## 4. GitHub Actions cron (gửi push background)

GitHub Actions cần 2 secrets để gọi cron endpoints:

1. Vào repo `trihuong815-oss/greenpool-erp` → **Settings → Secrets and variables → Actions**
2. Add 2 secrets:
   - **`APP_HOSTING_URL`** = `https://greenpool-erp--green-pool-system.asia-southeast1.hosted.app`
   - **`CRON_SECRET`** = giá trị giống bước 3 (cùng giá trị với production)

Workflow `.github/workflows/cron-reminders.yml` sẽ tự chạy:
- **Mỗi 5 phút** → gọi `/api/cron/send-reminders` (kiểm tra task có `reminderAt ≤ now`)
- **20:00 VN (13:00 UTC)** → gọi `/api/cron/send-evening-summary` (tin nhắn ngày mai)

## 5. Test e2e

1. Mở app trên điện thoại → vào `/cong-viec-ca-nhan`
2. Bấm nút **"Bật thông báo"** → cho phép permission
3. Tạo task với `Giờ thực hiện` = thời gian gần (vd. +5 phút từ now)
4. → Hệ thống tự set `reminderAt` = giờ - 1h
5. Đợi cron chạy (5 phút) → notification hiện trên điện thoại

## 6. iOS / iPhone

iOS Safari **chỉ hỗ trợ push khi app được "Add to Home Screen"** (PWA install):
1. Mở app trên Safari iPhone
2. Bấm **Share icon** → **Add to Home Screen**
3. Mở app từ icon home screen (không phải Safari tab)
4. Bật thông báo → hoạt động như native app

## 7. Trigger manual để test

Vào GitHub Actions tab:
- **Workflow "Cron — Send task reminders + evening summary"** → **Run workflow** → bấm Run

Hoặc curl direct:
```bash
curl -X POST https://greenpool-erp--green-pool-system.asia-southeast1.hosted.app/api/cron/send-reminders \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Troubleshooting

| Triệu chứng | Nguyên nhân | Fix |
|---|---|---|
| Banner hiện "Server chưa cấu hình VAPID" | env `NEXT_PUBLIC_FCM_VAPID_KEY` thiếu | Làm bước 1+2+3 |
| "Anh đã từ chối thông báo" | User denied permission | Settings trình duyệt → Allow notifications |
| Bấm "Bật thông báo" → "Service Worker init failed" | SW không register | Check console, có thể HTTPS hoặc cache issue |
| Cron chạy nhưng không nhận push | Token chưa lưu vào users/{uid}.fcmTokens | Mở app → bấm "Bật thông báo" lại |
| iPhone Safari: bấm Bật → "denied" ngay | iOS không cho push nếu chưa Add to Home Screen | Làm bước 6 |
| GitHub Action fail 401 | CRON_SECRET sai/khác giữa GitHub & App Hosting | Đảm bảo cùng 1 giá trị |

## Cost

- FCM: free unlimited
- GitHub Actions: free 2000 phút/tháng — cron usage ~60 phút/tháng
- App Hosting cron endpoints: chỉ tính invocations, free tier 2M/tháng
- **Tổng: 0đ với scale hiện tại** (<100 users)
