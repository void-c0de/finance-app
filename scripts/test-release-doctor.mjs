import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

/** release:doctor produces a well-formed JSON report with the required rows. */

const out = execFileSync('node', ['scripts/release-doctor.mjs', '--json', '--fast'], { encoding: 'utf8' });
const report = JSON.parse(out);

assert.ok(report.version, 'report has a version');
assert.ok(Array.isArray(report.rows) && report.rows.length >= 12, 'report has the check rows');

const VALID = new Set(['PASS', 'WARNING', 'NOT CONFIGURED', 'EXTERNAL BLOCKER', 'FAIL']);
for (const row of report.rows) {
  assert.ok(row.name && typeof row.name === 'string', 'row has a name');
  assert.ok(VALID.has(row.status), `row "${row.name}" has a valid status, got "${row.status}"`);
}

const names = report.rows.map((r) => r.name);
for (const required of [
  'VERSION',
  'RUNTIME',
  'GIT CLEAN',
  'TESTS',
  'ANDROID SIGNING',
  'UPLOAD KEY',
  'LEGAL',
  'SCREENSHOTS',
  'PLAY PRODUCT IDS',
  'GOOGLE SERVER VERIFY',
  'APPLE SERVER VERIFY',
  'TINK PRODUCTION',
  'IPHONE PHYSICAL QA',
  'SUPABASE MIGRATIONS',
]) {
  assert.ok(names.includes(required), `report covers "${required}"`);
}

// The provider verifiers must be honestly reported as EXTERNAL BLOCKER here.
const byName = Object.fromEntries(report.rows.map((r) => [r.name, r.status]));
assert.equal(byName['GOOGLE SERVER VERIFY'], 'EXTERNAL BLOCKER');
assert.equal(byName['APPLE SERVER VERIFY'], 'EXTERNAL BLOCKER');
assert.equal(byName['TINK PRODUCTION'], 'EXTERNAL BLOCKER');

// No secret-looking values in the output.
assert.ok(!/-----BEGIN|sb_secret_|eyJ[A-Za-z0-9_-]{20,}\./.test(out), 'no secrets in the report');

console.log('Release doctor: JSON shape, required checks, honest EXTERNAL BLOCKER reporting, no secret leakage — verified');
