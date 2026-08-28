import assert from 'node:assert/strict';

/**
 * RC6 — Purchase-Zustandsmaschine.
 *
 * Kern-Invarianten:
 *  - `verified` NUR über `VERIFY_OK` (serverseitig bestätigt).
 *  - Abbruch ≠ Fehler.
 *  - `pending` schaltet nichts frei.
 *  - `verification_failed` hat einen Wiederholungspfad.
 */
const { purchaseReducer, initialPurchaseState, canStartPurchase, isBusy } = await import(
  '../src/services/billing/purchaseStateMachine.ts'
);

const run = (events, start = initialPurchaseState) =>
  events.reduce((state, event) => purchaseReducer(state, event), start);

// --- Happy path: laden → kaufen → verifizieren → verified ----------
{
  const s = run([
    { type: 'INIT' },
    { type: 'PRODUCTS_LOADED' },
    { type: 'BUY' },
    { type: 'PURCHASE_RECEIVED' },
    { type: 'VERIFY_OK' },
  ]);
  assert.equal(s.phase, 'verified');
}

// --- verified ist NUR über VERIFY_OK erreichbar -------------------
for (const badEvent of [
  { type: 'PURCHASE_RECEIVED' },
  { type: 'PURCHASE_PENDING' },
  { type: 'BUY' },
]) {
  const s = run([{ type: 'INIT' }, { type: 'PRODUCTS_LOADED' }, badEvent]);
  assert.notEqual(s.phase, 'verified', `${badEvent.type} darf nicht zu verified führen`);
}

// --- Abbruch ist KEIN Fehler ------------------------------------
{
  const s = run([{ type: 'INIT' }, { type: 'PRODUCTS_LOADED' }, { type: 'BUY' }, { type: 'PURCHASE_CANCELLED' }]);
  assert.equal(s.phase, 'cancelled');
  assert.equal(s.message, null);
  // Danach zurück zur Auswahl
  assert.equal(purchaseReducer(s, { type: 'DISMISS' }).phase, 'ready');
}

// --- pending schaltet nichts frei -----------------------------
{
  const s = run([{ type: 'INIT' }, { type: 'PRODUCTS_LOADED' }, { type: 'BUY' }, { type: 'PURCHASE_PENDING' }]);
  assert.equal(s.phase, 'pending');
  assert.equal(canStartPurchase(s), false);
  // aus pending kann noch eine Verifizierung kommen
  assert.equal(purchaseReducer(s, { type: 'PURCHASE_RECEIVED' }).phase, 'verifying');
}

// --- Verifizierung schlägt fehl → Wiederholungspfad ------------
{
  const failed = run([
    { type: 'INIT' },
    { type: 'PRODUCTS_LOADED' },
    { type: 'BUY' },
    { type: 'PURCHASE_RECEIVED' },
    { type: 'VERIFY_FAILED' },
  ]);
  assert.equal(failed.phase, 'verification_failed');
  assert.ok(failed.message && failed.message.length > 0);
  // RETRY_VERIFY führt zurück in die Prüfung
  assert.equal(purchaseReducer(failed, { type: 'RETRY_VERIFY' }).phase, 'verifying');
  // RESTORE ebenfalls
  assert.equal(purchaseReducer(failed, { type: 'RESTORE' }).phase, 'verifying');
}

// --- Store-Kauf ok, Server nicht eingerichtet ----------------
{
  const s = run([
    { type: 'INIT' },
    { type: 'PRODUCTS_LOADED' },
    { type: 'BUY' },
    { type: 'PURCHASE_RECEIVED' },
    { type: 'VERIFY_NOT_CONFIGURED' },
  ]);
  assert.equal(s.phase, 'verification_failed');
  assert.match(s.message, /serverseitige Prüfung/);
}

// --- NOT_CONFIGURED jederzeit gültig, kein Fehler ------------
{
  const s = purchaseReducer(initialPurchaseState, { type: 'NOT_CONFIGURED' });
  assert.equal(s.phase, 'not_configured');
  assert.equal(s.productsReady, false);
  // aus not_configured heraus verändert BUY nichts
  assert.equal(purchaseReducer(s, { type: 'BUY' }).phase, 'not_configured');
}

// --- Store nicht verfügbar ----------------------------------
{
  const s = run([{ type: 'INIT' }, { type: 'STORE_UNAVAILABLE' }]);
  assert.equal(s.phase, 'store_unavailable');
}
{
  const s = run([{ type: 'INIT' }, { type: 'PRODUCTS_FAILED' }]);
  assert.equal(s.phase, 'store_unavailable');
}

// --- Kauf-Fehler ≠ Abbruch --------------------------------
{
  const s = run([
    { type: 'INIT' },
    { type: 'PRODUCTS_LOADED' },
    { type: 'BUY' },
    { type: 'PURCHASE_ERROR', message: 'Netzwerk weg' },
  ]);
  assert.equal(s.phase, 'error');
  assert.equal(s.message, 'Netzwerk weg');
}

// --- BUY nur aus ready ------------------------------------
assert.equal(purchaseReducer(initialPurchaseState, { type: 'BUY' }).phase, 'idle');
assert.equal(
  purchaseReducer({ phase: 'loading_products', message: null, productsReady: false }, { type: 'BUY' }).phase,
  'loading_products',
);

// --- isBusy -------------------------------------------------
assert.equal(isBusy({ phase: 'verifying', message: null, productsReady: true }), true);
assert.equal(isBusy({ phase: 'ready', message: null, productsReady: true }), false);
assert.equal(isBusy({ phase: 'cancelled', message: null, productsReady: true }), false);

// --- unbekannte Events sind no-ops -----------------------
assert.deepEqual(purchaseReducer(initialPurchaseState, { type: 'NONSENSE' }), initialPurchaseState);

console.log('purchase state machine: verified nur serverseitig, Abbruch≠Fehler, pending sperrt, Retry-Pfad — grün');
