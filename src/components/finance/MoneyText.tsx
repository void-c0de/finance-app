import {
    StyleSheet,
    Text,
    type StyleProp,
    type TextStyle,
} from 'react-native';

import {
    formatMinorUnits,
} from '@/core/money';

import {
    useFinanceTheme,
} from '@/hooks/use-finance-theme';

type MoneyTextSize =
  | 'xl'
  | 'l'
  | 'm'
  | 's';

type MoneyTextTone =
  /**
   * Farbe folgt dem Vorzeichen:
   * positiv -> positive, sonst Text.
   */
  | 'auto'

  /**
   * Immer neutrale Textfarbe.
   */
  | 'neutral'

  /**
   * Explizit positiv (Einnahmen).
   */
  | 'positive'

  /**
   * Explizit negativ (Ausgaben).
   */
  | 'negative';

type MoneyTextProps = {
  amountMinor:
    number;

  currency?:
    string;

  size?:
    MoneyTextSize;

  tone?:
    MoneyTextTone;

  /**
   * Erzwingt ein Vorzeichen
   * (z. B. '+' bei Einnahmen),
   * unabhängig vom gespeicherten
   * Vorzeichen.
   */
  forceSign?:
    'positive'
    | 'negative'
    | null;

  align?:
    'left'
    | 'right'
    | 'center';

  style?:
    StyleProp<TextStyle>;
};

const SIZE_TO_TYPOGRAPHY = {
  xl: 'amountXL',
  l: 'amountL',
  m: 'amountM',
  s: 'amountS',
} as const;

/**
 * Zentrale Geld-Darstellung.
 *
 * - konsistente Formatierung über core/money
 * - tabellarische Ziffern
 * - zentrale Ton-Policy
 */
export function MoneyText({
  amountMinor,

  currency = 'EUR',

  size = 'm',

  tone = 'neutral',

  forceSign = null,

  align = 'left',

  style,
}: MoneyTextProps) {
  const {
    colors,
    typography,
  } =
    useFinanceTheme();

  const isNegativeValue =
    amountMinor < 0;

  const magnitude =
    forceSign === 'positive'
      ? Math.abs(
          amountMinor
        )

      : forceSign === 'negative'
        ? -Math.abs(
            amountMinor
          )

        : amountMinor;

  const prefix =
    forceSign === 'positive' &&
      !isNegativeValue
      ? '+'

      : '';

  const formatted =
    `${prefix}${formatMinorUnits(
      magnitude,
      currency
    )}`;

  const color =
    tone === 'positive'
      ? colors.positive

      : tone === 'negative'
        ? colors.negative

        : tone === 'auto'
          ? amountMinor > 0
            ? colors.positive

            : amountMinor < 0
              ? colors.negative

              : colors.text

          : colors.text;

  return (
    <Text
      style={[
        typography[
          SIZE_TO_TYPOGRAPHY[size]
        ],

        styles.tabular,

        {
          color,

          textAlign: align,
        },

        style,
      ]}
    >
      {formatted}
    </Text>
  );
}

const styles =
  StyleSheet.create({
    tabular: {
      fontVariant: [
        'tabular-nums',
      ],
    },
  });
