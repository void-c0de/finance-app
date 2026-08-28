// Structured, privacy-safe billing/banking diagnostics.
//
// What may be logged: provider, a result category, an error/reason code, an
// HTTP status class, a normalized lifecycle, timing, whether it is retryable,
// configuration state, an opaque short correlation hash.
//
// What must NEVER be logged (enforced by redact()): purchase tokens, receipts,
// JWS, private keys, OAuth/bearer tokens, Apple transaction ids in full, user
// emails, IBANs, financial amounts, raw provider payloads.

const FORBIDDEN_KEYS =
  /token|receipt|jws|assertion|secret|password|private|authorization|bearer|iban|email|amount|balance|payload|signature/i;

const LONG_OPAQUE = /^[A-Za-z0-9_-]{20,}$/;

export function redact(value: unknown, keyHint = ''): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    if (FORBIDDEN_KEYS.test(keyHint)) return '[redacted]';
    if (value.length > 40 && LONG_OPAQUE.test(value)) return `[opaque:${value.length}]`;
    if (value.split('.').length === 3 && value.length > 60) return '[jws-like]';
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, keyHint));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = FORBIDDEN_KEYS.test(k) ? '[redacted]' : redact(v, k);
    }
    return out;
  }
  return '[unknown]';
}

export function billingLog(scope: string, fields: Record<string, unknown>): void {
  try {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ scope, ...(redact(fields) as Record<string, unknown>) }));
  } catch {
    // logging must never throw
  }
}

/** HTTP status → coarse class for dashboards. */
export function statusClass(status: number): '2xx' | '4xx' | '429' | '5xx' | 'other' {
  if (status === 429) return '429';
  if (status >= 200 && status < 300) return '2xx';
  if (status >= 400 && status < 500) return '4xx';
  if (status >= 500) return '5xx';
  return 'other';
}
