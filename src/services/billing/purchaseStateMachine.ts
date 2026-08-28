/**
 * Reine, deterministische Zustandsmaschine für den In-App-Kauf.
 *
 * Nur `import type` — testbar unter `node --experimental-strip-types`
 * (`scripts/test-purchase-state-machine.mjs`).
 *
 * Kern-Invarianten:
 *  - Ein Kauf-Event des Stores ist KEIN Premium. `verified` wird nur über
 *    `VERIFY_OK` erreicht (= serverseitig bestätigt).
 *  - Abbruch (`cancelled`) ist NIE `error`.
 *  - `pending` (z. B. Play „langsame Zahlung") schaltet nichts frei.
 *  - `verification_failed` bietet einen sicheren Wiederholungspfad
 *    (`RETRY_VERIFY` / `RESTORE`), ohne zum Doppelkauf zu drängen.
 */

export type PurchasePhase =
  | 'idle'
  | 'loading_products'
  | 'ready'
  | 'purchasing'
  | 'pending'
  | 'verifying'
  | 'verified'
  | 'cancelled'
  | 'not_configured'
  | 'store_unavailable'
  | 'verification_failed'
  | 'error';

export type PurchaseEvent =
  | { type: 'INIT' }
  | { type: 'NOT_CONFIGURED' }
  | { type: 'STORE_UNAVAILABLE' }
  | { type: 'PRODUCTS_LOADED' }
  | { type: 'PRODUCTS_FAILED' }
  | { type: 'BUY' }
  | { type: 'PURCHASE_PENDING' }
  | { type: 'PURCHASE_RECEIVED' }
  | { type: 'PURCHASE_CANCELLED' }
  | { type: 'PURCHASE_ERROR'; message?: string }
  | { type: 'VERIFY_OK' }
  | { type: 'VERIFY_NOT_CONFIGURED' }
  | { type: 'VERIFY_FAILED'; message?: string }
  | { type: 'RETRY_VERIFY' }
  | { type: 'RESTORE' }
  | { type: 'DISMISS' };

export type PurchaseState = {
  phase: PurchasePhase;
  /** Nutzerlesbare Fehlermeldung bei `error` / `verification_failed`. */
  message: string | null;
  /** True, sobald Produkte einmal geladen wurden (für `DISMISS` → `ready`). */
  productsReady: boolean;
};

export const initialPurchaseState: PurchaseState = {
  phase: 'idle',
  message: null,
  productsReady: false,
};

/** Endzustände, aus denen der Nutzer zurück zur Auswahl darf. */
const DISMISSABLE: ReadonlySet<PurchasePhase> = new Set([
  'cancelled',
  'error',
  'verified',
  'verification_failed',
]);

export function purchaseReducer(state: PurchaseState, event: PurchaseEvent): PurchaseState {
  const to = (phase: PurchasePhase, message: string | null = null): PurchaseState => ({
    ...state,
    phase,
    message,
  });

  switch (event.type) {
    case 'INIT':
      return state.phase === 'idle' ? to('loading_products') : state;

    case 'NOT_CONFIGURED':
      // Kein eingerichteter Kaufweg — jederzeit gültig, kein Fehler.
      return { phase: 'not_configured', message: null, productsReady: false };

    case 'STORE_UNAVAILABLE':
      return to('store_unavailable');

    case 'PRODUCTS_LOADED':
      return { ...to('ready'), productsReady: true };

    case 'PRODUCTS_FAILED':
      return to('store_unavailable');

    case 'BUY':
      return state.phase === 'ready' ? to('purchasing') : state;

    case 'PURCHASE_PENDING':
      // Play kann einen Kauf als „ausstehend" melden (langsame Zahlweise).
      // Das schaltet NICHTS frei.
      return state.phase === 'purchasing' ? to('pending') : state;

    case 'PURCHASE_RECEIVED':
      return state.phase === 'purchasing' || state.phase === 'pending' ? to('verifying') : state;

    case 'PURCHASE_CANCELLED':
      // Abbruch ist ausdrücklich KEIN Fehler.
      return state.phase === 'purchasing' ? to('cancelled') : state;

    case 'PURCHASE_ERROR':
      return state.phase === 'purchasing' || state.phase === 'pending'
        ? to('error', event.message ?? 'Der Kauf konnte nicht abgeschlossen werden.')
        : state;

    case 'VERIFY_OK':
      // Der EINZIGE Weg zu „verified" — Premium entsteht serverseitig.
      return state.phase === 'verifying' ? to('verified') : state;

    case 'VERIFY_NOT_CONFIGURED':
      // Store-Kauf ok, aber der Server-Verifizierer hat (noch) keine Credentials.
      return state.phase === 'verifying'
        ? to(
            'verification_failed',
            'Der Kauf wurde vom Store bestätigt, die serverseitige Prüfung ist aber noch nicht eingerichtet. Nichts wurde berechnet – bitte später „Käufe wiederherstellen".',
          )
        : state;

    case 'VERIFY_FAILED':
      return state.phase === 'verifying'
        ? to(
            'verification_failed',
            event.message ??
              'Die Kaufprüfung ist fehlgeschlagen. Es wurde kein zweiter Kauf ausgelöst – tippe auf „Erneut prüfen" oder „Käufe wiederherstellen".',
          )
        : state;

    case 'RETRY_VERIFY':
      return state.phase === 'verification_failed' ? to('verifying') : state;

    case 'RESTORE':
      // Wiederherstellen ist aus jedem stabilen Zustand erlaubt.
      return state.phase === 'purchasing' || state.phase === 'verifying' ? state : to('verifying');

    case 'DISMISS':
      if (!DISMISSABLE.has(state.phase)) return state;
      return to(state.productsReady ? 'ready' : 'idle');

    default:
      return state;
  }
}

/** Darf die UI aktuell einen Kauf-Button aktiv zeigen? */
export function canStartPurchase(state: PurchaseState): boolean {
  return state.phase === 'ready';
}

/** Ist gerade ein Vorgang „in Arbeit" (Spinner)? */
export function isBusy(state: PurchaseState): boolean {
  return (
    state.phase === 'loading_products' ||
    state.phase === 'purchasing' ||
    state.phase === 'pending' ||
    state.phase === 'verifying'
  );
}
