// Tests cho lib/firebase/private-key-normalize.ts
//
// Cover các môi trường lưu trữ FIREBASE_PRIVATE_KEY phổ biến:
//   - Vercel env: literal \n quoted hoặc unquoted
//   - GCP Secret Manager: real multiline PEM
//   - Bad inputs: empty, missing markers, garbled

import { describe, it, expect } from 'vitest';
import {
  normalizePrivateKey,
  PrivateKeyFormatError,
  getPrivateKeyDiagnostic,
} from '@/lib/firebase/private-key-normalize';

// Synthetic fake PEM content (DOES NOT validate as a real key — just used for shape tests).
// 100% safe to commit — gibberish base64-looking text inside markers.
const FAKE_PEM_MULTILINE =
  '-----BEGIN PRIVATE KEY-----\n'
  + 'MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQ\n'
  + 'gibberishOnlyForTestShapeNotARealKeyABCDEFGH\n'
  + '-----END PRIVATE KEY-----\n';

const FAKE_PEM_ESCAPED_NEWLINE = FAKE_PEM_MULTILINE.replace(/\n/g, '\\n');

describe('normalizePrivateKey — valid inputs', () => {
  it('Multiline PEM (Secret Manager format) → returned as-is (trimmed)', () => {
    const out = normalizePrivateKey(FAKE_PEM_MULTILINE);
    expect(out).toContain('-----BEGIN PRIVATE KEY-----');
    expect(out).toContain('-----END PRIVATE KEY-----');
    expect(out).toContain('\n');
  });

  it('Escaped \\n format (Vercel .env style) → converted to real newlines', () => {
    const out = normalizePrivateKey(FAKE_PEM_ESCAPED_NEWLINE);
    expect(out).toContain('-----BEGIN PRIVATE KEY-----');
    expect(out).toContain('\n');
    expect(out).not.toContain('\\n');
  });

  it('Wrapped in double quotes → quotes stripped', () => {
    const out = normalizePrivateKey(`"${FAKE_PEM_ESCAPED_NEWLINE}"`);
    expect(out.startsWith('-----BEGIN')).toBe(true);
    expect(out.endsWith('-----\n') || out.endsWith('-----')).toBe(true);
    expect(out).not.toContain('"');
  });

  it('Wrapped in single quotes → quotes stripped', () => {
    const out = normalizePrivateKey(`'${FAKE_PEM_ESCAPED_NEWLINE}'`);
    expect(out.startsWith('-----BEGIN')).toBe(true);
    expect(out).not.toContain("'");
  });

  it('Leading/trailing whitespace → trimmed', () => {
    const out = normalizePrivateKey(`  \n\n${FAKE_PEM_MULTILINE}\n  `);
    expect(out.startsWith('-----BEGIN')).toBe(true);
  });

  it('Mixed: quoted + escaped newlines + surrounding whitespace', () => {
    const out = normalizePrivateKey(`  "${FAKE_PEM_ESCAPED_NEWLINE}"  `);
    expect(out.startsWith('-----BEGIN')).toBe(true);
    expect(out).not.toContain('"');
    expect(out).not.toContain('\\n');
    expect(out).toContain('\n');
  });
});

describe('normalizePrivateKey — invalid inputs', () => {
  it('null → throws PrivateKeyFormatError', () => {
    expect(() => normalizePrivateKey(null)).toThrow(PrivateKeyFormatError);
  });

  it('undefined → throws PrivateKeyFormatError', () => {
    expect(() => normalizePrivateKey(undefined)).toThrow(PrivateKeyFormatError);
  });

  it('Empty string → throws PrivateKeyFormatError', () => {
    expect(() => normalizePrivateKey('')).toThrow(PrivateKeyFormatError);
  });

  it('Whitespace only → throws PrivateKeyFormatError', () => {
    expect(() => normalizePrivateKey('   \n\n  ')).toThrow(PrivateKeyFormatError);
  });

  it('Missing BEGIN marker → throws with diagnostic', () => {
    try {
      normalizePrivateKey('random gibberish without markers');
    } catch (err) {
      expect(err).toBeInstanceOf(PrivateKeyFormatError);
      expect((err as PrivateKeyFormatError).diagnostic).toContain('missing PEM markers');
    }
  });

  it('Has markers but no newlines after normalize → throws', () => {
    // Compressed form (no \n, no \\n) — invalid for cert()
    const compressed = '-----BEGIN PRIVATE KEY-----ABCDEFGH-----END PRIVATE KEY-----';
    expect(() => normalizePrivateKey(compressed)).toThrow(PrivateKeyFormatError);
  });

  it('Error message NEVER includes raw key bytes', () => {
    const secret = '-----BEGIN PRIVATE KEY-----SUPER_SECRET_BYTES_DO_NOT_LEAK';
    try {
      normalizePrivateKey(secret);
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).not.toContain('SUPER_SECRET_BYTES');
    }
  });
});

describe('getPrivateKeyDiagnostic', () => {
  it('Multiline PEM → all flags accurate', () => {
    const d = getPrivateKeyDiagnostic(FAKE_PEM_MULTILINE);
    expect(d.present).toBe(true);
    expect(d.length).toBeGreaterThan(50);
    expect(d.hasBeginMarker).toBe(true);
    expect(d.hasEndMarker).toBe(true);
    expect(d.hasLiteralBackslashN).toBe(false);
    expect(d.hasRealNewline).toBe(true);
    expect(d.surroundedByQuotes).toBe(false);
  });

  it('Escaped newline format → detected', () => {
    const d = getPrivateKeyDiagnostic(FAKE_PEM_ESCAPED_NEWLINE);
    expect(d.hasLiteralBackslashN).toBe(true);
    expect(d.hasRealNewline).toBe(false);
  });

  it('Quoted value → surroundedByQuotes=true', () => {
    const d = getPrivateKeyDiagnostic(`"${FAKE_PEM_ESCAPED_NEWLINE}"`);
    expect(d.surroundedByQuotes).toBe(true);
  });

  it('Empty / null → present=false, no leak', () => {
    expect(getPrivateKeyDiagnostic(null).present).toBe(false);
    expect(getPrivateKeyDiagnostic(undefined).present).toBe(false);
    expect(getPrivateKeyDiagnostic('').present).toBe(false);
  });

  it('Diagnostic object is JSON-safe (no key bytes in any field)', () => {
    const d = getPrivateKeyDiagnostic('-----BEGIN PRIVATE KEY-----SECRET_DATA');
    const json = JSON.stringify(d);
    expect(json).not.toContain('SECRET_DATA');
  });
});
