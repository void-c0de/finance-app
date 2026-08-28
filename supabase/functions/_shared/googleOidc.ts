// Verify a Google-issued OIDC identity token — used to authenticate Pub/Sub
// push requests for Google Play Real-time Developer Notifications.
//
// Pub/Sub attaches `Authorization: Bearer <JWT>` where the JWT is signed by
// Google (iss https://accounts.google.com), `aud` is the push endpoint URL (or
// a configured audience), and `email` is the push subscription's service
// account. We verify the RS256 signature against Google's published JWKS and
// check iss / aud / email / exp.
//
// Pure-ish: needs `fetch` + Web Crypto. Tested via scripts/test-webhook.mjs with
// an injected JWKS + key.

import { base64UrlDecodeToBytes, base64UrlDecodeToString, bufferSource } from './encoding.ts';

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

type Jwk = { kid: string; n: string; e: string; alg?: string; kty: string };

let jwksCache: { keys: Jwk[]; fetchedAtMs: number } | null = null;

export function resetGoogleJwksCacheForTests(): void {
  jwksCache = null;
}

async function loadJwks(doFetch: typeof fetch, now: number): Promise<Jwk[]> {
  if (jwksCache && now - jwksCache.fetchedAtMs < 3600_000) return jwksCache.keys;
  const res = await doFetch(GOOGLE_CERTS_URL);
  if (!res.ok) throw new Error(`jwks_${res.status}`);
  const body = (await res.json()) as { keys: Jwk[] };
  jwksCache = { keys: body.keys ?? [], fetchedAtMs: now };
  return jwksCache.keys;
}

export type OidcVerifyResult =
  | { ok: true; email: string; aud: string }
  | { ok: false; reason: 'malformed' | 'unknown_key' | 'signature_invalid' | 'expired' | 'bad_issuer' | 'bad_audience' | 'bad_email' | 'jwks_unavailable' };

export async function verifyGoogleOidcToken(
  token: string,
  opts: {
    expectedAudiences: string[];
    expectedEmail?: string;
    fetchImpl?: typeof fetch;
    now?: Date;
    /** test seam */
    jwksOverride?: Jwk[];
  },
): Promise<OidcVerifyResult> {
  const now = (opts.now ?? new Date()).getTime();
  const doFetch = opts.fetchImpl ?? fetch;
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };

  let header: { kid?: string; alg?: string };
  let payload: { iss?: string; aud?: string; email?: string; email_verified?: boolean; exp?: number };
  try {
    header = JSON.parse(base64UrlDecodeToString(parts[0]));
    payload = JSON.parse(base64UrlDecodeToString(parts[1]));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (header.alg !== 'RS256' || !header.kid) return { ok: false, reason: 'malformed' };
  if (!payload.iss || !GOOGLE_ISSUERS.has(payload.iss)) return { ok: false, reason: 'bad_issuer' };
  if (!payload.exp || payload.exp * 1000 < now) return { ok: false, reason: 'expired' };
  if (!payload.aud || !opts.expectedAudiences.includes(payload.aud)) return { ok: false, reason: 'bad_audience' };
  if (opts.expectedEmail && payload.email !== opts.expectedEmail) return { ok: false, reason: 'bad_email' };

  let keys: Jwk[];
  try {
    keys = opts.jwksOverride ?? (await loadJwks(doFetch, now));
  } catch {
    return { ok: false, reason: 'jwks_unavailable' };
  }
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return { ok: false, reason: 'unknown_key' };

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  } catch {
    return { ok: false, reason: 'unknown_key' };
  }
  const sig = base64UrlDecodeToBytes(parts[2]);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bufferSource(sig), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) return { ok: false, reason: 'signature_invalid' };

  return { ok: true, email: payload.email ?? '', aud: payload.aud };
}
