import { StyleSheet, Text, View } from 'react-native';

import { useFinanceTheme } from '@/hooks/use-finance-theme';

type Props = {
  label?: string;
  tone?: 'accent' | 'muted';
};

/** Dezente Premium-Kennzeichnung. Kein Schloss-Emoji, kein Rot, keine Panik. */
export function PremiumBadge({ label = 'Premium', tone = 'accent' }: Props) {
  const { colors, radius, typography } = useFinanceTheme();
  return (
    <View
      style={[
        styles.badge,
        {
          borderRadius: radius.sm,
          backgroundColor: colors.surfaceInteractive,
        },
      ]}
    >
      <Text
        style={[
          typography.caption,
          { color: tone === 'accent' ? colors.primary : colors.textMuted },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
});
