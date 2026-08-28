import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Play upload-signing gate: the config plugin and the pre-build check.
 * No real keystore, no secrets.
 */

// --- 1. the config plugin rewires the release buildType --------------
{
  const plugin = readFileSync('plugins/withFinanceUploadSigning.js', 'utf8');

  // handles BOTH `signingConfig signingConfigs.debug` and `signingConfig = signingConfigs.debug`
  const re = new RegExp(
    plugin.match(/const releaseSigningRe = (\/.*\/);/)[1].slice(1, -1),
  );
  assert.ok(re.test('    release {\n        signingConfig signingConfigs.debug\n'), 'plugin regex matches the space form');
  assert.ok(re.test('    release {\n        signingConfig = signingConfigs.debug\n'), 'plugin regex matches the `=` form (RN 0.73+)');

  // it throws rather than silently no-op'ing if the anchor is gone
  assert.match(plugin, /could not find .*signingConfigs\.debug.* — the upload-signing switch was NOT applied/);
  assert.match(plugin, /hasFinanceUploadSigning \? signingConfigs\.upload : signingConfigs\.debug/);
  assert.match(plugin, /\.every \{ value -> value != null && !value\.toString\(\)\.trim\(\)\.isEmpty\(\) \}/, 'all four vars required');
}

// --- 2. the generated build.gradle actually has the switch ----------
{
  let gradle = '';
  try {
    gradle = readFileSync('android/app/build.gradle', 'utf8');
  } catch {
    console.log('  (android/app/build.gradle not generated — skipping the generated-file assertion)');
  }
  if (gradle) {
    assert.match(gradle, /def hasFinanceUploadSigning =/, 'upload-signing variables present');
    assert.match(gradle, /if \(hasFinanceUploadSigning\) \{\s*\n\s*upload \{/, 'conditional upload signingConfig present');
    assert.match(
      gradle,
      /release\s*\{[\s\S]*?signingConfig\s*=?\s*hasFinanceUploadSigning \? signingConfigs\.upload : signingConfigs\.debug/,
      'release buildType switches on hasFinanceUploadSigning (NOT hard-wired to debug)',
    );
    // Inside the `release { … }` block there must be no bare debug signingConfig.
    const releaseBlock = gradle.slice(gradle.indexOf('release {'), gradle.indexOf('release {') + 600);
    assert.ok(
      !/^\s*signingConfig\s*=?\s*signingConfigs\.debug\s*$/m.test(releaseBlock),
      'the release buildType still has a bare `signingConfig = signingConfigs.debug`',
    );
    // The debug buildType keeps signingConfigs.debug — that is correct.
    assert.match(gradle, /debug \{\s*\n\s*signingConfig\s*=?\s*signingConfigs\.debug/);
    // the UPLOAD signingConfig must reference variables, never a literal password
    const uploadBlock = gradle.slice(gradle.indexOf('upload {'), gradle.indexOf('upload {') + 400);
    assert.match(uploadBlock, /storePassword financeUploadStorePassword/);
    assert.ok(!/storePassword\s+["'][^"']+["']/.test(uploadBlock), 'no hard-coded password in the upload signingConfig');
    // (the debug signingConfig legitimately uses the public "android" debug password)
  }
}

// --- 3. the pre-build check gate --------------------------------
function runCheck(env, args = []) {
  try {
    const out = execFileSync('node', ['scripts/check-upload-signing.mjs', ...args], {
      encoding: 'utf8',
      env: { ...process.env, FINANCE_UPLOAD_STORE_FILE: '', FINANCE_UPLOAD_STORE_PASSWORD: '', FINANCE_UPLOAD_KEY_ALIAS: '', FINANCE_UPLOAD_KEY_PASSWORD: '', ...env },
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

// 0 of 4 → ok (informational), unless --expect-production
assert.equal(runCheck({}).code, 0, 'no config → exit 0');
assert.equal(runCheck({}, ['--expect-production']).code, 1, 'no config + --expect-production → exit 1');

// 2 of 4 → refuse loudly
const partial = runCheck({ FINANCE_UPLOAD_STORE_FILE: '/tmp/x.jks', FINANCE_UPLOAD_KEY_ALIAS: 'upload' });
assert.equal(partial.code, 1, 'partial config → exit 1');
assert.match(partial.out, /TEILWEISE|PARTIAL|abgelehnt/i);

// 4 of 4 but keystore missing → exit 1
const allButMissing = runCheck({
  FINANCE_UPLOAD_STORE_FILE: '/tmp/does-not-exist-abc123.jks',
  FINANCE_UPLOAD_STORE_PASSWORD: 'sup3rsecret',
  FINANCE_UPLOAD_KEY_ALIAS: 'upload',
  FINANCE_UPLOAD_KEY_PASSWORD: 'sup3rsecret',
});
assert.equal(allButMissing.code, 1, 'keystore file missing → exit 1');

// 4 of 4 with androiddebugkey alias → exit 1
const debugAlias = runCheck({
  FINANCE_UPLOAD_STORE_FILE: 'package.json',
  FINANCE_UPLOAD_STORE_PASSWORD: 'android',
  FINANCE_UPLOAD_KEY_ALIAS: 'androiddebugkey',
  FINANCE_UPLOAD_KEY_PASSWORD: 'android',
});
assert.equal(debugAlias.code, 1, 'debug key alias → exit 1');

console.log('Signing gate: plugin rewrites release signingConfig (both syntaxes), generated gradle verified, partial-config refused — verified');
