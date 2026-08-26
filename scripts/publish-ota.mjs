#!/usr/bin/env node
/**
 * publish-ota.mjs — OTA-Publish-Pipeline für GitHub Pages.
 *
 * Ablauf:
 * 1. `expo export --platform android` erzeugt JS-Bundle + Assets
 * 2. Dieses Skript kopiert die Artefakte nach docs/updates/
 *    und generiert docs/api/manifest.json im
 *    expo-updates Self-Hosting-Protokoll.
 *
 * Voraussetzung (einmalig, manuell):
 *   GitHub repo Settings -> Pages -> Deploy from branch:
 *   main, Ordner /docs.
 *
 * App-seitige URL (app.json):
 *   https://<user>.github.io/<repo>/api/manifest.json
 *
 * Nutzung:
 *   node scripts/publish-ota.mjs
 */

import {
  existsSync,
  mkdirSync,
  cpSync,
  readFileSync,
  rmSync,
  writeFileSync,
  readdirSync,
  statSync,
} from 'node:fs';

import {
  dirname,
  join,
  resolve,
} from 'node:path';

import {
  fileURLToPath,
} from 'node:url';

import {
  randomUUID,
} from 'node:crypto';

const __dirname =
  dirname(
    fileURLToPath(
      import.meta.url,
    ),
  );

const projectRoot = resolve(
  __dirname,
  '..',
);

const exportDir = join(
  projectRoot,
  '.ota-export',
);

const docsApiDir = join(
  projectRoot,
  'docs',
  'api',
);

const docsUpdatesDir = join(
  projectRoot,
  'docs',
  'updates',
);

const PUBLIC_BASE =
  'https://void-c0de.github.io/finance-app';

function log(
  message,
) {
  console.log(
    `[publish-ota] ${message}`,
  );
}

function fail(
  message,
) {
  console.error(
    `[publish-ota] FEHLER: ${message}`,
  );

  process.exit(1);
}

// ------------------------------------------------------------
// 0. app.json Version lesen (runtimeVersion = appVersion)
// ------------------------------------------------------------
const appConfigPath =
  join(
    projectRoot,
    'app.json',
  );

if (
  !existsSync(
    appConfigPath,
  )
) {
  fail('app.json nicht gefunden.');
}

const appConfig =
  JSON.parse(
    readFileSync(
      appConfigPath,
      'utf8',
    ),
  );

const runtimeVersion =
  appConfig?.expo?.version;

if (!runtimeVersion) {
  fail(
    'Keine expo.version in app.json gesetzt.',
  );
}

log(
  `Runtime-Version: ${runtimeVersion}`,
);

// ------------------------------------------------------------
// 1. Export aufräumen + Bundle erzeugen
// ------------------------------------------------------------
if (
  existsSync(exportDir)
) {
  rmSync(exportDir, {
    recursive: true,

    force: true,
  });
}

log(
  'Exportiere Bundle (expo export)…',
);

const {
  execSync,
} =
  await import(
    'node:child_process'
  );

execSync(
  'npx expo export --platform android --output-dir .ota-export',

  {
    cwd: projectRoot,

    stdio: 'inherit',
  },
);

const metadataPath =
  join(
    exportDir,
    'metadata.json',
  );

if (
  !existsSync(
    metadataPath,
  )
) {
  fail(
    'metadata.json wurde vom Export nicht erzeugt.',
  );
}

const metadata =
  JSON.parse(
    readFileSync(
      metadataPath,
      'utf8',
    ),
  );

// ------------------------------------------------------------
// 2. Dateisammlung: Launch-Asset + Assets
// ------------------------------------------------------------
const contentTypes = {
  hbc: 'application/javascript',

  js: 'application/javascript',

  json: 'application/json',

  png: 'image/png',

  jpg: 'image/jpeg',

  jpeg: 'image/jpeg',

  gif: 'image/gif',

  webp: 'image/webp',

  svg: 'image/svg+xml',

  ttf: 'font/ttf',

  otf: 'font/otf',

  woff: 'font/woff',

  woff2: 'font/woff2',
};

function contentTypeFor(
  ext,
) {
  return (
    contentTypes[
      String(ext)
        .toLowerCase()
        .replace(/^\./, '')
    ] ??
    'application/octet-stream'
  );
}

const collectedFiles = [];

function pushFile(
  relPath,

  ext,
) {
  if (!relPath) {
    return;
  }

  const normalized =
    relPath.replace(/\\/g, '/');

  if (
    !existsSync(
      join(
        exportDir,
        normalized,
      ),
    )
  ) {
    log(
      `WARNUNG: Artefakt fehlt, wird übersprungen: ${normalized}`,
    );

    return;
  }

  const resolvedExt =
    ext ??
    normalized.split('.').pop();

  collectedFiles.push({
    relPath: normalized,

    key: normalized,

    ext: resolvedExt,
  });
}

/*
 * SDK 57 Format:
 * metadata.fileMetadata = {
 *   android: { bundle, assets: [{path, ext}] }
 * }
 */
const androidMeta =
  metadata?.fileMetadata
    ?.android ??
  metadata?.fileMetadata;

if (
  androidMeta?.bundle
) {
  pushFile(
    androidMeta.bundle,
  );
}

