/**
 * Kickt den kostenlosen macOS-Build für die unsignierte iOS-IPA an und wartet.
 *
 *   npm run ios:unsigned            – dispatch + Fortschritt bis fertig
 *   npm run ios:unsigned -- --info  – nur letzten Lauf + Artefakt zeigen
 *
 * Braucht einen GitHub-Token mit `repo`/`actions` (holt sich ihn aus dem
 * git-credential-Helper). Keine Apple-Credentials, nirgends.
 *
 * Der Workflow (.github/workflows/ios-unsigned.yml) läuft auf `macos-latest`,
 * baut unsigniert (CODE_SIGNING_ALLOWED=NO) für `iphoneos` und lädt
 * `FinanceApp-ios-unsigned.ipa` als Artefakt hoch (7 Tage). Danach: unter
 * Windows mit AltStore/Sideloadly + eigener kostenloser Apple-ID signieren.
 * Siehe IOS_FREE_DEVICE_INSTALL.md.
 */
import { execSync } from 'node:child_process';

const REPO = 'void-c0de/finance-app';
const WORKFLOW = 'ios-unsigned.yml';
const infoOnly = process.argv.includes('--info');

function token() {
  const out = execSync('git credential fill', {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
  });
  const m = out.match(/^password=(.+)$/m);
  if (!m) throw new Error('Kein GitHub-Token vom credential-Helper erhalten.');
  return m[1].trim();
}

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

const TOKEN = token();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function latestRun() {
  const d = await gh(`/actions/workflows/${WORKFLOW}/runs?per_page=1`);
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
    console.log(`  Download (im Browser, eingeloggt): https://github.com/${REPO}/actions/runs/${runId}`);
  }
}

async function main() {
  if (infoOnly) {
    const run = await latestRun();
    if (!run) {
      console.log('Noch kein Lauf. Starte mit: npm run ios:unsigned');
      return 0;
    }
    console.log(`Letzter Lauf #${run.run_number}: ${run.status}/${run.conclusion} — ${run.html_url}`);
    if (run.status === 'completed' && run.conclusion === 'success') await showArtifacts(run.id);
    return 0;
  }

  console.log('Dispatch iOS-unsigned-Build auf master …');
  await gh(`/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref: 'master' }),
  });

  await sleep(6000);
  const run = await latestRun();
  console.log(`Lauf #${run.run_number}: ${run.html_url}`);

  let last = '';
  for (;;) {
    const r = await gh(`/actions/runs/${run.id}`);
    const jobs = await gh(`/actions/runs/${run.id}/jobs`);
    const step = jobs.jobs[0]?.steps.find((s) => s.status === 'in_progress');
    const line = `  ${r.status}${step ? ` · ${step.name}` : ''}`;
    if (line !== last) {
      console.log(line);
      last = line;
    }
    if (r.status === 'completed') {
      console.log(`\nErgebnis: ${r.conclusion}`);
      if (r.conclusion === 'success') await showArtifacts(run.id);
      return r.conclusion === 'success' ? 0 : 1;
    }
    await sleep(20_000);
  }
}

process.exitCode = await main();
