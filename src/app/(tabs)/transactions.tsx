import {
  type Href,
  router,
  useFocusEffect,
} from 'expo-router';

import {
  useCallback,
  useMemo,
  useState,
} from 'react';

import {
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
  getTransactionTitle,
} from '@/components/finance/TransactionRow';

import {
  FinancePressable,
} from '@/components/interaction/FinancePressable';

import {
  FinanceSearchField,
} from '@/components/search/FinanceSearchField';

import {
  FinanceEmptyState,
} from '@/components/states/FinanceEmptyState';

import {
  FinanceSkeleton,
  FinanceSkeletonRow,
} from '@/components/states/FinanceSkeleton';

import {
  performFinanceHaptic,
} from '@/services/haptics';

import {
  calculateExpensesMinor,
  calculateIncomeMinor,
  filterTransactionsForMonth,
  sortTransactionsNewestFirst,
} from '@/core/finance';

import {
  formatMinorUnits,
} from '@/core/money';

import {
  useFinanceTheme,
} from '@/hooks/use-finance-theme';

import {
  useFinanceStore,
} from '@/stores/useFinanceStore';

import type {
  Transaction,
  TransactionDirection,
} from '@/types/finance';

type TransactionFilter =
  | 'all'
  | TransactionDirection;

function normalizeSearchValue(
  value:
    string
): string {
  return value
    .trim()
    .toLocaleLowerCase(
      'de-DE'
    );
}

