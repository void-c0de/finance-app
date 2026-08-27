import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validatePasswordSecurityCore } from '../src/security/passwordSecurityCore.ts';

const sha1Hex = async (value) => createHash('sha1').update(value, 'utf8').digest('hex');
const safeRange = async () => '00000000000000000000000000000000000:4\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:2';

const weak = await validatePasswordSecurityCore('password1234', { sha1Hex, fetchRange: safeRange });
assert.equal(weak.ok, false);
assert.ok(weak.code === 'too_short' || weak.code === 'too_weak');

const strongPassphrase = 'Marmor Komet Laterne Zypresse 8472';
const strong = await validatePasswordSecurityCore(strongPassphrase, { sha1Hex, fetchRange: safeRange });
assert.equal(strong.ok, true, 'Eine starke deutsche Passphrase muss akzeptiert werden.');

const compromisedPassword = 'Diese Passphrase ist formal sehr lang 9842';
const compromisedHash = await sha1Hex(compromisedPassword);
const compromised = await validatePasswordSecurityCore(compromisedPassword, {
  sha1Hex,
  fetchRange: async (prefix) => {
    assert.equal(prefix, compromisedHash.slice(0, 5).toUpperCase());
    return `${compromisedHash.slice(5).toUpperCase()}:42`;
  },
});
assert.equal(compromised.ok, false);
assert.equal(compromised.code, 'compromised');

const safePassword = 'Birkenwald-Satellit-Wolke-5831';
const safe = await validatePasswordSecurityCore(safePassword, { sha1Hex, fetchRange: safeRange });
assert.equal(safe.ok, true);

const unavailable = await validatePasswordSecurityCore(safePassword, {
  sha1Hex,
  fetchRange: async () => { throw new Error('network down'); },
});
assert.equal(unavailable.ok, false);
assert.equal(unavailable.code, 'check_unavailable');

console.log('Password security (zxcvbn + HIBP k-anonymity): OK');
