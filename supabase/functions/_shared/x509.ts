// Minimal DER / X.509 parsing — just enough to verify an Apple JWS x5c chain
// on Web Crypto. NOT a general X.509 library; it deliberately supports only what
// Apple's StoreKit / App Store Server signing chain uses (ECDSA P-256 leaves,
// P-384 intermediates/root).
//
// Pure module. Tested by scripts/test-apple-verify.mjs.

import { bufferSource } from './encoding.ts';

export type Asn1 = {
  tag: number;
  len: number;
  headerLen: number;
  /** content bytes (without tag/length) */
  content: Uint8Array;
  /** full element bytes (tag + length + content) */
  full: Uint8Array;
  start: number;
  end: number;
};

export function readTlv(buf: Uint8Array, offset = 0): Asn1 {
  const tag = buf[offset];
  let idx = offset + 1;
  let len = buf[idx];
  idx += 1;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4) throw new Error('der_bad_length');
    len = 0;
    for (let i = 0; i < n; i += 1) len = (len << 8) | buf[idx + i];
    idx += n;
  }
  const headerLen = idx - offset;
  const content = buf.subarray(idx, idx + len);
  return { tag, len, headerLen, content, full: buf.subarray(offset, idx + len), start: offset, end: idx + len };
}

/** Iterate the children of a constructed element. */
export function readChildren(el: Asn1): Asn1[] {
  const out: Asn1[] = [];
  let off = 0;
  while (off < el.content.length) {
    const child = readTlv(el.content, off);
    out.push(child);
    off = child.end;
  }
  return out;
}

const TAG_SEQUENCE = 0x30;
const TAG_BITSTRING = 0x03;
const TAG_OID = 0x06;
const TAG_UTCTIME = 0x17;
const TAG_GENERALIZEDTIME = 0x18;
const TAG_INTEGER = 0x02;

export function oidToString(content: Uint8Array): string {
  const parts: number[] = [];
  const first = content[0];
  parts.push(Math.floor(first / 40), first % 40);
  let value = 0;
  for (let i = 1; i < content.length; i += 1) {
    value = (value << 7) | (content[i] & 0x7f);
    if (!(content[i] & 0x80)) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join('.');
}

export type ParsedCertificate = {
  tbsBytes: Uint8Array;
  signatureAlgOid: string;
  signatureValue: Uint8Array; // raw DER of the ECDSA SEQ{r,s}
  spkiBytes: Uint8Array; // full SubjectPublicKeyInfo DER
  curveOid: string; // '1.2.840.10045.3.1.7' P-256 · '1.3.132.0.34' P-384
  notBefore: number; // epoch ms
  notAfter: number;
};

const OID_P256 = '1.2.840.10045.3.1.7';
const OID_P384 = '1.3.132.0.34';

function parseTime(el: Asn1): number {
  const s = new TextDecoder().decode(el.content);
  if (el.tag === TAG_UTCTIME) {
    // YYMMDDHHMMSSZ
    const yy = parseInt(s.slice(0, 2), 10);
    const year = yy >= 50 ? 1900 + yy : 2000 + yy;
    return Date.UTC(year, +s.slice(2, 4) - 1, +s.slice(4, 6), +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12));
  }
  if (el.tag === TAG_GENERALIZEDTIME) {
    // YYYYMMDDHHMMSSZ
    return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12), +s.slice(12, 14));
  }
  throw new Error('der_bad_time');
}

