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
  ActivityIndicator,
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
  FinanceCard,
} from '@/components/finance/FinanceCard';

import {
  MoneyText,
} from '@/components/finance/MoneyText';

import {
  TransactionRow,
} from '@/components/finance/TransactionRow';

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
  FinanceSkeleton,
  FinanceSkeletonRow,
} from '@/components/states/FinanceSkeleton';

import {
  formatMinorUnits,
} from '@/core/money';

import {
  deleteBudget,
  upsertMonthlyCategoryBudget,
} from '@/db/repositories/budgets';

import {
  useFinanceTheme,
} from '@/hooks/use-finance-theme';

import {
  buildFinanceInsights,
  type CategorySpendingInsight,
} from '@/services/financeInsights';

import {
  performFinanceHaptic,
} from '@/services/haptics';

import {
  useFinanceStore,
} from '@/stores/useFinanceStore';

import type {
  Transaction,
} from '@/types/finance';

function createSuggestedBudgetMinor(
  spendingMinor:
    number
): number {
  if (
    spendingMinor <=
    0
  ) {
    return 5_000;
  }

  /*
   * Aktuelle Ausgabe + 15 % Puffer.
   *
   * Kein Finanzrat.
   * Nur ein UI-Vorschlag.
   */
  const withBuffer =
    Math.ceil(
      spendingMinor *
        1.15
    );

  const fiveEuroStep =
    500;

  return (
    Math.ceil(
      withBuffer /
        fiveEuroStep
    ) *
    fiveEuroStep
  );
}

function percentageLabel(
  value:
    number
): string {
  return `${Math.round(
    value * 100
  )} %`;
}

