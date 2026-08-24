import {
    router,
    useLocalSearchParams,
} from 'expo-router';

import {
    useMemo,
} from 'react';

import {
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
    FinancePressable,
} from '@/components/interaction/FinancePressable';

import {
    useFinanceTheme,
} from '@/hooks/use-finance-theme';

import {
    useFinanceStore,
} from '@/stores/useFinanceStore';

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

function formatLongDate(
  bookingDate:
    string
): string {
  const parts =
    bookingDate.split(
      '-'
    );

  const year =
    Number(
      parts[0]
    );

  const month =
    Number(
      parts[1]
    );

  const day =
    Number(
      parts[2]
    );

  if (
    !Number.isInteger(
      year
    ) ||

    !Number.isInteger(
      month
    ) ||

    !Number.isInteger(
      day
    )
  ) {
    return bookingDate;
  }

  return new Intl
    .DateTimeFormat(
      'de-DE',
      {
        weekday:
          'long',

        day:
          '2-digit',

        month:
          'long',

        year:
          'numeric',
      }
    )
    .format(
      new Date(
        year,
        month - 1,
        day
      )
    );
}

export default function TransactionDetailScreen() {
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

  const transactionId =
    resolveParam(
      params.id
    );

  const transactions =
    useFinanceStore(
      (state) =>
        state.transactions
    );

  const accounts =
    useFinanceStore(
      (state) =>
        state.accounts
    );

  const transaction =
    useMemo(
      () =>
        transactions.find(
          (item) =>
            item.id ===
            transactionId
        ) ??
        null,

      [
        transactionId,
        transactions,
      ]
    );

  const account =
    useMemo(
      () =>
        transaction
          ? accounts.find(
              (item) =>
                item.id ===
                transaction.accountId
            ) ??
            null
          : null,

      [
        accounts,
        transaction,
      ]
    );

  if (!transaction) {
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
            Umsatz nicht gefunden
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
            Der ausgewählte Umsatz ist nicht mehr in den lokalen Finanzdaten vorhanden.
          </Text>

          <FinancePressable
            onPress={() =>
              router.back()
            }

            intent="navigation"

            style={{
              marginTop:
                spacing.xxl,
            }}

            contentStyle={
              styles.backTextButton
            }
          >
            <Text
              style={[
                typography.bodyMedium,

                {
                  color:
                    colors.primary,
                },
              ]}
            >
              Zurück
            </Text>
          </FinancePressable>
        </View>
      </SafeAreaView>
    );
  }

  const isIncome =
    transaction.direction ===
    'income';

  const title =
    transaction.counterpartyName ??
    transaction.description;

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
          Umsatzdetails
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
        <View
          style={
            styles.hero
          }
        >
          <View
            style={[
              styles.heroIcon,

              {
                backgroundColor:
                  isIncome
                    ? colors.positiveSoft
                    : colors.surface,

                borderRadius:
                  radius.xxl,
              },
            ]}
          >
            <Text
              style={[
                styles.heroIconText,

                {
                  color:
                    isIncome
                      ? colors.positive
                      : colors.textSecondary,
                },
              ]}
            >
              {isIncome
                ? '↓'
                : '↑'}
            </Text>
          </View>

          <Text
            numberOfLines={
              2
            }

            style={[
              typography.title,

              styles.centerText,

              {
                color:
                  colors.text,

                marginTop:
                  spacing.lg,
              },
            ]}
          >
            {title}
          </Text>

          <MoneyText
            amountMinor={
              transaction.amountMinor
            }

            currency={
              transaction.currency
            }

            size="xl"

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

            align="center"

            style={[
              styles.centerText,

              {
                marginTop:
                  spacing.sm,
              },
            ]}
          />

          <Text
            style={[
              typography.small,

              styles.centerText,

              {
                color:
                  colors.textSecondary,

                marginTop:
                  spacing.sm,
              },
            ]}
          >
            {formatLongDate(
              transaction.bookingDate
            )}
          </Text>
        </View>

        <FinanceCard
          style={{
            marginTop:
              spacing.xxl,
          }}
        >
          <DetailRow
            label="Typ"

            value={
              isIncome
                ? 'Einnahme'
                : 'Ausgabe'
            }
          />

          <DetailDivider />

          <DetailRow
            label="Konto"

            value={
              account?.name ??
              'Unbekanntes Konto'
            }
          />

          <DetailDivider />

          <DetailRow
            label="Bank"

            value={
              account?.institutionName ??
              'Nicht verfügbar'
            }
          />

          <DetailDivider />

          <DetailRow
            label="Beschreibung"

            value={
              transaction.description
            }
          />

          <DetailDivider />

          <DetailRow
            label="Regelmäßig"

            value={
              transaction.isRecurring
                ? 'Ja'
                : 'Nein'
            }
          />

          <DetailDivider />

          <DetailRow
            label="Kategorie"

            value={
              transaction.categoryId
                ? 'Zugeordnet'
                : 'Noch nicht kategorisiert'
            }
          />
        </FinanceCard>

        {(transaction.counterpartyIBAN ||
          transaction.valueDate) && (
          <FinanceCard
            style={{
              marginTop:
                spacing.md,
            }}
          >
            {transaction.valueDate && (
              <>
                <DetailRow
                  label="Wertstellung"

                  value={
                    transaction.valueDate
                  }
                />

                {transaction.counterpartyIBAN && (
                  <DetailDivider />
                )}
              </>
            )}

            {transaction.counterpartyIBAN && (
              <DetailRow
                label="IBAN"

                value={
                  transaction.counterpartyIBAN
                }
              />
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

    hero: {
      alignItems:
        'center',
    },

    heroIcon: {
      width:
        72,

      height:
        72,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    heroIconText: {
      fontSize:
        30,

      fontWeight:
        '800',
    },

    centerText: {
      textAlign:
        'center',
    },

    detailRow: {
      flexDirection:
        'row',

      alignItems:
        'flex-start',

      justifyContent:
        'space-between',
    },

    detailValue: {
      flex:
        1,

      textAlign:
        'right',
    },

    divider: {
      width:
        '100%',

      height:
        StyleSheet
          .hairlineWidth,
    },

    notFound: {
      flex:
        1,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    backTextButton: {
      minHeight:
        44,

      paddingHorizontal:
        18,

      alignItems:
        'center',

      justifyContent:
        'center',
    },
  });