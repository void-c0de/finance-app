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

type FinanceErrorStateProps = {
  /**
   * Nutzerfreundliche Nachricht.
   *
   * KEINE technischen Exceptions
   * oder Stacktraces hier anzeigen.
   */
  message?:
    string;

  retryLabel?:
    string;

  onRetry?:
    () => void;

  style?:
    StyleProp<ViewStyle>;
};

/**
 * Zentraler Error-State.
 *
 * Technisches Logging bleibt in der
 * aufrufenden Schicht (console.error),
 * die UI zeigt eine ruhige Nachricht.
 */
export function FinanceErrorState({
  message =
    'Etwas ist schiefgelaufen. Bitte versuche es erneut.',

  retryLabel =
    'Erneut versuchen',

  onRetry,

  style,
}: FinanceErrorStateProps) {
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
            colors.negative,

          backgroundColor:
            colors.negativeSoft,

          borderRadius:
            radius.xl,

          padding:
            spacing.xxl,
        },

        style,
      ]}
    >
      <Text
        style={[
          typography.bodyMedium,

          {
            color: colors.text,
          },
        ]}
      >
        {message}
      </Text>

      {onRetry ? (
        <FinanceButton
          label={
            retryLabel
          }

          size="small"

          variant="secondary"

          onPress={
            onRetry
          }

          style={{
            marginTop:
              spacing.lg,
          }}
        />
      ) : null}
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      width: '100%',

      borderWidth: 1,
    },
  });
