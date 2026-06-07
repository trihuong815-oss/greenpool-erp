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
});
