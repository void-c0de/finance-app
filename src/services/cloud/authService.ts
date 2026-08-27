import {
    ensureCloudSession,
    getSupabaseClient,
} from '@/services/cloud/cloudClient';

import { validatePasswordSecurity } from '@/security/passwordSecurity';

/**
 * Persönliche Konto-Verwaltung.
 *
 * Jede Installation verwendet ein eigenes
 * Supabase-Konto und damit einen durch RLS
 * vollständig isolierten Datenraum.
 */

export type PersonalAccountMode =
  | 'unknown'
  | 'personal';

export type PersonalAccountInfo = {
  mode:
    PersonalAccountMode;

  email?:
    string;

  userId?:
    string;

  isSuperuser?:
    boolean;
};

export async function getPersonalAccountInfo(): Promise<PersonalAccountInfo> {
  const supabase =
    getSupabaseClient();

  if (!supabase) {
    return {
      mode: 'unknown',
    };
  }

  const session =
    await ensureCloudSession();

  if (!session.ok) {
    return {
      mode: 'unknown',
    };
  }

  try {
    const { data } =
      await supabase.auth.getUser();

    const email =
      data.user?.email ??
      undefined;

    let isSuperuser =
      false;

    try {
      const { data: profile } =
        await supabase
          .from('profiles')
          .select('is_superuser')
          .eq('id', session.userId)
          .single();

      isSuperuser =
        profile?.is_superuser ===
        true;
    } catch {
      /*
       * Profil nicht lesbar ist kein
       * Fehler fuer den Sync-Modus.
       */
    }

    return {
      mode: 'personal',

      email,

      isSuperuser,

      userId: session.userId,
    };
  } catch (error) {
    console.warn(
      '[AUTH] Kontostatus nicht lesbar:',
      error,
    );

    return {
      mode: 'unknown',

      userId: session.userId,
    };
  }
}

export type AuthActionResult =
  | {
      ok: true;

      needsEmailConfirmation?:
        boolean;
    }
  | {
      ok: false;

      message:
        string;
    };

function translateAuthError(
  message:
    string,
): string {
  const lowered =
    message.toLowerCase();

  if (
    lowered.includes(
      'invalid login',
    )
  ) {
    return 'E-Mail oder Passwort ist falsch.';
  }

  if (
    lowered.includes(
      'email not confirmed',
    ) ||
    lowered.includes(
      'not confirmed',
    )
  ) {
    return 'Bitte bestätige zuerst die E-Mail über den Link in deiner Mailbox.';
  }

  if (
    lowered.includes(
      'already registered',
    ) ||
    lowered.includes(
      'already exists',
    )
  ) {
    return 'Für diese E-Mail existiert bereits ein Konto. Bitte anmelden.';
  }

  if (
    lowered.includes(
      'rate limit',
    )
  ) {
    return 'Zu viele Versuche. Bitte kurz warten.';
  }

  if (
    lowered.includes(
      'password',
    ) &&
    lowered.includes(
      'at least',
    )
  ) {
    return 'Das Passwort erfüllt die Sicherheitsanforderungen nicht.';
  }

  return message;
}

export async function signInPersonalAccount(
  email:
    string,

  password:
    string,
): Promise<AuthActionResult> {
  const supabase =
    getSupabaseClient();

  if (!supabase) {
    return {
      ok: false,

      message:
        'Cloud nicht konfiguriert',
    };
  }

  try {
    const { data, error } =
      await supabase.auth.signInWithPassword({
        email,

        password,
      });

    if (
      error ||
      !data.user
    ) {
      return {
        ok: false,

        message: translateAuthError(
          error?.message ??
            'Anmeldung fehlgeschlagen',
        ),
      };
    }

    /*
     * Wichtig: Sync-Cursor gehören zum
     * Datenraum. Der Wechsel des Owners
     * wird von der Sync-Engine erkannt
     * (last_owner Metadatum) und löst
     * eine vollständige Übernahme aus.
     */
    return {
      ok: true,
    };
  } catch (error) {
    console.error(
      '[AUTH] Anmeldung fehlgeschlagen:',
      error,
    );

    return {
      ok: false,

      message:
        'Anmeldung fehlgeschlagen',
    };
  }
}

export async function signUpPersonalAccount(
  email:
    string,

  password:
    string,
): Promise<AuthActionResult> {
  const supabase =
    getSupabaseClient();

  if (!supabase) {
    return {
      ok: false,

      message:
        'Cloud nicht konfiguriert',
    };
  }

  const passwordSecurity =
    await validatePasswordSecurity(password);

  if (!passwordSecurity.ok) {
    return {
      ok: false,
      message: passwordSecurity.message,
    };
  }

  try {
    const { data, error } =
      await supabase.auth.signUp({
        email,

        password,

        options: {
          emailRedirectTo:
            'financeapp://auth/confirm',
        },
      });

    if (error) {
      return {
        ok: false,

        message: translateAuthError(
          error.message,
        ),
      };
    }

    /*
     * Ohne bestätigte E-Mail liefert Supabase
     * keine Session - der Nutzer muss den
     * Bestätigungslink klicken.
     */
    const needsConfirmation =
      !data.session;

    return {
      ok: true,

      needsEmailConfirmation:
        needsConfirmation,
    };
  } catch (error) {
    console.error(
      '[AUTH] Registrierung fehlgeschlagen:',
      error,
    );

    return {
      ok: false,

      message:
        'Registrierung fehlgeschlagen',
    };
  }
}

/**
 * Zentraler Passwortwechsel für künftige
 * Recovery-/Kontoeinstellungen. Verwendet
 * dieselbe Stärke- und HIBP-Prüfung wie die
 * Registrierung.
 */
export async function changePersonalAccountPassword(
  password: string,
): Promise<AuthActionResult> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, message: 'Cloud nicht konfiguriert' };

  const passwordSecurity = await validatePasswordSecurity(password);
  if (!passwordSecurity.ok) return { ok: false, message: passwordSecurity.message };

  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { ok: false, message: translateAuthError(error.message) };
    return { ok: true };
  } catch {
    return { ok: false, message: 'Passwort konnte nicht geändert werden.' };
  }
}

export async function signOutPersonalAccount(): Promise<
  | {
      ok: true;
    }
  | {
      ok: false;

      message:
        string;
    }
> {
  const supabase =
    getSupabaseClient();

  if (!supabase) {
    return {
      ok: false,

      message:
        'Cloud nicht konfiguriert',
    };
  }

  try {
    const { error } =
      await supabase.auth.signOut();

    if (error) {
      return {
        ok: false,

        message:
          'Abmelden fehlgeschlagen',
      };
    }

    return {
      ok: true,
    };
  } catch (error) {
    console.error(
      '[AUTH] Abmelden fehlgeschlagen:',
      error,
    );

    return {
      ok: false,

      message:
        'Abmelden fehlgeschlagen',
    };
  }
}
