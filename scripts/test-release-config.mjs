import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const appJson = JSON.parse(readFileSync('app.json', 'utf8'));
const config = appJson.expo;

assert.equal(packageJson.version, config.version, 'package/app version drift');
assert.equal(config.runtimeVersion?.policy, 'appVersion');
assert.equal(config.updates?.enabled, true);
assert.equal(config.updates?.useEmbeddedUpdate, true);
assert.equal(config.updates?.checkAutomatically, 'NEVER');
assert.equal(config.updates?.fallbackToCacheTimeout, 0);
assert.match(config.updates?.url ?? '', /^https:\/\//);
assert.ok(Number.isInteger(config.android?.versionCode));
assert.ok(config.android.versionCode > 0);

const serializedPublicConfig = JSON.stringify(config);
for (const forbidden of [
  'SERVICE_ROLE',
  'CLIENT_SECRET',
  'PRIVATE_KEY',
  'SYNC_PASSWORD',
]) {
  assert.equal(serializedPublicConfig.includes(forbidden), false);
}

console.log(
  `Release config: OK (app ${config.version}, runtime appVersion, Android ${config.android.versionCode})`,
);
