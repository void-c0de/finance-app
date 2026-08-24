import type {
    PropsWithChildren,
    ReactNode,
} from 'react';

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
    useFinanceTheme,
} from '@/hooks/use-finance-theme';

type SettingsRowProps = PropsWithChildren<{
  title:
    string;

  description?:
    string;

  /**
   * Optionale Icon-Fläche links.
   */
  icon?:
    ReactNode;

  /**
   * Rechter Wert (z. B. aktives Theme).
   */
  value?:
    string;

  onPress?:
    () => void;

  /**
   * Zeile zeigt einen Destruktions-Pfad an.
   */
  destructive?:
    boolean;
}>;

/**
 * Wiederverwendbare Einstellungs-Zeile.
 *
 * Navigation -> subtile Rückmeldung ohne Vibration.
 */
export function SettingsRow({
  title,

  description,

  icon,

  value,

  onPress,

  destructive = false,

  children,
}: SettingsRowProps) {
  const {
    colors,
    spacing,
    typography,
  } =
    useFinanceTheme();

  const titleColor =
    destructive
      ? colors.negative

      : colors.text;

  const content = (
    <View
      style={
        styles.row
      }
    >
      {icon ? (
        <View
          style={[
            styles.iconStage,

            {
              backgroundColor:
                destructive
                  ? colors.negativeSoft

                  : colors.surfaceSecondary,

              marginRight:
                spacing.lg,
            },
          ]}
        >
          {icon}
        </View>
      ) : null}

      <View
        style={
          styles.textColumn
        }
      >
        <Text
          style={[
            typography.bodyMedium,

            {
              color: titleColor,
            },
          ]}
        >
          {title}
        </Text>

        {description ? (
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
            {description}
          </Text>
        ) : null}

        {children}
      </View>

      {value ? (
        <Text
          style={[
            typography.smallMedium,

            {
              color: colors.textMuted,

              marginLeft:
                spacing.md,
            },
          ]}
        >
          {value}
        </Text>
      ) : (
        onPress && (
          <Text
            style={[
              styles.chevron,

              {
                color:
                  colors.textMuted,
              },
            ]}
          >
            ›
          </Text>
        )
      )}
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

      intent="navigation"

      feedbackColor={
        destructive
          ? colors.negative

          : undefined
      }

      style={
        styles.pressable as StyleProp<ViewStyle>
      }
    >
      {content}
    </FinancePressable>
  );
}

const styles =
  StyleSheet.create({
    pressable: {
      width: '100%',
    },

    row: {
      minHeight: 68,

      paddingHorizontal: 20,

      paddingVertical: 14,

      flexDirection:
        'row',

      alignItems:
        'center',
    },

    iconStage: {
      width: 40,

      height: 40,

      borderRadius: 12,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    textColumn: {
      flex: 1,
    },

    chevron: {
      fontSize: 28,

      lineHeight: 32,

      fontWeight:
        '300',

      marginLeft: 10,
    },
  });
