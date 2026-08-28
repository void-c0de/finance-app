// Apple JWS (JSON Web Signature) verification for App Store Server API responses
// and App Store Server Notifications V2.
//
// A signed payload is `header.payload.signature` where the header carries an
// `x5c` array: [leaf, intermediate, root] certificates (base64 DER). Verification:
//   1. leaf public key verifies the JWS signature over header.payload (ES256).
//   2. leaf is signed by intermediate; intermediate is signed by root.
//   3. root's SHA-256 fingerprint equals Apple Root CA - G3 (pinned below).
//   4. every certificate is within its validity window.
//
// This is a real trust-chain check. If ANY step fails we throw — never "decode
// and trust". Pure module (Web Crypto only); tested by scripts/test-apple-verify.mjs.

import { base64ToBytes, base64UrlDecodeToBytes, base64UrlDecodeToString, bufferSource } from './encoding.ts';
import { parseCertificate, sha256Hex, verifyCertSignature, curveParams } from './x509.ts';

// Apple Root CA - G3 — SHA-256 fingerprint (public; https://www.apple.com/certificateauthority/AppleRootCA-G3.cer)
export const APPLE_ROOT_CA_G3_SHA256 = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';

export type AppleJwsResult<T> = { ok: true; payload: T } | { ok: false; reason: AppleJwsFailure; detail?: string };
export type AppleJwsFailure = 'malformed' | 'signature_invalid' | 'chain_invalid' | 'root_untrusted' | 'certificate_expired';

export async function verifyAppleJws<T = Record<string, unknown>>(
  jws: string,
  opts: { now?: Date; trustedRootSha256?: string } = {},
): Promise<AppleJwsResult<T>> {
  const now = opts.now ?? new Date();
  const trustedRoot = (opts.trustedRootSha256 ?? APPLE_ROOT_CA_G3_SHA256).toLowerCase();

  const parts = jws.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed', detail: 'parts' };

  let header: { alg?: string; x5c?: string[] };
  let payload: T;
  try {
    header = JSON.parse(base64UrlDecodeToString(parts[0]));
    payload = JSON.parse(base64UrlDecodeToString(parts[1])) as T;
  } catch {
    return { ok: false, reason: 'malformed', detail: 'json' };
  }
  if (header.alg !== 'ES256') return { ok: false, reason: 'malformed', detail: 'alg' };
  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length < 2) return { ok: false, reason: 'malformed', detail: 'x5c' };

  // Parse the chain (leaf → … → root).
  let certs;
  try {
    certs = x5c.map((b64) => parseCertificate(base64ToBytes(b64)));
  } catch (e) {
    return { ok: false, reason: 'chain_invalid', detail: `parse:${(e as Error).message}` };
  }

  // Validity windows.
  for (const c of certs) {
    if (now.getTime() < c.notBefore || now.getTime() > c.notAfter) {
      return { ok: false, reason: 'certificate_expired' };
    }
  }

  // Chain links: certs[i] signed by certs[i+1].
  for (let i = 0; i < certs.length - 1; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const linkOk = await verifyCertSignature(certs[i], certs[i + 1]);
    if (!linkOk) return { ok: false, reason: 'chain_invalid', detail: `link_${i}` };
  }

  // Pinned root.
  const rootDer = base64ToBytes(x5c[x5c.length - 1]);
  const rootFp = await sha256Hex(rootDer);
  if (rootFp.toLowerCase() !== trustedRoot) return { ok: false, reason: 'root_untrusted' };

  // Leaf verifies the JWS signature over header.payload.
  const leaf = certs[0];
  const { namedCurve } = curveParams(leaf.curveOid);
  if (namedCurve !== 'P-256') return { ok: false, reason: 'chain_invalid', detail: 'leaf_curve' };
  let leafKey: CryptoKey;
  try {
    leafKey = await crypto.subtle.importKey('spki', bufferSource(leaf.spkiBytes), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  } catch {
    return { ok: false, reason: 'chain_invalid', detail: 'leaf_key' };
  }
  const sigRaw = base64UrlDecodeToBytes(parts[2]); // JWS ES256 signature is already raw r||s
  const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const sigOk = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, leafKey, bufferSource(sigRaw), signingInput);
  if (!sigOk) return { ok: false, reason: 'signature_invalid' };

  return { ok: true, payload };
}

/** Decode without verifying — ONLY for logging non-sensitive metadata after a verify has already passed, or in tests. */
export function decodeAppleJwsUnsafe<T = Record<string, unknown>>(jws: string): T | null {
  try {
    return JSON.parse(base64UrlDecodeToString(jws.split('.')[1])) as T;
  } catch {
    return null;
  }
}