export function parseCertificate(der: Uint8Array): ParsedCertificate {
  const cert = readTlv(der);
  if (cert.tag !== TAG_SEQUENCE) throw new Error('der_not_certificate');
  const [tbs, sigAlg, sigVal] = readChildren(cert);
  if (!tbs || !sigAlg || !sigVal) throw new Error('der_certificate_shape');

  const tbsChildren = readChildren(tbs);
  // tbs: [version?] serial signature issuer validity subject subjectPublicKeyInfo ...
  let i = 0;
  if (tbsChildren[0].tag === 0xa0) i = 1; // explicit [0] version
  // serial(i) sigAlg(i+1) issuer(i+2) validity(i+3) subject(i+4) spki(i+5)
  const validity = tbsChildren[i + 3];
  const spki = tbsChildren[i + 5];
  if (!validity || !spki) throw new Error('der_tbs_shape');

  const [notBeforeEl, notAfterEl] = readChildren(validity);
  const notBefore = parseTime(notBeforeEl);
  const notAfter = parseTime(notAfterEl);

  // spki: SEQ { AlgorithmIdentifier SEQ { ecPublicKey OID, curve OID }, BIT STRING }
  const spkiChildren = readChildren(spki);
  const algId = spkiChildren[0];
  const algChildren = readChildren(algId);
  const curveOidEl = algChildren.find((c) => c.tag === TAG_OID && oidToString(c.content) !== '1.2.840.10045.2.1');
  const curveOid = curveOidEl ? oidToString(curveOidEl.content) : '';

  // signatureAlgorithm
  const sigAlgOid = oidToString(readChildren(sigAlg).find((c) => c.tag === TAG_OID)!.content);

  // signatureValue BIT STRING: first content byte is unused-bits count (0), rest is the DER ECDSA-Sig-Value
  if (sigVal.tag !== TAG_BITSTRING) throw new Error('der_sig_not_bitstring');
  const signatureValue = sigVal.content.subarray(1);

  return {
    tbsBytes: tbs.full,
    signatureAlgOid: sigAlgOid,
    signatureValue,
    spkiBytes: spki.full,
    curveOid: curveOid === OID_P384 ? OID_P384 : OID_P256,
    notBefore,
    notAfter,
  };
}

/** Convert a DER ECDSA signature SEQ{ r INTEGER, s INTEGER } to raw r||s (Web Crypto format). */
export function derEcdsaToRaw(der: Uint8Array, size: 32 | 48): Uint8Array {
  const seq = readTlv(der);
  if (seq.tag !== TAG_SEQUENCE) throw new Error('der_sig_shape');
  const [rEl, sEl] = readChildren(seq);
  if (!rEl || !sEl || rEl.tag !== TAG_INTEGER || sEl.tag !== TAG_INTEGER) throw new Error('der_sig_ints');
  const out = new Uint8Array(size * 2);
  copyRight(trimLeadingZeros(rEl.content), out, 0, size);
  copyRight(trimLeadingZeros(sEl.content), out, size, size);
  return out;
}

function trimLeadingZeros(b: Uint8Array): Uint8Array {
  let i = 0;
  while (i < b.length - 1 && b[i] === 0) i += 1;
  return b.subarray(i);
}
function copyRight(src: Uint8Array, dst: Uint8Array, at: number, size: number): void {
  if (src.length > size) src = src.subarray(src.length - size);
  dst.set(src, at + (size - src.length));
}

export function curveParams(curveOid: string): { namedCurve: 'P-256' | 'P-384'; size: 32 | 48 } {
  return curveOid === OID_P384 ? { namedCurve: 'P-384', size: 48 } : { namedCurve: 'P-256', size: 32 };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bufferSource(bytes)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const OID_ECDSA_SHA256 = '1.2.840.10045.4.3.2';
const OID_ECDSA_SHA384 = '1.2.840.10045.4.3.3';

/**
 * Verify that `child.tbs` was signed by `issuer`'s public key.
 * The hash comes from the child's signatureAlgorithm OID, the key from the issuer's curve.
 */
export async function verifyCertSignature(child: ParsedCertificate, issuer: ParsedCertificate): Promise<boolean> {
  try {
    const { namedCurve, size } = curveParams(issuer.curveOid);
    const key = await crypto.subtle.importKey('spki', bufferSource(issuer.spkiBytes), { name: 'ECDSA', namedCurve }, false, ['verify']);
    const raw = derEcdsaToRaw(child.signatureValue, size);
    const hash =
      child.signatureAlgOid === OID_ECDSA_SHA384
        ? 'SHA-384'
        : child.signatureAlgOid === OID_ECDSA_SHA256
          ? 'SHA-256'
          : namedCurve === 'P-384'
            ? 'SHA-384'
            : 'SHA-256';
    return await crypto.subtle.verify({ name: 'ECDSA', hash }, key, bufferSource(raw), bufferSource(child.tbsBytes));
  } catch {
    return false;
  }
}