export default function TransactionsScreen() {
  const {
    colors,
    radius,
    spacing,
    typography,
  } = useFinanceTheme();

  const [
    filter,
    setFilter,
  ] =
    useState<TransactionFilter>(
      'all'
    );

  const [
    query,
    setQuery,
  ] =
    useState('');

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

  const sortedTransactions =
    useMemo(
      () =>
        sortTransactionsNewestFirst(
          transactions
        ),

      [
        transactions,
      ]
    );

  const normalizedQuery =
    useMemo(
      () =>
        normalizeSearchValue(
          query
        ),

      [
        query,
      ]
    );

  const searchResults =
    useMemo(
      () => {
        if (!normalizedQuery) {
          return sortedTransactions;
        }

        return sortedTransactions.filter(
          (transaction) => {
            const accountName =
              accountNames.get(
                transaction.accountId
              ) ??
              '';

            const searchableText = [
              getTransactionTitle(
                transaction
              ),

              transaction.description,

              accountName,

              transaction.bookingDate,

              formatMinorUnits(
                transaction.amountMinor,
                transaction.currency
              ),
            ]
              .join(
                ' '
              )
              .toLocaleLowerCase(
                'de-DE'
              );

            return searchableText.includes(
              normalizedQuery
            );
          }
        );
      },

      [
        accountNames,
        normalizedQuery,
        sortedTransactions,
      ]
    );

  const visibleTransactions =
    useMemo(
      () => {
        if (
          filter ===
          'all'
        ) {
          return searchResults;
        }

        return searchResults.filter(
          (transaction) =>
            transaction.direction ===
            filter
        );
      },

      [
        filter,
        searchResults,
      ]
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

  const monthIncome =
    useMemo(
      () =>
        calculateIncomeMinor(
          monthTransactions
        ),

      [
        monthTransactions,
      ]
    );

  const monthExpenses =
    useMemo(
      () =>
        calculateExpensesMinor(
          monthTransactions
        ),

      [
        monthTransactions,
      ]
    );

  function openTransaction(
    transaction:
      Transaction
  ) {
    router.push(
      `/transaction/${transaction.id}` as Href
    );
  }

  function renderFilter(
    id:
      TransactionFilter,

    label:
      string
  ) {
    const selected =
      filter === id;

    return (
      <FinancePressable
        key={
          id
        }

        accessibilityRole="button"

        accessibilityState={{
          selected,
        }}

        onPress={() => {
          setFilter(
            id
          );

          void performFinanceHaptic(
            'selection'
          );
        }}

        feedbackVariant="subtle"

        tapScale={
          0.97
        }

        style={[
          styles.filter,

          {
            backgroundColor:
              selected
                ? colors.primarySoft
                : colors.surface,

            borderColor:
              selected
                ? colors.primary
                : colors.border,

            borderRadius:
              radius.round,
          },
        ]}

        contentStyle={
          styles.filterContent
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
          {label}
        </Text>
      </FinancePressable>
    );
  }

  if (
    isLoading &&
    transactions.length ===
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
          style={{
            paddingHorizontal:
              spacing.lg,

            paddingTop:
              spacing.xl,
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
            BEWEGUNGEN
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
            Umsätze
          </Text>

          <View
            style={{
              marginTop:
                spacing.xxl,

              gap:
                spacing.xs,
            }}
          >
            <FinanceSkeletonRow />

            <FinanceSkeletonRow />

            <FinanceSkeletonRow />

            <FinanceSkeletonRow />

            <FinanceSkeleton
              width="40%"

              height={13}

              style={{
                alignSelf:
                  'center',

                marginTop:
                  spacing.lg,
              }}
            />
          </View>
        </View>
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

        keyboardShouldPersistTaps="handled"

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
          BEWEGUNGEN
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
          Umsätze
        </Text>

        <Text
          style={[
            typography.body,

            {
              color:
                colors.textSecondary,

              marginTop:
                spacing.sm,
            },
          ]}
        >
          Suche, filtere und öffne einzelne Buchungen für alle Details.
        </Text>

        <View
          style={[
            styles.summaryGrid,

            {
              gap:
                spacing.md,

              marginTop:
                spacing.xxl,
            },
          ]}
        >
          <FinanceCard
            style={
              styles.summaryCard
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
                monthIncome
              }

              size="m"

              tone="positive"

              forceSign="positive"

              style={{
                marginTop:
                  spacing.sm,
              }}
            />
          </FinanceCard>

          <FinanceCard
            style={
              styles.summaryCard
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
                monthExpenses
              }

              size="m"

              tone="negative"

              forceSign="negative"

              style={{
                marginTop:
                  spacing.sm,
              }}
            />
          </FinanceCard>
        </View>

        <View
          style={{
            marginTop:
              spacing.xl,
          }}
        >
          <FinanceSearchField<Transaction>
            value={
              query
            }

            onChangeText={
              setQuery
            }

            placeholder="Umsätze suchen"

            results={
              searchResults.slice(
                0,
                50
              )
            }

            resultsTitle="Umsätze"

            emptyTitle="Kein Umsatz gefunden"

            emptyDescription="Suche nach Händler, Beschreibung, Konto, Datum oder Betrag."

            keyExtractor={(
              transaction
            ) =>
              transaction.id
            }

            onSelect={
              openTransaction
            }

            renderResult={(
              transaction
            ) => {
              const isIncome =
                transaction.direction ===
                'income';

              const accountName =
                accountNames.get(
                  transaction.accountId
                ) ??
                'Konto';

              return (
                <View
                  style={
                    styles.searchResultRow
                  }
                >
                  <View
                    style={
                      styles.searchResultText
                    }
                  >
                    <Text
                      numberOfLines={
                        1
                      }

                      style={[
                        typography.bodyMedium,

                        {
                          color:
                            colors.text,
                        },
                      ]}
                    >
                      {getTransactionTitle(
                        transaction
                      )}
                    </Text>

                    <Text
                      numberOfLines={
                        1
                      }

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
                      {accountName}
                      {' · '}
                      {transaction.bookingDate}
                    </Text>
                  </View>

                  <MoneyText
                    amountMinor={
                      transaction.amountMinor
                    }

                    currency={
                      transaction.currency
                    }

                    size="s"

                    tone={
                      isIncome
                        ? 'positive'

                        : 'neutral'
                    }

                    forceSign={
                      isIncome
                        ? 'positive'

                        : null
                    }
                  />
                </View>
              );
            }}
          />
        </View>

        <ScrollView
          horizontal

          showsHorizontalScrollIndicator={
            false
          }

          contentContainerStyle={[
            styles.filters,

            {
              gap:
                spacing.sm,

              paddingRight:
                spacing.lg,
            },
          ]}
        >
          {renderFilter(
            'all',
            'Alle'
          )}

          {renderFilter(
            'income',
            'Einnahmen'
          )}

          {renderFilter(
            'expense',
            'Ausgaben'
          )}
        </ScrollView>

        {visibleTransactions.length ===
        0 ? (
          <FinanceEmptyState
            title="Keine Treffer"

            description="Ändere Suche oder Filter, um weitere Umsätze anzuzeigen."

            style={
              styles.emptyCard
            }
          />
        ) : (
          <FinanceCard
            padded={
              false
            }
          >
            {visibleTransactions.map(
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
                    visibleTransactions.length -
                      1 && (
                    <View
                      style={[
                        styles.divider,

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

    summaryGrid: {
      flexDirection:
        'row',
    },

    summaryCard: {
      flex:
        1,
    },

    filters: {
      paddingTop:
        20,

      paddingBottom:
        20,
    },

    filter: {
      minHeight:
        38,

      borderWidth:
        StyleSheet
          .hairlineWidth,
    },

    filterContent: {
      minHeight:
        36,

      paddingHorizontal:
        16,

      paddingVertical:
        9,

      justifyContent:
        'center',
    },

    emptyCard: {
      alignItems:
        'center',

      paddingVertical:
        34,
    },

    divider: {
      height:
        StyleSheet
          .hairlineWidth,

      marginLeft:
        78,
    },

    searchResultRow: {
      flexDirection:
        'row',

      alignItems:
        'center',
    },

    searchResultText: {
      flex:
        1,

      marginRight:
        12,
    },
  });