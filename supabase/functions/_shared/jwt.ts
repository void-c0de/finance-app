// Minimal JWT signing / ES256 verification on Web Crypto only.
//
// Used for:
//   - Google OAuth2 service-account assertion (RS256, "JWT bearer" grant)
//   - App Store Server API bearer token (ES256)
//   - Apple JWS transaction/notification payload verification (ES256 + x5c chain)
//
// SECURITY: never log the produced token, the private key, or the signature.

import { base64UrlDecodeToBytes, base64UrlDecodeToString, bufferSource, pemToBytes, stringToBase64Url } from './encoding.ts';

export type JwtHeader = Record<string, unknown> & { alg: string; kid?: string; x5c?: string[]; typ?: string };
export type JwtPayload = Record<string, unknown>;

export function decodeJwtParts(token: string): { header: JwtHeader; payload: JwtPayload; signingInput: string; signature: Uint8Array } {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('jwt_malformed');
  const header = JSON.parse(base64UrlDecodeToString(parts[0])) as JwtHeader;
  const payload = JSON.parse(base64UrlDecodeToString(parts[1])) as JwtPayload;
  return {
    header,
    payload,
    signingInput: `${parts[0]}.${parts[1]}`,
    signature: base64UrlDecodeToBytes(parts[2]),
  };
}

// --- signing --------------------------------------------------------------

async function importPkcs8(pem: string, algorithm: EcKeyImportParams | RsaHashedImportParams): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', bufferSource(pemToBytes(pem)), algorithm, false, ['sign']);
}

/** RS256-signed JWT — Google service-account assertion. */
export async function signRs256(header: JwtHeader, payload: JwtPayload, privateKeyPem: string): Promise<string> {
  const key = await importPkcs8(privateKeyPem, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' });
  const signingInput = `${stringToBase64Url(JSON.stringify({ ...header, alg: 'RS256' }))}.${stringToBase64Url(JSON.stringify(payload))}`;
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput)));
  return `${signingInput}.${bytesToB64Url(sig)}`;
}

/** ES256-signed JWT — App Store Server API bearer token. */
export async function signEs256(header: JwtHeader, payload: JwtPayload, privateKeyPem: string): Promise<string> {
  const key = await importPkcs8(privateKeyPem, { name: 'ECDSA', namedCurve: 'P-256' });
  const signingInput = `${stringToBase64Url(JSON.stringify({ ...header, alg: 'ES256' }))}.${stringToBase64Url(JSON.stringify(payload))}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(signingInput)));
  return `${signingInput}.${bytesToB64Url(sig)}`;
}

function bytesToB64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// --- ES256 verification --------------------------------------------------

/**
 * Verify an ES256 signature over `signingInput` using a P-256 public key given
 * as SPKI DER bytes (e.g. extracted from an x5c leaf certificate).
 */
export async function verifyEs256WithSpki(signingInput: string, signature: Uint8Array, spkiDer: Uint8Array): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey('spki', bufferSource(spkiDer), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, bufferSource(signature), new TextEncoder().encode(signingInput));
  } catch {
    return false;
  }
}
