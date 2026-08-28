import assert from 'node:assert/strict';

/**
 * TRACK A — Tink-Link-Rückkanal (hosted Browser-Flow, kein natives SDK).
 * state-Bindung, Abbruch, Provider-Fehler, Replay, Fehl-Zustand.
 */
const {
  buildTinkAuthorizeUrl,
  parseTinkCallback,
  classifyTinkCallback,
  tinkErrorToConnectionStatus,
  TINK_REDIRECT_URI,
} = await import('../src/banking/tink/tinkCallbackCore.ts');

// --- URL-Bau -------------------------------------------------------
{
  const url = buildTinkAuthorizeUrl({ clientId: 'cid-123', state: 'abcdef0123456789' });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, 'https://link.tink.com/1.0/authorize');
  assert.equal(u.searchParams.get('client_id'), 'cid-123');
  assert.equal(u.searchParams.get('redirect_uri'), TINK_REDIRECT_URI);
  assert.equal(u.searchParams.get('state'), 'abcdef0123456789');
  assert.equal(u.searchParams.get('market'), 'DE');
  assert.throws(() => buildTinkAuthorizeUrl({ clientId: '', state: 'x' }), /nicht konfiguriert/);
  assert.throws(() => buildTinkAuthorizeUrl({ clientId: 'c', state: '' }), /ohne state/);
}

// --- Parsing: volle URL, reine Query, Objekt ----------------------
{
  assert.deepEqual(
    parseTinkCallback('financeapp://bank/tink?code=AUTH1&state=S1'),
    { code: 'AUTH1', state: 'S1' },
  );
  assert.deepEqual(parseTinkCallback('?error=access_denied&error_reason=nutzer'), {
    error: 'access_denied',
    errorReason: 'nutzer',
  });
  assert.deepEqual(parseTinkCallback({ code: ['AUTH2'], state: 'S2' }), { code: 'AUTH2', state: 'S2' });
  assert.deepEqual(parseTinkCallback(null), {});
  assert.deepEqual(parseTinkCallback(''), {});
}

// --- Happy path: Code + passender state → exchange ---------------
{
  const d = classifyTinkCallback({ code: 'AUTH', state: 'S-good' }, 'S-good');
  assert.equal(d.kind, 'exchange');
  assert.equal(d.code, 'AUTH');
}

// --- state-Mismatch → kein exchange -----------------------------
{
  const d = classifyTinkCallback({ code: 'AUTH', state: 'S-evil' }, 'S-good');
  assert.equal(d.kind, 'state_mismatch');
  assert.equal(d.code, undefined);
}

// --- Replay: derselbe state, aber Sitzung schon konsumiert (expected=null)
//     und unplausibler state → Mismatch; plausibler state ohne Sitzung → toleriert
{
  assert.equal(classifyTinkCallback({ code: 'A', state: 'kurz' }, null).kind, 'state_mismatch');
  assert.equal(
    classifyTinkCallback({ code: 'A', state: 'abcdef0123456789abcdef' }, null).kind,
    'exchange',
  );
  assert.equal(classifyTinkCallback({ code: 'A' }, null).kind, 'exchange');
}

// --- Abbruch durch den Nutzer ----------------------------------
for (const token of ['access_denied', 'USER_CANCELLED', 'AUTHENTICATION_ERROR:USER_CANCELLED']) {
  const d = classifyTinkCallback({ error: token }, 'S');
  assert.equal(d.kind, 'cancelled', token);
  assert.equal(d.requiresReauthorization, false);
  assert.equal(d.connectionStatus, undefined);
}

// --- Provider-Fehler → Verbindungsstatus -----------------------
{
  const d = classifyTinkCallback({ error: 'provider_authorization_failed' }, 'S');
  assert.equal(d.kind, 'error');
  assert.equal(d.connectionStatus, 'requires_action');
  assert.equal(d.requiresReauthorization, true);

  const t = classifyTinkCallback({ error: 'provider_temporarily_unavailable' }, 'S');
  assert.equal(t.connectionStatus, 'temporarily_unavailable');
  assert.equal(t.requiresReauthorization, false);
}

// --- Fehlercode-Mapping direkt ------------------------------------
assert.equal(tinkErrorToConnectionStatus('invalid_session'), 'requires_action');
assert.equal(tinkErrorToConnectionStatus('access_revoked'), 'revoked');
assert.equal(tinkErrorToConnectionStatus('consent_expired'), 'consent_expired');
assert.equal(tinkErrorToConnectionStatus('irgendwas'), 'error');
assert.equal(tinkErrorToConnectionStatus(null), 'error');

// --- Leerer Rücksprung → idle ---------------------------------
assert.equal(classifyTinkCallback({}, 'S').kind, 'idle');

console.log('tink-callback: URL-state-Bindung, Abbruch, Provider-Fehler, Replay — grün');
