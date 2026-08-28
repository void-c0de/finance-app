import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Billing-Server-Architektur: Migrationen + Edge Functions + _shared-Verifizierer
 * statisch prüfen. Die kryptografischen Pfade sind separat getestet
 * (test:apple-verify, test:google-verify, test:webhook-auth); hier geht es um
 * den Sicherheitsvertrag: keine Klartext-Token, JWT-Identität, not_configured
 * statt Fake-Erfolg, finishTransaction erst nach Server-Verify.
 */

const noComments = (s) =>
  s.split('\n').filter((l) => !l.trimStart().startsWith('--') && !l.trimStart().startsWith('//')).join('\n');

// --- Migration: billing_subscriptions (RC4) -----------------------
{
  const sql = noComments(readFileSync('supabase/migrations/20260828140000_billing_subscriptions.sql', 'utf8'));
  assert.match(sql, /purchase_token_sha256 text NOT NULL/);
  assert.ok(!/purchase_token text/.test(sql), 'kein Klartext-Token-Feld');
  assert.match(sql, /UNIQUE \(provider, purchase_token_sha256\)/, 'Idempotenz über den Token-Hash');
  assert.match(sql, /source IN \([^)]*'google_play'[^)]*'revenuecat'[^)]*\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.apply_verified_subscription\([^)]*\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_my_product_access_for\(uuid\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /greatest\(coalesce\(v_existing_end/);
  assert.match(sql, /WHEN user_subscriptions\.permanent THEN/);
  const definer = (sql.match(/SECURITY DEFINER/g) ?? []).length;
  const path = (sql.match(/SET search_path = public/g) ?? []).length;
  assert.ok(definer >= 3 && path >= definer, 'jede DEFINER-Funktion pinnt search_path');
  assert.match(sql, /'billing\.verified'/);
  assert.ok(!/jsonb_build_object\([^)]*token/i.test(sql), 'kein Token im Audit-Metadata');
}

// --- Migration: App Store (RC4, additiv) -------------------------
{
  const sql = noComments(readFileSync('supabase/migrations/20260828160000_billing_app_store.sql', 'utf8'));
  assert.match(sql, /source IN \([^)]*'app_store'[^)]*\)/);
  assert.match(sql, /provider IN \('google_play', 'app_store', 'revenuecat'\)/);
  assert.ok(sql.includes('BEGIN;') && sql.includes('COMMIT;'), 'transaktional');
}

// --- Migration: provider details + replay guard (RC7) ----------
{
  const sql = noComments(readFileSync('supabase/migrations/20260828180000_billing_provider_details.sql', 'utf8'));
  // additive columns
  assert.match(sql, /ADD COLUMN IF NOT EXISTS provider_original_transaction_id text/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'production'/);
  assert.match(sql, /environment IN \('production', 'sandbox'\)/);
  // idempotency ledger
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.billing_webhook_events/);
  assert.match(sql, /UNIQUE \(provider, event_id\)/, 'Event-Dedup über (provider, event_id)');
  assert.match(sql, /REVOKE ALL ON public\.billing_webhook_events FROM anon, authenticated/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.record_billing_event/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.record_billing_event\([^)]*\) FROM PUBLIC, anon, authenticated/);
  // account-switch guard
  assert.match(sql, /subscription_owned_by_other_account/, 'Replay-/Account-Switch-Schutz');
  assert.match(sql, /IF v_owner IS NOT NULL AND v_owner <> p_user_id THEN/);
  // out-of-order guard
  assert.match(sql, /p_event_at < v_prev_event_at/, 'älteres Event überschreibt neueren Zustand nicht');
  // still transactional, still revoked from clients
  assert.ok(sql.includes('BEGIN;') && sql.includes('COMMIT;'), 'transaktional');
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.apply_verified_subscription\([^)]*timestamptz\)\s*\n?\s*FROM PUBLIC, anon, authenticated/);
  // SECURITY DEFINER + search_path on every function
  const definer = (sql.match(/SECURITY DEFINER/g) ?? []).length;
  const path = (sql.match(/SET search_path = public/g) ?? []).length;
  assert.ok(definer >= 2 && path >= definer, 'DEFINER-Funktionen pinnen search_path');
}

