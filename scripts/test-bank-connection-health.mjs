import assert from 'node:assert/strict';

import {
  getBankConnectionHealth,
} from '../src/services/bankConnectionHealth.ts';

assert.deepEqual(getBankConnectionHealth({ status: 'active' }), {
  label: 'Aktuell',
  detail: 'Die Verbindung ist einsatzbereit.',
  tone: 'positive',
  userActionRequired: false,
});

assert.equal(
  getBankConnectionHealth({ status: 'temporarily_unavailable' }).userActionRequired,
  false,
);
assert.equal(
  getBankConnectionHealth({ status: 'consent_expired' }).userActionRequired,
  true,
);
assert.equal(getBankConnectionHealth({ status: 'disconnected' }).label, 'Getrennt');

console.log('Bank connection health: OK');
