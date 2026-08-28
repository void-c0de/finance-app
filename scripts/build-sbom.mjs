import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * build:sbom — a CycloneDX-style JSON SBOM from package-lock.json.
 *
 *   npm run build:sbom            → store-assets/sbom.json
 *   npm run build:sbom -- --check → fail if the on-disk SBOM is stale
 *
 * Pure, offline, deterministic (no timestamps, no network). Lists every
 * resolved package with its exact version, integrity hash, and whether it is a
 * runtime or dev/build-only dependency. This is the software inventory the
 * release freeze pins.
 */

const CHECK = process.argv.includes('--check');
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

const runtimeNames = new Set(Object.keys(pkg.dependencies ?? {}));
const devNames = new Set(Object.keys(pkg.devDependencies ?? {}));

const components = [];
for (const [path, node] of Object.entries(lock.packages ?? {})) {
  if (path === '') continue; // the root project
  const name = path.split('node_modules/').pop();
  if (!node.version) continue;
  const isDirectRuntime = runtimeNames.has(name);
  const isDirectDev = devNames.has(name);
  components.push({
    type: 'library',
    name,
    version: node.version,
    scope: node.dev ? 'optional' : 'required',
    purl: `pkg:npm/${name.replace('@', '%40')}@${node.version}`,
    hashes: node.integrity ? [{ alg: node.integrity.split('-')[0].toUpperCase(), content: node.integrity.split('-').slice(1).join('-') }] : [],
    properties: [
      { name: 'finance:directDependency', value: String(isDirectRuntime || isDirectDev) },
      { name: 'finance:classification', value: isDirectRuntime ? 'runtime-direct' : isDirectDev ? 'dev-direct' : node.dev ? 'dev-transitive' : 'runtime-transitive' },
    ],
  });
}
components.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.version.localeCompare(b.version)));

const runtimeCount = components.filter((c) => c.properties[1].value.startsWith('runtime')).length;
const devCount = components.length - runtimeCount;

// a stable content hash of the component set — this is what "the SBOM changed" means
const bom = createHash('sha256');
for (const c of components) bom.update(`${c.purl}\n`);
const bomHash = bom.digest('hex');

const gitSha = (() => { try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } })();

const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  version: 1,
  metadata: {
    component: {
      type: 'application',
      name: pkg.name,
      version: pkg.version,
      purl: `pkg:npm/${pkg.name}@${pkg.version}`,
    },
    properties: [
      { name: 'finance:gitSha', value: gitSha ?? 'unknown' },
      { name: 'finance:lockfileVersion', value: String(lock.lockfileVersion) },
      { name: 'finance:componentHash', value: bomHash },
      { name: 'finance:runtimeComponents', value: String(runtimeCount) },
      { name: 'finance:devComponents', value: String(devCount) },
    ],
  },
  components,
};

const out = 'store-assets/sbom.json';
const serialized = JSON.stringify(sbom, null, 2) + '\n';

if (CHECK) {
  let current = '';
  try { current = readFileSync(out, 'utf8'); } catch { /* missing */ }
  const currentHash = (() => { try { return JSON.parse(current).metadata.properties.find((p) => p.name === 'finance:componentHash')?.value; } catch { return null; } })();
  if (currentHash !== bomHash) {
    console.error(`✗ SBOM is stale: on-disk componentHash ${currentHash ?? '(none)'} ≠ ${bomHash}`);
    console.error('  run: npm run build:sbom');
    process.exit(1);
  }
  console.log(`✓ SBOM up to date (${components.length} components, hash ${bomHash.slice(0, 12)}…)`);
} else {
  writeFileSync(out, serialized);
  console.log(`✓ ${out}`);
  console.log(`  ${components.length} components — ${runtimeCount} runtime, ${devCount} dev/build · componentHash ${bomHash.slice(0, 12)}…`);
}