// --- verify-purchase (RC7) ------------------------------------
{
  const fn = readFileSync('supabase/functions/verify-purchase/index.ts', 'utf8');
  assert.match(fn, /jwtSub\(token\)/, 'Identität aus dem JWT');
  assert.match(fn, /const callerId = token \? jwtSub\(token\) : null/);
  assert.ok(!/body\.(userId|user_id|appUserId)/.test(fn), 'keine Identität aus dem Body');
  assert.match(fn, /sha256Hex\(`\$\{platform\}:\$\{purchaseToken\}`\)/, 'Token wird gehasht');
  assert.match(fn, /verifyGooglePlayPurchase/, 'Google-Verifizierer eingebunden');
  assert.match(fn, /verifyAppStorePurchase/, 'App-Store-Verifizierer eingebunden');
  assert.match(fn, /apply_verified_subscription/, 'schreibt über die Merge-RPC');
  assert.match(fn, /subscription_owned_by_other_account/, 'Account-Switch-Fehler wird als 409 gemeldet');
  assert.match(fn, /not_configured: 501/, 'not_configured → 501');
  assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(fn) && !/sb_secret_/.test(fn), 'keine Secret-Literale');
  assert.match(fn, /method_not_allowed/, 'nur POST');
  // never grants premium from a client claim: no direct productAccess write
  assert.ok(!/setAccess|productAccess\s*=/.test(fn), 'kein direkter Entitlement-Write');
}

// --- Google Play verifier (_shared) ---------------------------
{
  const gp = readFileSync('supabase/functions/_shared/googlePlay.ts', 'utf8');
  assert.match(gp, /return \{ ok: false, reason: 'not_configured' \}/, 'ohne Service-Account: not_configured');
  assert.match(gp, /urn:ietf:params:oauth:grant-type:jwt-bearer/, 'JWT-Bearer-Grant');
  assert.match(gp, /www\.googleapis\.com\/auth\/androidpublisher/, 'korrekter Scope');
  assert.match(gp, /purchases\/subscriptionsv2\/tokens/, 'subscriptionsv2 (nicht deprecated v1)');
  assert.match(gp, /AbortController/, 'Timeout / Abbruch');
  assert.ok(!/console\.log|console\.warn/.test(gp), 'kein direktes Logging von Tokens');
  assert.ok(!/private_key.*console|console.*access_token/i.test(gp));
}

