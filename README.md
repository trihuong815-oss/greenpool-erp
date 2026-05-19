# Green Pool ERP — Next.js + Supabase

Hệ thống Quản lý Nội bộ cho cụm 5 cơ sở Bơi-Thể thao Green Pool.

## 🏗️ Tech Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend:** Supabase (PostgreSQL + Auth + Storage + Realtime)
- **Charts:** Recharts
- **Icons:** Lucide React
- **Deploy:** Vercel (edge network)

## 📋 Cấu trúc dự án

```
GreenPool_ERP_App/
├── README.md                    ← File này
├── package.json
├── tsconfig.json, *.config.*    ← Cấu hình
├── .env.example                 ← Mẫu env, copy thành .env.local
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql  ← SQL Schema (chạy trên Supabase)
├── app/
│   ├── layout.tsx
│   ├── login/page.tsx           ← Trang đăng nhập
│   └── (app)/                   ← Group route bảo vệ
│       ├── layout.tsx           ← Sidebar + Header
│       ├── dashboard/page.tsx   ← Dashboard
│       ├── doanh-so/page.tsx    ← Doanh số
│       ├── checklist/page.tsx   ← (shell) Checklist
│       ├── quy-trinh/page.tsx   ← (shell)
│       ├── giao-viec/page.tsx   ← (shell)
│       ├── sodo/page.tsx        ← (shell)
│       ├── luong/page.tsx       ← (shell)
│       ├── bao-cao/page.tsx     ← (shell)
│       ├── daotao/page.tsx      ← (shell)
│       ├── mkt/page.tsx         ← (shell)
│       └── settings-packages/page.tsx  ← (shell)
├── components/
│   ├── Sidebar.tsx              ← Menu trái lọc theo vai trò
│   ├── Header.tsx               ← Title + Notification bell
│   └── ModuleShell.tsx          ← Template "đang xây dựng" cho module shell
├── lib/
│   ├── supabase/client.ts       ← Supabase client (browser)
│   ├── permissions.ts           ← RBAC: ma trận quyền 18 vai trò × 11 module
│   ├── types.ts                 ← TypeScript types
│   └── utils.ts                 ← Helpers (formatVND, cn, ...)
├── middleware.ts                ← Bảo vệ routes (redirect chưa login)
└── public/
    └── logo.svg                 ← Logo Green Pool
```

## 🚀 Hướng dẫn cài đặt — TỪNG BƯỚC

### Bước 1: Cài Node.js dependencies

Mở Terminal, copy lệnh sau và Enter:

```bash
cd ~/Desktop/GreenPool_ERP_App
npm install
```

→ Đợi 1-2 phút để npm tải về tất cả packages.

### Bước 2: Tạo file .env.local

Copy file mẫu:

```bash
cp .env.example .env.local
```

Mở file `.env.local` bằng VS Code và paste 2 giá trị từ Supabase:

```
NEXT_PUBLIC_SUPABASE_URL=https://jxbwmbiofacnqzezqrru.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc... (paste anon key đầy đủ)
```

### Bước 3: Chạy SQL Schema trên Supabase

