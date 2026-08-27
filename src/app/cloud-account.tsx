import {
    useEffect,
    useRef,
    useState,
} from 'react';

import {
    router,
} from 'expo-router';

import {
    Alert,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import {
    SettingsRow,
} from '@/components/finance/SettingsRow';

import {
    FinanceCard,
} from '@/components/finance/FinanceCard';

import {
    FinanceButton,
} from '@/components/interaction/FinanceButton';

import {
    FinancePressable,
} from '@/components/interaction/FinancePressable';

import {
    performFinanceHaptic,
} from '@/services/haptics';

import {
    getPersonalAccountInfo,
    signInPersonalAccount,
    signOutPersonalAccount,
    signUpPersonalAccount,
    type PersonalAccountInfo,
} from '@/services/cloud/authService';

import {
    useCloudSyncStore,
} from '@/stores/useCloudSyncStore';

import {
    FinanceKeyboardScreen,
} from '@/components/layout/FinanceKeyboardScreen';

import {
    FinanceTextField,
} from '@/components/forms/FinanceTextField';

import {
    useFinanceTheme,
} from '@/hooks/use-finance-theme';

type FormMode =
  | 'signIn'
  | 'signUp';

export default function CloudAccountScreen() {
  const {
    colors,
    radius,
    spacing,
    typography,
  } =
    useFinanceTheme();

  const [
    account,
    setAccount,
  ] =
    useState<PersonalAccountInfo | null>(
      null,
    );

  const [
    isLoadingAccount,
    setIsLoadingAccount,
  ] =
    useState(true);

  const [
    formMode,
    setFormMode,
  ] =
    useState<FormMode>(
      'signIn',
    );

  const [
    emailInput,
    setEmailInput,
  ] =
    useState('');

  const [
    passwordInput,
    setPasswordInput,
  ] =
    useState('');

  const emailRef =
    useRef<TextInput | null>(
      null,
    );

  const passwordRef =
    useRef<TextInput | null>(
      null,
    );

  const [
    isBusy,
    setIsBusy,
  ] =
    useState(false);

  const [
    statusMessage,
    setStatusMessage,
  ] =
    useState<string | null>(
      null,
    );

  const [
    showForm,
    setShowForm,
  ] =
    useState(false);

  function showError(
    message:
      string,
  ) {
    Alert.alert(
      'Cloud-Konto',
      message,
    );
  }

  async function loadAccount() {
    setIsLoadingAccount(true);

    try {
      const info =
        await getPersonalAccountInfo();

      setAccount(info);
    } finally {
      setIsLoadingAccount(false);
    }
  }

  /*
   * Kontostatus beim Mount laden;
   * Reloads erfolgen nach jeder Aktion.
   */
  useEffect(() => {
    void loadAccount();
  }, []);

  function validateInputs():
    | {
        email:
          string;

        password:
          string;
      }
    | null {
    const trimmedEmail =
      emailInput.trim();

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        trimmedEmail,
      )
    ) {
      showError(
        'Bitte eine gültige E-Mail-Adresse eingeben.',
      );

      return null;
    }

    if (
      passwordInput.length <
      (formMode === 'signUp' ? 12 : 1)
    ) {
      showError(
        formMode === 'signUp'
          ? 'Das Passwort muss mindestens 12 Zeichen lang sein.'
          : 'Bitte gib dein Passwort ein.',
      );

      return null;
    }

    return {
      email: trimmedEmail,

      password: passwordInput,
    };
  }

  async function handleSubmit() {
    if (isBusy) {
      return;
    }

    const inputs =
      validateInputs();

    if (!inputs) {
      return;
    }

    setIsBusy(true);

    setStatusMessage(null);

    void performFinanceHaptic('action');

    try {
      const result =
        formMode === 'signIn'
          ? await signInPersonalAccount(inputs.email, inputs.password)
          : await signUpPersonalAccount(inputs.email, inputs.password);

      if (!result.ok) {
        showError(result.message);

        return;
      }

      if (
        formMode ===
          'signUp' &&
        result.needsEmailConfirmation
      ) {
        setStatusMessage(
          'Registriert! Bitte bestätige deine E-Mail und melde dich dann an.',
        );

        setFormMode('signIn');

        return;
      }

      /*
       * Erfolgreiche persönliche Anmeldung:
       * sofortiger Sync überträgt alle lokalen
       * Daten in den neuen, isolierten Datenraum.
       */
      await useCloudSyncStore
        .getState()
        .refreshCloudSync();

      void performFinanceHaptic('success');

      await loadAccount();

      setShowForm(false);

      setPasswordInput('');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSignOut() {
    if (isBusy) {
      return;
    }

    setIsBusy(true);

    try {
      const result =
        await signOutPersonalAccount();

      if (!result.ok) {
        showError(result.message);

        return;
      }

      void performFinanceHaptic('selection');

      await useCloudSyncStore
        .getState()
        .refreshCloudSync();

      await loadAccount();
    } finally {
      setIsBusy(false);
    }
  }

  const modeLabel =
    isLoadingAccount
      ? 'Wird geladen…'

      : account?.mode === 'personal'
        ? `Persönlich · ${account.email ?? ''}`

        : 'Unbekannt';

  const showSuperuserBadge =
    !isLoadingAccount &&
    account?.mode ===
      'personal' &&
    account.isSuperuser ===
      true;

  return (
    <FinanceKeyboardScreen
      backgroundColor={
        colors.background
      }

      contentContainerStyle={{
        paddingHorizontal:
          spacing.lg,

        paddingTop:
          spacing.sm,
      }}

      header={
        <View
          style={[
            styles.header,

            {
              paddingHorizontal:
                spacing.md,

              paddingVertical:
                spacing.md,
            },
          ]}
        >
          <FinancePressable
            accessibilityRole="button"

            accessibilityLabel="Zurück"

            onPress={() =>
              router.back()
            }

            intent="navigation"

            style={[
              styles.backButton,

              {
                backgroundColor:
                  colors.surface,

                borderRadius:
                  radius.round,
              },
            ]}

            contentStyle={
              styles.backContent
            }
          >
            <Text
              style={[
                styles.backIcon,

                {
                  color:
                    colors.text,
                },
              ]}
            >
              ‹
            </Text>
          </FinancePressable>

          <Text
            style={[
              typography.bodyMedium,

              {
                color:
                  colors.text,
              },
            ]}
          >
            Cloud-Konto
          </Text>

          <View
            style={
              styles.headerSpacer
            }
          />
        </View>
      }
    >
      <Text
        style={[
          typography.caption,

          styles.eyebrow,

          {
            color:
              colors.textMuted,
          },
        ]}
      >
        KONTOTYP
      </Text>

      <FinanceCard
        variant={
          account?.mode ===
            'personal'
            ? 'highlight'

            : 'default'
        }

        style={{
          marginTop:
            spacing.sm,
        }}
      >
        <SettingsRow
          title={
            showSuperuserBadge
              ? 'Superuser'
              : 'Aktueller Modus'
          }

          description={modeLabel}
        />
      </FinanceCard>

      <Text
        style={[
          typography.small,

          styles.explanation,

          {
            color:
              colors.textSecondary,

            marginTop:
              spacing.lg,
          },
        ]}
      >
        Melde dich mit deinem persönlichen Konto an, um die lokal
        verschlüsselten Finanzdaten zusätzlich in deinem durch RLS isolierten
        Supabase-Datenraum zu synchronisieren. Ohne Anmeldung bleiben sie nur
        auf diesem Gerät.
      </Text>

      {account?.mode ===
      'personal' ? (
        <>
          <FinanceCard
            style={{
              marginTop:
                spacing.xl,
            }}
          >
            <SettingsRow
              title="Angemeldet als"

              description={
                account.email ??
                ''
              }
            />

            <FinanceButton
              label="Von diesem Konto abmelden"

              size="small"

              variant="danger"

              loading={
                isBusy
              }

              onPress={() => {
                void handleSignOut();
              }}

              style={{
                width:
                  '100%',

                marginTop:
                  spacing.lg,
              }}
            />
          </FinanceCard>

          <Text
            style={[
              typography.caption,

              {
                color:
                  colors.textMuted,

                marginTop:
                  spacing.md,

                textAlign:
                  'center',
              },
            ]}
          >
            Nach dem Abmelden kehrt die App zum App-Konto zurück.
          </Text>
        </>
      ) : (
        <>
          {!showForm ? (
            <FinanceButton
              label="Eigenes Konto verbinden"

              onPress={() => {
                void performFinanceHaptic('action');

                setShowForm(true);
              }}

              style={{
                width:
                  '100%',

                marginTop:
                  spacing.xl,
              }}
            />
          ) : (
            <FinanceCard
              style={{
                marginTop:
                  spacing.xl,
              }}
            >
              <View
                style={[
                  styles.formSwitcher,

                  {
                    gap:
                      spacing.sm,
                  },
                ]}
              >
                {(
                  ['signIn', 'signUp'] as const
                ).map(
                  (
                    mode,
                  ) => {
                    const selected =
                      formMode ===
                      mode;

                    return (
                      <FinancePressable
                        key={mode}

                        accessibilityRole="button"

                        onPress={() => {
                          setFormMode(mode);
                        }}

                        feedbackVariant="subtle"

                        tapScale={0.98}

                        style={[
                          styles.formSwitchOption,

                          {
                            backgroundColor:
                              selected
                                ? colors.primarySoft

                                : colors.surfaceInteractive,

                            borderColor:
                              selected
                                ? colors.primary

                                : colors.border,

                            borderRadius:
                              radius.md,
                          },
                        ]}

                        contentStyle={
                          styles.formSwitchContent
                        }
                      >
                        <Text
                          style={[
                            typography.smallMedium,

                            {
                              color:
                                selected
                                  ? colors.primary

                                  : colors.textSecondary,
                            },
                          ]}
                        >
                          {mode === 'signIn'
                            ? 'Anmelden'

                            : 'Registrieren'}
                        </Text>
                      </FinancePressable>
                    );
                  },
                )}
              </View>

              <FinanceTextField
                label="E-Mail"

                inputRef={
                  emailRef
                }

                value={emailInput}

                onChangeText={
                  setEmailInput
                }

                placeholder="E-Mail"

                autoCapitalize="none"

                autoComplete="email"

                keyboardType="email-address"

                returnKeyType="next"

                onSubmitEditing={() => {
                  passwordRef.current?.focus();
                }}

                containerStyle={{
                  marginTop:
                    spacing.xl,
                }}
              />

              <FinanceTextField
                label="Passwort"

                inputRef={
                  passwordRef
                }

                value={passwordInput}

                onChangeText={
                  setPasswordInput
                }

                placeholder={formMode === 'signUp' ? 'Mindestens 12 Zeichen' : 'Passwort'}

                secureTextEntry

                autoCapitalize="none"

                autoComplete="password"

                helperText={formMode === 'signUp' ? 'Eine lange, einzigartige Passphrase ist besser als starre Symbolregeln. Sie wird lokal auf Stärke und bekannte Datenlecks geprüft.' : undefined}

                returnKeyType="done"

                onSubmitEditing={() => {
                  if (
                    !isBusy &&
                    validateInputs()
                  ) {
                    void handleSubmit();
                  }
                }}

                containerStyle={{
                  marginTop:
                    spacing.md,
                }}
              />

              <FinanceButton
                label={
                  formMode === 'signIn'
                    ? 'Anmelden'

                    : 'Konto erstellen'
                }

                loading={
                  isBusy
                }

                onPress={() => {
                  void handleSubmit();
                }}

                style={{
                  width:
                    '100%',

                  marginTop:
                    spacing.xl,
                }}
              />

              {statusMessage ? (
                <Text
                  style={[
                    typography.small,

                    {
                      color:
                        colors.info,

                      marginTop:
                        spacing.md,
                    },
                  ]}
                >
                  {statusMessage}
                </Text>
              ) : null}
            </FinanceCard>
          )}
        </>
      )}
    </FinanceKeyboardScreen>
  );
}

const styles =
  StyleSheet.create({
    eyebrow: {
      letterSpacing:
        1.4,
    },

    explanation: {
      lineHeight:
        20,
    },

    header: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',
    },

    backButton: {
      width:
        42,

      height:
        42,
    },

    backContent: {
      width:
        42,

      height:
        42,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    backIcon: {
      fontSize:
        34,

      lineHeight:
        37,

      fontWeight:
        '300',

      marginTop:
        -3,
    },

    headerSpacer: {
      width:
        42,

      height:
        42,
    },

    formSwitcher: {
      flexDirection:
        'row',
    },

    formSwitchOption: {
      flex:
        1,

      borderWidth:
        1,
    },

    formSwitchContent: {
      minHeight:
        38,

      alignItems:
        'center',

      justifyContent:
        'center',
    },
  });
