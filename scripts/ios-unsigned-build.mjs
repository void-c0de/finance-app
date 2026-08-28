/**
 * Freier macOS-Build der unsignierten iOS-IPA — anstoßen, warten, herunterladen.
 *
 *   npm run ios:unsigned              – dispatch + Fortschritt bis fertig
 *   npm run ios:unsigned:info         – nur letzten Lauf + Artefakt zeigen
 *   npm run ios:unsigned:download     – letztes erfolgreiches Artefakt nach .artifacts/ios/
 *   npm run ios:unsigned:prepare      – Lauf sicherstellen (ggf. neu bauen) + herunterladen
 *
 * Token kommt aus dem git-credential-Helper und wird NIE ausgegeben.
 * Keine Apple-Credentials, nirgends. Siehe IOS_FREE_DEVICE_INSTALL.md.
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'void-c0de/finance-app';
const WORKFLOW = 'ios-unsigned.yml';
const ARTIFACT_NAME = 'FinanceApp-ios-unsigned-ipa';
const IPA_NAME = 'FinanceApp-ios-unsigned.ipa';
const OUT_DIR = resolve('.artifacts/ios');

const mode = process.argv.includes('--info')
  ? 'info'
  : process.argv.includes('--download')
    ? 'download'
    : process.argv.includes('--prepare')
      ? 'prepare'
      : 'dispatch';

function token() {
  const out = execSync('git credential fill', {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
  });
  const m = out.match(/^password=(.+)$/m);
  if (!m) throw new Error('Kein GitHub-Token vom credential-Helper erhalten.');
  return m[1].trim();
}

const TOKEN = token();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gh(path, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `token ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'finance-app-ios-build',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

async function latestRun() {
  const d = await gh(`/actions/workflows/${WORKFLOW}/runs?per_page=1`);
  return d.workflow_runs[0];
}

async function latestSuccessfulRun() {
  const d = await gh(`/actions/workflows/${WORKFLOW}/runs?status=success&per_page=1`);
  return d.workflow_runs[0];
}

async function showArtifacts(runId) {
  const a = await gh(`/actions/runs/${runId}/artifacts`);
  if (!a.artifacts.length) {
    console.log('Keine Artefakte (Build evtl. fehlgeschlagen).');
    return;
  }
  for (const art of a.artifacts) {
    console.log(
      `Artefakt: ${art.name}  ${(art.size_in_bytes / 1_048_576).toFixed(1)} MB  ` +
        `abgelaufen=${art.expired}  erstellt=${art.created_at}`,
    );
  }
  console.log(`  Im Browser: https://github.com/${REPO}/actions/runs/${runId}`);
}

/** Entpackt eine Zip-Datei nach dest — unzip (Git Bash) oder PowerShell Expand-Archive. */
function unzip(zipPath, dest) {
  mkdirSync(dest, { recursive: true });
  try {
    execSync(`unzip -o "${zipPath}" -d "${dest}"`, { stdio: 'ignore' });
    return;
  } catch {
    /* Fallback für cmd.exe ohne unzip */
  }
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -Force -LiteralPath '${zipPath}' -DestinationPath '${dest}'"`,
    { stdio: 'ignore' },
  );
}

/** Liest die Zip-Central-Directory und gibt die Einträge als Liste zurück (keine Abhängigkeit). */
function listZipEntries(buf) {
  const names = [];
  // End of central directory record rückwärts suchen
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return names;
  let offset = buf.readUInt32LE(eocd + 16);
  const count = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < count && offset + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) break;
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    names.push(buf.toString('utf8', offset + 46, offset + 46 + nameLen));
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

