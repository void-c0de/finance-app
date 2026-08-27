import {
  type Href,
  router,
  useFocusEffect,
} from 'expo-router';

import {
  useCallback,
  useMemo,
} from 'react';

import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  SafeAreaView,
} from 'react-native-safe-area-context';

import {
  FinanceCard,
} from '@/components/finance/FinanceCard';

import {
  MoneyText,
} from '@/components/finance/MoneyText';

import {
  TransactionRow,
} from '@/components/finance/TransactionRow';

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
  FinanceSkeleton,
  FinanceSkeletonRow,
} from '@/components/states/FinanceSkeleton';

import {
  calculateCashflowMinor,
  calculateExpensesMinor,
  calculateIncomeMinor,
  calculateTotalBalanceMinor,
  filterTransactionsForMonth,
  sortTransactionsNewestFirst,
} from '@/core/finance';

import {
  summarizeBudgetProgress,
} from '@/services/budgetInsightsCore';

import {
  buildFinanceInsights,
} from '@/services/financeInsights';

import {
  buildCashflowForecast,
  RECURRING_KIND_LABEL,
} from '@/services/recurringInsightsCore';

import {
  buildAttentionItems,
} from '@/services/attentionCore';

import {
  hasCapability,
} from '@/services/entitlementCore';

import {
  useProductAccessStore,
} from '@/stores/useProductAccessStore';

import {
  goalProgressPercent,
} from '@/services/goalProgressCore';

import {
  formatMinorUnits,
} from '@/core/money';

import {
  useFinanceTheme,
} from '@/hooks/use-finance-theme';

import {
  useCloudSyncStore,
} from '@/stores/useCloudSyncStore';

import {
  useFinanceStore,
} from '@/stores/useFinanceStore';

import type {
  BankAccount,
  Transaction,
} from '@/types/finance';

function openAccount(
  account:
    BankAccount
) {
  router.push(
    `/account/${account.id}` as Href
  );
}

function openTransaction(
  transaction:
    Transaction
) {
  router.push(
    `/transaction/${transaction.id}` as Href
  );
}

