# Deploy Firebase App Hosting

## Trước khi deploy

1. **Nâng Firebase project lên Blaze plan**:
   - https://console.firebase.google.com/project/green-pool-system/usage/details
   - Đặt **budget alert $5** để không quá tay
   - Free quota dư cho ERP nội bộ (~$0/tháng thực tế)

2. **Cài firebase CLI mới nhất**:
   ```bash
   npm install -g firebase-tools
   firebase login
   ```

3. **Verify đăng nhập đúng account**:
   ```bash
   firebase projects:list | grep green-pool-system
   ```

## Upload secrets vào Cloud Secret Manager

Tất cả giá trị nhạy cảm phải qua Secret Manager. Chạy từng lệnh, lệnh sẽ hỏi
nhập giá trị (paste rồi Enter):

```bash
cd ~/Desktop/GreenPool_ERP

# 1. Firebase Admin private key (từ secrets/firebase-admin-sa.json, field "private_key")
firebase apphosting:secrets:set FIREBASE_PRIVATE_KEY --project green-pool-system

# 2. Firebase Web SDK config (lấy từ Firebase Console → Project Settings → SDK setup)
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_API_KEY --project green-pool-system
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN --project green-pool-system
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET --project green-pool-system
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID --project green-pool-system
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_APP_ID --project green-pool-system

# 3. AI key (chọn 1 trong các provider)
firebase apphosting:secrets:set GEMINI_API_KEY --project green-pool-system
# Hoặc:
# firebase apphosting:secrets:set ANTHROPIC_API_KEY --project green-pool-system
```

### Lấy giá trị từ `.env.local` để paste

```bash
# In ra value của field (không lộ ra terminal — chỉ copy ra clipboard)
grep "^NEXT_PUBLIC_FIREBASE_API_KEY=" ~/Desktop/GreenPool_ERP/.env.local | cut -d= -f2- | pbcopy
# → Cmd+V vào terminal khi firebase apphosting:secrets:set hỏi
```

### Lấy `FIREBASE_PRIVATE_KEY` từ service account JSON

```bash
# Extract private_key, copy ra clipboard (giữ nguyên \n)
python3 -c "import json; print(json.load(open('secrets/firebase-admin-sa.json'))['private_key'])" | pbcopy
```

## Tạo App Hosting backend (qua Console)

1. https://console.firebase.google.com/project/green-pool-system/apphosting
2. **Get started** → **Connect to GitHub** → authorize Firebase GitHub App
3. Chọn repo: `trihuong815-oss/greenpool-erp`
4. Branch: `main`
5. Backend ID: `greenpool-erp`
6. Region: **`asia-southeast1`** (Singapore)
7. Bấm **Deploy**

Build mất ~5-10 phút lần đầu (Cloud Build). Sau đó tự deploy mỗi lần push lên `main`.

## Sau khi deploy

URL mặc định: `https://greenpool-erp--green-pool-system.asia-southeast1.hosted.app`
(hoặc dạng `https://greenpool-erp-<hash>.web.app`)

### Bật authorized domain trong Firebase Auth

1. https://console.firebase.google.com/project/green-pool-system/authentication/settings
2. **Authorized domains** → **Add domain**
3. Paste domain mới (vd. `greenpool-erp--green-pool-system.asia-southeast1.hosted.app`)
4. Save

Không bước này → user không đăng nhập được trên domain mới.

## Gắn custom domain (tùy chọn)

1. App Hosting backend → tab **Domains** → **Add custom domain**
2. Nhập domain anh sở hữu (vd. `app.greenpool.vn`)
3. Add CNAME record theo hướng dẫn (qua nhà cung cấp domain — vd. CloudFlare/Vinahost)
4. Đợi SSL cert (Let's Encrypt, ~10-30 phút)

## Update sau khi deploy

Mọi push lên `main` → Firebase tự build + deploy. Không cần làm gì thêm.

## Rollback nếu lỗi

App Hosting → tab **Rollouts** → chọn version cũ → **Activate**

## Cost monitoring

- Quota dashboard: https://console.firebase.google.com/project/green-pool-system/usage
- Billing alerts: https://console.cloud.google.com/billing/budgets
- App Hosting metrics: https://console.firebase.google.com/project/green-pool-system/apphosting/greenpool-erp
