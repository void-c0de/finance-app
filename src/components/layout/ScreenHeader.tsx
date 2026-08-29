import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { router } from 'expo-router';

import { FinancePressable } from '@/components/interaction/FinancePressable';
import { useFinanceTheme } from '@/hooks/use-finance-theme';

type ScreenHeaderProps = {
  title: string;
  /** Hidden when false (e.g. a modal-style screen with its own dismiss). */
  showBack?: boolean;
  /** Overrides the default `router.back()`. */
  onBack?: () => void;
  /** Optional trailing control, right-aligned. */
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * The single header pattern for pushed screens: a circular back control, a
 * centred title, and a balanced trailing slot. Replaces the ad-hoc
 * `<FinanceButton label="‹" variant="ghost" />` headers that rendered a thin,
 * low-contrast guillemet.
 */
export function ScreenHeader({
  title,
  showBack = true,
  onBack,
  trailing,
  style,
}: ScreenHeaderProps) {
  const { colors, spacing, radius, typography } = useFinanceTheme();

  return (
    <View
      style={[
        styles.row,
        { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
        style,
      ]}
    >
      {showBack ? (
        <FinancePressable
          accessibilityRole="button"
          accessibilityLabel="Zurück"
          onPress={onBack ?? (() => router.back())}
          intent="navigation"
          style={[
            styles.slotButton,
            { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.round },
          ]}
          contentStyle={styles.slotContent}
        >
          <Text style={[styles.glyph, { color: colors.text }]}>‹</Text>
        </FinancePressable>
      ) : (
        <View style={styles.slot} />
      )}

      <Text numberOfLines={1} style={[typography.bodyMedium, styles.title, { color: colors.text }]}>
        {title}
      </Text>

      <View style={styles.slot}>{trailing}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  slot: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  slotButton: { width: 46, height: 46, borderWidth: StyleSheet.hairlineWidth },
  slotContent: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 28, fontWeight: '600', marginTop: -2 },
  title: { flex: 1, textAlign: 'center' },
});
