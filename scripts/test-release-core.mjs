import assert from 'node:assert/strict';
import { compareVersions, requiresNativeUpgrade } from '../src/services/releaseCore.ts';
assert.equal(compareVersions('1.1.0', '1.1.0'), 0);
assert.equal(compareVersions('1.10.0', '1.2.9'), 1);
assert.equal(compareVersions('1.1', '1.1.1'), -1);
assert.equal(requiresNativeUpgrade('1.1.0', '1.2.0'), true);
assert.equal(requiresNativeUpgrade('1.2.0', '1.2.0'), false);
assert.equal(requiresNativeUpgrade('1.2.0', null), false);
console.log('Release policy: OK');
