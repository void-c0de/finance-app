import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

/** release:doctor 2.0 produces a well-formed JSON report with the required rows. */

const out = execFileSync('node', ['scripts/release-doctor.mjs', '--json', '--fast'], { encoding: 'utf8' });
const report = JSON.parse(out);

assert.ok(report.version, 'report has a version');
assert.ok(Array.isArray(report.rows) && report.rows.length >= 20, 'report has the check rows');

const VALID = new Set(['PASS', 'ENGINEERING PASS', 'REAL PROVIDER PASS', 'WARNING', 'NOT CONFIGURED', 'EXTERNAL BLOCKER', 'FAIL']);
for (const row of report.rows) {
  assert.ok(row.name && typeof row.name === 'string', 'row has a name');
  assert.ok(VALID.has(row.status), `row "${row.name}" has a valid status, got "${row.status}"`);
}

const names = report.rows.map((r) => r.name);
for (const required of [
  'VERSION',
  'RUNTIME',
  'GIT CLEAN',
  'SIGNING BRANCH',
  'UPLOAD KEY',
  'AAB SIGNED',
  'PLAY PRODUCT IDS',
  'GOOGLE SERVER CONFIG',
  'GOOGLE API AUTH (REAL)',
  'REAL PLAY PURCHASE E2E',
  'RTDN (REAL)',
  'APPLE SERVER CONFIG',
  'CLOSED TEST UPLOADED',
  '12/14 TESTER GATE',
  'LEGAL',
  'SCREENSHOTS',
  'FEATURE GRAPHIC',
  'PLAY ICON 512',
  'IARC',
  'TINK PRODUCTION',
  'IPHONE PHYSICAL QA',
  'SUPABASE MIGRATIONS',
]) {
  assert.ok(names.includes(required), `report covers "${required}"`);
}

const byName = Object.fromEntries(report.rows.map((r) => [r.name, r.status]));

// engineering vs real-provider distinction must be honest given no credentials
assert.equal(byName['GOOGLE SERVER CONFIG'], 'EXTERNAL BLOCKER');
assert.equal(byName['GOOGLE API AUTH (REAL)'], 'EXTERNAL BLOCKER');
assert.equal(byName['REAL PLAY PURCHASE E2E'], 'EXTERNAL BLOCKER');
assert.equal(byName['RTDN (REAL)'], 'EXTERNAL BLOCKER');
assert.equal(byName['APPLE SERVER CONFIG'], 'EXTERNAL BLOCKER');
assert.equal(byName['TINK PRODUCTION'], 'EXTERNAL BLOCKER');
// no REAL PROVIDER PASS may be claimed without evidence
assert.ok(!report.rows.some((r) => r.status === 'REAL PROVIDER PASS'), 'no REAL PROVIDER PASS without real evidence');
// but the fixed signing branch is a legit engineering pass
assert.equal(byName['SIGNING BRANCH'], 'ENGINEERING PASS');

assert.ok(!/-----BEGIN|sb_secret_|eyJ[A-Za-z0-9_-]{20,}\./.test(out), 'no secrets in the report');

console.log('Release doctor 2.0: JSON shape, engineering-vs-real distinction, honest blockers, no secret leakage — verified');