// --- App Store verifier (_shared) ---------------------------
{
  const as = readFileSync('supabase/functions/_shared/appStore.ts', 'utf8');
  assert.match(as, /return \{ ok: false, reason: 'not_configured' \}/, 'ohne ASC-Key: not_configured');
  assert.match(as, /verifyAppleJws/, 'JWS wird kryptografisch verifiziert (kein reines Decode)');
  assert.match(as, /appstoreconnect-v1/, 'korrekte Audience für den Bearer-Token');
  assert.match(as, /api\.storekit\.itunes\.apple\.com/, 'App Store Server API');
  assert.match(as, /api\.storekit-sandbox\.itunes\.apple\.com/, 'Sandbox-Basis-URL');
  assert.match(as, /bundle_mismatch/, 'Bundle-ID wird geprüft');

  const jws = readFileSync('supabase/functions/_shared/appleJws.ts', 'utf8');
  assert.match(jws, /APPLE_ROOT_CA_G3_SHA256\s*=\s*'63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179'/, 'Apple Root CA G3 gepinnt');
  assert.match(jws, /verifyCertSignature/, 'Kettenprüfung, nicht nur Decode');
  assert.match(jws, /root_untrusted/, 'nicht gepinnte Wurzel wird abgelehnt');
  assert.match(jws, /decodeAppleJwsUnsafe[\s\S]{0,200}ONLY for logging|ONLY.*after a verify/i, 'unsafe decode ist klar als solches markiert');
  // the leaf must actually verify the JWS signature (not just parse it)
  assert.match(jws, /crypto\.subtle\.verify\([\s\S]{0,80}leafKey/, 'Leaf-Signatur wird kryptografisch geprüft');
}

// --- billing-webhook (RC7) ---------------------------------
{
  const fn = readFileSync('supabase/functions/billing-webhook/index.ts', 'utf8');
  // Apple: signed payload verified
  assert.match(fn, /verifyAppleJws/, 'Apple signedPayload wird verifiziert');
  assert.match(fn, /handleApple/, 'App Store Server Notifications V2 Zweig');
  // Google: OIDC or shared token
  assert.match(fn, /verifyGoogleOidcToken/, 'Google Pub/Sub OIDC-Token-Prüfung');
  assert.match(fn, /PLAY_RTDN_VERIFICATION_TOKEN/, 'Shared-Token-Fallback');
  assert.match(fn, /REVENUECAT_WEBHOOK_SECRET/, 'RevenueCat-Shared-Secret');
  // notification is a trigger, not truth
  assert.match(fn, /verifyGooglePlayPurchase\(\{/, 'Google: Re-Verifizierung nach Notification');
  assert.match(fn, /record_billing_event/, 'Idempotenz-Ledger');
  assert.match(fn, /duplicate: true/, 'Duplikate werden erkannt');
  assert.match(fn, /apply_verified_subscription/);
  assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(fn), 'keine Secret-Literale');
  // no blind "notification says premium → grant"
  assert.ok(!/notification[\s\S]{0,40}p_status: 'active'[\s\S]{0,40}without/i.test(fn));
}

// --- Native Client-Adapter (expo-iap) — Sicherheitsvertrag ---
{
  const adapter = readFileSync('src/services/billing/expoIapAdapter.ts', 'utf8');
  assert.match(adapter, /handoffToServer/, 'Adapter reicht an den Server-Verifizierer');
  assert.ok(!/productAccess|setAccess|isPremium\s*=/.test(adapter), 'Adapter fasst productAccess nicht an');
  const finishIdx = adapter.indexOf('finishTransaction({ purchase');
  const verifyIdx = adapter.indexOf('handoffToServer(');
  assert.ok(verifyIdx > -1 && finishIdx > verifyIdx, 'finishTransaction erst nach handoffToServer');
  assert.match(adapter, /purchaseState === 'pending'[\s\S]{0,80}kind: 'pending'/, 'pending schaltet nichts frei');
  assert.match(adapter, /'user-cancelled'[\s\S]{0,60}kind: 'cancelled'/, 'Abbruch ≠ Fehler');
  assert.ok(!/premium_monthly_real|['"][a-z.]*\.real['"]|hardcoded/i.test(adapter), 'keine Fake-Produkt-IDs');

  const client = readFileSync('src/services/billingClient.ts', 'utf8');
  assert.match(client, /gewährt NIEMALS selbst Premium|never grants|niemals selbst Premium/i, 'Client-Vertrag dokumentiert');
}

// --- Zustandsmaschine: verified nur serverseitig ------------
{
  const sm = readFileSync('src/services/billing/purchaseStateMachine.ts', 'utf8');
  assert.match(sm, /case 'VERIFY_OK':[\s\S]{0,120}'verified'/, 'verified nur über VERIFY_OK');
  assert.ok(!/case 'PURCHASE_RECEIVED':[\s\S]{0,80}'verified'/.test(sm), 'PURCHASE_RECEIVED führt nicht direkt zu verified');
}

// --- Observability: keine sensiblen Felder im Log ----------
{
  const obs = readFileSync('supabase/functions/_shared/observability.ts', 'utf8');
  assert.match(obs, /token|receipt|jws|assertion|secret|password|private|authorization|bearer|iban|email|amount|balance|payload|signature/, 'Redaction-Blacklist vorhanden');
  assert.match(obs, /\[redacted\]/, 'redigiert verbotene Schlüssel');
}

console.log('Billing server: Migrationen, Verifizierer (Google/Apple), Webhook-Idempotenz, Replay-Schutz, Client-Vertrag — verifiziert');
