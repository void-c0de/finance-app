import assert from 'node:assert/strict';

/**
 * Tink-Verbindungs-Lebenszyklus: erlaubte Übergänge + die harte Invariante,
 * dass nur eine bewusste Nutzer-Trennung importierte Daten löschen darf.
 */

const m = await import('../src/banking/tink/tinkConnectionLifecycle.ts');

// --- retention policy per state ------------------------------------
for (const status of ['connecting', 'active', 'syncing', 'requires_action', 'consent_expired', 'temporarily_unavailable', 'revoked', 'error']) {
  assert.equal(m.lifecycleFacts(status).retention, 'keep', `${status} darf NIE Daten löschen`);
}
assert.equal(m.lifecycleFacts('disconnected').retention, 'delete', 'nur disconnected darf löschen');

// --- user action flags ------------------------------------------
assert.equal(m.lifecycleFacts('requires_action').userActionRequired, true);
assert.equal(m.lifecycleFacts('consent_expired').userActionRequired, true);
assert.equal(m.lifecycleFacts('revoked').userActionRequired, true);
assert.equal(m.lifecycleFacts('temporarily_unavailable').userActionRequired, false);
assert.equal(m.lifecycleFacts('active').userActionRequired, false);

// --- transitions ----------------------------------------------
assert.equal(m.nextConnectionStatus('active', { type: 'PROVIDER_TEMPORARY_ERROR' }), 'temporarily_unavailable');
assert.equal(m.nextConnectionStatus('temporarily_unavailable', { type: 'SYNC_OK' }), 'active', 'transient outage recovers');
assert.equal(m.nextConnectionStatus('active', { type: 'CONSENT_EXPIRED' }), 'consent_expired');
assert.equal(m.nextConnectionStatus('active', { type: 'REAUTH_REQUIRED' }), 'requires_action');
assert.equal(m.nextConnectionStatus('active', { type: 'ACCESS_REVOKED' }), 'revoked');
assert.equal(m.nextConnectionStatus('consent_expired', { type: 'EXCHANGE_OK' }), 'active', 'reconnect clears it');

// a provider error while already needing reauth must NOT mask the reauth need
assert.equal(m.nextConnectionStatus('requires_action', { type: 'PROVIDER_TEMPORARY_ERROR' }), 'requires_action');
assert.equal(m.nextConnectionStatus('consent_expired', { type: 'UNKNOWN_ERROR' }), 'consent_expired');
assert.equal(m.nextConnectionStatus('revoked', { type: 'SYNC_STARTED' }), 'revoked');

// --- the invariant: no provider/consent event ever deletes data --
const EVENTS = [
  { type: 'PROVIDER_TEMPORARY_ERROR' }, { type: 'CONSENT_EXPIRED' }, { type: 'REAUTH_REQUIRED' },
  { type: 'ACCESS_REVOKED' }, { type: 'UNKNOWN_ERROR' }, { type: 'SYNC_STARTED' }, { type: 'LINK_STARTED' },
  { type: 'EXCHANGE_OK' }, { type: 'SYNC_OK' },
];
for (const from of ['active', 'syncing', 'requires_action', 'consent_expired', 'temporarily_unavailable', 'revoked', 'error']) {
  for (const ev of EVENTS) {
    const to = m.nextConnectionStatus(from, ev);
    assert.equal(m.mayDeleteImportedData(from, to, ev), false, `${from} --${ev.type}--> ${to} darf keine Daten löschen`);
    assert.notEqual(to, 'disconnected', `${ev.type} darf nie zu disconnected führen`);
  }
}
// only the explicit user disconnect
assert.equal(m.nextConnectionStatus('active', { type: 'USER_DISCONNECTED' }), 'disconnected');
assert.equal(m.mayDeleteImportedData('active', 'disconnected', { type: 'USER_DISCONNECTED' }), true);
assert.equal(m.mayDeleteImportedData('revoked', 'disconnected', { type: 'USER_DISCONNECTED' }), true);

// --- auto-sync gating ----------------------------------------
assert.equal(m.canAutoSync('active'), true);
assert.equal(m.canAutoSync('temporarily_unavailable'), true, 'retry a transient outage automatically');
assert.equal(m.canAutoSync('requires_action'), false, 'never auto-sync when SCA is needed');
assert.equal(m.canAutoSync('consent_expired'), false);
assert.equal(m.canAutoSync('revoked'), false);
assert.equal(m.canAutoSync('disconnected'), false);

console.log('Tink lifecycle: transitions, no-data-loss invariant, auto-sync gating — verified');
