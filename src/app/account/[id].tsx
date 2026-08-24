import {
    type Href,
    router,
    useLocalSearchParams,
} from 'expo-router';

import {
    useMemo,
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
    sortTransactionsNewestFirst,
} from '@/core/finance';

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
    Transaction,
} from '@/types/finance';

function resolveParam(
  value:
    | string
    | string[]
    | undefined
): string | null {
  if (
    Array.isArray(
      value
    )
  ) {
    return (
      value[0] ??
      null
    );
  }

  return (
    value ??
    null
  );
}

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

export default function AccountDetailScreen() {
  const {
    colors,
    radius,
    spacing,
    typography,
  } = useFinanceTheme();

  const params =
    useLocalSearchParams<{
      id?:
        | string
        | string[];
    }>();

  const accountId =
    resolveParam(
      params.id
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

  const [
    isSyncingAccount,
    setIsSyncingAccount,
  ] =
    useState(false);

  const account =
    useMemo(
      () =>
        accounts.find(
          (item) =>
            item.id ===
            accountId
        ) ??
        null,

      [
        accountId,
        accounts,
      ]
    );

  const accountTransactions =
    useMemo(
      () => {
        if (!account) {
          return [];
        }

        return sortTransactionsNewestFirst(
          transactions.filter(
            (transaction) =>
              transaction.accountId ===
              account.id
          )
        );
      },

      [
        account,
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

  async function refreshAccount() {
    if (
      isSyncingAccount
    ) {
      return;
    }

    setIsSyncingAccount(
      true
    );

    try {
      if (
        account?.bankConnectionId
      ) {
        await syncBankConnection(
          account.bankConnectionId
        );

        await refreshFinanceData();

        return;
      }

      await refreshFinanceData({
        forceSync:
          true,
      });
    } catch (error) {
      console.error(
        'Could not refresh account:',
        error
      );

      Alert.alert(
        'Aktualisierung fehlgeschlagen',
        'Das Konto konnte gerade nicht aktualisiert werden.'
      );
    } finally {
      setIsSyncingAccount(
        false
      );
    }
  }

  if (!account) {
    return (
      <SafeAreaView
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
            styles.notFound,

            {
              paddingHorizontal:
                spacing.xxl,
            },
          ]}
        >
          <Text
            style={[
              typography.title,

              {
                color:
                  colors.text,
              },
            ]}
          >
            Konto nicht gefunden
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
            Das Konto ist nicht mehr in deinen lokalen Finanzdaten vorhanden.
          </Text>
        </View>
      </SafeAreaView>
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
          Kontodetails
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

          paddingTop:
            spacing.lg,

          paddingBottom:
            spacing.huge,
        }}
      >
        <FinanceCard>
          <Text
            style={[
              typography.small,

              {
                color:
                  colors.textSecondary,
              },
            ]}
          >
            Aktueller Saldo
          </Text>

          <MoneyText
            amountMinor={
              account.balanceMinor
            }

            currency={
              account.currency
            }

            size="xl"

            style={{
              marginTop:
                spacing.xs,
            }}
          />

          <Text
            style={[
              typography.bodyMedium,

              {
                color:
                  colors.text,

                marginTop:
                  spacing.xl,
              },
            ]}
          >
            {account.name}
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
            {account.institutionName ??
              'Bankkonto'}
          </Text>

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

          <DetailRow
            label="Kontotyp"

            value={
              account.type
            }
          />

          <DetailDivider />

          <DetailRow
            label="Währung"

            value={
              account.currency
            }
          />

          <DetailDivider />

          <DetailRow
            label="IBAN"

            value={
              account.iban ??
              'Nicht verfügbar'
            }
          />

          <DetailDivider />

          <DetailRow
            label="Letzter Sync"

            value={
              formatLastSync(
                account.lastSyncedAt
              )
            }
          />

          <FinanceButton
            label="Jetzt aktualisieren"

            loading={
              isSyncingAccount ||
              isRefreshing
            }

            onPress={() => {
              void refreshAccount();
            }}

            style={{
              width:
                '100%',

              marginTop:
                spacing.xl,
            }}
          />
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

          <Text
            style={[
              typography.caption,

              {
                color:
                  colors.textMuted,
              },
            ]}
          >
            {accountTransactions.length}
          </Text>
        </View>

        {accountTransactions.length ===
        0 ? (
          <FinanceEmptyState
            title="Keine Umsätze"

            description="Für dieses Konto sind aktuell keine Buchungen gespeichert."
          />
        ) : (
          <FinanceCard
            padded={
              false
            }
          >
            {accountTransactions
              .slice(
                0,
                20
              )
              .map(
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

                      showAccountName={
                        false
                      }

                      onPress={() =>
                        openTransaction(
                          transaction
                        )
                      }
                    />

                    {index <
                      Math.min(
                        accountTransactions.length,
                        20
                      ) -
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
      </ScrollView>
    </SafeAreaView>
  );
}

type DetailRowProps = {
  label:
    string;

  value:
    string;
};

function DetailRow({
  label,
  value,
}: DetailRowProps) {
  const {
    colors,
    spacing,
    typography,
  } = useFinanceTheme();

  return (
    <View
      style={
        styles.detailRow
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
        {label}
      </Text>

      <Text
        numberOfLines={
          1
        }

        style={[
          typography.smallMedium,

          styles.detailValue,

          {
            color:
              colors.text,

            marginLeft:
              spacing.lg,
          },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function DetailDivider() {
  const {
    colors,
    spacing,
  } = useFinanceTheme();

  return (
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

    divider: {
      width:
        '100%',

      height:
        StyleSheet
          .hairlineWidth,
    },

    detailRow: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',
    },

    detailValue: {
      flex:
        1,

      textAlign:
        'right',
    },

    sectionHeader: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',
    },

    transactionDivider: {
      height:
        StyleSheet
          .hairlineWidth,

      marginLeft:
        78,
    },

    notFound: {
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
    },
  });