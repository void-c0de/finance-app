import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Billing-Server-Architektur: Migration + Edge Functions statisch prüfen.
 * (Der echte Store-Call braucht externe Credentials und ist als solcher isoliert.)
 */

const noComments = (s) =>
  s.split('\n').filter((l) => !l.trimStart().startsWith('--') && !l.trimStart().startsWith('//')).join('\n');

// --- Migration ------------------------------------------------------
{
  const sql = noComments(readFileSync('supabase/migrations/20260828140000_billing_subscriptions.sql', 'utf8'));

  // Kauf-Token wird nie im Klartext gespeichert – nur der SHA-256-Hash.
  assert.match(sql, /purchase_token_sha256 text NOT NULL/);
  assert.ok(!/purchase_token text/.test(sql), 'kein Klartext-Token-Feld');
  assert.match(sql, /UNIQUE \(provider, purchase_token_sha256\)/, 'Idempotenz über den Token-Hash');

  // Store-Quellen dürfen jetzt in user_subscriptions.
  assert.match(sql, /source IN \([^)]*'google_play'[^)]*'revenuecat'[^)]*\)/);

  // Die Merge-Funktion ist KEINE Client-API.
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.apply_verified_subscription\([^)]*\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_my_product_access_for\(uuid\) FROM PUBLIC, anon, authenticated/);

  // Präzedenz: nie eine längere Laufzeit verkürzen, permanent gewinnt.
  assert.match(sql, /greatest\(coalesce\(v_existing_end/);
  assert.match(sql, /WHEN user_subscriptions\.permanent THEN/);

  // SECURITY DEFINER + search_path.
  const definer = (sql.match(/SECURITY DEFINER/g) ?? []).length;
  const path = (sql.match(/SET search_path = public/g) ?? []).length;
  assert.ok(definer >= 3 && path >= definer, 'jede DEFINER-Funktion pinnt search_path');

  // Audit-Eintrag ohne Token.
  assert.match(sql, /'billing\.verified'/);
  assert.ok(!/jsonb_build_object\([^)]*token/i.test(sql), 'kein Token im Audit-Metadata');
}

// --- App-Store-Erweiterung (RC4, additiv) ---------------------------
{
  const sql = noComments(readFileSync('supabase/migrations/20260828160000_billing_app_store.sql', 'utf8'));
  assert.match(sql, /source IN \([^)]*'google_play'[^)]*'app_store'[^)]*'revenuecat'[^)]*\)/);
  assert.match(sql, /provider IN \('google_play', 'app_store', 'revenuecat'\)/);
  assert.match(sql, /IF p_provider NOT IN \('google_play', 'app_store', 'revenuecat'\) THEN RAISE EXCEPTION 'bad_provider'/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.apply_verified_subscription\([^)]*\) FROM PUBLIC, anon, authenticated/);
  assert.ok(sql.includes('BEGIN;') && sql.includes('COMMIT;'), 'transaktional');
}

// --- verify-purchase ----------------------------------------------
{
  const fn = readFileSync('supabase/functions/verify-purchase/index.ts', 'utf8');
  assert.match(fn, /jwtSub\(token\)/, 'Identität aus dem JWT');
  assert.match(fn, /const callerId = token \? jwtSub\(token\) : null/);
  assert.ok(!/body\.(userId|user_id|appUserId)/.test(fn), 'keine Identität aus dem Body');
  assert.match(fn, /sha256Hex\(`\$\{platform\}:\$\{purchaseToken\}`\)/, 'Token wird gehasht');
  assert.match(fn, /return \{ ok: false, reason: 'not_configured' \}/, 'ohne Credentials: not_configured');
  assert.match(fn, /apply_verified_subscription/, 'schreibt über die Merge-RPC');
  assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(fn) && !/sb_secret_/.test(fn), 'keine Secret-Literale');
  assert.match(fn, /PRODUCT_IDS/, 'Produkt-Whitelist');
  assert.match(fn, /method_not_allowed/, 'nur POST');
  // App Store: eigener isolierter Verifizierer, ohne Credentials not_configured.
  assert.match(fn, /verifyWithAppStore/, 'App-Store-Verifizierer vorhanden');
  assert.match(fn, /platform !== 'app_store'/, 'app_store im Plattform-Guard');
  assert.match(fn, /APP_STORE_ISSUER_ID|APP_STORE_PRIVATE_KEY/, 'Apple-Server-Credentials (nur Env)');
}

// --- billing-webhook --------------------------------------------
{
  const fn = readFileSync('supabase/functions/billing-webhook/index.ts', 'utf8');
  assert.match(fn, /PLAY_RTDN_VERIFICATION_TOKEN/, 'Google-Pub/Sub-Token-Prüfung');
  assert.match(fn, /REVENUECAT_WEBHOOK_SECRET/, 'RevenueCat-Shared-Secret');
  assert.match(fn, /if \(!isGoogle && !isRevenueCat\)/, 'unauthentifizierte Webhooks werden abgewiesen');
  assert.match(fn, /RTDN_STATUS/, 'Notification-Typ → Status-Mapping');
  assert.match(fn, /'revoked'/, 'Widerruf wird behandelt');
  assert.match(fn, /'expired'/, 'Ablauf wird behandelt');
  assert.match(fn, /apply_verified_subscription/);
  assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(fn), 'keine Secret-Literale');
}

console.log('Billing server: schema, token hashing, precedence & webhook auth verified');
