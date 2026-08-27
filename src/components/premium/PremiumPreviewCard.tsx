import { StyleSheet, Text, View } from 'react-native';

import { FinanceCard } from '@/components/finance/FinanceCard';
import { FinancePressable } from '@/components/interaction/FinancePressable';
import { useFinanceTheme } from '@/hooks/use-finance-theme';
import { trackPremiumEvent } from '@/services/premiumTelemetry';
import type { PremiumGateContext } from '@/services/entitlementCore';

type Props = {
  eyebrow: string;
  title: string;
  /** Ein echter Fakt aus lokalen Nutzerdaten – niemals erfunden. */
  teaser: string;
  context: PremiumGateContext;
  ctaLabel?: string;
  onOpen: (context: PremiumGateContext) => void;
  style?: object;
};

/**
 * Taktvolle Premium-Vorschau: nennt einen echten, lokal abgeleiteten Fakt und
 * bietet genau eine Aktion, um die vollständige Auswertung freizuschalten.
 * Das vollständige Premium-Ergebnis wird bewusst NICHT gezeigt.
 */
export function PremiumPreviewCard({
  eyebrow,
  title,
  teaser,
  context,
  ctaLabel = 'Details mit Premium',
  onOpen,
  style,
}: Props) {
  const { colors, spacing, radius, typography } = useFinanceTheme();
  return (
    <FinancePressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${ctaLabel}`}
      onPress={() => {
        trackPremiumEvent('premium_preview_opened', context);
        onOpen(context);
      }}
      intent="navigation"
      style={style}
    >
      <FinanceCard>
        <View style={styles.row}>
          <Text style={[typography.caption, { color: colors.textMuted, letterSpacing: 1 }]}>
            {eyebrow.toUpperCase()}
          </Text>
          <Text style={[typography.caption, { color: colors.primary }]}>Premium</Text>
        </View>

        <Text style={[typography.bodyMedium, { color: colors.text, marginTop: spacing.md }]}>
          {title}
        </Text>
        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xxs }]}>
          {teaser}
        </Text>

        <View
          style={{
            marginTop: spacing.md,
            alignSelf: 'flex-start',
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.xs,
            borderRadius: radius.round,
            backgroundColor: colors.surfaceInteractive,
          }}
        >
          <Text style={[typography.caption, { color: colors.primary }]}>{ctaLabel} →</Text>
        </View>
      </FinanceCard>
    </FinancePressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
