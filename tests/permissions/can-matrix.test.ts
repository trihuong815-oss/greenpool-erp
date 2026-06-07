// Phase B.4 (2026-06-07): Test can() permission matrix — verify mỗi role × action combo.
// Test này = single source of truth document hoá quyền: đọc test, biết role nào được gì.

import { describe, it, expect } from 'vitest';
import { can } from '@/lib/auth';

const CEO = { roleCode: 'CEO', uid: 'ceo-uid' };
const ADMIN = { roleCode: 'ADMIN', uid: 'admin-uid' };
const GD_KD = { roleCode: 'GD_KD', uid: 'gd-kd-uid', branchId: null };
const TP_KT = { roleCode: 'TP_KT', uid: 'tp-uid' };
const QLCS_HM = { roleCode: 'QLCS_HM', uid: 'qlcs-uid', branchId: 'HM' as const };
const NV_SALE = { roleCode: 'NV_SALE', uid: 'nv-uid', branchId: 'HM' as const };

describe('can() permission matrix', () => {
  // ─── Tasks ───
  describe('task:create_proposal', () => {
    it('TP/QLCS/GD/CEO/ADMIN được tạo đề xuất', () => {
      expect(can(CEO, 'task:create_proposal')).toBe(true);
      expect(can(ADMIN, 'task:create_proposal')).toBe(true);
      expect(can(GD_KD, 'task:create_proposal')).toBe(true);
      expect(can(TP_KT, 'task:create_proposal')).toBe(true);
      expect(can(QLCS_HM, 'task:create_proposal')).toBe(true);
    });

    it('NV KHÔNG được tạo đề xuất', () => {
      expect(can(NV_SALE, 'task:create_proposal')).toBe(false);
    });
  });

  describe('task:create_assignment', () => {
    it('CHỈ TopAdmin + GD tạo giao việc — TP/QLCS bị chặn (Phase 12.8)', () => {
      expect(can(CEO, 'task:create_assignment')).toBe(true);
      expect(can(ADMIN, 'task:create_assignment')).toBe(true);
      expect(can(GD_KD, 'task:create_assignment')).toBe(true);
      expect(can(TP_KT, 'task:create_assignment')).toBe(false);
      expect(can(QLCS_HM, 'task:create_assignment')).toBe(false);
    });
  });

  // ─── Sales ───
  describe('sales:create_entry', () => {
    it('QLCS chỉ branch mình, admin/GD any branch', () => {
      expect(can(QLCS_HM, 'sales:create_entry', { branchId: 'HM' })).toBe(true);
      expect(can(QLCS_HM, 'sales:create_entry', { branchId: 'TK' })).toBe(false);
      expect(can(GD_KD, 'sales:create_entry', { branchId: 'TK' })).toBe(true);
      expect(can(ADMIN, 'sales:create_entry', { branchId: 'CTT' })).toBe(true);
    });

    it('NV không tạo entry trực tiếp', () => {
      expect(can(NV_SALE, 'sales:create_entry', { branchId: 'HM' })).toBe(false);
    });
  });

  describe('sales:view_all_facilities', () => {
    it('Admin/GD/TP view all; QLCS/NV chỉ branch mình', () => {
      expect(can(CEO, 'sales:view_all_facilities')).toBe(true);
      expect(can(GD_KD, 'sales:view_all_facilities')).toBe(true);
      expect(can(TP_KT, 'sales:view_all_facilities')).toBe(true);
      expect(can(QLCS_HM, 'sales:view_all_facilities')).toBe(false);
      expect(can(NV_SALE, 'sales:view_all_facilities')).toBe(false);
    });
  });

  // ─── Users ───
  describe('users:edit_role — CRITICAL action', () => {
    it('CHỈ TopAdmin (CEO + ADMIN), KHÔNG GD', () => {
      expect(can(CEO, 'users:edit_role')).toBe(true);
      expect(can(ADMIN, 'users:edit_role')).toBe(true);
      expect(can(GD_KD, 'users:edit_role')).toBe(false);
      expect(can(TP_KT, 'users:edit_role')).toBe(false);
    });
  });

  describe('users:create / disable / reset_password', () => {
    it('TopAdmin + GD được', () => {
      expect(can(CEO, 'users:create')).toBe(true);
      expect(can(GD_KD, 'users:create')).toBe(true);
      expect(can(GD_KD, 'users:disable')).toBe(true);
      expect(can(GD_KD, 'users:reset_password')).toBe(true);
    });
    it('TP/QLCS/NV không được', () => {
      expect(can(TP_KT, 'users:create')).toBe(false);
      expect(can(QLCS_HM, 'users:disable')).toBe(false);
    });
  });

  // ─── Settings ───
  describe('settings:edit_branches', () => {
    it('CHỈ TopAdmin được edit branches (cấu hình hệ thống)', () => {
      expect(can(CEO, 'settings:edit_branches')).toBe(true);
      expect(can(ADMIN, 'settings:edit_branches')).toBe(true);
      expect(can(GD_KD, 'settings:edit_branches')).toBe(false);
    });
  });

  describe('settings:edit_packages', () => {
    it('TopAdmin + GD được edit packages', () => {
      expect(can(CEO, 'settings:edit_packages')).toBe(true);
      expect(can(GD_KD, 'settings:edit_packages')).toBe(true);
      expect(can(TP_KT, 'settings:edit_packages')).toBe(false);
    });
  });

  // ─── Checklist ───
  describe('checklist:supervisor_view', () => {
    it('Admin/GD/TP/QLCS được supervisor view', () => {
      expect(can(CEO, 'checklist:supervisor_view')).toBe(true);
      expect(can(GD_KD, 'checklist:supervisor_view')).toBe(true);
      expect(can(TP_KT, 'checklist:supervisor_view')).toBe(true);
      expect(can(QLCS_HM, 'checklist:supervisor_view')).toBe(true);
      expect(can(NV_SALE, 'checklist:supervisor_view')).toBe(false);
    });
  });

  // ─── Edge cases ───
  describe('edge cases', () => {
    it('Role không tồn tại → false mọi action', () => {
      const unknown = { roleCode: 'NONEXISTENT', uid: 'uid' };
      expect(can(unknown, 'task:create_proposal')).toBe(false);
      expect(can(unknown, 'users:edit_role')).toBe(false);
    });
  });
});
