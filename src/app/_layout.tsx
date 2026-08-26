import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
} from 'expo-router';

import * as SplashScreen from 'expo-splash-screen';
import * as WebBrowser from 'expo-web-browser';

import {
  StatusBar,
} from 'expo-status-bar';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  AppState,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
  type LayoutChangeEvent,
} from 'react-native';

import {
  FinanceLogo,
} from '@/components/brand/FinanceLogo';

import {
  AppBootSplash,
} from '@/components/feedback/AppBootSplash';

import {
  FinanceDialog,
  type FinanceDialogConfig,
} from '@/components/feedback/FinanceDialog';

import {
  FinanceButton,
} from '@/components/interaction/FinanceButton';

import {
  useFinanceTheme,
} from '@/hooks/use-finance-theme';

import {
  FinanceBlurHost,
} from '@/providers/FinanceBlurHost';

import {
  InteractionFeedbackProvider,
} from '@/providers/InteractionFeedbackProvider';

import {
  authenticateForAppAccess,
} from '@/security/appLock';

import {
  loadAuthenticatedApplicationData,
  prepareApplication,
} from '@/services/appBootstrap';

import {
  applyPendingReload,
  checkProductUpdate,
  markPatchNotesSeen,
  shouldShowPatchNotes,
} from '@/services/appUpdates';

import {
  useProductAccessStore,
} from '@/stores/useProductAccessStore';

void SplashScreen
  .preventAutoHideAsync();

type AppPhase =
  | 'booting'
  | 'locked'
  | 'unlocked'
  | 'startup_error';

const RELOCK_AFTER_MS =
  30_000;

const INITIAL_WELCOME_MS =
  1_250;

function wait(
  milliseconds:
    number
): Promise<void> {
  return new Promise(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds
      );
    }
  );
}

