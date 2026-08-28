import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

/**
 * The self-hosted OTA manifest (docs/api/manifest.json) must satisfy the
 * expo-updates client's rules, or every device rejects the update with
 * "UpdateFailedToLoad ... is not a valid filename".
 *
 * Root cause we regressed on (RC10): publish-ota.mjs wrote the full export path
 * ("_expo/static/js/android/entry-<hash>.hbc", "assets/<hash>") into `key`.
 * The client stores each asset on disk as `<key><fileExtension>` and refuses
 * any key or extension containing a path separator.
 */

const path = 'docs/api/manifest.json';
assert.ok(existsSync(path), 'docs/api/manifest.json exists');
const m = JSON.parse(readFileSync(path, 'utf8'));

// shape
for (const f of ['id', 'createdAt', 'runtimeVersion', 'launchAsset', 'assets']) {
  assert.ok(m[f] !== undefined, `manifest has "${f}"`);
}
assert.match(m.id, /^[0-9a-f-]{36}$/, 'id is a UUID');
assert.equal(m.runtimeVersion, JSON.parse(readFileSync('app.json', 'utf8')).expo.version, 'runtimeVersion tracks app.json expo.version');

const keyOk = (k) => typeof k === 'string' && k.length > 0 && !k.includes('/') && !k.includes('\\') && !k.includes('.');
const extOk = (e) => e === undefined || (typeof e === 'string' && /^\.[a-z0-9]+$/i.test(e) && !e.slice(1).includes('.'));

// launch asset
assert.ok(keyOk(m.launchAsset.key), `launchAsset.key "${m.launchAsset.key}" is a bare filename (no path separator, no extension)`);
assert.ok(/^https:\/\//.test(m.launchAsset.url), 'launchAsset.url is absolute https');
assert.equal(m.launchAsset.contentType, 'application/javascript', 'launchAsset is JS');

// regular assets
assert.ok(Array.isArray(m.assets) && m.assets.length > 0, 'has at least one asset');
const seen = new Set();
for (const a of m.assets) {
  assert.ok(keyOk(a.key), `asset key "${a.key}" is a bare filename`);
  assert.ok(extOk(a.fileExtension), `asset "${a.key}" fileExtension "${a.fileExtension}" is a single clean extension`);
  assert.ok(/^https:\/\//.test(a.url), `asset "${a.key}" url is absolute https`);
  assert.ok(a.contentType, `asset "${a.key}" has a contentType`);
  const dupKey = `${a.key}${a.fileExtension ?? ''}`;
  assert.ok(!seen.has(dupKey), `asset storage name "${dupKey}" is unique`);
  seen.add(dupKey);
}

// the URL still carries the real on-disk path even though the key is flattened
assert.ok(m.launchAsset.url.includes(`/updates/${m.runtimeVersion}/`), 'launchAsset.url points at the versioned updates folder');

console.log(`OTA manifest: ${m.assets.length} assets + launch bundle, all keys are path-separator-free and storable — verified`);
