// PR-PROMO2-B (2026-06-23) — Test classifyAdHoc với edge cases chính xác.

import { describe, it, expect } from 'vitest';
import {
  classifyAdHoc,
  AD_HOC_THRESHOLDS,
  AD_HOC_CLASSIFICATION_LABELS,
  AD_HOC_CLASSIFICATION_TONE,
  AD_HOC_CLASSIFICATION_PRIORITY,
} from '@/lib/sales-v2/ad-hoc-thresholds';

describe('AD_HOC_THRESHOLDS constants', () => {
  it('NORMAL_MAX=3, LOW_MAX=10, REVIEW_MAX=20', () => {
    expect(AD_HOC_THRESHOLDS.NORMAL_MAX).toBe(3);
    expect(AD_HOC_THRESHOLDS.LOW_MAX).toBe(10);
    expect(AD_HOC_THRESHOLDS.REVIEW_MAX).toBe(20);
  });
});

describe('classifyAdHoc — exact edges (Phương án A chốt 2026-06-23)', () => {
  it('0 → NORMAL', () => {
    expect(classifyAdHoc(0)).toBe('NORMAL');
  });

  it('1.5 → NORMAL', () => {
    expect(classifyAdHoc(1.5)).toBe('NORMAL');
  });

  it('3 (exact boundary) → NORMAL', () => {
    expect(classifyAdHoc(3)).toBe('NORMAL');
  });

  it('3.01 → LOW', () => {
    expect(classifyAdHoc(3.01)).toBe('LOW');
  });

  it('7 → LOW', () => {
    expect(classifyAdHoc(7)).toBe('LOW');
  });

  it('10 (exact boundary) → LOW', () => {
    expect(classifyAdHoc(10)).toBe('LOW');
  });

  it('10.01 → REVIEW', () => {
    expect(classifyAdHoc(10.01)).toBe('REVIEW');
  });

  it('15 → REVIEW', () => {
    expect(classifyAdHoc(15)).toBe('REVIEW');
  });

  it('20 (exact boundary) → REVIEW', () => {
    expect(classifyAdHoc(20)).toBe('REVIEW');
  });

  it('20.01 → HIGH_RISK', () => {
    expect(classifyAdHoc(20.01)).toBe('HIGH_RISK');
  });

  it('50 → HIGH_RISK', () => {
    expect(classifyAdHoc(50)).toBe('HIGH_RISK');
  });

  it('100 → HIGH_RISK', () => {
    expect(classifyAdHoc(100)).toBe('HIGH_RISK');
  });
});

describe('classifyAdHoc — invalid inputs fallback safe', () => {
  it('NaN → NORMAL (fallback safe)', () => {
    expect(classifyAdHoc(NaN)).toBe('NORMAL');
  });

  it('Infinity → fallback NORMAL', () => {
    // Note: !Number.isFinite(Infinity) → NORMAL
    expect(classifyAdHoc(Infinity)).toBe('NORMAL');
  });

  it('negative → NORMAL (caller phải skip case không hợp lệ trước)', () => {
    expect(classifyAdHoc(-5)).toBe('NORMAL');
  });
});

describe('Labels + tone + priority maps', () => {
  it('4 classification labels tiếng Việt', () => {
    expect(AD_HOC_CLASSIFICATION_LABELS.NORMAL).toBe('Sai số nhẹ');
    expect(AD_HOC_CLASSIFICATION_LABELS.LOW).toBe('Giảm nhẹ');
    expect(AD_HOC_CLASSIFICATION_LABELS.REVIEW).toBe('Cần kiểm tra');
    expect(AD_HOC_CLASSIFICATION_LABELS.HIGH_RISK).toBe('Rủi ro cao');
  });

  it('Tone map đúng: NORMAL=slate, LOW=amber, REVIEW=orange, HIGH_RISK=rose', () => {
    expect(AD_HOC_CLASSIFICATION_TONE.NORMAL).toBe('slate');
    expect(AD_HOC_CLASSIFICATION_TONE.LOW).toBe('amber');
    expect(AD_HOC_CLASSIFICATION_TONE.REVIEW).toBe('orange');
    expect(AD_HOC_CLASSIFICATION_TONE.HIGH_RISK).toBe('rose');
  });

  it('Priority: HIGH_RISK first, NORMAL last', () => {
    expect(AD_HOC_CLASSIFICATION_PRIORITY.HIGH_RISK).toBe(0);
    expect(AD_HOC_CLASSIFICATION_PRIORITY.REVIEW).toBe(1);
    expect(AD_HOC_CLASSIFICATION_PRIORITY.LOW).toBe(2);
    expect(AD_HOC_CLASSIFICATION_PRIORITY.NORMAL).toBe(3);
  });
});
