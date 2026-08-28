/**
 * Reiner Kern des Tink-Link-Rückkanals — nur `import type`, kein I/O.
 * Testbar über `scripts/test-tink-callback.mjs`.
 *
 * Architektur: Finance App nutzt den **hosted Tink-Link-Browser-Flow**
 * (`link.tink.com`), NICHT ein natives SDK. Das ist der von Tink für den
 * mobilen Lesezugriff (PSD2 AIS) unterstützte Weg und funktioniert auf iOS
 * und Android identisch — die App baut eine URL, öffnet sie, und empfängt
 * das Ergebnis über den benutzerdefinierten Rücksprung `financeapp://bank/tink`.
 * Kein Client-Secret, keine Bankzugänge in der App.
 */
import type { BankConnectionStatus } from '../../types/banking';

export const TINK_REDIRECT_URI = 'financeapp://bank/tink';
export const TINK_AUTHORIZE_ENDPOINT = 'https://link.tink.com/1.0/authorize';
export const TINK_DEFAULT_SCOPE = 'accounts:read balances:read transactions:read';

/** Start-URL für den hosted Tink-Link-Flow. `state` bindet den Rücksprung an die Sitzung. */
export function buildTinkAuthorizeUrl(input: {
  clientId: string;
  state: string;
  market?: string;
  locale?: string;
  scope?: string;
  redirectUri?: string;
}): string {
  if (!input.clientId) {
    throw new Error('Tink nicht konfiguriert.');
  }
  if (!input.state) {
    throw new Error('Tink-Link ohne state ist nicht erlaubt.');
  }

  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri ?? TINK_REDIRECT_URI,
    authorization_page: 'DEFAULT',
    scope: input.scope ?? TINK_DEFAULT_SCOPE,
    market: input.market ?? 'DE',
    locale: input.locale ?? 'de_DE',
    state: input.state,
  });

  return `${TINK_AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

export type TinkCallbackParams = {
  code?: string;
  state?: string;
  error?: string;
  errorReason?: string;
  credentialsStatus?: string;
};

/**
 * Zerlegt einen Rücksprung. Akzeptiert eine volle URL
 * (`financeapp://bank/tink?...`), eine reine Query (`?a=b` / `a=b`) oder ein
 * bereits geparstes Objekt (Expo-Router-`useLocalSearchParams`).
 */
export function parseTinkCallback(
  input: string | Record<string, string | string[] | undefined> | null | undefined,
): TinkCallbackParams {
  const out: TinkCallbackParams = {};
  if (!input) return out;

  let entries: [string, string][] = [];
  if (typeof input === 'string') {
    const qIndex = input.indexOf('?');
    const query = qIndex >= 0 ? input.slice(qIndex + 1) : input;
    for (const [k, v] of new URLSearchParams(query).entries()) {
      entries.push([k, v]);
    }
  } else {
    entries = Object.entries(input)
      .map(([k, v]): [string, string] => [k, Array.isArray(v) ? (v[0] ?? '') : (v ?? '')])
      .filter(([, v]) => v.length > 0);
  }

  for (const [k, v] of entries) {
    if (k === 'code') out.code = v;
    else if (k === 'state') out.state = v;
    else if (k === 'error') out.error = v;
    else if (k === 'error_reason' || k === 'errorReason' || k === 'message') out.errorReason = v;
    else if (k === 'credentials_status' || k === 'credentialsStatus') out.credentialsStatus = v;
  }
  return out;
}

/** Server-Fehlercode der `tink-banking`-Function → Verbindungszustand. */
export function tinkErrorToConnectionStatus(code: string | null | undefined): BankConnectionStatus {
  switch (code) {
    case 'provider_authorization_failed':
    case 'invalid_request':
    case 'invalid_session':
    case 'authentication_required':
      return 'requires_action';
    case 'provider_data_failed':
    case 'provider_temporarily_unavailable':
      return 'temporarily_unavailable';
    case 'consent_expired':
      return 'consent_expired';
    case 'access_revoked':
      return 'revoked';
    default:
      return 'error';
  }
}

export type TinkCallbackKind =
  | 'exchange' // gültiger Code, state passt → Server-Austausch starten
  | 'cancelled' // Nutzer hat abgebrochen → nichts kaputt machen
  | 'error' // Provider-/Auth-Fehler → Verbindung auf passenden Status
  | 'state_mismatch' // Rücksprung gehört nicht zu unserer Sitzung → ignorieren
  | 'idle'; // kein verwertbarer Parameter

export type TinkCallbackDecision = {
  kind: TinkCallbackKind;
  code?: string;
  title: string;
  message: string;
  connectionStatus?: BankConnectionStatus;
  requiresReauthorization: boolean;
};

const CANCEL_TOKENS = new Set([
  'access_denied',
  'user_cancelled',
  'cancelled',
  'canceled',
  'USER_CANCELLED',
  'AUTHENTICATION_ERROR:USER_CANCELLED',
]);

/**
 * Entscheidet, was ein Rücksprung bedeutet. `expectedState` ist der zuvor
 * erzeugte und sicher gespeicherte Nonce; fehlt er (Cold-Start ohne Sitzung),
 * wird ein vorhandener `state` nur auf Anwesenheit toleriert, aber ein
 * *falscher* state führt nie zu einem Austausch.
 */
export function classifyTinkCallback(
  params: TinkCallbackParams,
  expectedState: string | null | undefined,
): TinkCallbackDecision {
  const cancelled =
    (params.error && CANCEL_TOKENS.has(params.error)) ||
    (params.credentialsStatus && CANCEL_TOKENS.has(params.credentialsStatus));

  if (cancelled) {
    return {
      kind: 'cancelled',
      title: 'Bankverbindung abgebrochen',
      message:
        'Du hast die Bankfreigabe abgebrochen. Es wurde nichts geändert – deine bisherigen Konten und Umsätze bleiben unverändert.',
      requiresReauthorization: false,
    };
  }

  if (params.error) {
    const status = tinkErrorToConnectionStatus(params.error);
    return {
      kind: 'error',
      code: params.error,
      title: 'Bankfreigabe fehlgeschlagen',
      message:
        params.errorReason ??
        'Tink konnte die Autorisierung nicht abschließen. Deine bisherigen Daten bleiben erhalten – starte die Verbindung bei Bedarf neu.',
      connectionStatus: status,
      requiresReauthorization: status === 'requires_action' || status === 'consent_expired',
    };
  }

  if (!params.code) {
    return {
      kind: 'idle',
      title: '',
      message: '',
      requiresReauthorization: false,
    };
  }

  // Ab hier liegt ein Code vor.
  if (expectedState) {
    if (params.state !== expectedState) {
      return {
        kind: 'state_mismatch',
        title: 'Rücksprung nicht zuordenbar',
        message:
          'Dieser Bank-Rücksprung gehört nicht zu deiner aktuellen Anfrage und wurde ignoriert. Starte die Verbindung erneut.',
        requiresReauthorization: false,
      };
    }
  } else if (params.state && !/^[A-Za-z0-9._-]{8,128}$/.test(params.state)) {
    return {
      kind: 'state_mismatch',
      title: 'Rücksprung nicht zuordenbar',
      message: 'Der Bank-Rücksprung ist ungültig und wurde ignoriert. Starte die Verbindung erneut.',
      requiresReauthorization: false,
    };
  }

  return {
    kind: 'exchange',
    code: params.code,
    title: 'Bank wird verbunden',
    message: 'Konten und Umsätze werden verschlüsselt importiert.',
    requiresReauthorization: false,
  };
}
