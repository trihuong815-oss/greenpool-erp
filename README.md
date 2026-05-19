# Green Pool ERP — Prototype v1.0

Hệ thống Quản lý Nội bộ Green Pool — bản **prototype HTML** chạy ngay không cần cài đặt.

## Cách mở

**Cách 1 — Đơn giản nhất:**
1. Mở Finder, vào Desktop, vào thư mục `GreenPool_ERP/`
2. Click đúp vào file `index.html`
3. Trình duyệt Safari/Chrome sẽ mở ra với app

**Cách 2 — Khuyến nghị (chạy mượt hơn):**
1. Mở Terminal (Cmd + Space, gõ Terminal)
2. Paste lệnh sau và Enter:
   ```
   cd ~/Desktop/GreenPool_ERP && python3 -m http.server 8000
   ```
3. Mở trình duyệt vào địa chỉ: http://localhost:8000

## Tính năng đã có trong prototype

### Đăng nhập với 18 vai trò khác nhau
Chọn vai trò trong dropdown khi đăng nhập để xem giao diện tương ứng. Mỗi vai trò có dashboard khác nhau.

### 9 Module chính
1. **Dashboard** — Tổng quan theo vai trò
2. **Doanh số 5 cơ sở** — Bảng + biểu đồ doanh thu chi tiết
3. **Checklist vận hành** — Mẫu cho từng vai trò + tỷ lệ tuân thủ
4. **Giao việc & Đề xuất** — Kanban-style với 3 cột (Chờ/Đang xử lý/Hoàn thành)
5. **Sơ đồ tổ chức** — 5 tầng / 42 vai trò
6. **Lương 3P + KPI 3 tầng** — Demo cho NV Sale với công thức real-time
7. **Báo cáo tự động** — Lịch xuất báo cáo Word/Excel
8. **Đào tạo (API)** — Mô phỏng tích hợp với app học viên
9. **Marketing (API)** — Mô phỏng tích hợp với app MKT + CRM

## Dữ liệu sử dụng

Toàn bộ dữ liệu là **số liệu thật** của Green Pool T1-T5/2026:
- Tổng doanh thu cụm: 37,86 Tỷ
- 5 cơ sở với cơ cấu doanh thu chi tiết
- 5.006 học viên × 7 dịch vụ
- 17.863 leads × 6 nguồn (Renew, Refer, Face, Walk-in, Hotline, Thị Trường)

## Lưu ý

Đây là **prototype** để xem giao diện và trải nghiệm. Trong bản app thật:
- Mỗi user chỉ thấy phần dữ liệu thuộc quyền hạn của mình
- Có database thật (Supabase), không phải mock data
- Có tích hợp API thật với CRM + App MKT + App Đào tạo
- Có 2FA, audit log, backup
- Mobile responsive đầy đủ

## Bước tiếp theo

Sau khi Lãnh đạo duyệt UX:
1. Đăng ký tài khoản Supabase (miễn phí)
2. Đăng ký tài khoản Vercel (miễn phí)
3. Đăng ký domain greenpool.vn (~300k/năm)
4. Triển khai Phase 1 (Auth + Database) trong 4-5 phiên Cowork

---
*Generated: 18/05/2026 | Green Pool ERP v1.0 Prototype*
