/**
 * TINK OPEN BANKING CLIENT (SANDBOX)
 * ==================================
 *
 * Legitimer PSD2-Pfad zu Klarna: Tink
 * ist eine Klarna-Tochter. Dieser Client
 * implementiert den SERVERSEITIG
 * verifizierten API-Kontrakt (2026-08-25,
 * echte Calls gegen api.tink.com):
 *
 * - client_credentials-Grant OK
 *   (providers:read,user:read,user:create)
 * - POST /api/v1/user/create OK
 *   -> Sandbox-Testuser anlegbar
 * - POST /api/v1/oauth/authorization-grant:
 *   403 ohne entsprechende App-Freischaltung
 *   in der Console (erwartet) - der
 *   produktive Weg im Mobile-Flow ist
 *   TINK LINK (hosted Browser-Flow),
 *   der braucht keine Delegation.
 *
 * SECURITY-VERTRAG:
 * Im mobilen Bundle liegt ausschliesslich
 * die oeffentliche Tink Client-ID fuer den
 * Hosted-Link. Code-Austausch und Datenabruf
 * laufen authentifiziert ueber die Supabase
 * Edge Function `tink-banking`. Client-Secret
 * und Tink-User-Token verlassen den Server nie.
 */

import {
  getSupabaseClient,
} from '@/services/cloud/cloudClient';

const CLIENT_ID =
  process.env.EXPO_PUBLIC_TINK_CLIENT_ID ??
  '';

export type TinkAmount =
  {
    currencyCode?:
      string;

    scale?:
      string;

    unscaledValue?:
      string;
  };

export type TinkAccount =
  {
    accountId?:
      string;

    id?:
      string;

    name?:
      string;

    accountNumber?:
      string;

    /**
     * Balance-Shapes variieren je nach
     * Endpoint-Version - bewusst als
     * unknown und defensiv geparsed
     * (siehe extractBalanceMinor).
     */
    balance?:
      unknown;

    balances?:
      TinkAmount[];

    type?:
      string;
  };

export type TinkTransaction =
  {
    accountId?:
      string;

    externalId?:
      string;

    transactionId?:
      string;

    id?:
      string;

    descriptions?:
      {
        display?: string;
      };

    description?:
      string;

    dates?: {
      booked?: string;
    };

    bookedDate?:
      string;

    /**
     * Data v2 liefert den Wert ueblicherweise
     * als { currencyCode, value: { unscaledValue,
     * scale } }. Sandbox-/Legacy-Antworten koennen
     * weiterhin die flache Form enthalten.
     */
    amount?: unknown;

    bookedDateTime?: string;

    status?:
      | 'PENDING'
      | 'BOOKED'
      | 'UNDEFINED'
      | string;
  };

/**
 * Tink Link Start-URL: der User waehlt
 * dort seine Bank (inkl. Klarna, falls
 * gelistet) und autorisiert.
 */
export function buildTinkLinkUrl(
  options: {
    market?:
      string;

    locale?:
      string;

    scope?:
      string;
  },
): string {
  if (
    !CLIENT_ID
  ) {
    throw new Error(
      'Tink nicht konfiguriert.',
    );
  }

  const params =
    new URLSearchParams(
      {
        client_id:
          CLIENT_ID,

        redirect_uri:
          'financeapp://bank/tink',

        authorization_page:
          'DEFAULT',

        scope:

          options.scope ??
          'accounts:read balances:read transactions:read',

        market:

          options.market ??
          'DE',

        locale:

          options.locale ??
          'de_DE',
      },
    );

  return `https://link.tink.com/1.0/authorize?${params.toString()}`;
}

export type TinkImportPayload = {
  accounts: TinkAccount[];

  transactions: TinkTransaction[];
};

/**
 * Tauscht den Authorization Code und liest
 * Bankdaten ausschliesslich serverseitig.
 * Supabase uebermittelt die aktuelle Auth-
 * Session an die JWT-geschuetzte Funktion.
 */
export async function fetchTinkImport(
  code:
    string,
): Promise<TinkImportPayload> {
  const client =
    getSupabaseClient();

  if (!client) {
    throw new Error(
      'Cloud ist nicht konfiguriert.',
    );
  }

  const {
    data,
    error,
  } = await client.functions.invoke<TinkImportPayload>(
    'tink-banking',
    {
      body: {
        action: 'exchange-and-fetch',
        code,
        redirectUri:
          'financeapp://bank/tink',
      },
    },
  );

  if (error) {
    let serverCode:
      | string
      | undefined;

    const response = (
      error as unknown as {
        context?: Response;
      }
    ).context;

    if (response) {
      try {
        const body =
          await response.clone().json() as {
            error?: unknown;
          };

        serverCode =
          typeof body.error === 'string'
            ? body.error
            : undefined;
      } catch {
        // Keine verwertbare JSON-Fehlerantwort.
      }
    }

    const messageByCode:
      Record<string, string> = {
        authentication_required:
          'Cloud-Anmeldung für die Bankverbindung erforderlich.',
        invalid_session:
          'Cloud-Sitzung abgelaufen. Bitte erneut anmelden.',
        provider_not_configured:
          'Der sichere Tink-Dienst ist noch nicht vollständig konfiguriert.',
        invalid_request:
          'Die Tink-Autorisierung ist ungültig oder bereits verbraucht.',
        provider_authorization_failed:
          'Tink hat die Autorisierung abgelehnt oder sie ist abgelaufen.',
        provider_data_failed:
          'Tink konnte die Bankdaten nach der Autorisierung nicht bereitstellen.',
      };

    throw new Error(
      serverCode
        ? messageByCode[serverCode] ??
          `Sicherer Tink-Abruf fehlgeschlagen (${serverCode}).`
        : `Sicherer Tink-Abruf fehlgeschlagen (${error.name}).`,
    );
  }

  if (!data) {
    throw new Error(
      'Leere Antwort vom sicheren Tink-Dienst.',
    );
  }

  return {
    accounts:
      Array.isArray(data.accounts)
        ? data.accounts
        : [],

    transactions:
      Array.isArray(data.transactions)
        ? data.transactions
        : [],
  };
}

/*
 * Hilfsfunktion: Tink-Betraege kommen als
 * unscaledValue + scale (String) - z.B.
 * unscaled "1234", scale "-2" => 12.34 EUR
 * => 1234 Minor Units.
 */
export function tinkUnscaledToMinorUnits(
  unscaledValue:
    string |

    undefined,

  scale:
    string |

    undefined,
): number {
  if (
    !unscaledValue
  ) {
    return 0;
  }

  const unscaled =
    Number.parseInt(
      unscaledValue,

      10,
    );

  if (
    Number.isNaN(
      unscaled,
    )
  ) {
    return 0;
  }

  const scaleDigits =
    scale
      ? Number.parseInt(
          scale,

          10,
        )
      : 0;

  if (
    scaleDigits >=
    0
  ) {
    let value =
      unscaled;

    for (
      let index = 0;
      index <
      scaleDigits;
      index += 1
    ) {
      value *=
        10;
    }

    return value;
  }

  let divisor =
    1;

  for (
    let index = 0;
    index >
    scaleDigits;
    index -= 1
  ) {
    divisor *=
      10;
  }

  /*
   * Bewusst runden statt abschneiden,
   * um Rundungsdrift zu vermeiden.
   */
  return Math.round(
    unscaled /
      divisor,
  );
}