1. Vào [Supabase Dashboard](https://supabase.com/dashboard) → project của anh
2. Sidebar trái → **SQL Editor** (icon `< >`)
3. Bấm **+ New query**
4. Mở file `supabase/migrations/001_initial_schema.sql` trong VS Code
5. Copy toàn bộ nội dung → paste vào SQL Editor
6. Bấm **Run** (góc phải dưới)

→ Schema sẽ tạo: 14 bảng, 18 vai trò, 5 cơ sở, 7 phòng, RLS policies.

### Bước 4: Tạo tài khoản admin đầu tiên

Trong Supabase Dashboard:

1. **Authentication** → **Users** → bấm **Add user** → **Create new user**
2. Email: `ceo@greenpool.vn` (hoặc email thật của anh)
3. Password: mật khẩu mạnh
4. **Auto Confirm User**: ✅ tick vào (không cần verify email)
5. Bấm **Create user**

Sau đó tạo profile cho user vừa tạo. Vào **SQL Editor**:

```sql
insert into profiles (id, full_name, email, role_code)
values (
  (select id from auth.users where email = 'ceo@greenpool.vn'),
  'Nguyễn Văn A',
  'ceo@greenpool.vn',
  'CEO'
);
```

### Bước 5: Chạy app local

```bash
npm run dev
```

→ Mở http://localhost:3000 trong trình duyệt. Đăng nhập bằng email + mật khẩu đã tạo ở Bước 4.

### Bước 6: Đẩy lên GitHub

```bash
cd ~/Desktop/GreenPool_ERP_App
git init
git add .
git commit -m "Initial commit: Green Pool ERP Phase 1"
```

Tạo repo trên github.com:
1. Vào https://github.com/new
2. Repository name: `greenpool-erp`
3. **Private** (riêng tư — quan trọng)
4. Không tick các option (README, .gitignore, license)
5. **Create repository**

Sau khi tạo, copy 2 dòng lệnh GitHub hiển thị, dán vào Terminal:

```bash
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/greenpool-erp.git
git push -u origin main
```

### Bước 7: Deploy lên Vercel

1. Vào https://vercel.com/new
2. Import từ GitHub → chọn repo `greenpool-erp`
3. Framework Preset: **Next.js** (auto-detect)
4. **Environment Variables**: paste 2 giá trị từ `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Bấm **Deploy**

→ Sau 1-2 phút, anh sẽ có URL công khai dạng `https://greenpool-erp.vercel.app`

### Bước 8: Mua domain riêng (tuỳ chọn)

1. Vào https://www.namecheap.com (hoặc tenten.vn)
2. Mua domain `greenpool.com.vn` hoặc tương tự (~250k/năm)
3. Trong Vercel → project settings → **Domains** → thêm domain → làm theo hướng dẫn cấu hình DNS

## 📊 Trạng thái module

| Module | Trạng thái | Ghi chú |
|---|---|---|
| Auth + Layout | ✅ Hoàn thành | Đăng nhập + sidebar lọc theo vai trò |
| Dashboard | ✅ Phase 1 | KPI cơ bản, sẽ mở rộng widget |
| Doanh số | ✅ Phase 1 | Bảng + KPI, sẽ thêm chart + tiến độ tháng |
| Checklist | 🚧 Shell | Logic có trong prototype, chuyển sang React |
| Quy trình | 🚧 Shell | File upload cần Supabase Storage |
| Giao việc | 🚧 Shell | Workflow ma trận + 2 GĐ duyệt |
| Sơ đồ tổ chức | 🚧 Shell | Render 42 vai trò × 5 tầng |
| Lương 3P | 🚧 Shell | Công thức tự tính |
| Báo cáo | 🚧 Shell | Tích hợp xuất Word/Excel |
| Đào tạo (API) | 🚧 Shell | Tích hợp API ngoài |
| Marketing (API) | 🚧 Shell | Tích hợp API ngoài |
| Quản lý gói | 🚧 Shell | CRUD gói + per-facility editing |

## 🔧 Phát triển tiếp

Mỗi module "Shell" có sẵn:
- Route + middleware bảo vệ
- Permission check
- Header + Sidebar
- Placeholder UI

Để hoàn thiện 1 module:
1. Tham khảo prototype HTML trong `~/Desktop/GreenPool_ERP/` (đầy đủ logic + UI)
2. Chuyển sang React components trong `components/`
3. Thay mock data bằng Supabase queries
4. Test với từng vai trò (CEO, QLCS, TP, NV)

## 📞 Khi cần hỗ trợ

Mở Cowork và yêu cầu: *"Tiếp tục hoàn thiện module [tên module] cho Green Pool ERP"* — tôi sẽ implement chi tiết.

---
*Generated by Claude (Cowork) — Phase 1 foundation, May 2026*
