import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compareVersions, requiresNativeUpgrade } from '../src/services/releaseCore.ts';

/**
 * Schützt die native Kompatibilitätsgrenze (runtimeVersion.policy = appVersion).
 *
 * Kern-Invariante: Ein OTA-Manifest darf niemals einer Runtime angeboten werden,
 * die es nicht gibt. Die Edge-Function `expo-updates` erzwingt das über exakten
 * Header-Abgleich; dieser Test sichert zusätzlich die statische Manifest-Integrität
 * und die Versionslogik ab, damit ein 1.2.0-Bundle nicht als 1.1.0-kompatibel
 * ausgeliefert werden kann.
 */

const appJson = JSON.parse(readFileSync('app.json', 'utf8'));
const appVersion = appJson.expo.version;
const manifest = JSON.parse(readFileSync('docs/api/manifest.json', 'utf8'));

const SEMVER = /^\d+\.\d+\.\d+$/;
assert.match(appVersion, SEMVER, 'app.json expo.version muss dreistelliges SemVer sein');
assert.match(manifest.runtimeVersion, SEMVER, 'Manifest runtimeVersion muss dreistelliges SemVer sein');

// Diese native Generation ist ausdrücklich freigegeben.
assert.equal(appVersion, '1.2.0', 'Dieser Meilenstein liefert nativ 1.2.0 aus');
assert.equal(appJson.expo.android.versionCode, 3, 'Android versionCode 3 gehört zu 1.2.0');
assert.equal(appJson.expo.runtimeVersion?.policy, 'appVersion', 'Runtime folgt weiterhin der App-Version');

// Das veröffentlichte OTA-Manifest darf keine Runtime bewerben, die neuer als der
// aktuelle native Build ist (eine solche Runtime existiert auf keinem Gerät).
assert.ok(
  compareVersions(manifest.runtimeVersion, appVersion) <= 0,
  `Manifest-Runtime ${manifest.runtimeVersion} ist neuer als die App-Version ${appVersion}`,
);

// Manifest-Selbstkonsistenz: Alle Asset-URLs müssen im Pfadsegment exakt die
// deklarierte runtimeVersion tragen. Das verhindert das gefährlichste Versehen —
// nur das runtimeVersion-Feld zu ändern, während die Bundles einer anderen
// Generation angehören.
const segment = `/updates/${manifest.runtimeVersion}/`;
assert.ok(
  typeof manifest.launchAsset?.url === 'string' && manifest.launchAsset.url.includes(segment),
  `launchAsset-URL gehört nicht zu runtimeVersion ${manifest.runtimeVersion}`,
);
for (const asset of manifest.assets ?? []) {
  assert.ok(
    typeof asset.url === 'string' && asset.url.includes(segment),
    `Asset ${asset.key} gehört nicht zu runtimeVersion ${manifest.runtimeVersion}`,
  );
}

// Versionslogik: ein 1.1.0-Gerät muss ein erzwungenes 1.2.0-Minimum als
// nativen Pflicht-Upgrade erkennen, ein 1.2.0-Gerät nicht.
assert.equal(requiresNativeUpgrade('1.1.0', '1.2.0'), true);
assert.equal(requiresNativeUpgrade('1.2.0', '1.2.0'), false);
assert.equal(requiresNativeUpgrade('1.2.0', null), false);
assert.equal(compareVersions(appVersion, '1.1.0') > 0, true, 'Native Generation ist gegenüber 1.1.0 vorgerückt');

console.log(
  `Runtime boundary: OK (App ${appVersion} / versionCode ${appJson.expo.android.versionCode}, Manifest-Runtime ${manifest.runtimeVersion})`,
);
