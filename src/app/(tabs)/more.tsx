import {
  type Href,
  router,
} from 'expo-router';

import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  useState,
} from 'react';

import {
  SafeAreaView,
} from 'react-native-safe-area-context';

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
  applyPendingReload,
  checkAndInstallUpdate,
  isUpdateSystemAvailable,
  type UpdateStatusKind,
} from '@/services/appUpdates';

import {
  useCloudSyncStore,
} from '@/stores/useCloudSyncStore';

import {
  useFinanceTheme,
} from '@/hooks/use-finance-theme';

import {
  useThemeStore,
} from '@/stores/useThemeStore';

import {
  financeThemePreviewColors,
  type FinanceThemeName,
} from '@/theme/finance-theme';

type ThemeOption = {
  id:
    FinanceThemeName;

  title:
    string;

  description:
    string;
};

const themeOptions:
ThemeOption[] = [
  {
    id:
      'system',

    title:
      'System',

    description:
      'Automatisch',
  },

  {
    id:
      'light',

    title:
      'Hell',

    description:
      'Helles Design',
  },

  {
    id:
      'dark',

    title:
      'Dunkel',

    description:
      'Dark Mode',
  },

  {
    id:
      'amoled',

    title:
      'AMOLED',

    description:
      'Echtes Schwarz',
  },
];

