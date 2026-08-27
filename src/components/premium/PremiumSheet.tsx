import { type Href, router } from 'expo-router';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { FinanceButton } from '@/components/interaction/FinanceButton';
import { FinancePressable } from '@/components/interaction/FinancePressable';
import { useFinanceTheme } from '@/hooks/use-finance-theme';
import { performFinanceHaptic } from '@/services/haptics';
import {
  PREMIUM_GATE_COPY,
  PREMIUM_PILLARS,
  type PremiumGateContext,
} from '@/services/entitlementCore';
import { trackPremiumEvent } from '@/services/premiumTelemetry';

type Props = {
  context: PremiumGateContext | null;
  onClose: () => void;
  /** Optionaler, betont personalisierter Einleitungssatz aus echten Nutzerdaten. */
  personalNote?: string;
};

/**
 * Kontextueller Premium-Hinweis. Wert vor Preis, genau eine primäre Aktion,
 * eine klare Verwerfen-Aktion, nie eine Navigationsfalle. Kein Countdown,
 * keine künstliche Dringlichkeit, kein Confirm-Shaming.
 */
export function PremiumSheet({ context, onClose, personalNote }: Props) {
  const { colors, spacing, radius, typography } = useFinanceTheme();
  const copy = context ? PREMIUM_GATE_COPY[context] : null;
  const pillar = copy ? PREMIUM_PILLARS.find((entry) => entry.id === copy.pillar) ?? null : null;

  return (
    <Modal
      visible={context !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <FinancePressable
        accessibilityRole="button"
        accessibilityLabel="Schließen"
        onPress={onClose}
        intent="navigation"
        style={[styles.scrim, { backgroundColor: colors.scrim }]}
      >
        <View
          onStartShouldSetResponder={() => true}
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.xl, padding: spacing.lg },
          ]}
        >
          {copy ? (
            <>
              <Text style={[typography.caption, { color: colors.primary, letterSpacing: 1 }]}>
                PREMIUM
              </Text>
              <Text style={[typography.title, { color: colors.text, marginTop: spacing.xs }]}>
                {copy.title}
              </Text>

              {personalNote ? (
                <Text style={[typography.bodyMedium, { color: colors.text, marginTop: spacing.md }]}>
                  {personalNote}
                </Text>
              ) : null}

              <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm }]}>
                {copy.body}
              </Text>

              {pillar ? (
                <View
                  style={{
                    marginTop: spacing.lg,
                    padding: spacing.md,
                    borderRadius: radius.lg,
                    backgroundColor: colors.surfaceInteractive,
                  }}
                >
                  <Text style={[typography.smallMedium, { color: colors.text }]}>{pillar.title}</Text>
                  {pillar.points.map((point) => (
                    <Text
                      key={point}
                      style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xxs }]}
                    >
                      · {point}
                    </Text>
                  ))}
                </View>
              ) : null}

              <FinanceButton
                label={copy.cta}
                onPress={() => {
                  trackPremiumEvent('premium_gate_cta', context ?? undefined);
                  onClose();
                  router.push('/premium' as Href);
                }}
                style={{ width: '100%', marginTop: spacing.xl }}
              />
              <FinanceButton
                label="Vielleicht später"
                variant="ghost"
                onPress={() => {
                  trackPremiumEvent('premium_gate_dismissed', context ?? undefined);
                  void performFinanceHaptic('selection');
                  onClose();
                }}
                style={{ width: '100%', marginTop: spacing.sm }}
              />
            </>
          ) : null}
        </View>
      </FinancePressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', padding: 16 },
  sheet: { width: '100%', maxWidth: 480, alignSelf: 'center', borderWidth: StyleSheet.hairlineWidth, marginBottom: 12 },
});