export default function HomeScreen() {
  const {
    colors,
    spacing,
    radius,
    typography,
  } = useFinanceTheme();

  const cloudStatus =
    useCloudSyncStore(
      (state) => state.status,
    );

  const accounts =
    useFinanceStore(
      (state) =>
        state.accounts
    );

  const transactions =
    useFinanceStore(
      (state) =>
        state.transactions
    );

  const budgets =
    useFinanceStore(
      (state) =>
        state.budgets
    );

  const goals =
    useFinanceStore(
      (state) =>
        state.goals
    );

  const recurringOverrides =
    useFinanceStore(
      (state) =>
        state.recurringOverrides
    );

  const bankConnections =
    useFinanceStore(
      (state) =>
        state.bankConnections
    );

  const productAccess =
    useProductAccessStore(
      (state) =>
        state.access
    );

  const categories =
    useFinanceStore(
      (state) =>
        state.categories
    );

  const isLoading =
    useFinanceStore(
      (state) =>
        state.isLoading
    );

  const isRefreshing =
    useFinanceStore(
      (state) =>
        state.isRefreshing
    );

  const errorMessage =
    useFinanceStore(
      (state) =>
        state.errorMessage
    );

  const refreshFinanceData =
    useFinanceStore(
      (state) =>
        state.refreshFinanceData
    );

  useFocusEffect(
    useCallback(
      () => {
        void refreshFinanceData();

        return undefined;
      },

      [
        refreshFinanceData,
      ]
    )
  );

  const monthTransactions =
    useMemo(
      () =>
        filterTransactionsForMonth(
          transactions
        ),

      [
        transactions,
      ]
    );

  const recentTransactions =
    useMemo(
      () =>
        sortTransactionsNewestFirst(
          transactions
        ).slice(
          0,
          5
        ),

      [
        transactions,
      ]
    );

  const accountNames =
    useMemo(
      () =>
        new Map(
          accounts.map(
            (account) => [
              account.id,
              account.name,
            ]
          )
        ),

      [
        accounts,
      ]
    );

  const totalBalanceMinor =
    useMemo(
      () =>
        calculateTotalBalanceMinor(
          accounts,
          'EUR'
        ),

      [
        accounts,
      ]
    );

  const incomeMinor =
    useMemo(
      () =>
        calculateIncomeMinor(
          monthTransactions
        ),

      [
        monthTransactions,
      ]
    );

  const expensesMinor =
    useMemo(
      () =>
        calculateExpensesMinor(
          monthTransactions
        ),

      [
        monthTransactions,
      ]
    );

  const cashflowMinor =
    useMemo(
      () =>
        calculateCashflowMinor(
          monthTransactions
        ),

      [
        monthTransactions,
      ]
    );

  const insights =
    useMemo(
      () =>
        buildFinanceInsights({
          transactions,
          categories,
          budgets,
          recurringOverrides,
        }),

      [
        transactions,
        categories,
        budgets,
        recurringOverrides,
      ]
    );

  const budgetSummary =
    useMemo(
      () =>
        summarizeBudgetProgress(
          insights.budgetInsights
        ),

      [
        insights.budgetInsights,
      ]
    );

  const nextRecurring =
    insights.upcomingRecurring[0] ??
    null;

  const canForecast =
    hasCapability(
      productAccess,
      'premium_analytics',
    );

  const attentionItems =
    useMemo(
      () =>
        buildAttentionItems({
          uncategorizedExpenseCount:
            insights.uncategorizedExpenseCount,
          uncertainRecurringCount:
            insights.recurringSummary.uncertainCount,
          overBudgetCount:
            budgetSummary.overBudgetCount,
          bankConnections:
            bankConnections.map((connection) => ({
              id: connection.id,
              institutionName: connection.institutionName,
              status: connection.status,
            })),
          cloudSyncFailed:
            cloudStatus === 'error',
        }),

      [
        insights.uncategorizedExpenseCount,
        insights.recurringSummary.uncertainCount,
        budgetSummary.overBudgetCount,
        bankConnections,
        cloudStatus,
      ]
    );

  const forecast =
    useMemo(
      () =>
        canForecast
          ? buildCashflowForecast({
              openingBalanceMinor:
                totalBalanceMinor,
              recurringItems:
                insights.recurringItems,
              horizonDays: 30,
            })
          : null,

      [
        canForecast,
        totalBalanceMinor,
        insights.recurringItems,
      ]
    );

  const currentMonth =
    useMemo(
      () => {
        const formatted =
          new Intl
            .DateTimeFormat(
              'de-DE',
              {
                month:
                  'long',

                year:
                  'numeric',
              }
            )
            .format(
              new Date()
            );

        return (
          formatted
            .charAt(0)
            .toUpperCase() +
          formatted.slice(
            1
          )
        );
      },

      []
    );

  if (
    isLoading &&
    accounts.length ===
      0
  ) {
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
        <View
          style={[
            styles.loadingHeader,

            {
              paddingHorizontal:
                spacing.lg,

              paddingTop:
                spacing.lg,
            },
          ]}
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
            DEINE FINANZEN
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
            Übersicht
          </Text>
        </View>

        <View
          style={{
            paddingHorizontal:
              spacing.lg,

            marginTop:
              spacing.xxl,

            gap:
              spacing.md,
          }}
        >
          <FinanceCard
            variant="elevated"
          >
            <FinanceSkeleton
              width="45%"

              height={13}
            />

            <FinanceSkeleton
              width="70%"

              height={34}

              style={{
                marginTop:
                  spacing.md,
              }}
            />
          </FinanceCard>

          <FinanceSkeletonRow />

          <FinanceSkeletonRow />
        </View>

        <FinanceLoadingState
          label="Finanzdaten werden geladen…"

          style={{
            marginTop:
              spacing.xxxl,
          }}
        />
      </SafeAreaView>
    );
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

        refreshControl={
          <RefreshControl
            refreshing={
              isRefreshing
            }

            onRefresh={() => {
              void refreshFinanceData({
                forceSync:
                  true,
              });
            }}
          />
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
        <View
          style={
            styles.header
          }
        >
          <View
            style={
              styles.headerText
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
              DEINE FINANZEN
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
              Übersicht
            </Text>
          </View>

          <FinancePressable
            accessibilityRole="button"

            accessibilityLabel="Finanzdaten aktualisieren"

            onPress={() => {
              void refreshFinanceData({
                forceSync:
                  true,
              });
            }}

            disabled={
              isRefreshing
            }

            /*
             * Manueller Sync =
             * bewusste Aktion.
             */
            intent="important"

            style={[
              styles.refreshButton,

              {
                backgroundColor:
                  colors.surface,

                borderColor:
                  colors.border,

                borderRadius:
                  radius.round,
              },
            ]}

            contentStyle={
              styles.refreshContent
            }
          >
            {isRefreshing ? (
              <ActivityIndicator
                size="small"

                color={
                  colors.primary
                }
              />
            ) : (
              <Text
                style={[
                  styles.refreshIcon,

                  {
                    color:
                      colors.primary,
                  },
                ]}
              >
                ↻
              </Text>
            )}
          </FinancePressable>
        </View>

        {errorMessage && (
          <View
            style={[
              styles.errorBanner,

              {
                backgroundColor:
                  colors.negativeSoft,

                borderRadius:
                  radius.lg,

                marginTop:
                  spacing.lg,
              },
            ]}
          >
            <Text
              style={[
                typography.smallMedium,

                {
                  color:
                    colors.negative,
                },
              ]}
            >
              {errorMessage}
            </Text>
          </View>
        )}

        <FinanceCard
          style={{
            marginTop:
              spacing.xxl,
          }}
        >
          <View
            style={
              styles.heroTopRow
            }
          >
            <View
              style={
                styles.heroMain
              }
            >
              <Text
                style={[
                  typography.small,

                  {
                    color:
                      colors.textSecondary,
                  },
                ]}
              >
                Gesamtvermögen
              </Text>

              <MoneyText
                amountMinor={
                  totalBalanceMinor
                }

                size="xl"

                style={{
                  marginTop:
                    spacing.xs,
                }}
              />
            </View>

            <View
              style={[
                styles.liveBadge,

                {
                  backgroundColor:
                    colors.positiveSoft,

                  borderRadius:
                    radius.round,
                },
              ]}
            >
              <View
                style={[
                  styles.liveDot,

                  {
                    backgroundColor:
                      colors.positive,
                  },
                ]}
              />

              <Text
                style={[
                  typography.caption,

                  {
                    color:
                      colors.positive,
                  },
                ]}
              >
                {cloudStatus === 'synced'
                  ? 'Cloud synchronisiert'
                  : cloudStatus === 'syncing'
                    ? 'Cloud-Sync…'
                    : 'Lokal geschützt'}
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
              styles.heroBottomRow
            }
          >
            <View>
              <Text
                style={[
                  typography.caption,

                  {
                    color:
                      colors.textMuted,
                  },
                ]}
              >
                KONTEN
              </Text>

              <Text
                style={[
                  typography.bodyMedium,

                  {
                    color:
                      colors.text,

                    marginTop:
                      spacing.xs,
                  },
                ]}
              >
                {accounts.length ===
                1
                  ? '1 verbundenes Konto'

                  : `${accounts.length} verbundene Konten`}
              </Text>
            </View>

            <FinancePressable
              onPress={() => {
                router.push(
                  '/connect-bank' as Href
                );
              }}

              intent="navigation"

              contentStyle={
                styles.textActionContent
              }
            >
              <Text
                style={[
                  typography.smallMedium,

                  {
                    color:
                      colors.primary,
                  },
                ]}
              >
                Hinzufügen
              </Text>
            </FinancePressable>
          </View>
        </FinanceCard>

        {attentionItems.length > 0 ? (
          <FinanceCard style={{ marginTop: spacing.md }}>
            <Text
              style={[
                typography.caption,
                { color: colors.textMuted },
              ]}
            >
              BRAUCHT AUFMERKSAMKEIT
            </Text>

            {attentionItems.slice(0, 3).map((item, index) => {
              const accent =
                item.priority === 'critical'
                  ? colors.negative
                  : item.priority === 'action_required'
                    ? colors.warning
                    : colors.textSecondary;
              return (
                <FinancePressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                  onPress={() => router.push(item.route as Href)}
                  intent="navigation"
                  style={{
                    marginTop: index === 0 ? spacing.md : spacing.sm,
                    borderLeftWidth: 3,
                    borderLeftColor: accent,
                    paddingLeft: spacing.md,
                  }}
                >
                  <Text
                    style={[
                      typography.bodyMedium,
                      { color: colors.text },
                    ]}
                  >
                    {item.title}
                  </Text>
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.textSecondary, marginTop: spacing.xxs },
                    ]}
                    numberOfLines={2}
                  >
                    {item.detail}
                  </Text>
                </FinancePressable>
              );
            })}

            {attentionItems.length > 3 ? (
              <Text
                style={[
                  typography.caption,
                  { color: colors.textMuted, marginTop: spacing.sm },
                ]}
              >
                +{attentionItems.length - 3} weitere
              </Text>
            ) : null}
          </FinanceCard>
        ) : null}

        {forecast ? (
          <FinanceCard style={{ marginTop: spacing.md }}>
            <View style={styles.header}>
              <Text
                style={[
                  typography.caption,
                  { color: colors.textMuted },
                ]}
              >
                PROGNOSE · 30 TAGE
              </Text>
              <Text
                style={[
                  typography.caption,
                  { color: colors.primary },
                ]}
              >
                Premium
              </Text>
            </View>

            <MoneyText
              amountMinor={forecast.projectedAfterKnownMinor}
              currency="EUR"
              size="l"
              forceSign={null}
              style={{ marginTop: spacing.md }}
            />
            <Text
              style={[
                typography.caption,
                { color: colors.textSecondary, marginTop: spacing.xxs },
              ]}
            >
              Verfügbar heute {formatMinorUnits(forecast.openingBalanceMinor, 'EUR')} · bekannte Fixkosten {formatMinorUnits(forecast.knownOutflowMinor, 'EUR')} · erwartetes Einkommen {formatMinorUnits(forecast.expectedInflowMinor, 'EUR')}
            </Text>

            {forecast.likelyOutflowMinor < 0 ? (
              <Text
                style={[
                  typography.caption,
                  { color: colors.textSecondary, marginTop: spacing.xs },
                ]}
              >
                Mit erkannten (unbestätigten) Zahlungen: {formatMinorUnits(forecast.projectedAfterLikelyMinor, 'EUR')}
              </Text>
            ) : null}

            <Text
              style={[
                typography.caption,
                { color: colors.textMuted, marginTop: spacing.sm },
              ]}
            >
              Nur bekannte wiederkehrende Zahlungen. Kein garantierter Monatsendstand – künftige freie Ausgaben sind nicht eingerechnet.
            </Text>
          </FinanceCard>
        ) : null}

        <View
          style={[
            styles.statGrid,

            {
              gap:
                spacing.md,

              marginTop:
                spacing.md,
            },
          ]}
        >
          <FinanceCard
            style={
              styles.statCard
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
              EINNAHMEN
            </Text>

            <MoneyText
              amountMinor={
                incomeMinor
              }

              size="m"

              tone="positive"

              forceSign="positive"

              style={{
                marginTop:
                  spacing.sm,
              }}
            />

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
              diesen Monat
            </Text>
          </FinanceCard>

          <FinanceCard
            style={
              styles.statCard
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
              AUSGABEN
            </Text>

            <MoneyText
              amountMinor={
                expensesMinor
              }

              size="m"

              tone="negative"

              forceSign="negative"

              style={{
                marginTop:
                  spacing.sm,
              }}
            />

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
              diesen Monat
            </Text>
          </FinanceCard>
        </View>

        <FinanceCard
          style={{
            marginTop:
              spacing.md,
          }}
        >
          <View
            style={
              styles.sectionRow
            }
          >
            <View>
              <Text
                style={[
                  typography.sectionTitle,

                  {
                    color:
                      colors.text,
                  },
                ]}
              >
                Cashflow
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
                {currentMonth}
              </Text>
            </View>

            <View
              style={
                styles.amountRight
              }
            >
              <MoneyText
                amountMinor={
                  cashflowMinor
                }

                size="m"

                tone="auto"
              />

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
                Netto
              </Text>
            </View>
          </View>
        </FinanceCard>

        <View
          style={[
            styles.sectionRow,

            {
              marginTop:
                spacing.xxxl,

              marginBottom:
                spacing.md,
            },
          ]}
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
            Konten
          </Text>

          <FinancePressable
            onPress={() =>
              router.push(
                '/bank-connections' as Href
              )
            }

            intent="navigation" contentStyle={styles.textActionContent}
          >
            <Text
              style={[
                typography.smallMedium,

                {
                  color:
                    colors.primary,
                },
              ]}
            >
              Verwalten
            </Text>
          </FinancePressable>
        </View>

        {accounts.length ===
        0 ? (
          <FinanceEmptyState
            title="Noch kein Konto"

            description="Füge eine Bankverbindung hinzu, um Salden und Umsätze zu sehen."

            actionLabel="Bank verbinden"

            onAction={() => {
              router.push(
                '/connect-bank' as Href
              );
            }}
          />
        ) : (
          accounts.map(
            (
              account
            ) => (
              <FinancePressable
                key={
                  account.id
                }

                onPress={() =>
                  openAccount(
                    account
                  )
                }

                intent="navigation"
              >
                <FinanceCard
                  style={{
                    marginBottom:
                      spacing.sm,
                  }}
                >
                  <View
                    style={
                      styles.accountRow
                    }
                  >
                    <View
                      style={[
                        styles.accountIcon,

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
                          styles.accountIconText,

                          {
                            color:
                              colors.primary,
                          },
                        ]}
                      >
                        €
                      </Text>
                    </View>

                    <View
                      style={
                        styles.accountText
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
                        {
                          account.name
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
                        {account.institutionName ??
                          'Bankkonto'}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.amountRight
                      }
                    >
                      <MoneyText
                        amountMinor={
                          account.balanceMinor
                        }

                        currency={
                          account.currency
                        }

                        size="m"
                      />

                      <Text
                        style={[
                          typography.caption,

                          {
                            color:
                              colors.textMuted,

                            marginTop:
                              spacing.xs,
                          },
                        ]}
                      >
                        Details ›
                      </Text>
                    </View>
                  </View>
                </FinanceCard>
              </FinancePressable>
            )
          )
        )}

        <View
          style={[
            styles.sectionRow,

            {
              marginTop:
                spacing.xxxl,

              marginBottom:
                spacing.md,
            },
          ]}
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
            Letzte Umsätze
          </Text>

          <FinancePressable
            onPress={() =>
              router.push(
                '/transactions' as Href
              )
            }

            intent="navigation" contentStyle={styles.textActionContent}
          >
            <Text
              style={[
                typography.smallMedium,

                {
                  color:
                    colors.primary,
                },
              ]}
            >
              Alle
            </Text>
          </FinancePressable>
        </View>

        {recentTransactions.length ===
        0 ? (
          <FinanceEmptyState
            title="Noch keine Umsätze"

            description="Sobald Bankdaten synchronisiert wurden, erscheinen hier deine letzten Buchungen."
          />
        ) : (
          <FinanceCard
            padded={
              false
            }
          >
            {recentTransactions.map(
              (
                transaction,
                index
              ) => (
                <View
                  key={
                    transaction.id
                  }
                >
                  <TransactionRow
                    transaction={
                      transaction
                    }

                    accountName={
                      accountNames.get(
                        transaction.accountId
                      )
                    }

                    onPress={() =>
                      openTransaction(
                        transaction
                      )
                    }
                  />

                  {index <
                    recentTransactions.length -
                      1 && (
                    <View
                      style={[
                        styles.transactionDivider,

                        {
                          backgroundColor:
                            colors.border,
                        },
                      ]}
                    />
                  )}
                </View>
              )
            )}
          </FinanceCard>
        )}

        <View
          style={[
            styles.sectionRow,

            {
              marginTop:
                spacing.xxxl,

              marginBottom:
                spacing.md,
            },
          ]}
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
            Planung
          </Text>

          <FinancePressable
            onPress={() =>
              router.push(
                '/planning' as Href
              )
            }

            intent="navigation" contentStyle={styles.textActionContent}
          >
            <Text
              style={[
                typography.smallMedium,

                {
                  color:
                    colors.primary,
                },
              ]}
            >
              Alle anzeigen
            </Text>
          </FinancePressable>
        </View>

        <View
          style={[
            styles.planningGrid,

            {
              gap:
                spacing.sm,
            },
          ]}
        >
          <FinanceCard
            style={
              styles.planningCard
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
              BUDGETS
            </Text>

            {budgetSummary.count ===
            0 ? (
              <Text
                style={[
                  typography.title,

                  {
                    color:
                      colors.text,

                    marginTop:
                      spacing.lg,
                  },
                ]}
              >
                0
              </Text>
            ) : (
              <>
                <MoneyText
                  amountMinor={Math.abs(
                    budgetSummary.totalRemainingMinor
                  )}
                  currency="EUR"
                  size="s"
                  forceSign={null}
                  style={{
                    marginTop:
                      spacing.lg,
                  }}
                />

                <Text
                  style={[
                    typography.caption,

                    {
                      color:
                        budgetSummary.totalRemainingMinor <
                        0
                          ? colors.negative
                          : colors.textSecondary,

                      marginTop:
                        spacing.xs,
                    },
                  ]}
                >
                  {budgetSummary.totalRemainingMinor >=
                  0
                    ? 'übrig diesen Monat'
                    : `${budgetSummary.overBudgetCount} über Budget`}
                </Text>
              </>
            )}
          </FinanceCard>

          <FinanceCard
            style={
              styles.planningCard
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
              SPARZIELE
            </Text>

            <Text
              style={[
                typography.title,

                {
                  color:
                    colors.text,

                  marginTop:
                    spacing.lg,
                },
              ]}
            >
              {goals[0]?.name ?? '0 Ziele'}
            </Text>

            {goals[0] ? (
              <>
                <MoneyText
                  amountMinor={goals[0].currentAmountMinor}
                  currency={goals[0].currency}
                  size="s"
                  forceSign={null}
                />
                <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                  {goalProgressPercent(goals[0].currentAmountMinor, goals[0].targetAmountMinor)} % erreicht
                </Text>
              </>
            ) : null}
          </FinanceCard>

          <FinanceCard
            style={
              styles.planningCard
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
              FIXKOSTEN
            </Text>

            <MoneyText
              amountMinor={
                insights.recurringSummary
                  .monthlyCommittedMinor
              }
              currency="EUR"
              size="s"
              forceSign={null}
              style={{
                marginTop:
                  spacing.lg,
              }}
            />

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
              {insights.recurringSummary
                .subscriptionCount +
              insights.recurringSummary
                .billCount +
              insights.recurringSummary
                .uncertainCount}{' '}
              wiederkehrend · mtl.
            </Text>
          </FinanceCard>
        </View>

        {nextRecurring ? (
          <FinanceCard
            style={{
              marginTop:
                spacing.md,
            }}
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
              NÄCHSTE WIEDERKEHRENDE ZAHLUNG
            </Text>

            <View
              style={[
                styles.header,
                {
                  marginTop:
                    spacing.md,
                },
              ]}
            >
              <View
                style={{
                  flex: 1,
                  paddingRight:
                    spacing.md,
                }}
              >
                <Text
                  style={[
                    typography.bodyMedium,
                    {
                      color:
                        colors.text,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {nextRecurring.title}
                </Text>

                <Text
                  style={[
                    typography.caption,
                    {
                      color:
                        colors.textSecondary,
                      marginTop:
                        spacing.xxs,
                    },
                  ]}
                >
                  {RECURRING_KIND_LABEL[
                    nextRecurring.kind
                  ]}
                  {' · fällig '}
                  {new Date(
                    `${nextRecurring.nextDate}T00:00:00.000Z`
                  ).toLocaleDateString(
                    'de-DE',
                    {
                      day: '2-digit',
                      month: '2-digit',
                    }
                  )}
                  {nextRecurring.confidence ===
                  'low'
                    ? ' · unbestätigt'
                    : ''}
                </Text>
              </View>

              <MoneyText
                amountMinor={
                  nextRecurring.amountMinor
                }
                currency={
                  nextRecurring.currency
                }
                size="s"
                forceSign="negative"
              />
            </View>
          </FinanceCard>
        ) : null}

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

    loadingHeader: {},

    header: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',
    },

    headerText: {
      flex:
        1,
    },

    eyebrow: {
      letterSpacing:
        1.4,
    },

    refreshButton: {
      width:
        46,

      height:
        46,

      borderWidth:
        StyleSheet
          .hairlineWidth,
    },

    refreshContent: {
      width:
        46,

      height:
        46,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    refreshIcon: {
      fontSize:
        23,

      fontWeight:
        '700',
    },

    errorBanner: {
      paddingHorizontal:
        15,

      paddingVertical:
        13,
    },

    heroTopRow: {
      flexDirection:
        'row',

      alignItems:
        'flex-start',

      justifyContent:
        'space-between',
    },

    heroMain: {
      flex:
        1,
    },

    liveBadge: {
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

      marginLeft:
        10,
    },

    liveDot: {
      width:
        6,

      height:
        6,

      borderRadius:
        3,
    },

    divider: {
      height:
        StyleSheet
          .hairlineWidth,

      width:
        '100%',
    },

    heroBottomRow: {
      flexDirection:
        'row',

      alignItems:
        'flex-end',

      justifyContent:
        'space-between',
    },

    textActionContent: {
      minHeight:
        34,

      paddingHorizontal:
        8,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    statGrid: {
      flexDirection:
        'row',
    },

    statCard: {
      flex:
        1,
    },

    sectionRow: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',
    },

    amountRight: {
      alignItems:
        'flex-end',
    },

    accountRow: {
      flexDirection:
        'row',

      alignItems:
        'center',
    },

    accountIcon: {
      width:
        48,

      height:
        48,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    accountIconText: {
      fontSize:
        20,

      fontWeight:
        '800',
    },

    accountText: {
      flex:
        1,

      marginLeft:
        14,

      marginRight:
        12,
    },

    transactionDivider: {
      height:
        StyleSheet
          .hairlineWidth,

      marginLeft:
        78,
    },

    planningGrid: {
      flexDirection:
        'row',
    },

    planningCard: {
      flex:
        1,

      minHeight:
        105,
    },
  });
