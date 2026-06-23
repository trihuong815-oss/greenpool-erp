// PR-CASH1E (2026-06-23) — Unit tests cho pure helpers trong finance-notifications.
// Test wrapper integrations đầy đủ qua runtime smoke trên production (lib có 'server-only').

import { describe, it, expect } from 'vitest';
import {
  _buildSubmittedRecipients,
  _buildSubmittedMessage,
  _buildCheckedMessage,
  _buildReturnedMessage,
  _buildLinkUrl,
} from '@/lib/firebase/finance-notifications';
import type { ReportSentTo } from '@/lib/finance/cashflow-report-types';

describe('_buildSubmittedRecipients (sentTo dedupe)', () => {
  it('flatten 4 group + dedupe', () => {
    const sentTo: ReportSentTo = {
      treasurerUserIds: ['u1', 'u2'],
      accountingManagerUserIds: ['u2', 'u3'],
      supervisionUserIds: ['u4'],
      leadershipUserIds: ['u5', 'u1'],
    };
    const r = _buildSubmittedRecipients(sentTo);
    expect(r.sort()).toEqual(['u1', 'u2', 'u3', 'u4', 'u5'].sort());
  });

  it('empty groups → empty array', () => {
    const sentTo: ReportSentTo = {
      treasurerUserIds: [], accountingManagerUserIds: [],
      supervisionUserIds: [], leadershipUserIds: [],
    };
    expect(_buildSubmittedRecipients(sentTo)).toEqual([]);
  });

  it('filters falsy uids', () => {
    const sentTo = {
      treasurerUserIds: ['u1', '', null as any],
      accountingManagerUserIds: [],
      supervisionUserIds: [undefined as any],
      leadershipUserIds: ['u2'],
    } as ReportSentTo;
    expect(_buildSubmittedRecipients(sentTo).sort()).toEqual(['u1', 'u2']);
  });
});

describe('Message builders include required fields', () => {
  it('Submitted message contains branchName, date, totals', () => {
    const m = _buildSubmittedMessage({
      branchName: 'Green Pool Hoàng Mai', date: '2026-06-23',
      revenueTotal: 1500000, expenseTotal: 400000, netTotal: 1100000,
    });
    expect(m).toContain('Green Pool Hoàng Mai');
    expect(m).toContain('2026-06-23');
    expect(m).toContain('1.500.000');
    expect(m).toContain('400.000');
    expect(m).toContain('1.100.000');
  });

  it('Checked message contains date, branch, checker name', () => {
    const m = _buildCheckedMessage({
      branchName: 'HM Branch', date: '2026-06-23',
      checkedByName: 'Nguyễn Thị Hương', checkNote: null,
    });
    expect(m).toContain('2026-06-23');
    expect(m).toContain('HM Branch');
    expect(m).toContain('Nguyễn Thị Hương');
    expect(m).toContain('kiểm tra');
  });

  it('Checked message appends note when present', () => {
    const m = _buildCheckedMessage({
      branchName: 'HM', date: '2026-06-23',
      checkedByName: 'TPKE User', checkNote: 'Số liệu khớp',
    });
    expect(m).toContain('Ghi chú: Số liệu khớp');
  });

  it('Returned message contains returnReason', () => {
    const m = _buildReturnedMessage({
      branchName: 'CTT Branch', date: '2026-06-23',
      returnReason: 'thiếu hoá đơn vật tư',
    });
    expect(m).toContain('CTT Branch');
    expect(m).toContain('2026-06-23');
    expect(m).toContain('bị trả lại');
    expect(m).toContain('Lý do: thiếu hoá đơn vật tư');
  });
});

describe('_buildLinkUrl', () => {
  it('Submitted → /bao-cao-thu-chi (người nhận: lãnh đạo/kế toán review)', () => {
    expect(_buildLinkUrl('bao-cao', '2026-06-23', 'HM')).toBe('/bao-cao-thu-chi?date=2026-06-23&branchId=HM');
  });

  it('Checked/Returned → /chi-phi-co-so (người nhận: NV_KE bổ sung chi)', () => {
    expect(_buildLinkUrl('chi-phi', '2026-06-23', 'TK')).toBe('/chi-phi-co-so?date=2026-06-23&branchId=TK');
  });

  it('Escapes special chars in branchId/date', () => {
    expect(_buildLinkUrl('chi-phi', '2026-06-23', '24')).toBe('/chi-phi-co-so?date=2026-06-23&branchId=24');
  });
});
