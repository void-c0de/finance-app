import {
    ActivityIndicator,
    StyleSheet,
    Text,
    View,
    type StyleProp,
    type ViewStyle,
} from 'react-native';

import {
    useFinanceTheme,
} from '@/hooks/use-finance-theme';

type FinanceLoadingStateProps = {
  label?:
    string;

  style?:
    StyleProp<ViewStyle>;
};

/**
 * Zentraler Lade-Zustand.
 *
 * Kein Fake-Loader: nur für
 * real laufende Ladevorgänge nutzen.
 */
export function FinanceLoadingState({
  label,

  style,
}: FinanceLoadingStateProps) {
  const {
    colors,
    spacing,
    typography,
  } =
    useFinanceTheme();

  return (
    <View
      style={[
        styles.container,

        style,
      ]}
    >
      <ActivityIndicator
        color={
          colors.primary
        }

        size="small"
      />

      {label ? (
        <Text
          style={[
            typography.small,

            {
              color:
                colors.textSecondary,

              marginTop:
                spacing.md,
            },
          ]}
        >
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      width: '100%',

      alignItems:
        'center',

      justifyContent:
        'center',

      paddingVertical:
        28,
    },
  });
