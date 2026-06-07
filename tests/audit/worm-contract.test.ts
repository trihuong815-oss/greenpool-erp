// Phase C.4 (2026-06-07): WORM contract test cho audit log.
//
// Mục tiêu: đảm bảo `lib/firebase/audit-log.ts` KHÔNG export bất kỳ helper
// nào sửa/xoá log đã ghi. Nếu future PR vô tình thêm `updateAuditLog` hay
// `deleteAuditLog` → test này sẽ fail → CI block.
//
// Đây là static contract — không gọi Firestore, chỉ inspect module exports.

import { describe, expect, it } from 'vitest';
import * as auditLog from '@/lib/firebase/audit-log';

describe('audit log WORM contract', () => {
  it('writeAuditLog là export duy nhất write side-effect', () => {
    const exports = Object.keys(auditLog);
    // Cho phép thêm type/const không phải function. Function dùng để mutate
    // PHẢI chỉ có writeAuditLog.
    const fnExports = exports.filter((name) => typeof (auditLog as any)[name] === 'function');
    expect(fnExports).toEqual(['writeAuditLog']);
  });

  it('không có export name chứa "update" hoặc "delete"', () => {
    const exports = Object.keys(auditLog);
    const forbidden = exports.filter((name) => /update|delete|remove|patch|edit/i.test(name));
    expect(forbidden).toEqual([]);
  });

  it('writeAuditLog signature: 1 param', () => {
    expect(auditLog.writeAuditLog.length).toBe(1);
  });
});
