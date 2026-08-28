import { readFileSync } from 'node:fs';

/**
 * Production-submission legal gate.
 *
 * Exits non-zero while ANY legal fact is still missing — a `[BITTE ERGÄNZEN]` /
 * `[BITTE PRÜFEN]` marker in a shipped page, or a null in legal/legal.config.json.
 * `release:doctor` calls this; a non-zero exit means "not ready for a production
 * store submission" (it is NOT a code failure — the CI test suite does not run
 * this).
 *
 *   npm run check:legal
 */

const REQUIRED_KEYS = [
  'controller_name',
  'controller_address',
  'contact_email',
  'supervisory_authority',
  'supabase_region_statement',
  'diagnostics_retention_statement',
  'public_app_name',
];

const SCANNED_FILES = [
  'docs/datenschutz.html',
  'docs/support.html',
  'docs/konto-loeschen.html',
  'docs/index.html',
  'PLAY_SUBMISSION_PACK.md',
  'STORE_LISTING.md',
];

const MARKER = /\[BITTE (?:ERGÄNZEN|PRÜFEN)[^\]]*\]/g;

function main() {
  const problems = [];

  let config = {};
  try {
    config = JSON.parse(readFileSync('legal/legal.config.json', 'utf8'));
  } catch {
    problems.push('legal/legal.config.json fehlt oder ist kein gültiges JSON');
  }
  for (const key of REQUIRED_KEYS) {
    if (config[key] == null || String(config[key]).trim() === '') {
      problems.push(`legal.config.json: "${key}" ist nicht gesetzt`);
    }
  }

  for (const file of SCANNED_FILES) {
    let text = '';
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const hits = text.match(MARKER);
    if (hits) {
      problems.push(`${file}: ${hits.length} offene(r) Platzhalter (${[...new Set(hits)].slice(0, 3).join(', ')}${hits.length > 3 ? ' …' : ''})`);
    }
  }

  if (problems.length === 0) {
    console.log('✓ Legal: alle Pflichtangaben gesetzt, keine offenen Platzhalter. Freigabe möglich.');
    process.exit(0);
  }

  console.error('✗ Legal-Gate: die Produktions-Einreichung ist blockiert, bis diese Angaben vorliegen:');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\n  → legal/legal.config.json ausfüllen, dann `npm run build:legal`.');
  process.exit(1);
}

main();
