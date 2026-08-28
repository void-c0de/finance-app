import assert from 'node:assert/strict';

/**
 * Google Pub/Sub OIDC authentication for billing-webhook.
 * A synthetic RSA key signs the identity token; the JWKS is injected. No Google
 * calls. Covers: valid, wrong audience, wrong email, wrong issuer, expired,
 * bad signature, unknown key, malformed.
 */

const oidc = await import('../supabase/functions/_shared/googleOidc.ts');

const kp = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify'],
);
const jwkPub = await crypto.subtle.exportKey('jwk', kp.publicKey);
const KID = 'test-kid-1';
const jwks = [{ kid: KID, kty: 'RSA', n: jwkPub.n, e: jwkPub.e, alg: 'RS256' }];

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

async function makeToken(payload, { kid = KID, tamper = false } = {}) {
  const header = { alg: 'RS256', kid, typ: 'JWT' };
  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(signingInput)));
  let s = Buffer.from(sig).toString('base64url');
  if (tamper) s = s.slice(0, -2) + (s.endsWith('AA') ? 'BB' : 'AA');
  return `${signingInput}.${s}`;
}

const AUD = 'https://cqemndaghehbehtjnkwy.functions.supabase.co/billing-webhook';
const EMAIL = 'play-rtdn@finance.iam.gserviceaccount.com';
const now = new Date();
const base = { iss: 'https://accounts.google.com', aud: AUD, email: EMAIL, email_verified: true, exp: Math.floor(now.getTime() / 1000) + 600 };

const verify = (token, over = {}) =>
  oidc.verifyGoogleOidcToken(token, { expectedAudiences: [AUD], expectedEmail: EMAIL, jwksOverride: jwks, now, ...over });

// valid
{
  const r = await verify(await makeToken(base));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.email, EMAIL);
}
// wrong audience
{
  const r = await verify(await makeToken({ ...base, aud: 'https://evil.example' }));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bad_audience');
}
// wrong email
{
  const r = await verify(await makeToken({ ...base, email: 'attacker@evil.iam.gserviceaccount.com' }));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bad_email');
}
// wrong issuer
{
  const r = await verify(await makeToken({ ...base, iss: 'https://accounts.evil.com' }));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bad_issuer');
}
// expired
{
  const r = await verify(await makeToken({ ...base, exp: Math.floor(now.getTime() / 1000) - 10 }));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'expired');
}
// tampered signature
{
  const r = await verify(await makeToken(base, { tamper: true }));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'signature_invalid');
}
// unknown key id
{
  const r = await verify(await makeToken(base, { kid: 'some-other-kid' }));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unknown_key');
}
// malformed
{
  const r = await verify('not.a.jwt.at.all');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'malformed');
}
// alg none / not RS256
{
  const hdr = Buffer.from(JSON.stringify({ alg: 'none', kid: KID })).toString('base64url');
  const r = await verify(`${hdr}.${b64url(base)}.`);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'malformed');
}
// second accepted audience (the bare path form)
{
  const r = await oidc.verifyGoogleOidcToken(await makeToken({ ...base, aud: 'https://x/billing-webhook' }), {
    expectedAudiences: [AUD, 'https://x/billing-webhook'],
    expectedEmail: EMAIL,
    jwksOverride: jwks,
    now,
  });
  assert.equal(r.ok, true);
}

console.log('Webhook auth: Google OIDC verification (aud/email/iss/exp/sig/kid) — verified');
