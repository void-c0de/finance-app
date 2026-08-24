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

const SYNC_EMAIL =
  process.env.EXPO_PUBLIC_SUPABASE_SYNC_EMAIL;

const SYNC_PASSWORD =
  process.env.EXPO_PUBLIC_SUPABASE_SYNC_PASSWORD;

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
      SUPABASE_PUBLISHABLE_KEY &&
      SYNC_EMAIL &&
      SYNC_PASSWORD,
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

/**
 * Stellt sicher, dass eine gültige
 * Cloud-Session existiert.
 *
 * Bestehende Sessions werden wiederverwendet
 * (persistiert in SecureStore), sonst erfolgt
 * ein Password-Grant mit dem dedizierten
 * Sync-Account.
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

    const existingSession:
      | Session
      | null =
      sessionData.session;

    if (
      existingSession?.user?.id
    ) {
      return {
        ok: true,

        userId:
          existingSession.user.id,
      };
    }

    const { data, error } =
      await client.auth.signInWithPassword({
        email:
          SYNC_EMAIL as string,

        password:
          SYNC_PASSWORD as string,
      });

    if (error || !data.user) {
      console.error(
        '[CLOUD] Anmeldung fehlgeschlagen:',
        error?.message,
      );

      return {
        ok: false,

        message:
          'Cloud-Anmeldung fehlgeschlagen',
      };
    }

    return {
      ok: true,

      userId:
        data.user.id,
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
