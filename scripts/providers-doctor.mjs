import { execSync } from 'node:child_process';

/**
 * External provider configuration status. Names/booleans only — NEVER a value.
 *
 *   npm run providers:doctor          human readable
 *   npm run providers:doctor -- --json
 *
 * Reads:
 *   - the local process env (build-time EXPO_PUBLIC_* + signing vars)
 *   - Supabase Function secret NAMES via `supabase secrets list` (values are
 *     server-side digests, never printed)
 */

const JSON_OUT = process.argv.includes('--json');

function envSet(name) {
  const v = process.env[name];
  return typeof v === 'string' && v.trim() !== '';
}

let supabaseSecretNames = new Set();
let supabaseReachable = false;
try {
  const out = execSync('npx supabase secrets list --output json', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 90_000,
  });
  const start = Math.min(...['[', '{'].map((c) => (out.indexOf(c) === -1 ? Infinity : out.indexOf(c))));
  const parsed = JSON.parse(out.slice(start));
  const list = Array.isArray(parsed) ? parsed : (parsed.secrets ?? []);
  for (const s of list) supabaseSecretNames.add(s.name);
  supabaseReachable = list.length > 0;
} catch {
  // offline / not linked — fall back to "unknown" for server secrets
}

const secret = (name) => (supabaseReachable ? supabaseSecretNames.has(name) : null);

const checks = {
  androidUploadSigning:
    ['FINANCE_UPLOAD_STORE_FILE', 'FINANCE_UPLOAD_STORE_PASSWORD', 'FINANCE_UPLOAD_KEY_ALIAS', 'FINANCE_UPLOAD_KEY_PASSWORD'].every(envSet)
      ? 'CONFIGURED'
      : ['FINANCE_UPLOAD_STORE_FILE', 'FINANCE_UPLOAD_STORE_PASSWORD', 'FINANCE_UPLOAD_KEY_ALIAS', 'FINANCE_UPLOAD_KEY_PASSWORD'].some(envSet)
        ? 'PARTIAL (refused by check:upload-signing)'
        : 'NOT CONFIGURED',

  googlePlayVerify:
    secret('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON') && secret('GOOGLE_PLAY_PACKAGE_NAME')
      ? 'CONFIGURED'
      : secret('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON') === null
        ? 'UNKNOWN (supabase not reachable)'
        : 'NOT CONFIGURED',

  googleRtdn:
    secret('GOOGLE_PUBSUB_SA_EMAIL') || secret('PLAY_RTDN_VERIFICATION_TOKEN')
      ? 'CONFIGURED'
      : secret('GOOGLE_PUBSUB_SA_EMAIL') === null
        ? 'UNKNOWN'
        : 'NOT CONFIGURED',

  clientProductIds:
    envSet('EXPO_PUBLIC_PREMIUM_MONTHLY_ID') && envSet('EXPO_PUBLIC_PREMIUM_YEARLY_ID')
      ? 'CONFIGURED'
      : 'NOT CONFIGURED',

  appleVerify:
    ['APP_STORE_ISSUER_ID', 'APP_STORE_KEY_ID', 'APP_STORE_PRIVATE_KEY', 'APP_STORE_BUNDLE_ID'].every(secret)
      ? 'CONFIGURED'
      : secret('APP_STORE_ISSUER_ID') === null
        ? 'UNKNOWN'
        : 'NOT CONFIGURED',

  tink:
    process.env.EXPO_PUBLIC_TINK_ENVIRONMENT === 'production'
      ? 'PRODUCTION (env)'
      : 'SANDBOX',

  supabaseFunctionRuntime: supabaseReachable
    ? [...supabaseSecretNames].filter((n) => n.startsWith('SUPABASE_')).length >= 3
      ? 'OK (auto-provided secrets present)'
      : 'CHECK'
    : 'UNKNOWN',
};

if (JSON_OUT) {
  console.log(JSON.stringify({ supabaseReachable, checks }, null, 2));
} else {
  const pad = Math.max(...Object.keys(checks).map((k) => k.length));
  for (const [k, v] of Object.entries(checks)) {
    console.log(`  ${k.padEnd(pad)}  ${v}`);
  }
  if (!supabaseReachable) console.log('\n  (supabase not reachable — server-secret rows show UNKNOWN)');
  const activated = Object.values(checks).filter((v) => v.startsWith('CONFIGURED') || v.startsWith('PRODUCTION')).length;
  console.log(`\n  ${activated} provider path(s) configured. No secret values were read or printed.`);
}
