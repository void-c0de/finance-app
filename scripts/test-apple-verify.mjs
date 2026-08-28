import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Real cryptographic test for the Apple JWS trust-chain verifier.
 *
 * Builds a genuine 3-cert chain with openssl (P-384 root → P-384 intermediate →
 * P-256 leaf), signs a JWS with the leaf key via Web Crypto (raw r||s, JWS
 * format), and checks that `verifyAppleJws` accepts it and rejects every
 * tampering. No Apple credentials, no real JWS.
 */

const jws = await import('../supabase/functions/_shared/appleJws.ts');
const x509 = await import('../supabase/functions/_shared/x509.ts');
const appStore = await import('../supabase/functions/_shared/appStore.ts');
const enc = await import('../supabase/functions/_shared/encoding.ts');

const dir = mkdtempSync(join(tmpdir(), 'apple-verify-'));
// MSYS_NO_PATHCONV stops Git-Bash from mangling openssl's `/CN=...` args on Windows.
const sh = (cmd) =>
  execFileSync('bash', ['-c', cmd], {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, MSYS_NO_PATHCONV: '1', MSYS2_ARG_CONV_EXCL: '*' },
  }).toString();

try {
  // --- 1. build a real chain --------------------------------------------
  // Root (P-384, self-signed)
  sh('openssl ecparam -name secp384r1 -genkey -noout -out root.key');
  sh('openssl req -new -x509 -key root.key -out root.pem -days 3 -subj "/CN=Test Apple Root G3" -sha384');
  // Intermediate (P-384, signed by root)
  sh('openssl ecparam -name secp384r1 -genkey -noout -out int.key');
  sh('openssl req -new -key int.key -out int.csr -subj "/CN=Test Apple WWDR"');
  sh('openssl x509 -req -in int.csr -CA root.pem -CAkey root.key -CAcreateserial -out int.pem -days 3 -sha384');
  // Leaf (P-256, signed by intermediate)
  sh('openssl ecparam -name prime256v1 -genkey -noout -out leaf.key');
  sh('openssl req -new -key leaf.key -out leaf.csr -subj "/CN=Test StoreKit Leaf"');
  sh('openssl x509 -req -in leaf.csr -CA int.pem -CAkey int.key -CAcreateserial -out leaf.pem -days 3 -sha384');
  // leaf key as pkcs8 for Web Crypto
  sh('openssl pkcs8 -topk8 -nocrypt -in leaf.key -out leaf.pk8.pem');

  const derB64 = (name) => {
    const pem = readFileSync(join(dir, name), 'utf8');
    const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    return body;
  };
  const x5c = [derB64('leaf.pem'), derB64('int.pem'), derB64('root.pem')];

  const rootDer = enc.base64ToBytes(x5c[2]);
  const rootFp = await x509.sha256Hex(rootDer);

  // --- 2. sign a JWS with the leaf key ---------------------------------
  const leafPk8 = readFileSync(join(dir, 'leaf.pk8.pem'), 'utf8');
  const leafKey = await crypto.subtle.importKey('pkcs8', enc.pemToBytes(leafPk8), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);

  const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const header = { alg: 'ES256', x5c };
  const payload = {
    transactionId: '2000000999',
    originalTransactionId: '2000000111',
    bundleId: 'com.nocta-xz.financeapp',
    productId: 'premium.monthly',
    expiresDate: Date.now() + 20 * 86400_000,
    originalPurchaseDate: Date.now() - 10 * 86400_000,
    type: 'Auto-Renewable Subscription',
    environment: 'Production',
  };
  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, leafKey, new TextEncoder().encode(signingInput)));
  const goodJws = `${signingInput}.${Buffer.from(sig).toString('base64url')}`;

  // --- 3. positive ---------------------------------------------------
  const ok = await jws.verifyAppleJws(goodJws, { trustedRootSha256: rootFp });
  assert.equal(ok.ok, true, `valid JWS must verify: ${JSON.stringify(ok)}`);
  assert.equal(ok.payload.productId, 'premium.monthly');

  // --- 4. negatives ------------------------------------------------
  // wrong root pin
  const wrongRoot = await jws.verifyAppleJws(goodJws, { trustedRootSha256: '00'.repeat(32) });
  assert.equal(wrongRoot.ok, false);
  assert.equal(wrongRoot.reason, 'root_untrusted');

  // tampered payload (re-encode a changed payload, keep old signature)
  const tamperedPayload = b64url({ ...payload, productId: 'premium.yearly' });
  const tamperedJws = `${b64url(header)}.${tamperedPayload}.${Buffer.from(sig).toString('base64url')}`;
  const tampered = await jws.verifyAppleJws(tamperedJws, { trustedRootSha256: rootFp });
  assert.equal(tampered.ok, false);
  assert.equal(tampered.reason, 'signature_invalid');

  // broken chain: drop the intermediate
  const noIntJws = `${b64url({ alg: 'ES256', x5c: [x5c[0], x5c[2]] })}.${b64url(payload)}.x`;
  const noInt = await jws.verifyAppleJws(noIntJws, { trustedRootSha256: rootFp });
  assert.equal(noInt.ok, false);
  assert.ok(noInt.reason === 'chain_invalid' || noInt.reason === 'signature_invalid');

  // wrong alg
  const rs = await jws.verifyAppleJws(`${b64url({ alg: 'RS256', x5c })}.${b64url(payload)}.x`, { trustedRootSha256: rootFp });
  assert.equal(rs.ok, false);
  assert.equal(rs.reason, 'malformed');

  // malformed (2 parts)
  const malformed = await jws.verifyAppleJws('a.b', { trustedRootSha256: rootFp });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.reason, 'malformed');

  // certificate validity window: 10 days out, the 3-day leaf is past notAfter.
  const future = new Date(Date.now() + 10 * 86400_000);
  const expired = await jws.verifyAppleJws(goodJws, { trustedRootSha256: rootFp, now: future });
  assert.equal(expired.ok, false);
  assert.equal(expired.reason, 'certificate_expired');

  // --- 5. normalization -------------------------------------------
  const norm = appStore.normalizeAppleSubscription({
    transaction: payload,
    renewal: { autoRenewStatus: 1 },
    statusInt: 1,
    internalProductId: 'premium_monthly',
    expectedStoreProductIds: ['premium.monthly', 'premium.yearly'],
    expectedBundleId: 'com.nocta-xz.financeapp',
  });
  assert.equal(norm.ok, true);
  assert.equal(norm.subscription.lifecycle, 'active');
  assert.equal(norm.subscription.provider, 'app_store');
  assert.equal(norm.subscription.providerOriginalTransactionId, '2000000111');

  // bundle mismatch
  const badBundle = appStore.normalizeAppleSubscription({
    transaction: { ...payload, bundleId: 'com.evil.app' },
    renewal: null,
    statusInt: 1,
    internalProductId: 'premium_monthly',
    expectedStoreProductIds: ['premium.monthly'],
    expectedBundleId: 'com.nocta-xz.financeapp',
  });
  assert.equal(badBundle.ok, false);
  assert.equal(badBundle.reason, 'bundle_mismatch');

  // revoked
  const revoked = appStore.normalizeAppleSubscription({
    transaction: { ...payload, revocationDate: Date.now() - 1000, revocationReason: 1 },
    renewal: { autoRenewStatus: 0 },
    statusInt: 5,
    internalProductId: 'premium_monthly',
    expectedStoreProductIds: ['premium.monthly'],
    expectedBundleId: 'com.nocta-xz.financeapp',
  });
  assert.equal(revoked.ok, true);
  assert.equal(revoked.subscription.lifecycle, 'revoked');

  // auto-renew off but active → cancelled_active, still Premium
  const cancelledActive = appStore.normalizeAppleSubscription({
    transaction: payload,
    renewal: { autoRenewStatus: 0 },
    statusInt: 1,
    internalProductId: 'premium_monthly',
    expectedStoreProductIds: ['premium.monthly'],
    expectedBundleId: 'com.nocta-xz.financeapp',
  });
  assert.equal(cancelledActive.subscription.lifecycle, 'cancelled_active');

  // --- 6. verifyAppStorePurchase — not_configured without creds ----
  const notConf = await appStore.verifyAppStorePurchase({
    env: {},
    internalProductId: 'premium_monthly',
    expectedStoreProductIds: ['premium.monthly'],
    purchaseToken: goodJws,
  });
  assert.equal(notConf.ok, false);
  assert.equal(notConf.reason, 'not_configured');

  // --- 7. verifyAppStorePurchase — JWS path with skipServerApi -----
  appStore.resetAppStoreCachesForTests();
  const p8 = readFileSync(join(dir, 'leaf.pk8.pem'), 'utf8').replace(/\n/g, '\\n');
  const jwsOnly = await appStore.verifyAppStorePurchase({
    env: {
      APP_STORE_ISSUER_ID: 'issuer',
      APP_STORE_KEY_ID: 'KEY123',
      APP_STORE_PRIVATE_KEY: p8,
      APP_STORE_BUNDLE_ID: 'com.nocta-xz.financeapp',
    },
    internalProductId: 'premium_monthly',
    expectedStoreProductIds: ['premium.monthly'],
    purchaseToken: goodJws,
    skipServerApi: true,
    now: new Date(),
  });
  // The JWS is signed by our TEST root, not Apple's — so signature_invalid is expected.
  assert.equal(jwsOnly.ok, false);
  assert.equal(jwsOnly.reason, 'signature_invalid');

  console.log('Apple verify: JWS chain, pinning, tamper-rejection, normalization, not_configured — verified');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
