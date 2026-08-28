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
  useEffect,
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
  performFinanceHaptic,
} from '@/services/haptics';

import {
  applyPendingReload,
  checkProductUpdate,
  getInstalledVersionInfo,
  isUpdateSystemAvailable,
  type UpdateStatusKind,
} from '@/services/appUpdates';

import { canAccessDemo } from '@/services/screenshotMode';

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
  useProductAccessStore,
} from '@/stores/useProductAccessStore';

import {
  FINANCE_THEMES,
} from '@/theme/finance-theme';

export default function MoreScreen() {
  const {
    colors,
    radius,
    spacing,
    typography,
    premiumThemeFallbackActive,
  } =
    useFinanceTheme();

  const selectedTheme =
    useThemeStore(
      (
        state
      ) =>
        state.themeName
    );

  const currentThemeLabel =
    FINANCE_THEMES.find((theme) => theme.id === selectedTheme)?.label ?? 'System';

  const cloudSync =
    useCloudSyncStore();

  const {
    access: productAccess,
    hydrate: hydrateProductAccess,
    refresh: refreshProductAccess,
  } =
    useProductAccessStore();

  useEffect(() => {
    void hydrateProductAccess()
      .then(() => refreshProductAccess());
  }, [hydrateProductAccess, refreshProductAccess]);

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
        ? 'Bereit. Die App startet offline; Updates kannst du hier sicher abrufen.'
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

    void checkProductUpdate()
      .then((result) => {
        if (!result) return;
        setUpdateStatus(
          result.status
        );

        setUpdateMessage(
          result.release
            ? `${result.release.title} · ${result.release.summary}`
            : result.message
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
          PRODUKT
        </Text>

        <FinanceCard padded={false}>
          <SettingsRow
            title="Analysen"
            description={
              productAccess.isPremium
                ? 'Monatsvergleich, Trends, Abo-Preise, ausgebliebene Zahlungen'
                : 'Vergleiche und Trends – mit Premium'
            }
            value={productAccess.isPremium ? undefined : 'PREMIUM'}
            icon={<Text style={[styles.rowGlyph, { color: colors.primary }]}>◱</Text>}
            onPress={() => router.push('/analytics' as Href)}
          />

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <SettingsRow
            title="Daten exportieren"
            description="Umsätze als CSV · Budgets, Sparziele und Abos mit Premium"
            icon={<Text style={[styles.rowGlyph, { color: colors.primary }]}>⇩</Text>}
            onPress={() => router.push('/export' as Href)}
          />

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <SettingsRow
            title="Abos & Premium"
            description={
              productAccess.isSuperuser
                ? 'Superuser · alle Premium-Funktionen freigeschaltet'
                : productAccess.isPremium
                  ? 'Premium aktiv'
                  : 'Standard · Vorteile und Coupon einlösen'
            }
            value={productAccess.isPremium ? 'PREMIUM' : undefined}
            icon={<Text style={[styles.rowGlyph, { color: colors.primary }]}>◆</Text>}
            onPress={() => router.push('/premium' as Href)}
          />

          {productAccess.isSuperuser ? (
            <>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <SettingsRow
                title="Administration"
                description="Coupons, Entitlements und Releases"
                icon={<Text style={[styles.rowGlyph, { color: colors.positive }]}>✦</Text>}
                onPress={() => router.push('/admin' as Href)}
              />
            </>
          ) : null}

          {canAccessDemo({ isDev: __DEV__, isSuperuser: productAccess.isSuperuser }) ? (
            <>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <SettingsRow
                title="Demo-Daten"
                description="Synthetischer Datensatz für Screenshots und QA"
                icon={<Text style={[styles.rowGlyph, { color: colors.info }]}>▦</Text>}
                onPress={() => router.push('/demo' as Href)}
              />
            </>
          ) : null}
        </FinanceCard>

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

        <FinanceCard padded={false}>
          <SettingsRow
            title="Themes"
            description={
              premiumThemeFallbackActive
                ? "Premium-Design gespeichert – Fallback aktiv"
                : `Aktuell: ${currentThemeLabel}`
            }
            icon={<Text style={[styles.rowGlyph, { color: colors.primary }]}>◐</Text>}
            onPress={() => router.push("/themes" as Href)}
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
            title="Bank über Tink verbinden"

            description="Open Banking (Beta) · nur Lesezugriff"

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
                ⇄
              </Text>
            }

            onPress={() => {
              router.push(
                '/bank/tink' as Href
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
            title={`Finance ${getInstalledVersionInfo().version}`}
            description={`Runtime ${getInstalledVersionInfo().runtimeVersion}`}
            value="Installiert"
          />

          <View style={[styles.divider, { backgroundColor: colors.border, marginVertical: spacing.sm }]} />

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

            description="Backup, Import, Cloud-Sync, lokaler Reset und Löschung"

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

            onPress={() => {
              router.push('/data-privacy' as Href);
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