export default function MoreScreen() {
  const {
    colors,
    radius,
    spacing,
    typography,
  } =
    useFinanceTheme();

  const selectedTheme =
    useThemeStore(
      (
        state
      ) =>
        state.themeName
    );

  const setThemeName =
    useThemeStore(
      (
        state
      ) =>
        state.setThemeName
    );

  const cloudSync =
    useCloudSyncStore();

  const syncStatusText =
    cloudSync.isBusy
      ? 'Synchronisiere…'
      : `${cloudSync.message}`;

  const [
    updateStatus,
    setUpdateStatus,
  ] =
    useState<UpdateStatusKind>(
      isUpdateSystemAvailable()
        ? 'up_to_date'
        : 'unavailable'
    );

  const [
    updateMessage,
    setUpdateMessage,
  ] =
    useState<string>(
      isUpdateSystemAvailable()
        ? 'Bereit. Updates werden beim Start automatisch gesucht.'
        : 'Update-Dienst in diesem Build noch nicht aktiv.'
    );

  const [
    isCheckingUpdate,
    setIsCheckingUpdate,
  ] =
    useState(false);

  function runUpdateCheck() {
    if (isCheckingUpdate) {
      return;
    }

    setIsCheckingUpdate(
      true
    );

    void performFinanceHaptic(
      'action'
    );

    void checkAndInstallUpdate()
      .then((result) => {
        setUpdateStatus(
          result.status
        );

        setUpdateMessage(
          result.message
        );
      })
      .finally(() => {
        setIsCheckingUpdate(
          false
        );
      });
  }

  function restartForUpdate() {
    void performFinanceHaptic(
      'action'
    );

    void applyPendingReload();
  }

  return (
    <SafeAreaView
      edges={[
        'top',
      ]}
      style={[
        styles.safeArea,

        {
          backgroundColor:
            colors.background,
        },
      ]}
    >
      <ScrollView
        showsVerticalScrollIndicator={
          false
        }
        contentContainerStyle={{
          paddingHorizontal:
            spacing.lg,

          paddingTop:
            spacing.xl,

          paddingBottom:
            spacing.huge,
        }}
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
          EINSTELLUNGEN
        </Text>

        <Text
          style={[
            typography.screenTitle,

            {
              color:
                colors.text,

              marginTop:
                spacing.xs,
            },
          ]}
        >
          Mehr
        </Text>

        <FinanceCard
          variant="highlight"

          style={{
            marginTop:
              spacing.xxl,
          }}
        >
          <View
            style={
              styles.securityHeader
            }
          >
            <View
              style={[
                styles.securityIcon,

                {
                  backgroundColor:
                    colors.surface,

                  borderColor:
                    colors.primary,

                  borderRadius:
                    radius.lg,
                },
              ]}
            >
              <Text
                style={[
                  styles.securityIconText,

                  {
                    color:
                      colors.primary,
                  },
                ]}
              >
                ✓
              </Text>
            </View>

            <View
              style={
                styles.securityText
              }
            >
              <Text
                style={[
                  typography.sectionTitle,

                  {
                    color:
                      colors.text,
                  },
                ]}
              >
                Geschützt
              </Text>

              <Text
                style={[
                  typography.small,

                  {
                    color:
                      colors.textSecondary,

                    marginTop:
                      spacing.xs,
                  },
                ]}
              >
                Biometrie und verschlüsselte lokale SQLCipher-Datenbank
              </Text>
            </View>
          </View>
        </FinanceCard>

        <Text
          style={[
            typography.caption,

            styles.sectionLabel,

            {
              color:
                colors.textMuted,

              marginTop:
                spacing.xxxl,

              marginBottom:
                spacing.sm,
            },
          ]}
        >
          DARSTELLUNG
        </Text>

        <FinanceCard>
          <Text
            style={[
              typography.sectionTitle,

              {
                color:
                  colors.text,
              },
            ]}
          >
            Erscheinungsbild
          </Text>

          <Text
            style={[
              typography.small,

              {
                color:
                  colors.textSecondary,

                marginTop:
                  spacing.xs,
              },
            ]}
          >
            Wähle das Farbschema der App.
          </Text>

          <View
            style={[
              styles.themeGrid,

              {
                gap:
                  spacing.sm,

                marginTop:
                  spacing.xl,
              },
            ]}
          >
            {themeOptions.map(
              (
                theme
              ) => {
                const selected =
                  selectedTheme ===
                  theme.id;

                const previewColor =
                  financeThemePreviewColors[
                    theme.id
                  ] ??
                  colors.background;

                return (
                  <FinancePressable
                    key={
                      theme.id
                    }

                    accessibilityRole="button"

                    accessibilityState={{
                      selected,
                    }}

                    onPress={() => {
                      void setThemeName(
                        theme.id
                      );

                      void performFinanceHaptic(
                        'selection'
                      );
                    }}

                    feedbackVariant="subtle"

                    tapScale={
                      0.98
                    }

                    style={[
                      styles.themeOption,

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
                          radius.lg,
                      },
                    ]}

                    contentStyle={
                      styles.themeOptionContent
                    }
                  >
                    <View
                      style={[
                        styles.themePreview,

                        {
                          backgroundColor:
                            previewColor,

                          borderColor:
                            colors.borderStrong,
                        },
                      ]}
                    />

                    <Text
                      style={[
                        typography.smallMedium,

                        {
                          color:
                            selected
                              ? colors.primary

                              : colors.text,

                          marginTop:
                            spacing.sm,
                        },
                      ]}
                    >
                      {theme.title}
                    </Text>

                    <Text
                      style={[
                        typography.caption,

                        {
                          color:
                            colors.textSecondary,

                          marginTop:
                            spacing.xs,
                        },
                      ]}
                    >
                      {theme.description}
                    </Text>
                  </FinancePressable>
                );
              }
            )}
          </View>
        </FinanceCard>

        <Text
          style={[
            typography.caption,

            styles.sectionLabel,

            {
              color:
                colors.textMuted,

              marginTop:
                spacing.xxxl,

              marginBottom:
                spacing.sm,
            },
          ]}
        >
          FINANZEN
        </Text>

        <FinanceCard
          padded={
            false
          }
        >
          <SettingsRow
            title="Cloud-Sync"

            description={
              syncStatusText
            }

            icon={
              <Text
                style={[
                  styles.rowGlyph,

                  {
                    color:
                      cloudSync.status ===
                        'synced'
                        ? colors.positive

                        : colors.info,
                  },
                ]}
              >
                ◇
              </Text>
            }

            onPress={() => {
              void cloudSync.refreshCloudSync();
            }}
          />

          <View
            style={[
              styles.divider,

              {
                backgroundColor:
                  colors.border,
              },
            ]}
          />

          <SettingsRow
            title="Cloud-Konto"

            description="Eigenes Konto verbinden oder abmelden"

            icon={
              <Text
                style={[
                  styles.rowGlyph,

                  {
                    color:
                      colors.primary,
                  },
                ]}
              >
                ●
              </Text>
            }

            onPress={() => {
              router.push(
                '/cloud-account' as never
              );
            }}
          />

          <View
            style={[
              styles.divider,

              {
                backgroundColor:
                  colors.border,
              },
            ]}
          />

          <SettingsRow
            title="Bankkonten"

            description="Verbindungen, Sync und lokale Konten verwalten"

            icon={
              <Text
                style={[
                  styles.rowGlyph,

                  {
                    color:
                      colors.primary,
                  },
                ]}
              >
                ⌂
              </Text>
            }

            onPress={() => {
              router.push(
                '/bank-connections' as Href
              );
            }}
          />

          <View
            style={[
              styles.divider,

              {
                backgroundColor:
                  colors.border,
              },
            ]}
          />

          <SettingsRow
            title="Kategorien & Regeln"

            description="Automatische Zuordnung wird im Demo-Build bereits verwendet"

            icon={
              <Text
                style={[
                  styles.rowGlyph,

                  {
                    color:
                      colors.primary,
                  },
                ]}
              >
                ≡
              </Text>
            }

            onPress={() => {
              router.push(
                '/category-rules' as Href
              );
            }}
          />
        </FinanceCard>

        <Text
          style={[
            typography.caption,

            styles.sectionLabel,

            {
              color:
                colors.textMuted,

              marginTop:
                spacing.xxxl,

              marginBottom:
                spacing.sm,
            },
          ]}
        >
          APP-AKTUALISIERUNG
        </Text>

        <FinanceCard>
          <SettingsRow
            title="Updates"

            description={
              updateMessage
            }

            icon={
              <Text
                style={[
                  styles.rowGlyph,

                  {
                    color:
                      updateStatus ===
                      'ready_to_install'
                        ? colors.positive

                        : colors.info,
                  },
                ]}
              >
                ↻
              </Text>
            }
          />

          {updateStatus ===
          'ready_to_install' ? (
            <FinanceButton
              label="Neustart & installieren"

              size="small"

              variant="secondary"

              onPress={
                restartForUpdate
              }

              style={{
                marginTop:
                  spacing.lg,
              }}
            />
          ) : (
            <FinanceButton
              label="Nach Updates suchen"

              size="small"

              loading={
                isCheckingUpdate
              }

              onPress={
                runUpdateCheck
              }

              style={{
                marginTop:
                  spacing.lg,
              }}
            />
          )}
        </FinanceCard>

        <Text
          style={[
            typography.caption,

            styles.sectionLabel,

            {
              color:
                colors.textMuted,

              marginTop:
                spacing.xxxl,

              marginBottom:
                spacing.sm,
            },
          ]}
        >
          APP
        </Text>

        <FinanceCard
          padded={
            false
          }
        >
          <SettingsRow
            title="Sicherheit"

            description="App-Sperre und Biometrie"

            icon={
              <Text
                style={[
                  styles.rowGlyph,

                  {
                    color:
                      colors.positive,
                  },
                ]}
              >
                ✓
              </Text>
            }

            value="Aktiv"
          />

          <View
            style={[
              styles.divider,

              {
                backgroundColor:
                  colors.border,
              },
            ]}
          />

          <SettingsRow
            title="Daten & Datenschutz"

            description="Lokale Finanzdaten und zukünftigen Cloud-Sync verwalten"

            icon={
              <Text
                style={[
                  styles.rowGlyph,

                  {
                    color:
                      colors.info,
                  },
                ]}
              >
                ◈
              </Text>
            }
          />

          <View
            style={[
              styles.divider,

              {
                backgroundColor:
                  colors.border,
              },
            ]}
          />

          <SettingsRow
            title="Über die App"

            description={`Finance App · Demo Build`}
          />
        </FinanceCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex:
        1,
    },

    eyebrow: {
      letterSpacing:
        1.4,
    },

    sectionLabel: {
      letterSpacing:
        1.2,

      paddingHorizontal:
        3,
    },

    securityHeader: {
      flexDirection:
        'row',

      alignItems:
        'center',
    },

    securityIcon: {
      width:
        52,

      height:
        52,

      alignItems:
        'center',

      justifyContent:
        'center',

      borderWidth:
        1,
    },

    securityIconText: {
      fontSize:
        24,

      fontWeight:
        '800',
    },

    securityText: {
      flex:
        1,

      marginLeft:
        15,
    },

    themeGrid: {
      flexDirection:
        'row',

      flexWrap:
        'wrap',
    },

    themeOption: {
      width:
        '48%',

      borderWidth:
        1,
    },

    themeOptionContent: {
      padding:
        14,
    },

    themePreview: {
      width:
        '100%',

      height:
        35,

      borderRadius:
        10,

      borderWidth:
        1,
    },

    divider: {
      height:
        StyleSheet.hairlineWidth,

      marginLeft:
        20,
    },

    rowGlyph: {
      fontSize:
        18,

      fontWeight:
        '600',
    },
  });
