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
 * Sandbox-Credentials duerfen gebundelt
 * werden (EXPO_PUBLIC_TINK_*). Fuer die
 * Production-Umgebung MUESSEN client_id/
 * secret serverseitig liegen (Edge Function)
 * und diese Datei nur noch ohne Secret
 * arbeiten. Nie Produktions-Secrets ins APK!
 */

const TINK_API_BASE =
  'https://api.tink.com';

const CLIENT_ID =
  process.env.EXPO_PUBLIC_TINK_CLIENT_ID ??
  '';

const CLIENT_SECRET =
  process.env.EXPO_PUBLIC_TINK_CLIENT_SECRET ??
  '';

export type TinkTokenResponse =
  {
    access_token:
      string;

    token_type:
      string;

    expires_in:
      number;

    scope:
      string;
  };

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

    amount?: {
      currencyCode?: string;

      scale?: string;

      unscaledValue?: string;
    };
  };

async function postForm(
  path:
    string,

  form:
    Record<
      string,
      string
    >,
): Promise<TinkTokenResponse> {
  const body =
    Object.entries(
      form,
    )
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
      )
      .join('&');

  const response =
    await fetch(
      `${TINK_API_BASE}${path}`,

      {
        method:
          'POST',

        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded',
        },

        body,
      },
    );

  if (
    !response.ok
  ) {
    throw new Error(
      `Tink ${path} failed: ${response.status}`,
    );
  }

  return (await response.json()) as TinkTokenResponse;
}

/**
 * App-Level-Token (client_credentials).
 * Reicht fuer User-Management/Providers -
 * NICHT fuer Datenzugriff.
 */
export async function getClientAccessToken(
  scope:
    string =
    'providers:read user:read user:create',
): Promise<string> {
  if (
    !CLIENT_ID ||
    !CLIENT_SECRET
  ) {
    throw new Error(
      'Tink nicht konfiguriert (EXPO_PUBLIC_TINK_* fehlt).',
    );
  }

  const token =
    await postForm(
      '/api/v1/oauth/token',

      {
        client_id:
          CLIENT_ID,

        client_secret:
          CLIENT_SECRET,

        grant_type:
          'client_credentials',

        scope,
      },
    );

  return token.access_token;
}

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

/**
 * Authorization Code (aus dem Redirect)
 * gegen einen USER access token tauschen.
 */
export async function exchangeAuthorizationCode(
  code:
    string,
): Promise<TinkTokenResponse> {
  return postForm(
    '/api/v1/oauth/token',

    {
      client_id:
        CLIENT_ID,

      client_secret:
        CLIENT_SECRET,

      grant_type:
        'authorization_code',

      code,

      redirect_uri:
        'financeapp://bank/tink',
    },
  );
}

async function getJson<T>(
  path:
    string,

  accessToken:
    string,
): Promise<T> {
  const response =
    await fetch(
      `${TINK_API_BASE}${path}`,

      {
        method:
          'GET',

        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },
      },
    );

  if (
    !response.ok
  ) {
    throw new Error(
      `Tink GET ${path} failed: ${response.status}`,
    );
  }

  return (await response.json()) as T;
}

type AccountsEnvelope =
  {
    accounts?:
      TinkAccount[];
  };

type TransactionsEnvelope =
  {
    transactions?:
      TinkTransaction[];
  };

export async function listAccounts(
  userAccessToken:
    string,
): Promise<TinkAccount[]> {
  const payload =
    await getJson<AccountsEnvelope>(
      '/data/v2/accounts',

      userAccessToken,
    );

  return payload.accounts ??
    [];
}

export async function listTransactions(
  userAccessToken:
    string,
): Promise<TinkTransaction[]> {
  const payload =
    await getJson<TransactionsEnvelope>(
      '/data/v2/transactions',

      userAccessToken,
    );

  return payload.transactions ??
    [];
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
