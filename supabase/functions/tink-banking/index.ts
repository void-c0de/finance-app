import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';

const TINK_API_BASE = 'https://api.tink.com';
const REDIRECT_URI = 'financeapp://bank/tink';

const jsonHeaders = {
  'Content-Type': 'application/json',
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

class TinkRequestError extends Error {
  constructor(
    readonly status: number,
    readonly requestId: string | null,
    readonly providerCode: string | null,
    path: string,
  ) {
    super(`Tink ${path} returned ${status}`);
  }
}

async function tinkRequest(
  path: string,
  init: RequestInit,
): Promise<Response> {
  const response = await fetch(`${TINK_API_BASE}${path}`, init);

  if (!response.ok) {
    let providerCode: string | null = null;

    try {
      const payload = await response.clone().json() as Record<string, unknown>;
      const candidate =
        payload.error ?? payload.errorCode ?? payload.code ?? payload.reason;

      if (typeof candidate === 'string') {
        const normalized = candidate.slice(0, 80);

        if (/^[A-Za-z0-9_.:-]+$/.test(normalized)) {
          providerCode = normalized;
        }
      }
    } catch {
      // Providerantwort enthaelt kein verwertbares JSON.
    }

    throw new TinkRequestError(
      response.status,
      response.headers.get('X-Request-ID'),
      providerCode,
      path,
    );
  }

  return response;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  const authorization = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publishableKey = Deno.env.get('SUPABASE_ANON_KEY');
  const tinkClientId = Deno.env.get('TINK_CLIENT_ID');
  const tinkClientSecret = Deno.env.get('TINK_CLIENT_SECRET');

  if (!authorization || !supabaseUrl || !publishableKey) {
    return json(401, { error: 'authentication_required' });
  }

  if (!tinkClientId || !tinkClientSecret) {
    return json(503, { error: 'provider_not_configured' });
  }

  const supabase = createClient(supabaseUrl, publishableKey, {
    global: {
      headers: { Authorization: authorization },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: userData, error: userError } =
    await supabase.auth.getUser();

  if (userError || !userData.user) {
    return json(401, { error: 'invalid_session' });
  }

  let payload: {
    action?: unknown;
    code?: unknown;
    redirectUri?: unknown;
  };

  try {
    payload = await request.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  if (
    payload.action !== 'exchange-and-fetch' ||
    typeof payload.code !== 'string' ||
    payload.code.length < 8 ||
    payload.code.length > 4096 ||
    payload.redirectUri !== REDIRECT_URI
  ) {
    return json(400, { error: 'invalid_request' });
  }

  try {
    const tokenBody = new URLSearchParams({
      client_id: tinkClientId,
      client_secret: tinkClientSecret,
      grant_type: 'authorization_code',
      code: payload.code,
    });

    const tokenResponse = await tinkRequest('/api/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenBody.toString(),
    });

    const tokenPayload = await tokenResponse.json() as {
      access_token?: string;
    };

    if (!tokenPayload.access_token) {
      throw new Error('Tink token response missing access token');
    }

    const tinkHeaders = {
      Authorization: `Bearer ${tokenPayload.access_token}`,
    };

    const [accountsResponse, transactionsResponse] = await Promise.all([
      tinkRequest('/data/v2/accounts', { headers: tinkHeaders }),
      tinkRequest('/data/v2/transactions', { headers: tinkHeaders }),
    ]);

    const accountsPayload = await accountsResponse.json() as {
      accounts?: unknown[];
    };

    const transactionsPayload = await transactionsResponse.json() as {
      transactions?: unknown[];
    };

    return json(200, {
      accounts: Array.isArray(accountsPayload.accounts)
        ? accountsPayload.accounts
        : [],
      transactions: Array.isArray(transactionsPayload.transactions)
        ? transactionsPayload.transactions
        : [],
    });
  } catch (error) {
    // Deliberately omit authorization codes, tokens and provider payloads.
    const providerStatus =
      error instanceof TinkRequestError
        ? error.status
        : undefined;

    const requestId =
      error instanceof TinkRequestError
        ? error.requestId
        : null;

    const providerCode =
      error instanceof TinkRequestError
        ? error.providerCode
        : null;

    console.error('Tink banking request failed', {
      message:
        error instanceof Error
          ? error.message
          : 'unknown_error',
      providerStatus,
      requestId,
      providerCode,
      userId: userData.user.id,
    });

    const errorCode =
      providerStatus === 400 ||
      providerStatus === 401 ||
      providerStatus === 403
        ? 'provider_authorization_failed'
        : 'provider_data_failed';

    return json(502, {
      error: errorCode,
      requestId,
      providerCode,
    });
  }
});
