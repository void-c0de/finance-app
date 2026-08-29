import {
    StyleSheet,
    Text,
    View,
    type StyleProp,
    type ViewStyle,
} from 'react-native';

import {
    FinancePressable,
} from '@/components/interaction/FinancePressable';

import {
    MoneyText,
} from '@/components/finance/MoneyText';

import {
    buildDisplayTitle,
} from '@/services/merchantNormalization';

import {
    useFinanceTheme,
} from '@/hooks/use-finance-theme';

import type {
    Transaction,
} from '@/types/finance';

type TransactionRowProps = {
  transaction:
    Transaction;

  accountName?:
    string;

  showAccountName?:
    boolean;

  onPress?:
    () => void;

  style?:
    StyleProp<ViewStyle>;
};

function formatBookingDate(
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
        day:
          '2-digit',

        month:
          'short',

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

export function getTransactionTitle(
  transaction:
    Transaction
): string {
  return buildDisplayTitle(
    transaction.counterpartyName,
    transaction.description,
  );
}

/**
 * Erstes aussagekräftiges Zeichen des Titels als Avatar-Initiale.
 * Deutlich wiedererkennbarer als ein generisches Richtungssymbol und
 * braucht keine Icon-Bibliothek.
 */
export function initialFor(title: string): string {
  const match = title.match(/\p{L}|\p{N}/u);
  return match ? match[0].toUpperCase() : '•';
}

export function TransactionRow({
  transaction,

  accountName,

  showAccountName =
    true,

  onPress,

  style,
}: TransactionRowProps) {
  const {
    colors,
    radius,
    spacing,
    typography,
  } =
    useFinanceTheme();

  const isIncome =
    transaction.direction ===
    'income';

  const title =
    getTransactionTitle(
      transaction
    );

  const content = (
    <View
      style={[
        styles.row,

        {
          paddingHorizontal:
            spacing.xl,

          paddingVertical:
            spacing.lg,
        },

        style,
      ]}
    >
      <View
        style={[
          styles.icon,

          {
            backgroundColor:
              isIncome
                ? colors.positiveSoft
                : colors.surfaceSecondary,

            borderRadius:
              radius.lg,
          },
        ]}
      >
        <Text
          style={[
            styles.iconText,

            {
              color:
                isIncome
                  ? colors.positive
                  : colors.textSecondary,
            },
          ]}
        >
          {initialFor(title)}
        </Text>
      </View>

      <View
        style={
          styles.textColumn
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
          {title}
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
          {formatBookingDate(
            transaction.bookingDate
          )}

          {transaction.bookingStatus ===
          'pending'
            ? ' · Vorgemerkt'
            : ''}

          {showAccountName &&
          accountName
            ? ` · ${accountName}`
            : ''}
        </Text>
      </View>

      <View
        style={
          styles.amountColumn
        }
      >
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
              : 'negative'
          }
          align="right"
        />

        {transaction.isRecurring && (
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
            regelmäßig
          </Text>
        )}
      </View>
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <FinancePressable
      accessibilityRole="button"

      onPress={
        onPress
      }

      hapticFeedback={
        false
      }

      feedbackVariant="subtle"

      feedbackColor={
        isIncome
          ? colors.positive
          : colors.primary
      }

      tapScale={
        0.992
      }
    >
      {content}
    </FinancePressable>
  );
}

const styles =
  StyleSheet.create({
    row: {
      flexDirection:
        'row',

      alignItems:
        'center',
    },

    icon: {
      width:
        46,

      height:
        46,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    iconText: {
      fontSize:
        18,

      fontWeight:
        '700',
    },

    textColumn: {
      flex:
        1,

      marginHorizontal:
        12,
    },

    amountColumn: {
      alignItems:
        'flex-end',

      maxWidth:
        135,
    },
  });