export default function PlanningScreen() {
  const {
    colors,
    radius,
    spacing,
    typography,
  } =
    useFinanceTheme();

  const accounts =
    useFinanceStore(
      (
        state
      ) =>
        state.accounts
    );

  const transactions =
    useFinanceStore(
      (
        state
      ) =>
        state.transactions
    );

  const categories =
    useFinanceStore(
      (
        state
      ) =>
        state.categories
    );

  const budgets =
    useFinanceStore(
      (
        state
      ) =>
        state.budgets
    );

  const isLoading =
    useFinanceStore(
      (
        state
      ) =>
        state.isLoading
    );

  const isRefreshing =
    useFinanceStore(
      (
        state
      ) =>
        state.isRefreshing
    );

  const refreshFinanceData =
    useFinanceStore(
      (
        state
      ) =>
        state.refreshFinanceData
    );

  const [
    savingCategoryId,
    setSavingCategoryId,
  ] =
    useState<
      string | null
    >(null);

  const [
    deletingBudgetId,
    setDeletingBudgetId,
  ] =
    useState<
      string | null
    >(null);

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

  const insights =
    useMemo(
      () =>
        buildFinanceInsights({
          transactions,

          categories,

          budgets,
        }),
      [
        budgets,
        categories,
        transactions,
      ]
    );

  const budgetedCategoryIds =
    useMemo(
      () =>
        new Set(
          budgets
            .map(
              (
                budget
              ) =>
                budget.categoryId
            )
            .filter(
              (
                categoryId
              ): categoryId is string =>
                Boolean(
                  categoryId
                )
            )
        ),
      [
        budgets,
      ]
    );

  const budgetSuggestions =
    useMemo(
      () =>
        insights.categorySpending
          .filter(
            (
              item
            ) =>
              item.categoryId !==
                'cat-other' &&

              item.categoryId !==
                'uncategorized' &&

              !budgetedCategoryIds.has(
                item.categoryId
              )
          )
          .slice(
            0,
            3
          ),
      [
        budgetedCategoryIds,

        insights.categorySpending,
      ]
    );

  const accountNames =
    useMemo(
      () =>
        new Map(
          accounts.map(
            (
              account
            ) => [
              account.id,
              account.name,
            ]
          )
        ),
      [
        accounts,
      ]
    );

  const recurringTransactions =
    useMemo(
      () => {
        const recurringIds =
          new Set(
            insights.recurringExpenses.map(
              (
                item
              ) =>
                item.transactionId
            )
          );

        return transactions.filter(
          (
            transaction
          ) =>
            recurringIds.has(
              transaction.id
            )
        );
      },
      [
        insights.recurringExpenses,
        transactions,
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

  async function acceptBudgetSuggestion(
    suggestion:
      CategorySpendingInsight
  ) {
    if (
      savingCategoryId
    ) {
      return;
    }

    setSavingCategoryId(
      suggestion.categoryId
    );

    try {
      const amountMinor =
        createSuggestedBudgetMinor(
          suggestion.amountMinor
        );

      await upsertMonthlyCategoryBudget({
        categoryId:
          suggestion.categoryId,

        name:
          suggestion.name,

        amountMinor,
      });

      await refreshFinanceData();

      await performFinanceHaptic(
        'success'
      );
    } catch (error) {
      console.error(
        'Could not save budget:',
        error
      );

      Alert.alert(
        'Budget konnte nicht gespeichert werden',

        'Bitte versuche es erneut.'
      );
    } finally {
      setSavingCategoryId(
        null
      );
    }
  }

  function requestDeleteBudget(
    budgetId:
      string,

    budgetName:
      string
  ) {
    Alert.alert(
      'Budget entfernen?',

      `${budgetName} wird aus deiner Planung entfernt.`,

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
            void removeBudget(
              budgetId
            );
          },
        },
      ]
    );
  }

  async function removeBudget(
    budgetId:
      string
  ) {
    if (
      deletingBudgetId
    ) {
      return;
    }

    setDeletingBudgetId(
      budgetId
    );

    try {
      await deleteBudget(
        budgetId
      );

      await refreshFinanceData();

      await performFinanceHaptic(
        'success'
      );
    } catch (error) {
      console.error(
        'Could not delete budget:',
        error
      );

      Alert.alert(
        'Budget konnte nicht entfernt werden',

        'Bitte versuche es erneut.'
      );
    } finally {
      setDeletingBudgetId(
        null
      );
    }
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
            INTELLIGENTE PLANUNG
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
            Planung
          </Text>

          <View
            style={{
              marginTop:
                spacing.xxl,

              gap:
                spacing.md,
            }}
          >
            <FinanceCard>
              <FinanceSkeleton
                width="50%"

                height={13}
              />

              <FinanceSkeleton
                width="65%"

                height={34}

                style={{
                  marginTop:
                    spacing.md,
                }}
              />
            </FinanceCard>

            <FinanceCard>
              <FinanceSkeletonRow />

              <FinanceSkeletonRow />
            </FinanceCard>
          </View>

          <FinanceLoadingState
            label="Planung wird aufgebaut…"

            style={{
              marginTop:
                spacing.xxxl,
            }}
          />
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
        contentContainerStyle={{
          paddingHorizontal:
            spacing.lg,

          paddingTop:
            spacing.xl,

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
              INTELLIGENTE PLANUNG
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
              Planung
            </Text>
          </View>

          <FinancePressable
            accessibilityRole="button"

            accessibilityLabel="Planung aktualisieren"

            onPress={() => {
              void refreshFinanceData({
                forceSync:
                  true,
              });
            }}

            disabled={
              isRefreshing
            }

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

        <FinanceCard
          style={{
            marginTop:
              spacing.xxl,
          }}
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
            Monatsüberschuss bisher
          </Text>

          <MoneyText
            amountMinor={
              insights.cashflowMinor
            }

            size="xl"

            tone="auto"

            style={{
              marginTop:
                spacing.xs,
            }}
          />

          <View
            style={[
              styles.heroStats,

              {
                marginTop:
                  spacing.xl,

                gap:
                  spacing.sm,
              },
            ]}
          >
            <MiniStat
              label="Einnahmen"

              amountMinor={
                insights.incomeMinor
              }

              tone="positive"

              forceSign="positive"
            />

            <MiniStat
              label="Ausgaben"

              amountMinor={
                insights.expensesMinor
              }

              tone="negative"

              forceSign="negative"
            />

            <MiniStat
              label="Fixkosten"

              amountMinor={
                insights.recurringExpenseMinor
              }

              tone="neutral"
            />
          </View>
        </FinanceCard>

        <View
          style={[
            styles.sectionHeader,

            {
              marginTop:
                spacing.xxxl,

              marginBottom:
                spacing.md,
            },
          ]}
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
              Budgets
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
              Lokal gespeichert · monatlich
            </Text>
          </View>

          <Text
            style={[
              typography.caption,

              {
                color:
                  colors.textMuted,
              },
            ]}
          >
            {budgets.length}
          </Text>
        </View>

        {insights.budgetInsights.map(
          (
            item
          ) => {
            const progressPercent =
              Math.round(
                item.progress *
                  100
              );

            const progressWidth =
              `${Math.max(
                2,
                progressPercent
              )}%` as `${number}%`;

            return (
              <FinanceCard
                key={
                  item.budget.id
                }
                style={{
                  marginBottom:
                    spacing.sm,
                }}
              >
                <View
                  style={
                    styles.budgetHeader
                  }
                >
                  <View
                    style={
                      styles.budgetText
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
                      {item.categoryName}
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
                      {formatMinorUnits(
                        item.spentMinor,
                        'EUR'
                      )}
                      {' von '}
                      {formatMinorUnits(
                        item.budget.amountMinor,
                        'EUR'
                      )}
                    </Text>
                  </View>

                  <Text
                    style={[
                      typography.smallMedium,

                      {
                        color:
                          item.progress >=
                          1
                            ? colors.negative
                            : colors.text,
                      },
                    ]}
                  >
                    {progressPercent} %
                  </Text>
                </View>

                <View
                  style={[
                    styles.progressTrack,

                    {
                      backgroundColor:
                        colors.surfaceSecondary,

                      marginTop:
                        spacing.lg,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.progressFill,

                      {
                        width:
                          progressWidth,

                        backgroundColor:
                          item.progress >=
                          1
                            ? colors.negative
                            : colors.primary,
                      },
                    ]}
                  />
                </View>

                <View
                  style={[
                    styles.budgetFooter,

                    {
                      marginTop:
                        spacing.md,
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.caption,

                      {
                        color:
                          colors.textSecondary,
                      },
                    ]}
                  >
                    {item.remainingMinor >=
                    0
                      ? `${formatMinorUnits(
                          item.remainingMinor,
                          'EUR'
                        )} übrig`
                      : `${formatMinorUnits(
                          Math.abs(
                            item.remainingMinor
                          ),
                          'EUR'
                        )} darüber`}
                  </Text>

                  <FinancePressable
                    accessibilityRole="button"

                    accessibilityLabel="Budget entfernen"

                    onPress={() => {
                      requestDeleteBudget(
                        item.budget.id,
                        item.categoryName
                      );
                    }}

                    disabled={
                      deletingBudgetId ===
                      item.budget.id
                    }

                    intent="destructive"

                    contentStyle={
                      styles.inlineAction
                    }
                  >
                    {deletingBudgetId ===
                    item.budget.id ? (
                      <ActivityIndicator
                        size="small"

                        color={
                          colors.negative
                        }
                      />
                    ) : (
                      <Text
                        style={[
                          typography.smallMedium,

                          {
                            color:
                              colors.negative,
                          },
                        ]}
                      >
                        Entfernen
                      </Text>
                    )}
                  </FinancePressable>
                </View>
              </FinanceCard>
            );
          }
        )}

        {budgetSuggestions.length >
          0 && (
          <FinanceCard
            style={{
              marginTop:
                budgets.length >
                0
                  ? spacing.sm
                  : 0,
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
            >
              Budget-Vorschläge
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
              Basierend auf deinen Ausgaben dieses Monats, mit einem kleinen Puffer. Du entscheidest selbst, ob ein Vorschlag gespeichert wird.
            </Text>

            <View
              style={{
                marginTop:
                  spacing.lg,
              }}
            >
              {budgetSuggestions.map(
                (
                  suggestion,
                  index
                ) => {
                  const suggestedMinor =
                    createSuggestedBudgetMinor(
                      suggestion.amountMinor
                    );

                  return (
                    <View
                      key={
                        suggestion.categoryId
                      }
                    >
                      <View
                        style={
                          styles.suggestionRow
                        }
                      >
                        <View
                          style={
                            styles.suggestionText
                          }
                        >
                          <Text
                            style={[
                              typography.smallMedium,

                              {
                                color:
                                  colors.text,
                              },
                            ]}
                          >
                            {suggestion.icon
                              ? `${suggestion.icon} `
                              : ''}

                            {suggestion.name}
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
                            Vorschlag{' '}

                            {formatMinorUnits(
                              suggestedMinor,
                              'EUR'
                            )}
                          </Text>
                        </View>

                        <FinanceButton
                          label="Übernehmen"

                          loading={
                            savingCategoryId ===
                            suggestion.categoryId
                          }

                          disabled={
                            savingCategoryId !==
                              null &&

                            savingCategoryId !==
                              suggestion.categoryId
                          }

                          onPress={() => {
                            void acceptBudgetSuggestion(
                              suggestion
                            );
                          }}

                          style={
                            styles.compactButton
                          }
                        />
                      </View>

                      {index <
                        budgetSuggestions.length -
                          1 && (
                        <View
                          style={[
                            styles.divider,

                            {
                              backgroundColor:
                                colors.border,

                              marginVertical:
                                spacing.md,
                            },
                          ]}
                        />
                      )}
                    </View>
                  );
                }
              )}
            </View>
          </FinanceCard>
        )}

        <View
          style={[
            styles.sectionHeader,

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
            Ausgaben nach Kategorie
          </Text>

          <Text
            style={[
              typography.caption,

              {
                color:
                  colors.textMuted,
              },
            ]}
          >
            Monat
          </Text>
        </View>

        <FinanceCard>
          {insights.categorySpending.length ===
          0 ? (
            <Text
              style={[
                typography.small,

                {
                  color:
                    colors.textSecondary,
                },
              ]}
            >
              Noch keine Ausgaben für diesen Monat.
            </Text>
          ) : (
            insights.categorySpending.map(
              (
                category,
                index
              ) => {
                const width =
                  `${Math.max(
                    3,

                    Math.round(
                      category.share *
                        100
                    )
                  )}%` as `${number}%`;

                return (
                  <View
                    key={
                      category.categoryId
                    }
                  >
                    <View
                      style={
                        styles.categoryHeader
                      }
                    >
                      <View
                        style={
                          styles.categoryLabel
                        }
                      >
                        <View
                          style={[
                            styles.categoryIcon,

                            {
                              backgroundColor:
                                colors.primarySoft,

                              borderRadius:
                                radius.md,
                            },
                          ]}
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
                            {category.icon ??
                              '·'}
                          </Text>
                        </View>

                        <View>
                          <Text
                            style={[
                              typography.smallMedium,

                              {
                                color:
                                  colors.text,
                              },
                            ]}
                          >
                            {category.name}
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
                            {category.transactionCount}{' '}

                            {category.transactionCount ===
                            1
                              ? 'Umsatz'
                              : 'Umsätze'}

                            {' · '}

                            {percentageLabel(
                              category.share
                            )}
                          </Text>
                        </View>
                      </View>

                      <MoneyText
                        amountMinor={
                          category.amountMinor
                        }

                        size="s"
                      />
                    </View>
                    <View
                      style={[
                        styles.categoryTrack,

                        {
                          backgroundColor:
                            colors.surfaceSecondary,

                          marginTop:
                            spacing.sm,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.categoryFill,

                          {
                            width,

                            backgroundColor:
                              colors.primary,
                          },
                        ]}
                      />
                    </View>

                    {index <
                      insights.categorySpending.length -
                        1 && (
                      <View
                        style={{
                          height:
                            spacing.lg,
                        }}
                      />
                    )}
                  </View>
                );
              }
            )
          )}
        </FinanceCard>

        <View
          style={[
            styles.sectionHeader,

            {
              marginTop:
                spacing.xxxl,

              marginBottom:
                spacing.md,
            },
          ]}
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
              Wiederkehrende Kosten
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
              Aus als regelmäßig markierten Umsätzen
            </Text>
          </View>

          <MoneyText
            amountMinor={
              insights.recurringExpenseMinor
            }

            size="m"
          />
        </View>

        <FinanceCard
          padded={
            false
          }
        >
          {recurringTransactions.length ===
          0 ? (
            <FinanceEmptyState
              title="Noch keine wiederkehrenden Kosten"

              description="Sobald wiederkehrende Zahlungen erkannt werden, erscheinen sie hier."

              style={{
                margin:
                  spacing.lg,
              }}
            />
          ) : (
            recurringTransactions.map(
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
                    recurringTransactions.length -
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
            )
          )}
        </FinanceCard>

        <View
          style={[
            styles.insightGrid,

            {
              gap:
                spacing.md,

              marginTop:
                spacing.xxxl,
            },
          ]}
        >
          <FinanceCard
            style={
              styles.insightCard
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
              KATEGORISIERT
            </Text>

            <Text
              style={[
                typography.title,

                {
                  color:
                    colors.text,

                  marginTop:
                    spacing.sm,
                },
              ]}
            >
              {percentageLabel(
                insights.classificationRate
              )}
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
              {insights.uncategorizedExpenseCount}{' '}
              offen
            </Text>
          </FinanceCard>

          <FinanceCard
            style={
              styles.insightCard
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
              TOP-AUSGABE
            </Text>

            <Text
              numberOfLines={
                1
              }
              style={[
                typography.bodyMedium,

                {
                  color:
                    colors.text,

                  marginTop:
                    spacing.sm,
                },
              ]}
            >
              {insights.topExpense
                ? insights.topExpense
                    .counterpartyName ??
                  insights.topExpense
                    .description
                : '—'}
            </Text>

            {insights.topExpense ? (
              <MoneyText
                amountMinor={
                  insights.topExpense
                    .amountMinor
                }

                currency={
                  insights.topExpense
                    .currency
                }

                size="s"

                style={{
                  marginTop:
                    spacing.xs,
                }}
              />
            ) : (
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
                Keine Ausgabe
              </Text>
            )}
          </FinanceCard>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type MiniStatProps = {
  label:
    string;

  amountMinor:
    number;

  tone:
    'positive'
    | 'negative'
    | 'neutral';

  forceSign?:
    'positive'
    | 'negative'
    | null;
};

function MiniStat({
  label,
  amountMinor,
  tone,
  forceSign,
}: MiniStatProps) {
  const {
    colors,
    radius,
    spacing,
    typography,
  } =
    useFinanceTheme();

  return (
    <View
      style={[
        styles.miniStat,

        {
          backgroundColor:
            colors.surfaceSecondary,

          borderRadius:
            radius.lg,

          padding:
            spacing.md,
        },
      ]}
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
        {label}
      </Text>

      <MoneyText
        amountMinor={
          amountMinor
        }

        size="s"

        tone={
          tone
        }

        forceSign={
          forceSign ??
          null
        }

        style={{
          marginTop:
            spacing.xs,
        }}
      />
    </View>
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
        StyleSheet.hairlineWidth,
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

    heroStats: {
      flexDirection:
        'row',
    },

    miniStat: {
      flex:
        1,

      minWidth:
        0,
    },

    sectionHeader: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',
    },

    budgetHeader: {
      flexDirection:
        'row',

      alignItems:
        'flex-start',

      justifyContent:
        'space-between',
    },

    budgetText: {
      flex:
        1,

      marginRight:
        12,
    },

    progressTrack: {
      height:
        7,

      borderRadius:
        4,

      overflow:
        'hidden',
    },

    progressFill: {
      height:
        '100%',

      borderRadius:
        4,
    },

    budgetFooter: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',
    },

    inlineAction: {
      minHeight:
        36,

      paddingHorizontal:
        8,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    suggestionRow: {
      flexDirection:
        'row',

      alignItems:
        'center',
    },

    suggestionText: {
      flex:
        1,

      marginRight:
        12,
    },

    compactButton: {
      minWidth:
        116,
    },

    divider: {
      height:
        StyleSheet.hairlineWidth,

      width:
        '100%',
    },

    categoryHeader: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',
    },

    categoryLabel: {
      flexDirection:
        'row',

      alignItems:
        'center',

      flex:
        1,

      marginRight:
        12,

      gap:
        10,
    },

    categoryIcon: {
      width:
        36,

      height:
        36,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    categoryTrack: {
      height:
        5,

      borderRadius:
        3,

      overflow:
        'hidden',
    },

    categoryFill: {
      height:
        '100%',

      borderRadius:
        3,
    },

    transactionDivider: {
      height:
        StyleSheet.hairlineWidth,

      marginLeft:
        78,
    },

    insightGrid: {
      flexDirection:
        'row',
    },

    insightCard: {
      flex:
        1,

      minWidth:
        0,
    },
  });