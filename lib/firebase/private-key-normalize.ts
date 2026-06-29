// Private key normalization for Firebase Admin SDK.
//
// FIREBASE_PRIVATE_KEY env value comes from different sources with different
// quirks:
//   - Vercel env (.env file): literal `\n` escape sequences inside quoted value
//   - GCP Secret Manager: raw multiline PEM (real newlines)
//   - Some platforms wrap with surrounding quotes
//   - Some platforms add stray whitespace
//
// This helper makes the value safe to pass to firebase-admin/cert():
//   1. Trim
//   2. Strip surrounding quotes (single or double, if matched pair)
//   3. Convert literal `\n` sequences to real newlines
//   4. Validate it looks like a PEM (has BEGIN/END markers + real newlines)
//
// Throws PrivateKeyFormatError with diagnostic info (NEVER logs the actual
// key bytes — only metadata like length, has-begin, has-newline) when the
// value cannot be repaired.

export class PrivateKeyFormatError extends Error {
  constructor(public readonly diagnostic: string) {
    super(`Firebase private key invalid: ${diagnostic}`);
    this.name = 'PrivateKeyFormatError';
  }
}

/**
 * Normalize a FIREBASE_PRIVATE_KEY env value to a usable PEM string.
 *
 * @param raw raw env value
 * @returns normalized PEM
 * @throws PrivateKeyFormatError when value is empty/malformed/missing markers
 */
export function normalizePrivateKey(raw: string | undefined | null): string {
  if (raw === undefined || raw === null) {
    throw new PrivateKeyFormatError('value is null/undefined');
  }
  if (typeof raw !== 'string') {
    throw new PrivateKeyFormatError(`value is ${typeof raw}, expected string`);
  }

  let key = raw.trim();
  if (key.length === 0) {
    throw new PrivateKeyFormatError('value is empty after trim');
  }

  // Strip surrounding quote pair if present (some env loaders preserve them)
  if (
    (key.startsWith('"') && key.endsWith('"'))
    || (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  // Replace literal `\n` escape sequences with real newlines.
  // No-op if value already contains real newlines (multiline secret).
  key = key.replace(/\\n/g, '\n');

  // Sanity checks — never log actual bytes, only metadata
  const hasBegin = key.includes('-----BEGIN');
  const hasEnd = key.includes('-----END');
  const hasNewline = key.includes('\n');
  const len = key.length;

  if (!hasBegin || !hasEnd) {
    throw new PrivateKeyFormatError(
      `missing PEM markers (length=${len}, hasBegin=${hasBegin}, hasEnd=${hasEnd})`,
    );
  }
  if (!hasNewline) {
    throw new PrivateKeyFormatError(
      `no newlines after normalize (length=${len}). Env may need \\n escapes or multiline secret format.`,
    );
  }

  return key;
}

/**
 * Returns a diagnostic object about the env value for safe logging.
 * NEVER returns the actual key.
 */
export function getPrivateKeyDiagnostic(raw: string | undefined | null): {
  present: boolean;
  length: number;
  hasBeginMarker: boolean;
  hasEndMarker: boolean;
  hasLiteralBackslashN: boolean;
  hasRealNewline: boolean;
  surroundedByQuotes: boolean;
} {
  if (typeof raw !== 'string' || raw.length === 0) {
    return {
      present: false,
      length: 0,
      hasBeginMarker: false,
      hasEndMarker: false,
      hasLiteralBackslashN: false,
      hasRealNewline: false,
      surroundedByQuotes: false,
    };
  }
  const trimmed = raw.trim();
  return {
    present: true,
    length: raw.length,
    hasBeginMarker: trimmed.includes('-----BEGIN'),
    hasEndMarker: trimmed.includes('-----END'),
    hasLiteralBackslashN: raw.includes('\\n'),
    hasRealNewline: raw.includes('\n'),
    surroundedByQuotes:
      (trimmed.startsWith('"') && trimmed.endsWith('"'))
      || (trimmed.startsWith("'") && trimmed.endsWith("'")),
  };
}
