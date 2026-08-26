import {
  type Href,
  router,
  useFocusEffect,
} from 'expo-router';

import {
  useCallback,
  useState,
} from 'react';

import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  SafeAreaView,
} from 'react-native-safe-area-context';

import {
  getBankProvider,
  isExternalManagedProvider,
} from '@/banking/providerRegistry';

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
  FinanceEmptyState,
} from '@/components/states/FinanceEmptyState';

import {
  FinanceLoadingState,
} from '@/components/states/FinanceLoadingState';

import {
  deleteBankConnection,
  getBankConnections,
} from '@/db/repositories/bankConnections';

import {
  useFinanceTheme,
} from '@/hooks/use-finance-theme';

import {
  syncBankConnection,
} from '@/services/bankSync';

import {
  useFinanceStore,
} from '@/stores/useFinanceStore';

import type {
  BankConnection,
} from '@/types/banking';

function formatLastSync(
  value?:
    string
): string {
  if (!value) {
    return 'Noch nicht synchronisiert';
  }

  const date =
    new Date(
      value
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return new Intl
    .DateTimeFormat(
      'de-DE',
      {
        day:
          '2-digit',

        month:
          '2-digit',

        year:
          'numeric',

        hour:
          '2-digit',

        minute:
          '2-digit',
      }
    )
    .format(
      date
    );
}

export default function BankConnectionsScreen() {
  const {
    colors,
    radius,
    spacing,
    typography,
  } = useFinanceTheme();

  const [
    connections,
    setConnections,
  ] =
    useState<
      BankConnection[]
    >([]);

  const [
    isLoading,
    setIsLoading,
  ] =
    useState(
      true
    );

  const [
    removingId,
    setRemovingId,
  ] =
    useState<
      string | null
    >(null);

  const [
    syncingId,
    setSyncingId,
  ] =
    useState<
      string | null
    >(null);

  const refreshFinanceData =
    useFinanceStore(
      (state) =>
        state.refreshFinanceData
    );

  const resetFinanceStore =
    useFinanceStore(
      (state) =>
        state.reset
    );

  const loadConnections =
    useCallback(
      async (
        showLoader =
          true
      ) => {
        if (showLoader) {
          setIsLoading(
            true
          );
        }

        try {
          const result =
            await getBankConnections();

          setConnections(
            result
          );
        } catch (error) {
          console.error(
            'Could not load bank connections:',
            error
          );
        } finally {
          if (showLoader) {
            setIsLoading(
              false
            );
          }
        }
      },

      []
    );

  useFocusEffect(
    useCallback(
      () => {
        void loadConnections();

        return undefined;
      },

      [
        loadConnections,
      ]
    )
  );

  function requestDelete(
    connection:
      BankConnection
  ) {
    Alert.alert(
      'Verbindung entfernen?',

      `${connection.institutionName} und die lokal dazu gespeicherten Konten und Umsätze werden entfernt.`,

      [
        {
          text:
            'Abbrechen',

          style:
            'cancel',
        },

        {
          text:
            'Entfernen',

          style:
            'destructive',

          onPress: () => {
            void removeConnection(
              connection
            );
          },
        },
      ]
    );
  }

  async function removeConnection(
    connection:
      BankConnection
  ) {
    setRemovingId(
      connection.id
    );

    try {
      /*
       * Extern verwaltete Provider
       * (z.B. Tink) haben keinen lokalen
       * Provider-Adapter - deren Consent
       * laeuft ueber den Hosted-Flow.
       * Lokal reicht das Tombstone-
       * Delete, die Cloud propagiert.
       */
      if (
        !isExternalManagedProvider(
          connection.providerId
        )
      ) {
        const provider =
          getBankProvider(
            connection.providerId
          );

        await provider.disconnect(
          connection.externalConnectionId
        );
      }

      await deleteBankConnection(
        connection.id
      );

      setConnections(
        (current) =>
          current.filter(
            (item) =>
              item.id !==
              connection.id
          )
      );

      resetFinanceStore();

      await refreshFinanceData();
    } catch (error) {
      console.error(
        'Could not remove bank connection:',
        error
      );

      Alert.alert(
        'Fehler',

        'Die Verbindung konnte nicht vollständig entfernt werden.'
      );
    } finally {
      setRemovingId(
        null
      );
    }
  }

  async function syncConnection(
    connection:
      BankConnection
  ) {
    setSyncingId(
      connection.id
    );

    try {
      await syncBankConnection(
        connection.id
      );

      await refreshFinanceData();

      await loadConnections(
        false
      );
    } catch (error) {
      console.error(
        'Could not sync bank connection:',
        error
      );

      Alert.alert(
        'Synchronisierung fehlgeschlagen',

        'Die Bankverbindung konnte gerade nicht aktualisiert werden.'
      );
    } finally {
      setSyncingId(
        null
      );
    }
  }

  function statusAppearance(
    connection:
      BankConnection
  ) {
    if (
      connection.status ===
      'error'
    ) {
      return {
        label:
          'Fehler',

        color:
          colors.negative,

        backgroundColor:
          colors.negativeSoft,
      };
    }

    if (
      connection.status ===
      'requires_action'
    ) {
      return {
        label:
          'Aktion nötig',

        color:
          colors.warning,

        backgroundColor:
          colors.warningSoft,
      };
    }

    return {
      label:
        'Aktiv',

      color:
        colors.positive,

      backgroundColor:
        colors.positiveSoft,
    };
  }

  return (
    <SafeAreaView
      edges={[
        'top',
        'bottom',
      ]}

      style={[
        styles.safeArea,

        {
          backgroundColor:
            colors.background,
        },
      ]}
    >
      <View
        style={[
          styles.header,

          {
            paddingHorizontal:
              spacing.lg,

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
          Bankkonten
        </Text>

        <FinancePressable
          accessibilityRole="button"

          accessibilityLabel="Bank hinzufügen"

          onPress={() => {
            router.push(
              '/connect-bank' as Href
            );
          }}

          /*
           * Hinzufügen = echte Aktion.
           */
          intent="important"

          style={
            styles.addHeaderButton
          }

          contentStyle={
            styles.addHeaderContent
          }
        >
          <Text
            style={[
              styles.addHeaderText,

              {
                color:
                  colors.primary,
              },
            ]}
          >
            +
          </Text>
        </FinancePressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={
          false
        }

        contentContainerStyle={{
          paddingHorizontal:
            spacing.lg,

          paddingTop:
            spacing.lg,

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
          VERBINDUNGEN
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
          Meine Bankkonten
        </Text>

        <Text
          style={[
            typography.body,

            {
              color:
                colors.textSecondary,

              marginTop:
                spacing.sm,

              marginBottom:
                spacing.xxl,
            },
          ]}
        >
          Synchronisierung, Status und lokale Daten jeder Verbindung an einer Stelle.
        </Text>

        <FinanceCard
          style={{
            marginBottom:
              spacing.xl,
          }}
        >
          <View
            style={
              styles.securityRow
            }
          >
            <View
              style={[
                styles.securityIcon,

                {
                  backgroundColor:
                    colors.positiveSoft,

                  borderRadius:
                    radius.lg,
                },
              ]}
            >
              <Text
                style={[
                  styles.securityCheck,

                  {
                    color:
                      colors.positive,
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
                  typography.bodyMedium,

                  {
                    color:
                      colors.text,
                  },
                ]}
              >
                Lokal verschlüsselt
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
                Bankverbindungen, Konten und Umsätze liegen in deiner SQLCipher-Datenbank.
              </Text>
            </View>
          </View>
        </FinanceCard>

        {isLoading && (
          <FinanceLoadingState
            label="Verbindungen werden geladen…"

            style={
              styles.loadingArea
            }
          />
        )}

        {!isLoading &&
          connections.length ===
            0 && (
            <FinanceEmptyState
              title="Noch keine Bank"

              description="Lege zuerst eine Verbindung an. Der aktuelle Provider ist weiterhin Demo-only."

              actionLabel="Bank hinzufügen"

              onAction={() => {
                router.push(
                  '/connect-bank' as Href
                );
              }}

              style={
                styles.emptyCard
              }
            />
          )}

        {!isLoading &&
          connections.map(
            (
              connection
            ) => {
              const appearance =
                statusAppearance(
                  connection
                );

              return (
                <FinanceCard
                  key={
                    connection.id
                  }

                  style={{
                    marginBottom:
                      spacing.md,
                  }}
                >
                  <View
                    style={
                      styles.connectionHeader
                    }
                  >
                    <View
                      style={[
                        styles.bankIcon,

                        {
                          backgroundColor:
                            colors.primarySoft,

                          borderRadius:
                            radius.lg,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.bankIconText,

                          {
                            color:
                              colors.primary,
                          },
                        ]}
                      >
                        {connection.institutionName
                          .slice(
                            0,
                            2
                          )
                          .toUpperCase()}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.connectionText
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
                        {
                          connection.institutionName
                        }
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
                        {connection.isDemo
                          ? 'Demo-Verbindung'
                          : 'Bankverbindung'}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.statusBadge,

                        {
                          backgroundColor:
                            appearance.backgroundColor,

                          borderRadius:
                            radius.round,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.statusDot,

                          {
                            backgroundColor:
                              appearance.color,
                          },
                        ]}
                      />

                      <Text
                        style={[
                          typography.caption,

                          {
                            color:
                              appearance.color,
                          },
                        ]}
                      >
                        {
                          appearance.label
                        }
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.divider,

                      {
                        backgroundColor:
                          colors.border,

                        marginVertical:
                          spacing.lg,
                      },
                    ]}
                  />

                  <View
                    style={
                      styles.connectionInfo
                    }
                  >
                    <View
                      style={
                        styles.infoColumn
                      }
                    >
                      <Text
                        style={[
                          typography.caption,

                          {
                            color:
                              colors.textMuted,
                          },
                        ]}
                      >
                        PROVIDER
                      </Text>

                      <Text
                        style={[
                          typography.smallMedium,

                          {
                            color:
                              colors.text,

                            marginTop:
                              spacing.xs,
                          },
                        ]}
                      >
                        {
                          connection.providerId
                        }
                      </Text>
                    </View>

                    <View
                      style={
                        styles.rightInfo
                      }
                    >
                      <Text
                        style={[
                          typography.caption,

                          {
                            color:
                              colors.textMuted,
                          },
                        ]}
                      >
                        LETZTER SYNC
                      </Text>

                      <Text
                        style={[
                          typography.smallMedium,

                          styles.syncText,

                          {
                            color:
                              colors.text,

                            marginTop:
                              spacing.xs,
                          },
                        ]}
                      >
                        {formatLastSync(
                          connection.lastSyncedAt
                        )}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.actionRow,

                      {
                        gap:
                          spacing.sm,

                        marginTop:
                          spacing.xl,
                      },
                    ]}
                  >
                    <FinanceButton
                      label="Aktualisieren"

                      loading={
                        syncingId ===
                        connection.id
                      }

                      disabled={
                        removingId ===
                        connection.id
                      }

                      onPress={() => {
                        void syncConnection(
                          connection
                        );
                      }}

                      style={
                        styles.actionButton
                      }
                    />

                    <FinanceButton
                      label="Entfernen"

                      variant="danger"

                      loading={
                        removingId ===
                        connection.id
                      }

                      disabled={
                        syncingId ===
                        connection.id
                      }

                      onPress={() =>
                        requestDelete(
                          connection
                        )
                      }

                      style={
                        styles.actionButton
                      }
                    />
                  </View>
                </FinanceCard>
              );
            }
          )}
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

    addHeaderButton: {
      width:
        42,

      height:
        42,
    },

    addHeaderContent: {
      width:
        42,

      height:
        42,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    addHeaderText: {
      fontSize:
        32,

      fontWeight:
        '400',
    },

    eyebrow: {
      letterSpacing:
        1.4,
    },

    securityRow: {
      flexDirection:
        'row',

      alignItems:
        'center',
    },

    securityIcon: {
      width:
        50,

      height:
        50,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    securityCheck: {
      fontSize:
        24,

      fontWeight:
        '800',
    },

    securityText: {
      flex:
        1,

      marginLeft:
        14,
    },

    loadingArea: {
      minHeight:
        180,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    emptyCard: {
      alignItems:
        'center',

      paddingVertical:
        34,
    },

    connectionHeader: {
      flexDirection:
        'row',

      alignItems:
        'center',
    },

    bankIcon: {
      width:
        52,

      height:
        52,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    bankIconText: {
      fontSize:
        14,

      fontWeight:
        '800',
    },

    connectionText: {
      flex:
        1,

      marginLeft:
        14,
    },

    statusBadge: {
      flexDirection:
        'row',

      alignItems:
        'center',

      gap:
        6,

      paddingHorizontal:
        10,

      paddingVertical:
        7,
    },

    statusDot: {
      width:
        6,

      height:
        6,

      borderRadius:
        3,
    },

    divider: {
      width:
        '100%',

      height:
        StyleSheet
          .hairlineWidth,
    },

    connectionInfo: {
      flexDirection:
        'row',

      justifyContent:
        'space-between',

      gap:
        16,
    },

    infoColumn: {
      flex:
        1,
    },

    rightInfo: {
      flex:
        1,

      alignItems:
        'flex-end',
    },

    syncText: {
      textAlign:
        'right',
    },

    actionRow: {
      flexDirection:
        'row',
    },

    actionButton: {
      flex:
        1,
    },
  });