if (
  Array.isArray(
    androidMeta?.assets,
  )
) {
  for (const entry of androidMeta.assets) {
    pushFile(
      entry?.path,

      entry?.ext,
    );
  }
}

/*
 * Fallbacks für ältere Export-Formate.
 */
function collectFromEntryList(
  entries,
) {
  if (
    !Array.isArray(
      entries,
    )
  ) {
    return;
  }

  for (const entry of entries) {
    const relPath =
      typeof entry ===
        'string'
        ? entry

        : entry?.path;

    const ext =
      typeof entry ===
        'string'
        ? undefined
        : entry?.ext;

    pushFile(
      relPath,
      ext,
    );
  }
}

collectFromEntryList([
  metadata?.launchAsset,
]);

collectFromEntryList(
  metadata?.assets,
);

collectFromEntryList(
  metadata?.assets
    ?.fileMetadata,
);

if (
  collectedFiles.length ===
  0
) {
  fail(
    'Keine Export-Artefakte in metadata.json gefunden.',
  );
}

log(
  `${collectedFiles.length} Artefakte gefunden.`,
);

// ------------------------------------------------------------
// 3. Nach docs/updates/<version>/ kopieren
// ------------------------------------------------------------
const targetBase = join(
  docsUpdatesDir,
  runtimeVersion,
);

if (
  existsSync(
    targetBase,
  )
) {
  rmSync(targetBase, {
    recursive: true,

    force: true,
  });
}

mkdirSync(targetBase, {
  recursive: true,
});

for (const file of collectedFiles) {
  const normalizedRel =
    file.relPath.replace(/\\/g, '/');

  const source = join(
    exportDir,
    normalizedRel,
  );

  const target = join(
    targetBase,
    normalizedRel,
  );

  mkdirSync(dirname(target), {
    recursive: true,
  });

  cpSync(source, target);
}

// ------------------------------------------------------------
// 4. Manifest schreiben
// ------------------------------------------------------------
function urlFor(relPath) {
  return `${PUBLIC_BASE}/updates/${runtimeVersion}/${relPath
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) =>
      encodeURIComponent(segment),
    )
    .join('/')}`;
}

let launchAssetEntry =
  null;

if (
  metadata?.fileMetadata
    ?.android?.bundle
) {
  launchAssetEntry =
    collectedFiles.find(
      (file) =>
        file.relPath ===
        metadata.fileMetadata.android.bundle.replace(
          /\\/g,
          '/',
        ),
    );
}

if (
  !launchAssetEntry &&
  metadata?.launchAsset?.path
) {
  launchAssetEntry =
    collectedFiles.find(
      (file) =>
        file.relPath ===
        metadata.launchAsset.path.replace(
          /\\/g,
          '/',
        ),
    );
}

if (!launchAssetEntry) {
  launchAssetEntry =
    collectedFiles.find(
      (file) =>
        file.ext === 'hbc' ||
        file.ext === 'js',
    );
}

if (!launchAssetEntry) {
  fail(
    'Launch-Asset (Bundle) konnte nicht bestimmt werden.',
  );
}

// Refuse to publish if a legacy/privileged credential was accidentally
// compiled into the mobile bundle. Values are compared in memory and never
// printed.
const launchAssetBytes =
  readFileSync(
    join(exportDir, launchAssetEntry.relPath),
  );

for (const variableName of [
  'EXPO_PUBLIC_SUPABASE_SYNC_PASSWORD',
  'TINK_CLIENT_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY',
]) {
  const value = process.env[variableName];

  if (
    value &&
    value.length >= 8 &&
    launchAssetBytes.includes(Buffer.from(value, 'utf8'))
  ) {
    fail(
      `Sicherheitsabbruch: ${variableName} wurde im App-Bundle gefunden.`,
    );
  }
}

const assetEntries =
  collectedFiles.filter(
    (file) =>
      file !==
      launchAssetEntry,
  );

const manifest = {
  id: randomUUID(),

  createdAt: new Date().toISOString(),

  runtimeVersion,

  launchAsset: {
    key: launchAssetEntry.key,

    contentType: contentTypeFor(
      launchAssetEntry.ext,
    ),

    url: urlFor(
      launchAssetEntry.relPath,
    ),
  },

  assets: assetEntries.map(
    (file) => ({
      key: file.key,

      contentType: contentTypeFor(
        file.ext,
      ),

      // SDK 57's Android parser requires this key for every regular asset,
      // including extensionless binary assets.
      fileExtension:
        file.ext
          ? `.${String(file.ext).replace(/^\./, '')}`
          : '',

      url: urlFor(
        file.relPath,
      ),
    }),
  ),

  metadata: {},

  extra: {},
};

mkdirSync(docsApiDir, {
  recursive: true,
});

writeFileSync(
  join(docsApiDir, 'manifest.json'),

  JSON.stringify(
    manifest,
    null,
    2,
  ),
);

// ------------------------------------------------------------
// 5. Export-Ordner aufräumen
// ------------------------------------------------------------
rmSync(exportDir, {
  recursive: true,

  force: true,
});

log('Fertig.');
log(
  `Manifest : docs/api/manifest.json`,
);

log(
  `Bundle   : ${manifest.launchAsset.url}`,
);

log(
  'Nächster Schritt: git commit/push -> GitHub Pages liefert das Update.',
);
