// PR-CASH1E-FIX (2026-06-23) — Test sendEmailNoti/sendEmailNotiBatch return shape
// dùng để engine map per-uid emailStatus.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sendEmailNoti, sendEmailNotiBatch, type EmailSendResult } from '@/lib/email/gmail-smtp-client';

describe('sendEmailNoti single result mapping', () => {
  const originalUser = process.env.GMAIL_SMTP_USER;
  const originalPass = process.env.GMAIL_SMTP_PASS;

  beforeEach(() => {
    delete process.env.GMAIL_SMTP_USER;
    delete process.env.GMAIL_SMTP_PASS;
  });
  afterEach(() => {
    if (originalUser) process.env.GMAIL_SMTP_USER = originalUser; else delete process.env.GMAIL_SMTP_USER;
    if (originalPass) process.env.GMAIL_SMTP_PASS = originalPass; else delete process.env.GMAIL_SMTP_PASS;
  });

  it('SMTP env chưa set → skipped/smtp_not_configured', async () => {
    const r = await sendEmailNoti({ to: 'a@b.vn', subject: 's', title: 't', body: 'b' });
    expect(r.status).toBe('skipped');
    expect(r.reason).toBe('smtp_not_configured');
    expect(r.errorMessage).toBeUndefined();
  });
});

describe('sendEmailNoti — env set, format validation', () => {
  const originalUser = process.env.GMAIL_SMTP_USER;
  const originalPass = process.env.GMAIL_SMTP_PASS;

  beforeEach(() => {
    // Set fake env để bypass smtp_not_configured. transporter sẽ tạo nhưng sendMail không gọi thật
    // vì email format invalid hoặc empty.
    process.env.GMAIL_SMTP_USER = 'test@example.com';
    process.env.GMAIL_SMTP_PASS = 'fake-app-password-16chars';
  });
  afterEach(() => {
    if (originalUser) process.env.GMAIL_SMTP_USER = originalUser; else delete process.env.GMAIL_SMTP_USER;
    if (originalPass) process.env.GMAIL_SMTP_PASS = originalPass; else delete process.env.GMAIL_SMTP_PASS;
  });

  it('email rỗng → skipped/missing_email (không thử send)', async () => {
    const r = await sendEmailNoti({ to: '', subject: 's', title: 't', body: 'b' });
    expect(r.status).toBe('skipped');
    expect(r.reason).toBe('missing_email');
  });

  it('email sai format → failed/invalid_email', async () => {
    const r = await sendEmailNoti({ to: 'no-at-sign', subject: 's', title: 't', body: 'b' });
    expect(r.status).toBe('failed');
    expect(r.reason).toBe('invalid_email');
    expect(r.errorMessage).toContain('invalid');
  });
});

describe('sendEmailNotiBatch perItem mapping', () => {
  const originalUser = process.env.GMAIL_SMTP_USER;
  const originalPass = process.env.GMAIL_SMTP_PASS;

  afterEach(() => {
    if (originalUser) process.env.GMAIL_SMTP_USER = originalUser; else delete process.env.GMAIL_SMTP_USER;
    if (originalPass) process.env.GMAIL_SMTP_PASS = originalPass; else delete process.env.GMAIL_SMTP_PASS;
  });

  it('items.length=0 → empty perItem', async () => {
    const r = await sendEmailNotiBatch([]);
    expect(r.ok).toBe(0); expect(r.failed).toBe(0); expect(r.skipped).toBe(0);
    expect(r.perItem).toEqual([]);
  });

  it('SMTP env không set → toàn bộ skipped/smtp_not_configured, perItem cùng độ dài items', async () => {
    delete process.env.GMAIL_SMTP_USER;
    delete process.env.GMAIL_SMTP_PASS;
    const items = [
      { to: 'a@b.vn', subject: 's1', title: 't1', body: 'b1' },
      { to: 'c@d.vn', subject: 's2', title: 't2', body: 'b2' },
      { to: 'e@f.vn', subject: 's3', title: 't3', body: 'b3' },
    ];
    const r = await sendEmailNotiBatch(items);
    expect(r.skipped).toBe(3);
    expect(r.perItem.length).toBe(3);
    for (const item of r.perItem) {
      expect(item.status).toBe('skipped');
      expect(item.reason).toBe('smtp_not_configured');
    }
  });
});

describe('EmailSendResult type shape (compile + runtime)', () => {
  it('status values are limited to sent | failed | skipped', () => {
    const r1: EmailSendResult = { status: 'sent' };
    const r2: EmailSendResult = { status: 'failed', reason: 'send_error', errorMessage: 'x' };
    const r3: EmailSendResult = { status: 'skipped', reason: 'smtp_not_configured' };
    expect(r1.status).toBe('sent');
    expect(r2.status).toBe('failed');
    expect(r3.status).toBe('skipped');
  });
});
