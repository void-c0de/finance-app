import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

/**
 * Statischer Secret-/Datenexpositions-Wächter für das ÖFFENTLICHE Repo.
 *
 * Prüft alle von Git verfolgten Dateien auf Muster, die niemals eingecheckt
 * werden dürfen. Der öffentliche Supabase-Publishable-Key (sb_publishable_*) und
 * die EXPO_PUBLIC_*-URL sind bewusst erlaubt – das sind Client-Credentials, die
 * per Design öffentlich sind und über RLS/Auth abgesichert werden.
 */

const FORBIDDEN = [
  { name: 'Supabase secret key', re: /sb_secret_[A-Za-z0-9]{10,}/ },
  { name: 'Supabase legacy anon/service JWT', re: /\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{40,}/ },
  { name: 'private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: 'Google service account key', re: /"private_key"\s*:\s*"-----BEGIN/ },
  { name: 'Tink client secret assignment', re: /TINK_CLIENT_SECRET\s*[:=]\s*["'][A-Za-z0-9]{8,}/ },
  { name: 'generic long secret assignment', re: /(?:client[_-]?secret|refresh[_-]?token|private[_-]?token)["']?\s*[:=]\s*["'][A-Za-z0-9._-]{28,}["']/i },
  { name: 'keystore password assignment', re: /(?:store|key)Password\s*[:=]\s*["'][^"'\s$]{4,}["']/i },
  // Billing / Store credentials & belege
  { name: 'Google service-account JSON', re: /"type"\s*:\s*"service_account"[\s\S]{0,200}"private_key_id"/ },
  { name: 'App Store Connect API key assignment', re: /APP_STORE_(?:PRIVATE_KEY|KEY_ID|ISSUER_ID)\s*[:=]\s*["'][A-Za-z0-9/+=_-]{6,}["']/ },
  { name: 'Play service-account key path assignment', re: /GOOGLE_PLAY_SERVICE_ACCOUNT_JSON\s*[:=]\s*["'](?!process\.env)[^"']{20,}["']/ },
  { name: 'raw Play purchase token dump', re: /"purchaseToken"\s*:\s*"[A-Za-z0-9._-]{40,}"/ },
  { name: 'raw Apple JWS / receipt dump', re: /"(?:jwsRepresentation|transactionReceipt|signedTransactionInfo)"\s*:\s*"[A-Za-z0-9._-]{60,}"/ },
];

// Dateien, die legitim „secret-ähnliche" Muster als Beispiel/Doku/Fixture enthalten.
const ALLOW_MATCH_IN = [
  /\.md$/,
  /^\.gitignore$/,
  /^scripts\/ci-secret-guard\.mjs$/,
  /^scripts\/verify-release-signing\.mjs$/,
  /^scripts\/test-.*\.mjs$/, // synthetische Test-Fixtures (z. B. Fake-JWT für Redaction-Test)
  /^plugins\/withFinanceUploadSigning\.js$/,
  /^supabase\/functions\/.*\/index\.ts$/, // nur Env-Zugriffe, keine Werte
];

const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
const findings = [];

for (const file of files) {
  if (/\.(png|jpg|jpeg|gif|webp|ttf|otf|woff2?|ico|hbc|keystore|jks|bin)$/i.test(file)) continue;
  let size = 0;
  try {
    size = statSync(file).size;
  } catch {
    continue;
  }
  if (size > 2_000_000) continue;

  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  const allowed = ALLOW_MATCH_IN.some((re) => re.test(file));
  for (const rule of FORBIDDEN) {
    const m = text.match(rule.re);
    if (m && !allowed) {
      findings.push(`${file}: ${rule.name} → ${m[0].slice(0, 40)}…`);
    }
  }
}

// .env* dürfen nie verfolgt sein.
for (const file of files) {
  if (/(^|\/)\.env(\.|$)/.test(file) && !/\.example$/.test(file)) {
    findings.push(`${file}: .env-Datei ist eingecheckt`);
  }
}

// Trust- / Signier- / Store-Material darf nie verfolgt sein.
const FORBIDDEN_FILES = [
  /\.mobiledevicepairing$/i,
  /\.mobileprovision$/i,
  /\.(p12|p8|certSigningRequest|keystore|jks)$/i,
  /ALTPairingFile/i,
  /(^|\/)Lockdown\/.*\.plist$/i,
  /(^|\/)anisette.*\.json$/i,
  /(^|\/)adi\.pb$/i,
  /(^|\/)(play|google)[-_]?service[-_]?account.*\.json$/i,
  /AuthKey_[A-Z0-9]{6,}\.p8$/i,
];
for (const file of files) {
  if (FORBIDDEN_FILES.some((re) => re.test(file))) {
    findings.push(`${file}: Trust-/Signier-/Store-Material ist eingecheckt`);
  }
}

if (findings.length > 0) {
  console.error('✗ Secret-Guard: Treffer\n' + findings.map((f) => '  - ' + f).join('\n'));
  process.exit(1);
}
console.log(`✓ Secret-Guard: ${files.length} Dateien geprüft, nichts gefunden`);