export default function RootLayout() {
  const {
    colors,
    isDark,
    spacing,
    typography,
  } =
    useFinanceTheme();

  const [
    phase,
    setPhase,
  ] =
    useState<AppPhase>(
      'booting'
    );

  const [
    bootMessage,
    setBootMessage,
  ] =
    useState(
      'Sichere Umgebung wird vorbereitet...'
    );

  const [
    startupError,
    setStartupError,
    ] =
    useState<
      string | null
    >(null);

  const [
    updateDialog,
    setUpdateDialog,
  ] = useState<FinanceDialogConfig | null>(null);

  const appState =
    useRef<AppStateStatus>(
      AppState.currentState
    );

  const backgroundedAt =
    useRef<
      number | null
    >(null);

  const bootRunning =
    useRef(false);

  const nativeSplashHidden =
    useRef(false);

  const initialBootCompleted =
    useRef(false);

  const baseNavigationTheme =
    isDark
      ? DarkTheme
      : DefaultTheme;

  const navigationTheme =
    useMemo(
      () => ({
        ...baseNavigationTheme,

        colors: {
          ...baseNavigationTheme
            .colors,

          primary:
            colors.primary,

          background:
            colors.background,

          card:
            colors.surface,

          text:
            colors.text,

          border:
            colors.border,

          notification:
            colors.negative,
        },
      }),

      [
        baseNavigationTheme,

        colors.background,
        colors.border,
        colors.negative,
        colors.primary,
        colors.surface,
        colors.text,
      ]
    );

  const hideNativeSplashOnce =
    useCallback(
      (
        _event?:
          LayoutChangeEvent
      ) => {
        if (
          nativeSplashHidden
            .current
        ) {
          return;
        }

        nativeSplashHidden
          .current =
          true;

        void SplashScreen
          .hideAsync();
      },

      []
    );

  const runInitialBoot =
    useCallback(
      async () => {
        if (
          bootRunning.current
        ) {
          return;
        }

        bootRunning.current =
          true;

        setStartupError(
          null
        );

        setPhase(
          'booting'
        );

        const minimumWelcome =
          wait(
            INITIAL_WELCOME_MS
          );

        try {
          setBootMessage(
            'Verschlüsselte Datenbank und Theme werden vorbereitet...'
          );

          await prepareApplication();

          setBootMessage(
            'Sicherheitsprüfung wird vorbereitet...'
          );

          const authenticated =
            await authenticateForAppAccess();

          if (
            !authenticated
          ) {
            await minimumWelcome;

            setPhase(
              'locked'
            );

            return;
          }

          setBootMessage(
            'Konten, Umsätze und Planung werden geladen...'
          );

          await loadAuthenticatedApplicationData();

          setBootMessage(
            'Alles bereit.'
          );

          await minimumWelcome;

          initialBootCompleted
            .current =
            true;

          setPhase(
            'unlocked'
          );
        } catch (error) {
          console.error(
            '[BOOT] Initial startup failed:',
            error
          );

          await minimumWelcome;

          setStartupError(
            error instanceof Error
              ? error.message
              : 'Die App konnte nicht vollständig gestartet werden.'
          );

          setPhase(
            'startup_error'
          );
        } finally {
          bootRunning.current =
            false;
        }
      },

      []
    );

  const runUnlock =
    useCallback(
      async () => {
        if (
          bootRunning.current
        ) {
          return;
        }

        bootRunning.current =
          true;

        setStartupError(
          null
        );

        setPhase(
          'booting'
        );

        try {
          setBootMessage(
            'Finance wird entsperrt...'
          );

          const authenticated =
            await authenticateForAppAccess();

          if (
            !authenticated
          ) {
            setPhase(
              'locked'
            );

            return;
          }

          setBootMessage(
            'Finanzdaten werden aktualisiert...'
          );

          await loadAuthenticatedApplicationData();

          setPhase(
            'unlocked'
          );
        } catch (error) {
          console.error(
            '[BOOT] Unlock failed:',
            error
          );

          setStartupError(
            error instanceof Error
              ? error.message
              : 'Finance konnte nicht entsperrt werden.'
          );

          setPhase(
            'startup_error'
          );
        } finally {
          bootRunning.current =
            false;
        }
      },

      []
    );

  useEffect(() => {
    void runInitialBoot();
  }, [
    runInitialBoot,
  ]);

  useEffect(() => {
    if (phase !== 'unlocked') return;

    void useProductAccessStore.getState().hydrate()
      .then(() => useProductAccessStore.getState().refresh());

    void checkProductUpdate({ background: true }).then(async (result) => {
      if (!result) return;
      const release = result.release;
      if (result.status !== 'ready_to_install') {
        if (release && await shouldShowPatchNotes(release)) {
          setUpdateDialog({
            title: `Neu in Finance ${release.version}`,
            message: `${release.title}\n\n${release.summary}`,
            confirmLabel: 'Verstanden',
            onConfirm: () => { void markPatchNotesSeen(release); },
          });
        }
        return;
      }
      setUpdateDialog({
        title: result.nativeUpgradeRequired ? 'App-Update erforderlich' : 'Update verfügbar',
        message: release
          ? `${release.title}\n\n${release.summary}`
          : result.message,
        confirmLabel: result.nativeUpgradeRequired ? 'Update öffnen' : 'Jetzt aktualisieren',
        cancelLabel: result.nativeUpgradeRequired || release?.level === 'required' ? undefined : 'Später',
        onConfirm: () => {
          if (result.nativeUpgradeRequired && release?.storeUrl) {
            void WebBrowser.openBrowserAsync(release.storeUrl);
            return;
          }
          if (!result.nativeUpgradeRequired) void applyPendingReload();
        },
      });
    });
  }, [phase]);

  useEffect(() => {
    const subscription =
      AppState.addEventListener(
        'change',

        (
          nextAppState
        ) => {
          const previousAppState =
            appState.current;

          if (
            previousAppState ===
              'active' &&

            nextAppState !==
              'active'
          ) {
            backgroundedAt
              .current =
              Date.now();
          }

          if (
            previousAppState !==
              'active' &&

            nextAppState ===
              'active'
          ) {
            const leftAt =
              backgroundedAt
                .current;

            if (
              leftAt !==
                null &&

              initialBootCompleted
                .current &&

              Date.now() -
                leftAt >=
                RELOCK_AFTER_MS
            ) {
              void runUnlock();
            }

            backgroundedAt
              .current =
              null;
          }

          appState.current =
            nextAppState;
        }
      );

    return () => {
      subscription.remove();
    };
  }, [
    runUnlock,
  ]);

  return (
    <ThemeProvider
      value={
        navigationTheme
      }
    >
      <StatusBar
        style={
          isDark
            ? 'light'
            : 'dark'
        }
      />

      <InteractionFeedbackProvider>
        {phase ===
          'booting' && (
          <AppBootSplash
            onLayout={
              hideNativeSplashOnce
            }

            message={
              bootMessage
            }
          />
        )}

        {phase ===
          'locked' && (
          <View
            onLayout={
              hideNativeSplashOnce
            }

            style={[
              styles.stateContainer,

              {
                backgroundColor:
                  colors.background,

                paddingHorizontal:
                  spacing.xxxl,
              },
            ]}
          >
            <FinanceLogo
              size={82}
            />

            <Text
              style={[
                typography.screenTitle,

                styles.centerText,

                {
                  color:
                    colors.text,

                  marginTop:
                    spacing.xxl,
                },
              ]}
            >
              App gesperrt
            </Text>

            <Text
              style={[
                typography.body,

                styles.centerText,

                {
                  color:
                    colors.textSecondary,

                  marginTop:
                    spacing.sm,
                },
              ]}
            >
              Authentifiziere dich, um deine Finanzdaten anzuzeigen.
            </Text>

            <FinanceButton
              label="Entsperren"

              onPress={() => {
                void runUnlock();
              }}

              style={{
                width:
                  '100%',

                marginTop:
                  spacing.xxl,
              }}
            />
          </View>
        )}

        {phase ===
          'startup_error' && (
          <View
            onLayout={
              hideNativeSplashOnce
            }

            style={[
              styles.stateContainer,

              {
                backgroundColor:
                  colors.background,

                paddingHorizontal:
                  spacing.xxxl,
              },
            ]}
          >
            <FinanceLogo
              size={82}
            />

            <Text
              style={[
                typography.title,

                styles.centerText,

                {
                  color:
                    colors.text,

                  marginTop:
                    spacing.xxl,
                },
              ]}
            >
              Start fehlgeschlagen
            </Text>

            <Text
              style={[
                typography.body,

                styles.centerText,

                {
                  color:
                    colors.textSecondary,

                  marginTop:
                    spacing.sm,
                },
              ]}
            >
              {startupError ??
                'Die App konnte nicht geladen werden.'}
            </Text>

            <FinanceButton
              label="Erneut versuchen"

              onPress={() => {
                void runInitialBoot();
              }}

              style={{
                width:
                  '100%',

                marginTop:
                  spacing.xxl,
              }}
            />
          </View>
        )}

        {phase ===
          'unlocked' && (
          <FinanceBlurHost>
            <Stack
              screenOptions={{
                headerShown:
                  false,

                contentStyle: {
                  backgroundColor:
                    colors.background,
                },

                animation:
                  'slide_from_right',
              }}
            />
          </FinanceBlurHost>
        )}

        <FinanceDialog
          visible={updateDialog !== null}
          config={updateDialog}
          onClose={() => setUpdateDialog(null)}
        />
      </InteractionFeedbackProvider>
    </ThemeProvider>
  );
}

const styles =
  StyleSheet.create({
    stateContainer: {
      flex:
        1,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    centerText: {
      maxWidth:
        330,

      textAlign:
        'center',
    },
  });