async function downloadArtifact(run) {
  if (!run || run.conclusion !== 'success') {
    console.log('Kein erfolgreicher Lauf vorhanden. Erst bauen: npm run ios:unsigned');
    return 1;
  }
  const a = await gh(`/actions/runs/${run.id}/artifacts`);
  const art = a.artifacts.find((x) => x.name === ARTIFACT_NAME);
  if (!art) {
    console.log(`Artefakt ${ARTIFACT_NAME} nicht gefunden.`);
    return 1;
  }
  if (art.expired) {
    console.log('Artefakt ist abgelaufen (7 Tage). Neu bauen: npm run ios:unsigned');
    return 1;
  }

  console.log(`Lade ${ARTIFACT_NAME} (${(art.size_in_bytes / 1_048_576).toFixed(1)} MB) …`);
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/artifacts/${art.id}/zip`, {
    headers: { Authorization: `token ${TOKEN}`, 'User-Agent': 'finance-app-ios-build' },
  });
  if (!res.ok) throw new Error(`Download fehlgeschlagen: ${res.status}`);
  const outerZip = Buffer.from(await res.arrayBuffer());

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const outerPath = resolve(OUT_DIR, 'artifact.zip');
  writeFileSync(outerPath, outerZip);
  unzip(outerPath, OUT_DIR);
  rmSync(outerPath, { force: true });

  const ipaPath = resolve(OUT_DIR, IPA_NAME);
  if (!existsSync(ipaPath)) {
    console.log(`Fehler: ${IPA_NAME} nicht im Artefakt.`);
    return 1;
  }

  const ipa = readFileSync(ipaPath);
  const sha = createHash('sha256').update(ipa).digest('hex');
  const entries = listZipEntries(ipa);
  const hasApp = entries.some((n) => /^Payload\/[^/]+\.app\/$/.test(n) || /^Payload\/[^/]+\.app\//.test(n));
  const hasInfo = entries.some((n) => /^Payload\/[^/]+\.app\/Info\.plist$/.test(n));
  const macho = entries.find((n) => /^Payload\/([^/]+)\.app\/\1$/.test(n));

  console.log('');
  console.log(`IPA bereit:   ${ipaPath}`);
  console.log(`Größe:        ${(ipa.length / 1_048_576).toFixed(1)} MB`);
  console.log(`SHA-256:      ${sha}`);
  console.log(`Payload/*.app: ${hasApp ? 'ok' : 'FEHLT'}`);
  console.log(`Info.plist:    ${hasInfo ? 'ok' : 'FEHLT'}`);
  console.log(`Mach-O:        ${macho ? macho : '(nicht eindeutig gefunden)'}`);
  console.log(`Dateien im IPA: ${entries.length}`);
  console.log('');
  reportSideloadTools();
  console.log('');
  console.log('Jetzt nur noch in AltStore/Sideloadly auswählen und mit deiner');
  console.log('kostenlosen Apple-ID signieren. Nie deinstallieren — immer drüber installieren.');
  console.log('Tipp: vorher in der App ein Finance-Backup exportieren (Mehr → Daten & Datenschutz).');
  return hasApp && hasInfo ? 0 : 1;
}

/** Nur Erkennung, kein Download, keine Änderung an Apple-Software. */
function reportSideloadTools() {
  if (process.platform !== 'win32') {
    console.log('Signier-Tools: dieser Check läuft nur unter Windows.');
    return;
  }
  const env = process.env;
  const checks = [
    ['AltServer', [`${env.LOCALAPPDATA}\\Programs\\AltServer\\AltServer.exe`, `${env['ProgramFiles(x86)']}\\AltServer\\AltServer.exe`]],
    ['Sideloadly', [`${env.LOCALAPPDATA}\\Programs\\Sideloadly\\Sideloadly.exe`, `${env.ProgramFiles}\\Sideloadly\\Sideloadly.exe`]],
    ['Apple Mobile Device Support', [`${env.CommonProgramFiles}\\Apple\\Mobile Device Support`, `${env['CommonProgramFiles(x86)']}\\Apple\\Mobile Device Support`]],
    ['iTunes (Standalone, für die Frameworks)', [`${env.ProgramFiles}\\iTunes\\iTunes.exe`, `${env['ProgramFiles(x86)']}\\iTunes\\iTunes.exe`]],
  ];
  console.log('Signier-Tools auf diesem PC:');
  for (const [name, paths] of checks) {
    const found = paths.some((p) => p && existsSync(p));
    console.log(`  ${found ? '✓' : '·'} ${name}${found ? '' : ' — nicht gefunden'}`);
  }
  console.log('  Bezugsquellen: altstore.io (AltStore/AltServer) · sideloadly.io · apple.com (iTunes/iCloud, NICHT Store-Version)');
}

async function watchRun(runId) {
  let last = '';
  for (;;) {
    const r = await gh(`/actions/runs/${runId}`);
    const jobs = await gh(`/actions/runs/${runId}/jobs`);
    const step = jobs.jobs[0]?.steps.find((s) => s.status === 'in_progress');
    const line = `  ${r.status}${step ? ` · ${step.name}` : ''}`;
    if (line !== last) {
      console.log(line);
      last = line;
    }
    if (r.status === 'completed') return r;
    await sleep(20_000);
  }
}

async function dispatchAndWatch() {
  console.log('Dispatch iOS-unsigned-Build auf master …');
  await gh(`/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref: 'master' }),
  });
  await sleep(6000);
  const run = await latestRun();
  console.log(`Lauf #${run.run_number}: ${run.html_url}`);
  const done = await watchRun(run.id);
  console.log(`\nErgebnis: ${done.conclusion}`);
  return done;
}

async function main() {
  if (mode === 'info') {
    const run = await latestRun();
    if (!run) {
      console.log('Noch kein Lauf. Starte mit: npm run ios:unsigned');
      return 0;
    }
    console.log(`Letzter Lauf #${run.run_number}: ${run.status}/${run.conclusion} — ${run.html_url}`);
    if (run.status === 'completed' && run.conclusion === 'success') await showArtifacts(run.id);
    return 0;
  }

  if (mode === 'download') {
    return downloadArtifact(await latestSuccessfulRun());
  }

  if (mode === 'prepare') {
    let run = await latestRun();
    const fresh =
      run &&
      run.status === 'completed' &&
      run.conclusion === 'success' &&
      Date.parse(run.updated_at) > Date.now() - 6 * 24 * 3600 * 1000;
    if (fresh) {
      console.log(`Vorhandener erfolgreicher Lauf #${run.run_number} wird verwendet.`);
    } else {
      run = await dispatchAndWatch();
      if (run.conclusion !== 'success') return 1;
    }
    return downloadArtifact(run);
  }

  // dispatch
  const done = await dispatchAndWatch();
  if (done.conclusion === 'success') await showArtifacts(done.id);
  return done.conclusion === 'success' ? 0 : 1;
}

process.exitCode = await main();
