import type { PropsWithChildren } from 'react';

import {
    StyleSheet,
    Text,
    View,
    type StyleProp,
    type ViewStyle,
} from 'react-native';

import {
    FinanceButton,
} from '@/components/interaction/FinanceButton';

import {
    useFinanceTheme,
} from '@/hooks/use-finance-theme';

type FinanceEmptyStateProps = PropsWithChildren<{
  title:
    string;

  description?:
    string;

  actionLabel?:
    string;

  onAction?:
    () => void;

  style?:
    StyleProp<ViewStyle>;
}>;

/**
 * Zentraler Empty-State.
 *
 * Erklärt kurz: was fehlt,
 * warum es relevant ist und
 * was der nächste Schritt ist.
 */
export function FinanceEmptyState({
  title,

  description,

  actionLabel,

  onAction,

  style,

  children,
}: FinanceEmptyStateProps) {
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
        styles.container,

        {
          borderColor:
            colors.border,

          backgroundColor:
            colors.surfaceSecondary,

          borderRadius:
            radius.xl,

          padding:
            spacing.xxl,
        },

        style,
      ]}
    >
      <View
        style={[
          styles.glyphStage,

          {
            backgroundColor:
              colors.surface,

            borderColor:
              colors.border,

            borderRadius:
              radius.round,
          },
        ]}
      >
        <Text
          style={[
            styles.glyph,

            {
              color:
                colors.textMuted,
            },
          ]}
        >
          ◌
        </Text>
      </View>

      <Text
        style={[
          typography.bodyMedium,

          styles.title,

          {
            color: colors.text,

            marginTop:
              spacing.lg,
          },
        ]}
      >
        {title}
      </Text>

      {description ? (
        <Text
          style={[
            typography.small,

            styles.description,

            {
              color:
                colors.textSecondary,

              marginTop:
                spacing.sm,
            },
          ]}
        >
          {description}
        </Text>
      ) : null}

      {actionLabel && onAction ? (
        <FinanceButton
          label={
            actionLabel
          }

          size="small"

          variant="secondary"

          onPress={
            onAction
          }

          style={{
            marginTop:
              spacing.xl,
          }}
        />
      ) : null}

      {children}
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      width: '100%',

      alignItems:
        'center',

      borderWidth:
        StyleSheet.hairlineWidth,
    },

    glyphStage: {
      width: 56,

      height: 56,

      alignItems:
        'center',

      justifyContent:
        'center',

      borderWidth:
        StyleSheet.hairlineWidth,
    },

    glyph: {
      fontSize: 26,

      lineHeight: 30,

      fontWeight:
        '300',
    },

    title: {
      textAlign:
        'center',
    },

    description: {
      textAlign:
        'center',

      maxWidth: 280,
    },
  });
