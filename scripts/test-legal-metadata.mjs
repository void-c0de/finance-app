import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { renderLegal } from './build-legal.mjs';

/**
 * Legal-Metadaten-Mechanismus: Konfig-Schema, Build-Idempotenz, Rendering
 * mit / ohne Werte. Prüft NICHT, ob die Felder ausgefüllt sind — das ist die
 * Aufgabe von `check:legal` (Release-Gate, kein CI-Test).
 */

const config = JSON.parse(readFileSync('legal/legal.config.json', 'utf8'));
const REQUIRED = ['controller_name', 'controller_address', 'contact_email', 'supervisory_authority', 'supabase_region_statement', 'diagnostics_retention_statement', 'public_app_name'];
for (const key of REQUIRED) {
  assert.ok(key in config, `legal.config.json braucht den Schlüssel "${key}"`);
}
assert.equal(config.public_app_name, 'Finance App');

// --- rendering: null → Platzhalter bleibt --------------------------
const sample = '<p><span data-legal="controller_name">[BITTE ERGÄNZEN: Name / ggf. Firma]</span></p>';
const asIsNull = renderLegal(sample, { controller_name: null });
assert.match(asIsNull, /\[BITTE ERGÄNZEN: Name/);

// --- rendering: Wert gesetzt → eingesetzt (HTML-escaped) ----------
const filled = renderLegal(sample, { controller_name: 'Max <Muster> & Co.' });
assert.match(filled, /Max &lt;Muster&gt; &amp; Co\./);
assert.ok(!/BITTE ERGÄNZEN/.test(filled));

// --- Idempotenz: zweimal rendern == einmal rendern --------------
const once = renderLegal(sample, { controller_name: 'ACME GmbH' });
const twice = renderLegal(once, { controller_name: 'ACME GmbH' });
assert.equal(once, twice, 'renderLegal ist idempotent');

// zurück auf null → Platzhalter kommt wieder
const backToNull = renderLegal(once, { controller_name: null });
assert.match(backToNull, /\[BITTE ERGÄNZEN: Name/);

// --- die echten Docs tragen die Marker -------------------------
const ds = readFileSync('docs/datenschutz.html', 'utf8');
for (const key of ['controller_name', 'controller_address', 'contact_email', 'supervisory_authority', 'supabase_region_statement', 'diagnostics_retention_statement']) {
  assert.ok(ds.includes(`data-legal="${key}"`), `datenschutz.html braucht data-legal="${key}"`);
}
assert.ok(readFileSync('docs/support.html', 'utf8').includes('data-legal="contact_email"'));

// --- die aktuell ausgelieferten Docs sind ein gültiges Build-Ergebnis ---
assert.equal(renderLegal(ds, config), ds, 'docs/datenschutz.html ist nicht aus legal.config.json gebaut — `npm run build:legal` ausführen und committen');
assert.equal(renderLegal(readFileSync('docs/support.html', 'utf8'), config), readFileSync('docs/support.html', 'utf8'), 'docs/support.html ist nicht gebaut');

console.log('Legal metadata: Schema, Rendering (null/Wert/escape), Idempotenz, Marker, Build-Konsistenz — verifiziert');
