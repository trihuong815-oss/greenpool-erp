// PR-CASH-EXPENSE-BANK-ACCOUNT (2026-06-24) — Pure helper tests.

import { describe, it, expect } from 'vitest';
import {
  requiresTransferAccount,
  normalizeTransferAccount,
  validateTransferAccountForRecord,
  TRANSFER_ACCOUNT_MAX_LEN,
} from '@/lib/finance/transfer-account';

describe('requiresTransferAccount', () => {
  it('transfer → true', () => expect(requiresTransferAccount('transfer')).toBe(true));
  it('cash → false', () => expect(requiresTransferAccount('cash')).toBe(false));
  it('card → false', () => expect(requiresTransferAccount('card')).toBe(false));
  it('other → false', () => expect(requiresTransferAccount('other')).toBe(false));
});

describe('normalizeTransferAccount', () => {
  it('transfer + value → trimmed value', () => {
    expect(normalizeTransferAccount('transfer', '  VCB 0101  ')).toBe('VCB 0101');
  });
  it('transfer + null → null', () => {
    expect(normalizeTransferAccount('transfer', null)).toBeNull();
  });
  it('transfer + empty → null', () => {
    expect(normalizeTransferAccount('transfer', '')).toBeNull();
    expect(normalizeTransferAccount('transfer', '   ')).toBeNull();
  });
  it('transfer + > max len → slice', () => {
    const long = 'a'.repeat(TRANSFER_ACCOUNT_MAX_LEN + 50);
    const out = normalizeTransferAccount('transfer', long);
    expect(out).toBeTruthy();
    expect(out!.length).toBe(TRANSFER_ACCOUNT_MAX_LEN);
  });
  it('cash + value → forced null (clear dirty data)', () => {
    expect(normalizeTransferAccount('cash', 'VCB 0101')).toBeNull();
  });
  it('card + value → null', () => {
    expect(normalizeTransferAccount('card', 'should-clear')).toBeNull();
  });
  it('other + value → null', () => {
    expect(normalizeTransferAccount('other', 'x')).toBeNull();
  });
});

describe('validateTransferAccountForRecord', () => {
  it('transfer + valid → ok', () => {
    const v = validateTransferAccountForRecord('transfer', 'VCB 0101');
    expect(v.ok).toBe(true);
  });
  it('transfer + null → error', () => {
    const v = validateTransferAccountForRecord('transfer', null);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toContain('Vui lòng nhập tài khoản');
  });
  it('transfer + empty string → error', () => {
    const v = validateTransferAccountForRecord('transfer', '');
    expect(v.ok).toBe(false);
  });
  it('transfer + spaces only → error', () => {
    const v = validateTransferAccountForRecord('transfer', '   ');
    expect(v.ok).toBe(false);
  });
  it('cash + value → ok (bỏ qua, server force null)', () => {
    expect(validateTransferAccountForRecord('cash', 'dirty').ok).toBe(true);
  });
  it('cash + null → ok', () => {
    expect(validateTransferAccountForRecord('cash', null).ok).toBe(true);
  });
});
