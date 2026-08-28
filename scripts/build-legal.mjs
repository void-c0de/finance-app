import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Renders the legal web pages from legal/legal.config.json.
 *
 * Each fill point in docs/*.html is a `<span data-legal="KEY">…</span>`. This
 * script rewrites the span's inner text:
 *   config[KEY] is a non-empty string → that value
 *   config[KEY] is null               → the canonical [BITTE ERGÄNZEN] placeholder
 *
 * Idempotent: running it twice produces the same output. Nothing is invented —
 * a null stays a visible placeholder and `check:legal` keeps the submission
 * gate closed.
 *
 * Run:  npm run build:legal   (then commit the regenerated docs/*.html)
 */

const CONFIG_PATH = 'legal/legal.config.json';

/** key → { file span placeholder } */
const PLACEHOLDERS = {
  controller_name: '[BITTE ERGÄNZEN: Name / ggf. Firma]',
  controller_address: '[BITTE ERGÄNZEN: Anschrift]',
  contact_email: '[BITTE ERGÄNZEN: Kontakt-E-Mail]',
  supervisory_authority: '[BITTE ERGÄNZEN: je nach Wohnsitz/Bundesland]',
  supabase_region_statement:
    '[BITTE PRÜFEN: Standort der Supabase-Region und ggf. erforderliche Grundlage für eine Drittlandübermittlung (Standardvertragsklauseln).]',
  diagnostics_retention_statement:
    'Diagnose-Protokolle: kurzfristig; [BITTE ERGÄNZEN: konkrete Aufbewahrungsfrist, z. B. 30 Tage].',
};

const FILES = ['docs/datenschutz.html', 'docs/support.html'];

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderLegal(html, config) {
  return html.replace(
    /(<span data-legal="([a-z_]+)">)([\s\S]*?)(<\/span>)/g,
    (_m, open, key, _inner, close) => {
      const value = config[key];
      const text = value != null && String(value).trim() !== '' ? escapeHtml(String(value)) : (PLACEHOLDERS[key] ?? '[BITTE ERGÄNZEN]');
      return `${open}${text}${close}`;
    },
  );
}

function main() {
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  let changed = 0;
  for (const file of FILES) {
    const before = readFileSync(file, 'utf8');
    const after = renderLegal(before, config);
    if (after !== before) {
      writeFileSync(file, after);
      changed += 1;
      console.log(`✓ ${file} aktualisiert`);
    } else {
      console.log(`· ${file} unverändert`);
    }
  }
  const filled = Object.keys(PLACEHOLDERS).filter((k) => config[k] != null && String(config[k]).trim() !== '').length;
  console.log(`Legal: ${filled}/${Object.keys(PLACEHOLDERS).length} Felder gesetzt, ${changed} Datei(en) geschrieben.`);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('build-legal.mjs')) {
  main();
}
