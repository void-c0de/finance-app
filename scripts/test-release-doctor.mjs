import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

/** Release Doctor 3.0: well-formed JSON, required rows, honest real/engineering split. */

const out = execFileSync('node', ['scripts/release-doctor.mjs', '--json', '--fast'], { encoding: 'utf8' });
const report = JSON.parse(out);

assert.ok(report.version, 'has a version');
assert.equal(typeof report.closedTestReady, 'boolean', 'has a closedTestReady verdict');
assert.equal(typeof report.blockingCount, 'number', 'has a blockingCount');
assert.ok(Array.isArray(report.rows) && report.rows.length >= 28, 'has the check rows');

const VALID = new Set(['PASS', 'ENGINEERING PASS', 'REAL PROVIDER PASS', 'REAL PLAY PASS', 'WARNING', 'NOT CONFIGURED', 'EXTERNAL BLOCKER', 'FAIL']);
for (const row of report.rows) {
  assert.ok(row.name && typeof row.name === 'string', 'row has a name');
  assert.ok(VALID.has(row.status), `row "${row.name}" has a valid status, got "${row.status}"`);
  assert.equal(typeof row.blocking, 'boolean', `row "${row.name}" has a blocking flag`);
}

const names = report.rows.map((r) => r.name);
for (const required of [
  'VERSION', 'RUNTIME', 'GIT CLEAN', 'SIGNING ENGINEERING', 'SIGNING REAL', 'AAB SIGNED',
  'PLAY PRODUCT IDS', 'GOOGLE SERVER CONFIG', 'GOOGLE AUTH REAL', 'ANDROID PUBLISHER REACHED',
  'PRODUCT QUERY REAL', 'PURCHASE REAL', 'VERIFY REAL', 'ENTITLEMENT REAL', 'RESTORE REAL',
  'RTDN CONFIG', 'RTDN REAL', 'APPLE SERVER CONFIG', 'PLAY CONSOLE ACCESS', 'PLAY APP EXISTS',
  'CLOSED TEST TRACK', 'CLOSED TEST UPLOADED', '12/14 TESTER GATE', 'LEGAL', 'SCREENSHOTS',
  'FEATURE GRAPHIC', 'PLAY ICON 512', 'DATA SAFETY', 'FINANCIAL FEATURES', 'APP CONTENT',
  'IARC', 'PRIVACY POLICY LIVE', 'ACCOUNT DELETION URL LIVE', 'TINK PRODUCTION', 'SUPABASE MIGRATIONS',
]) {
  assert.ok(names.includes(required), `report covers "${required}"`);
}

const byName = Object.fromEntries(report.rows.map((r) => [r.name, r.status]));

// with no credentials configured, every REAL row must be honestly blocked
for (const realRow of ['GOOGLE AUTH REAL', 'ANDROID PUBLISHER REACHED', 'PRODUCT QUERY REAL', 'PURCHASE REAL', 'VERIFY REAL', 'ENTITLEMENT REAL', 'RESTORE REAL', 'RTDN REAL', 'APPLE API AUTH REAL']) {
  assert.equal(byName[realRow], 'EXTERNAL BLOCKER', `${realRow} must be EXTERNAL BLOCKER without credentials`);
}
assert.ok(!report.rows.some((r) => r.status === 'REAL PROVIDER PASS'), 'no REAL PROVIDER PASS without evidence');
assert.ok(!report.rows.some((r) => r.status === 'REAL PLAY PASS'), 'no REAL PLAY PASS without evidence');
assert.equal(byName['SIGNING ENGINEERING'], 'ENGINEERING PASS');
assert.equal(byName['FEATURE GRAPHIC'], 'PASS', 'feature graphic is now generated');
assert.equal(byName['PLAY ICON 512'], 'PASS');
assert.equal(byName['APP CONTENT'], 'ENGINEERING PASS', 'PLAY_APP_CONTENT.md prepared');

// closed test cannot be ready without a Console + keystore
assert.equal(report.closedTestReady, false, 'closed test NOT ready without external access');
assert.ok(report.blockingCount >= 1);

assert.ok(!/-----BEGIN|sb_secret_|eyJ[A-Za-z0-9_-]{20,}\./.test(out), 'no secrets in the report');

console.log('Release doctor 3.0: JSON shape, closedTestReady verdict, blocking flags, honest real/engineering split, no secret leakage — verified');
