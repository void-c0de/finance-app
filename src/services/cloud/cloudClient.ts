import 'react-native-url-polyfill/auto';

import * as SecureStore from 'expo-secure-store';

import { createClient } from '@supabase/supabase-js';

import type {
    SupabaseClient,
    Session,
} from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL;

const SUPABASE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;





/**
 * SecureStore-Adapter für
 * supabase-js Session-Persistenz.
 */
const secureStoreAdapter = {
  getItem: (
    key: string,
  ): Promise<string | null> =>
    SecureStore.getItemAsync(
      key,
    ),

  setItem: (
    key: string,

    value: string,
  ): Promise<void> =>
    SecureStore.setItemAsync(
      key,

      value,
    ),

  removeItem: (
    key: string,
  ): Promise<void> =>
    SecureStore.deleteItemAsync(
      key,
    ),
};

let cachedClient:
  | SupabaseClient
  | null = null;

export function isCloudConfigured(): boolean {
  return Boolean(
    SUPABASE_URL &&
      SUPABASE_PUBLISHABLE_KEY
  );
}

export function getSupabaseClient():
  | SupabaseClient
  | null {
  if (!isCloudConfigured()) {
    return null;
  }

  if (cachedClient) {
    return cachedClient;
  }

  cachedClient = createClient(
    SUPABASE_URL as string,

    SUPABASE_PUBLISHABLE_KEY as string,

    {
      auth: {
        storage:
          secureStoreAdapter,

        autoRefreshToken: true,

        persistSession: true,

        detectSessionInUrl: false,
      },
    },
  );

  return cachedClient;
}

export type CloudSignInResult =
  | {
      ok: true;

      userId: string;
    }
  | {
      ok: false;

      message:
        string;
    };

function shouldRefreshSession(
  session: Session,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (
    typeof session.expires_at === 'number' &&
    session.expires_at <= nowSeconds + 60
  ) {
    return true;
  }

  try {
    const payloadPart = session.access_token.split('.')[1];

    if (!payloadPart) {
      return false;
    }

    const normalizedBase64 = payloadPart
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const normalized = normalizedBase64.padEnd(
      Math.ceil(normalizedBase64.length / 4) * 4,
      '=',
    );

    const payload = JSON.parse(
      globalThis.atob(normalized),
    ) as { iat?: unknown };

    return (
      typeof payload.iat === 'number' &&
      payload.iat > nowSeconds + 30
    );
  } catch {
    // Ein nicht lesbarer JWT wird weiterhin von Supabase validiert.
    return false;
  }
}

/**
 * Stellt sicher, dass eine gültige
 * Cloud-Session existiert.
 *
 * Sessions werden in SecureStore persistiert.
 * Ohne Session wird bewusst KEIN Fallback-
 * Passwort verwendet (keine Geheimnisse im
 * Bundle!): Die App fordert dann eine
 * Anmeldung über den Cloud-Konto-Bildschirm.
 */
export async function ensureCloudSession(): Promise<CloudSignInResult> {
  const client =
    getSupabaseClient();

  if (!client) {
    return {
      ok: false,

      message:
        'Cloud nicht konfiguriert',
    };
  }

  try {
    const {
      data: sessionData,
    } =
      await client.auth.getSession();

    let existingSession:
      | Session
      | null =
      sessionData.session;

    if (
      existingSession &&
      shouldRefreshSession(existingSession)
    ) {
      const { data, error } =
        await client.auth.refreshSession();

      if (error) {
        throw error;
      }

      existingSession = data.session;
    }

    if (
      existingSession?.user?.id
    ) {
      return {
        ok: true,

        userId:
          existingSession.user.id,
      };
    }

    return {
      ok: false,

      message:
        'Anmeldung erforderlich',
    };
  } catch (error) {
    console.error(
      '[CLOUD] Session-Fehler:',
      error,
    );

    return {
      ok: false,

      message:
        'Cloud nicht erreichbar',
    };
  }
}
