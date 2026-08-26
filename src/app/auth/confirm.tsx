import {
    useEffect,
    useState,
} from 'react';

import {
    useLocalSearchParams,
    router,
} from 'expo-router';

import {
    ActivityIndicator,
    StyleSheet,
    Text,
} from 'react-native';

import {
    SafeAreaView,
} from 'react-native-safe-area-context';

import {
    FinanceLogo,
} from '@/components/brand/FinanceLogo';

import {
    performFinanceHaptic,
} from '@/services/haptics';

import {
    getSupabaseClient,
} from '@/services/cloud/cloudClient';

import {
    useFinanceTheme,
} from '@/hooks/use-finance-theme';

/**
 * Deep-Link-Ziel für E-Mail-Bestätigungen.
 *
 * Link-Format (aus Supabase-Vorlage):
 * financeapp://auth/confirm?token_hash=...&type=signup
 *
 * Dashboard-Voraussetzung (einmalig):
 * Auth -> URL Configuration ->
 *   Site URL: financeapp://auth/confirm
 *   Redirect URLs enthält financeapp://auth/confirm
 */

export default function AuthConfirmScreen() {
  const {
    colors,
    spacing,
    typography,
  } =
    useFinanceTheme();

  const params =
    useLocalSearchParams<{
      token_hash?:
        | string
        | string[];

      type?:
        | string
        | string[];
    }>();

  const [
    state,
    setState,
  ] =
    useState<'working' | 'success' | 'error'>(
      'working',
    );

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState<string | null>(
      null,
    );

  useEffect(() => {
    let cancelled = false;

    function first(
      value:
        | string
        | string[]
        | undefined,
    ): string | undefined {
      return Array.isArray(value)
        ? value[0]
        : value;
    }

    async function confirm() {
      const supabase =
        getSupabaseClient();

      if (!supabase) {
        setState('error');

        setErrorMessage(
          'Cloud nicht konfiguriert.',
        );

        return;
      }

      const tokenHash =
        first(params.token_hash);

      const type =
        first(params.type) ??
        'signup';

      if (
        !tokenHash
      ) {
        /*
         * Kein Token im Link: möglicherweise
         * wurde der Link bereits verwendet.
         * Session prüfen - wenn vorhanden,
         * gilt die Bestätigung als erfolgreich.
         */
        try {
          const { data } =
            await supabase.auth.getSession();

          if (
            data.session?.user
          ) {
            setState('success');

            void performFinanceHaptic('success');

            return;
          }
        } catch {
          // bewusst ignoriert - unten generischer Fehler
        }

        setState('error');

        setErrorMessage(
          'Der Bestätigungslink ist ungültig oder wurde bereits verwendet.',
        );

        return;
      }

      try {
        const { error } =
          await supabase.auth.verifyOtp({
            type:

              type ===
              'recovery'
                ? 'recovery'

                : 'signup',

            token_hash: tokenHash,
          });

        if (cancelled) {
          return;
        }

        if (error) {
          setState('error');

          setErrorMessage(
            error.message,
          );

          return;
        }

        setState('success');

        void performFinanceHaptic('success');
      } catch (verifyError) {
        if (cancelled) {
          return;
        }

        setState('error');

        setErrorMessage(
          verifyError instanceof Error
            ? verifyError.message
            : 'Bestätigung fehlgeschlagen.',
        );
      }
    }

    void confirm();

    return () => {
      cancelled = true;
    };
  }, [
    params,
  ]);

  return (
    <SafeAreaView
      style={[
        styles.container,

        {
          backgroundColor:
            colors.background,

          paddingHorizontal:
            spacing.xxxl,
        },
      ]}
    >
      <FinanceLogo
        size={72}
      />

      {state === 'working' && (
        <>
          <ActivityIndicator
            color={colors.primary}

            style={styles.spacingTop}
          />

          <Text
            style={[
              typography.body,

              styles.centerText,

              styles.spacingTop,

              {
                color:
                  colors.textSecondary,
              },
            ]}
          >
            E-Mail wird bestätigt…
          </Text>
        </>
      )}

      {state === 'success' && (
        <>
          <Text
            style={[
              styles.resultGlyph,

              styles.spacingTop,

              {
                color:
                  colors.positive,
              },
            ]}
          >
            ✓
          </Text>

          <Text
            style={[
              typography.sectionTitle,

              styles.centerText,

              styles.spacingTop,

              {
                color:
                  colors.text,
              },
            ]}
          >
            E-Mail bestätigt
          </Text>

          <Text
            style={[
              typography.small,

              styles.centerText,

              styles.spacingTop,

              {
                color:
                  colors.textSecondary,
              },
            ]}
          >
            Du kannst jetzt zur Anmeldung zurückkehren.
          </Text>
        </>
      )}

      {state === 'error' && (
        <>
          <Text
            style={[
              styles.resultGlyph,

              styles.spacingTop,

              {
                color:
                  colors.negative,
              },
            ]}
          >
            ✕
          </Text>

          <Text
            style={[
              typography.sectionTitle,

              styles.centerText,

              styles.spacingTop,

              {
                color:
                  colors.text,
              },
            ]}
          >
            Bestätigung fehlgeschlagen
          </Text>

          <Text
            style={[
              typography.small,

              styles.centerText,

              styles.spacingTop,

              {
                color:
                  colors.textSecondary,
              },
            ]}
          >
            {errorMessage ??
              'Unbekannter Fehler.'}
          </Text>
        </>
      )}

      {state !== 'working' && (
        <Text
          onPress={() => {
            router.replace('/(tabs)/more');
          }}

          style={[
            typography.bodyMedium,

            styles.spacingTop,

            {
              color:
                colors.primary,
            },
          ]}
        >
          Weiter zu den Einstellungen
        </Text>
      )}
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex:
        1,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    centerText: {
      textAlign:
        'center',

      maxWidth:
        300,
    },

    spacingTop: {
      marginTop:
        16,
    },

    resultGlyph: {
      fontSize:
        44,

      fontWeight:
        '800',
    },
  });
