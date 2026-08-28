import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

/** release-evidence.json shape + the updater's guard rails. */

const PATH = 'store-assets/release-evidence.json';
const original = readFileSync(PATH, 'utf8');
const ev = JSON.parse(original);

// This test must never leave the committed file mutated.
process.on('exit', () => {
  try {
    if (readFileSync(PATH, 'utf8') !== original) writeFileSync(PATH, original);
  } catch {
    /* best effort */
  }
});

assert.equal(ev.schema, 'finance-app/release-evidence@1');
for (const section of ['signing', 'google', 'apple', 'play_console', 'tink']) {
  assert.ok(section in ev, `evidence has "${section}"`);
}
// every google.*_real flag is a boolean
for (const [k, v] of Object.entries(ev.google)) {
  if (k.endsWith('_real') || k.endsWith('_configured')) assert.equal(typeof v, 'boolean', `google.${k} is boolean`);
}
// no secret-looking content anywhere
assert.ok(!/-----BEGIN|sb_secret_|@[a-z0-9.-]+\.iam\.gserviceaccount\.com|[0-9]{13,}/.test(original), 'no secrets in the evidence file');

function run(args, expectCode) {
  try {
    execFileSync('node', ['scripts/update-release-evidence.mjs', ...args], { stdio: 'pipe' });
    return 0;
  } catch (e) {
    return e.status ?? 1;
  }
}

// rejects a value that looks like a secret / email
assert.equal(run(['google.api_auth_real=service-account@x.iam.gserviceaccount.com']), 1, 'rejects an email-looking value');
assert.equal(run(['--note', 'token is eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc']), 1, 'rejects a JWT-looking note');
// rejects an unknown path (no new fields)
assert.equal(run(['google.made_up_flag=true']), 1, 'rejects an unknown path');
// rejects a huge integer
assert.equal(run(['play_console.testers_opted_in=999999999999']), 1, 'rejects a 12+ digit number');

// accepts a legit boolean flip, then restore
const before = readFileSync(PATH, 'utf8');
run(['play_console.testers_opted_in=3']);
const after = JSON.parse(readFileSync(PATH, 'utf8'));
assert.equal(after.play_console.testers_opted_in, 3, 'legit flip applied');
writeFileSync(PATH, before); // restore

console.log('Release evidence: schema, boolean flags, no-secrets guard, unknown-path rejection — verified');
