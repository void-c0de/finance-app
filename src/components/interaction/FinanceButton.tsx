import type {
    ReactNode,
} from 'react';

import type {
    PressableProps,
    StyleProp,
    ViewStyle,
} from 'react-native';

import {
    ActivityIndicator,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import {
    FinancePressable,
} from '@/components/interaction/FinancePressable';

import {
    useFinanceTheme,
} from '@/hooks/use-finance-theme';

type FinanceButtonVariant =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'ghost'
  | 'danger';

type FinanceButtonSize =
  | 'small'
  | 'medium'
  | 'large';

type FinanceButtonProps = {
  label:
    string;

  onPress:
    NonNullable<
      PressableProps['onPress']
    >;

  variant?:
    FinanceButtonVariant;

  size?:
    FinanceButtonSize;

  /**
   * Optionales Icon links vom Label.
   */
  icon?:
    ReactNode;

  loading?:
    boolean;

  disabled?:
    boolean;

  style?:
    StyleProp<ViewStyle>;
};

const SIZE_TOKENS: Record<
  FinanceButtonSize,
  {
    minHeight: number;
    contentMinHeight: number;
    paddingHorizontal: number;
  }
> = {
  small: {
    minHeight: 40,
    contentMinHeight: 38,
    paddingHorizontal: 14,
  },

  medium: {
    minHeight: 52,
    contentMinHeight: 50,
    paddingHorizontal: 18,
  },

  large: {
    minHeight: 58,
    contentMinHeight: 56,
    paddingHorizontal: 22,
  },
};

export function FinanceButton({
  label,

  onPress,

  variant =
    'primary',

  size =
    'medium',

  icon,

  loading =
    false,

  disabled =
    false,

  style,
}: FinanceButtonProps) {
  const {
    colors,
    radius,
    spacing,
    typography,
  } = useFinanceTheme();

  const isDisabled =
    disabled ||
    loading;

  const sizeTokens =
    SIZE_TOKENS[size];

  const labelTypography =
    size === 'small'
      ? typography.smallMedium

      : typography.bodyMedium;

  const backgroundColor =
    variant === 'primary'
      ? colors.primary

      : variant === 'danger'
        ? colors.negativeSoft

        : variant === 'secondary'
          ? colors.surface

          : variant === 'tertiary'
            ? colors.surfaceSecondary

            : 'transparent';

  const borderColor =
    variant === 'secondary'
      ? colors.borderStrong

      : 'transparent';

  const textColor =
    variant === 'primary'
      ? colors.textInverse

      : variant === 'danger'
        ? colors.negative

        : variant === 'ghost' ||
            variant === 'tertiary'
          ? colors.primary

          : colors.text;

  return (
    <FinancePressable
      accessibilityRole="button"

      accessibilityLabel={
        label
      }

      accessibilityState={{
        disabled: isDisabled,

        busy: loading,
      }}

      disabled={
        isDisabled
      }

      onPress={
        onPress
      }

      /*
       * FinanceButton = echte Aktion.
       */
      intent="important"

      feedbackColor={
        variant === 'danger'
          ? colors.negative

          : variant === 'primary'
            ? colors.primaryPressed

            : colors.primary
      }

      style={[
        styles.button,

        {
          backgroundColor,

          borderColor,

          borderRadius:
            size === 'small'
              ? radius.md

              : radius.lg,

          opacity:
            isDisabled
              ? 0.55
              : 1,
        },

        style,
      ]}

      contentStyle={[
        styles.content,

        {
          minHeight:
            sizeTokens.contentMinHeight,

          paddingHorizontal:
            sizeTokens.paddingHorizontal,

          gap:
            icon
              ? spacing.sm
              : 0,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={
            textColor
          }

          size="small"
        />
      ) : (
        <>
          {icon && (
            <View
              style={
                styles.iconSlot
              }
            >
              {icon}
            </View>
          )}

          <Text
            style={[
              labelTypography,

              {
                color:
                  textColor,
              },
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </FinancePressable>
  );
}

const styles =
  StyleSheet.create({
    button: {
      alignSelf:
        'flex-start',

      minWidth:
        96,

      borderWidth:
        1,
    },

    content: {
      alignItems:
        'center',

      justifyContent:
        'center',
    },

    iconSlot: {
      alignItems:
        'center',

      justifyContent:
        'center',
    },
  });
