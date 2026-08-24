import type { PropsWithChildren } from 'react';

import {
    StyleSheet,
    View,
    type StyleProp,
    type ViewStyle,
} from 'react-native';

import {
    useFinanceTheme,
} from '@/hooks/use-finance-theme';

type FinanceCardVariant =
  | 'default'
  | 'elevated'
  | 'highlight'
  | 'danger';

type FinanceCardProps = PropsWithChildren<{
  style?:
    StyleProp<ViewStyle>;

  padded?:
    boolean;

  variant?:
    FinanceCardVariant;
}>;

/**
 * Zentrale Karten-Fläche.
 *
 * AMOLED-Hierarchie entsteht bewusst
 * über Border + leicht abgestufte
 * Surface-Farben, nicht über Schatten.
 */
export function FinanceCard({
  children,

  style,

  padded = true,

  variant = 'default',
}: FinanceCardProps) {
  const {
    colors,
    radius,
    spacing,
  } =
    useFinanceTheme();

  const backgroundColor =
    variant === 'elevated'
      ? colors.surfaceElevated

      : variant === 'highlight'
        ? colors.primarySoft

        : variant === 'danger'
          ? colors.negativeSoft

          : colors.surface;

  const borderColor =
    variant === 'highlight'
      ? colors.primary

      : variant === 'danger'
        ? colors.negative

        : variant === 'elevated'
          ? colors.borderStrong

          : colors.border;

  return (
    <View
      style={[
        styles.base,

        {
          backgroundColor,

          borderColor,

          borderRadius:
            radius.xxl,

          padding:
            padded
              ? spacing.xl
              : 0,
        },

        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles =
  StyleSheet.create({
    base: {
      width: '100%',

      borderWidth:
        StyleSheet.hairlineWidth,
    },
  });
