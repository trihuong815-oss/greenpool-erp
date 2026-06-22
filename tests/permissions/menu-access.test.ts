// Phase A.7: Test #2 — menu access matrix.
// canAccessRoute đảm bảo NV không thấy /quan-ly-sale; CEO/ADMIN/GD thấy mọi route được phép.
// Catch khi anh thêm route mới mà quên update MENU_PERMISSIONS.

import { describe, it, expect } from 'vitest';
import { canAccessRoute } from '@/lib/permissions';

describe('canAccessRoute matrix', () => {
  it('CEO truy cập được dashboard + doanh-so + giao-viec + ky-thuat + checklist-v2 + users', () => {
    expect(canAccessRoute('CEO', 'dashboard')).toBe(true);
    expect(canAccessRoute('CEO', 'doanh-so')).toBe(true);
    expect(canAccessRoute('CEO', 'giao-viec')).toBe(true);
    expect(canAccessRoute('CEO', 'ky-thuat')).toBe(true);
    expect(canAccessRoute('CEO', 'checklist-v2')).toBe(true);
    expect(canAccessRoute('CEO', 'users')).toBe(true);
  });

  it('ADMIN truy cập được mọi module quản trị', () => {
    expect(canAccessRoute('ADMIN', 'dashboard')).toBe(true);
    expect(canAccessRoute('ADMIN', 'users')).toBe(true);
    expect(canAccessRoute('ADMIN', 'bao-mat')).toBe(true);
  });

  it('GD_KD truy cập module KD nhưng KHÔNG /quan-ly-cong-viec admin', () => {
    expect(canAccessRoute('GD_KD', 'dashboard')).toBe(true);
    expect(canAccessRoute('GD_KD', 'doanh-so')).toBe(true);
    expect(canAccessRoute('GD_KD', 'giao-viec')).toBe(true);
  });

  it('Route không tồn tại trong menu permission → trả false (deny by default)', () => {
    expect(canAccessRoute('NV_SALE', 'admin-secret-route')).toBe(false);
    expect(canAccessRoute('NV_SALE', '__proto__')).toBe(false);
  });

  it('Role không tồn tại → chỉ default dashboard (fallback safe)', () => {
    // canAccessRoute fallback ['dashboard'] cho role không tồn tại — đảm bảo user lỡ không có
    // role record vẫn vào được dashboard, không bị lock-out hoàn toàn.
    expect(canAccessRoute('NONEXISTENT_ROLE', 'dashboard')).toBe(true);
    expect(canAccessRoute('NONEXISTENT_ROLE', 'users')).toBe(false);
    expect(canAccessRoute('', 'doanh-so')).toBe(false);
  });

  // PR-TK2.1 (2026-06-21): TP_GS được xem /doanh-so-v2/tong-ket để giám sát.
  // Quyền Export Excel VẪN bị chặn ở canExportSalesExcel (PR-6.3, scope.ts test riêng).
  // PR-PROMO1B (2026-06-23): + /chuong-trinh read-only (giám sát workflow KM).
  //   UI đã harden từ PR-PROMO1A — isPromoReadOnlyRole(TP_GS)=true → ẩn mọi button.
  describe('TP_GS — giám sát doanh số tháng + KM', () => {
    it('TP_GS được xem /doanh-so-v2/tong-ket', () => {
      expect(canAccessRoute('TP_GS', 'doanh-so-v2/tong-ket')).toBe(true);
    });

    it('TP_GS được xem /doanh-so-v2/chuong-trinh (read-only — PR-PROMO1B)', () => {
      expect(canAccessRoute('TP_GS', 'doanh-so-v2/chuong-trinh')).toBe(true);
    });

    it('TP_GS KHÔNG vào các route doanh số nhập/đối chiếu/công nợ (mutation workflow)', () => {
      expect(canAccessRoute('TP_GS', 'doanh-so-v2/nhap')).toBe(false);
      expect(canAccessRoute('TP_GS', 'doanh-so-v2/doi-chieu')).toBe(false);
      expect(canAccessRoute('TP_GS', 'doanh-so-v2/cong-no')).toBe(false);
    });

    it('TP_GS giữ nguyên các route giám sát cũ (bao-cao/sodo/phe-duyet/giao-viec)', () => {
      expect(canAccessRoute('TP_GS', 'bao-cao')).toBe(true);
      expect(canAccessRoute('TP_GS', 'sodo')).toBe(true);
      expect(canAccessRoute('TP_GS', 'phe-duyet')).toBe(true);
      expect(canAccessRoute('TP_GS', 'giao-viec')).toBe(true);
    });
  });

  // PR-TK2.1: regression — các role khác KHÔNG đổi quyền /tong-ket
  it('Các role hiện tại vẫn vào được /tong-ket như cũ', () => {
    expect(canAccessRoute('ADMIN', 'doanh-so-v2/tong-ket')).toBe(true);
    expect(canAccessRoute('CEO', 'doanh-so-v2/tong-ket')).toBe(true);
    expect(canAccessRoute('CHU_TICH', 'doanh-so-v2/tong-ket')).toBe(true);
    expect(canAccessRoute('GD_KD', 'doanh-so-v2/tong-ket')).toBe(true);
    expect(canAccessRoute('GD_VP', 'doanh-so-v2/tong-ket')).toBe(true);
    expect(canAccessRoute('TP_KE', 'doanh-so-v2/tong-ket')).toBe(true);
    expect(canAccessRoute('NV_KE', 'doanh-so-v2/tong-ket')).toBe(true);
    expect(canAccessRoute('QLCS_HM', 'doanh-so-v2/tong-ket')).toBe(true);
    expect(canAccessRoute('QLCS_TT', 'doanh-so-v2/tong-ket')).toBe(true);
    expect(canAccessRoute('NV_SALE', 'doanh-so-v2/tong-ket')).toBe(true);
    expect(canAccessRoute('NV_SALE_PT', 'doanh-so-v2/tong-ket')).toBe(true);
  });
});
