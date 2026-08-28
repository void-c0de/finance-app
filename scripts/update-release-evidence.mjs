import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Flip booleans in store-assets/release-evidence.json as real provider / release
 * milestones are verified. Refuses anything that looks like a secret.
 *
 *   node scripts/update-release-evidence.mjs signing.production_branch_proven_ephemeral=true
 *   node scripts/update-release-evidence.mjs google.api_auth_real=true google.api_reached_real=true
 *   node scripts/update-release-evidence.mjs play_console.testers_opted_in=12 --note "closed test opened"
 *   node scripts/update-release-evidence.mjs --stamp 2026-08-28T12:00:00Z
 *
 * Only boolean, small-integer and null values are accepted (plus --note strings,
 * which are scrubbed for token/email-looking content).
 */

const PATH = 'store-assets/release-evidence.json';
const doc = JSON.parse(readFileSync(PATH, 'utf8'));

const SECRETISH = /-----BEGIN|sb_secret_|\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{4,}|@[A-Za-z0-9.-]+\.(com|iam\.gserviceaccount\.com)|\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b|[0-9]{12,}/;

const args = process.argv.slice(2);
let stamp = null;
const notes = [];
const assignments = [];

for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === '--stamp') {
    stamp = args[++i];
  } else if (a === '--note') {
    notes.push(args[++i]);
  } else if (a.includes('=')) {
    assignments.push(a);
  } else {
    console.error(`Unbekanntes Argument: ${a}`);
    process.exit(1);
  }
}

function setPath(obj, dotted, value) {
  const parts = dotted.split('.');
  let node = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!(parts[i] in node) || typeof node[parts[i]] !== 'object') {
      console.error(`Pfad existiert nicht: ${dotted}`);
      process.exit(1);
    }
    node = node[parts[i]];
  }
  const key = parts[parts.length - 1];
  if (!(key in node)) {
    console.error(`Schlüssel existiert nicht: ${dotted} (kein neues Feld erlauben)`);
    process.exit(1);
  }
  node[key] = value;
}

for (const a of assignments) {
  const [path, raw] = a.split('=');
  let value;
  if (raw === 'true') value = true;
  else if (raw === 'false') value = false;
  else if (raw === 'null') value = null;
  else if (/^-?\d{1,4}$/.test(raw)) value = Number(raw);
  else if (SECRETISH.test(raw)) {
    console.error(`Wert wirkt sensibel, abgelehnt: ${path}`);
    process.exit(1);
  } else value = raw; // short string (e.g. iarc_result "PEGI 3")
  setPath(doc, path, value);
}

for (const note of notes) {
  if (SECRETISH.test(note)) {
    console.error('Notiz wirkt sensibel, abgelehnt.');
    process.exit(1);
  }
  doc.notes.push(note);
}

doc.gitSha = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return doc.gitSha;
  }
})();
if (stamp) doc.updatedAt = stamp;

// full-doc secret sweep before writing
const serialized = JSON.stringify(doc, null, 2) + '\n';
if (SECRETISH.test(serialized.replace(/"gitSha":\s*"[0-9a-f]+"/, '').replace(/@1"/g, ''))) {
  console.error('Abbruch: das Ergebnisdokument enthält etwas Sensibles.');
  process.exit(1);
}
writeFileSync(PATH, serialized);
console.log(`✓ ${PATH} aktualisiert (git ${doc.gitSha}).`);
