import {
    useEffect,
    useMemo,
    useState,
} from 'react';

import {
    type Href,
    router,
} from 'expo-router';

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
    FinanceCard,
} from '@/components/finance/FinanceCard';

import {
    MoneyText,
} from '@/components/finance/MoneyText';

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
    performFinanceHaptic,
} from '@/services/haptics';

import {
    debugLog,
} from '@/core/debugLog';

import {
    setTransactionCategory,
} from '@/db/repositories/categorization';

import {
    createCategoryRule,
} from '@/db/repositories/categoryRules';

import {
    getTransactionTitle,
} from '@/components/finance/TransactionRow';

import * as Crypto from 'expo-crypto';

import {
    useFinanceTheme,
} from '@/hooks/use-finance-theme';

import {
    useFinanceStore,
} from '@/stores/useFinanceStore';

import {
    hasCapability,
} from '@/services/entitlementCore';

import {
    useProductAccessStore,
} from '@/stores/useProductAccessStore';

export default function UncategorizedScreen() {
  const {
    colors,
    radius,
    spacing,
    typography,
  } =
    useFinanceTheme();

  const transactions =
    useFinanceStore(
      (state) =>
        state.transactions
    );

  const categories =
    useFinanceStore(
      (state) =>
        state.categories
    );

  const refreshFinanceData =
    useFinanceStore(
      (state) =>
        state.refreshFinanceData
    );

  const [
    openTransactionId,
    setOpenTransactionId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    busyId,
    setBusyId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    selectedCategoryId,
    setSelectedCategoryId,
  ] = useState<string | null>(null);

  const access =
    useProductAccessStore(
      (state) => state.access,
    );

  const canCreateRules =
    hasCapability(
      access,
      'advanced_category_rules',
    );

  /*
   * Review-Queue:
   * NULL-Kategorie oder Fallback "Sonstige".
   */
  const queue =
    useMemo(
      () =>
        transactions.filter(
          (transaction) =>
            !transaction.categoryId ||
            transaction.categoryId ===
              'cat-other',
        ),
      [
        transactions,
      ],
    );

  useEffect(() => {
    /*
     * Queue beim Öffnen auffrischen -
     * Auto-Kategorisierung läuft ohnehin
     * im Refresh davor.
     */
  }, []);

  async function apply(
    transactionId:
      string,

    categoryId:
      string,

    options?: {
      alsoCreateRule?:
        boolean;
    },
  ) {
    if (
      busyId
    ) {
      return;
    }

    setBusyId(transactionId);

    void performFinanceHaptic('action');

    try {
      await setTransactionCategory(
        transactionId,

        categoryId,

        options?.alsoCreateRule
          ? 'manual'

          : 'manual',
      );

      if (
        options?.alsoCreateRule
      ) {
        const transaction =
          transactions.find(
            (item) =>
              item.id ===
              transactionId,
          );

        const merchant =
          (
            transaction?.counterpartyName ??
            transaction?.description ??
            ''
          ).trim();

        if (merchant) {
          const id =
            await Crypto.randomUUID();

          await createCategoryRule({
            id,

            name: `${merchant} → ${categoryNameFor(categoryId)}`,

            matchType: 'merchant_contains',

            matchValue: merchant,

            categoryId,

            enabled: true,

            priority: 100,
          });
        }
      }

      await refreshFinanceData();

      await performFinanceHaptic('success');

      setOpenTransactionId(null);
      setSelectedCategoryId(null);
    } catch (error) {
      debugLog.error(
        'CAT',
        'CAT-SAVE-001: Queue-Zuordnung fehlgeschlagen',
        error,
      );

      Alert.alert(
        'Kategorien',
        'Konnte nicht gespeichert werden. Versuch es bitte erneut.',
      );
    } finally {
      setBusyId(null);
    }
  }

  function categoryNameFor(
    categoryId:
      string,
  ): string {
    return (
      categories.find(
        (category) =>
          category.id ===
          categoryId,
      )?.name ??
      categoryId
    );
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
          Kategorisieren
        </Text>

        <View
          style={
            styles.headerSpacer
          }
        />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={
          false
        }

        contentContainerStyle={{
          paddingHorizontal:
            spacing.lg,

          paddingBottom:
            spacing.huge,
        }}
      >
        <Text
          style={[
            typography.screenTitle,

            {
              color:
                colors.text,

              marginTop:
                spacing.sm,
            },
          ]}
        >
          {queue.length ===
          0
            ? 'Alles sortiert'
            : `${queue.length} offen`}
        </Text>

        <Text
          style={[
            typography.body,

            styles.subtitle,

            {
              color:
                colors.textSecondary,

              marginTop:
                spacing.sm,
            },
          ]}
        >
          {queue.length ===
          0
            ? 'Alle Umsätze haben eine passende Kategorie.'
            : 'Wähle für jeden Umsatz die passende Kategorie.'}
        </Text>

        <View
          style={{
            marginTop:
              spacing.xxl,

            gap:
              spacing.md,
          }}
        >
          {queue.length ===
          0 ? (
            <FinanceEmptyState
              title="Nichts zu tun"

              description="Neue unbekannte Händler erscheinen hier automatisch."
            />
          ) : (
            queue.map(
              (
                transaction,
              ) => {
                const isOpen =
                  openTransactionId ===
                  transaction.id;

                return (
                  <FinanceCard
                    key={
                      transaction.id
                    }

                    variant={
                      'default' as const
                    }
                  >
                    <View
                      style={
                        styles.rowTop
                      }
                    >
                      <View
                        style={
                          styles.rowText
                        }
                      >
                        <Text
                          numberOfLines={1}

                          style={[
                            typography.bodyMedium,

                            {
                              color:
                                colors.text,
                            },
                          ]}
                        >
                          {getTransactionTitle(
                            transaction,
                          )}
                        </Text>

                        <Text
                          numberOfLines={1}

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

                        size="m"

                        tone={
                          transaction.direction ===
                            'income'
                            ? 'positive'

                            : 'neutral'
                        }

                        forceSign={
                          transaction.direction ===
                            'income'
                            ? 'positive'

                            : null
                        }
                      />
                    </View>

                    {!isOpen ? (
                      <FinanceButton
                        label="Kategorie wählen"

                        size="small"

                        variant="secondary"

                        onPress={() => {
                          void performFinanceHaptic('selection');

                          setOpenTransactionId(
                            transaction.id,
                          );

                          setSelectedCategoryId(null);
                        }}

                        style={{
                          alignSelf:
                            'flex-start',

                          marginTop:
                            spacing.lg,
                        }}
                      />
                    ) : (
                      <View
                        style={{
                          marginTop:
                            spacing.lg,

                          gap:
                            spacing.xs,
                        }}
                      >
                        {categories.map(
                          (
                            category,
                          ) => (
                            <FinancePressable
                              key={category.id}

                              accessibilityRole="button"

                              onPress={() => {
                                void performFinanceHaptic(
                                  'selection',
                                );

                                setSelectedCategoryId(
                                  category.id,
                                );
                              }}

                              intent="navigation"

                              disabled={
                                busyId ===
                                transaction.id
                              }

                              style={[
                                styles.categoryRow,

                                {
                                  borderBottomColor:
                                    colors.border,

                                  backgroundColor:
                                    selectedCategoryId === category.id
                                      ? colors.surfaceInteractive
                                      : 'transparent',
                                },
                              ]}

                              contentStyle={
                                styles.categoryRowContent
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
                                {category.icon
                                  ? `${category.icon} `
                                  : ''}

                                {category.name}
                              </Text>
                            </FinancePressable>
                          ),
                        )}

                        {selectedCategoryId ? (
                          <View
                            style={{
                              gap: spacing.sm,
                              marginTop: spacing.md,
                            }}
                          >
                            <Text
                              style={[
                                typography.caption,
                                { color: colors.textSecondary },
                              ]}
                            >
                              {categoryNameFor(selectedCategoryId)} ausgewählt
                            </Text>

                            <FinanceButton
                              label="Nur diesen Umsatz"
                              size="small"
                              loading={busyId === transaction.id}
                              onPress={() => {
                                void apply(
                                  transaction.id,
                                  selectedCategoryId,
                                );
                              }}
                            />

                            {canCreateRules ? (
                              <FinanceButton
                                label="Für diesen Händler merken"
                                size="small"
                                variant="secondary"
                                disabled={busyId === transaction.id}
                                onPress={() => {
                                  void apply(
                                    transaction.id,
                                    selectedCategoryId,
                                    { alsoCreateRule: true },
                                  );
                                }}
                              />
                            ) : (
                              <FinancePressable
                                accessibilityRole="button"
                                accessibilityLabel="Premium für automatische Händlerregeln ansehen"
                                onPress={() => router.push('/premium' as Href)}
                                intent="navigation"
                                style={[
                                  styles.premiumHint,
                                  {
                                    borderColor: colors.border,
                                    borderRadius: radius.md,
                                  },
                                ]}
                                contentStyle={styles.premiumHintContent}
                              >
                                <Text
                                  style={[
                                    typography.caption,
                                    { color: colors.textSecondary },
                                  ]}
                                >
                                  Premium merkt sich den Händler und kategorisiert künftige Umsätze automatisch.
                                </Text>
                              </FinancePressable>
                            )}
                          </View>
                        ) : null}

                        <FinanceButton
                          label="Ohne Kategorie lassen"

                          size="small"

                          variant="ghost"

                          loading={
                            busyId ===
                            transaction.id
                          }

                          onPress={() => {
                            void apply(
                              transaction.id,
                              'cat-other',
                            );
                          }}

                          style={{
                            alignSelf:
                              'flex-start',

                            marginTop:
                              spacing.sm,
                          }}
                        />
                      </View>
                    )}
                  </FinanceCard>
                );
              },
            )
          )}
        </View>
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

    headerSpacer: {
      width:
        42,

      height:
        42,
    },

    subtitle: {
      maxWidth:
        320,
    },

    rowTop: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',

      gap:
        12,
    },

    rowText: {
      flex:
        1,
    },

    categoryRow: {
      minHeight:
        44,

      justifyContent:
        'center',

      borderBottomWidth:
        StyleSheet.hairlineWidth,
    },

    categoryRowContent: {
      minHeight:
        42,
    },

    premiumHint: {
      borderWidth: StyleSheet.hairlineWidth,
    },

    premiumHintContent: {
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
  });
