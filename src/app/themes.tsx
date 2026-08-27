import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FinanceCard } from '@/components/finance/FinanceCard';
import { FinancePressable } from '@/components/interaction/FinancePressable';
import { PremiumBadge } from '@/components/premium/PremiumBadge';
import { PremiumSheet } from '@/components/premium/PremiumSheet';
import { useFinanceTheme } from '@/hooks/use-finance-theme';
import { hasCapability, type PremiumGateContext } from '@/services/entitlementCore';
import { performFinanceHaptic } from '@/services/haptics';
import { trackPremiumEvent } from '@/services/premiumTelemetry';
import { useProductAccessStore } from '@/stores/useProductAccessStore';
import { useThemeStore } from '@/stores/useThemeStore';
import {
  financeColors,
  FINANCE_THEMES,
  isPremiumTheme,
  resolvePaletteName,
  type FinanceThemeName,
} from '@/theme/finance-theme';

function ThemeMiniature({ palette }: { palette: keyof typeof financeColors }) {
  const c = financeColors[palette];
  return (
    <View style={[styles.miniature, { backgroundColor: c.background, borderColor: c.border }]}>
      <View style={[styles.miniCard, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={[styles.miniAccent, { backgroundColor: c.primary }]} />
        <View style={[styles.miniLine, { backgroundColor: c.text, width: '62%' }]} />
        <View style={[styles.miniLine, { backgroundColor: c.textSecondary, width: '40%' }]} />
        <View style={styles.miniDots}>
          <View style={[styles.miniDot, { backgroundColor: c.positive }]} />
          <View style={[styles.miniDot, { backgroundColor: c.negative }]} />
          <View style={[styles.miniDot, { backgroundColor: c.warning }]} />
        </View>
      </View>
    </View>
  );
}

export default function ThemesScreen() {
  const { colors, spacing, radius, typography, premiumThemeFallbackActive } = useFinanceTheme();
  const selectedTheme = useThemeStore((state) => state.themeName);
  const setThemeName = useThemeStore((state) => state.setThemeName);
  const access = useProductAccessStore((state) => state.access);
  const canUsePremiumThemes = hasCapability(access, 'premium_themes');
  const [gate, setGate] = useState<PremiumGateContext | null>(null);

  const systemPrefersDark = useFinanceTheme().isDark; // resolved once

  async function choose(id: FinanceThemeName) {
    if (isPremiumTheme(id) && !canUsePremiumThemes) {
      trackPremiumEvent('theme_premium_tapped', id);
      void performFinanceHaptic('selection');
      setGate('premium_theme');
      return;
    }
    trackPremiumEvent('theme_selected', id);
    void performFinanceHaptic('selection');
    await setThemeName(id);
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingHorizontal: spacing.md, paddingVertical: spacing.md }]}>
        <FinancePressable
          accessibilityRole="button"
          accessibilityLabel="Zurück"
          onPress={() => router.back()}
          intent="navigation"
          style={[styles.back, { backgroundColor: colors.surface, borderRadius: 23 }]}
          contentStyle={styles.backContent}
        >
          <Text style={[styles.backIcon, { color: colors.text }]}>‹</Text>
        </FinancePressable>
        <Text style={[typography.bodyMedium, { color: colors.text }]}>Themes</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.md }]}>
          System, Hell, Dunkel und AMOLED sind immer kostenlos. Premium-Designs bringen abgestimmte Farbwelten – die Finanz-Farben (grün/rot/gelb) bleiben in jedem Theme gleich lesbar.
        </Text>

        {premiumThemeFallbackActive ? (
          <FinanceCard style={{ marginBottom: spacing.md }}>
            <Text style={[typography.caption, { color: colors.textMuted }]}>DEIN PREMIUM-DESIGN IST GESPEICHERT</Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.xxs }]}>
              Solange Premium nicht aktiv ist, zeigt die App dein zuletzt gewähltes kostenloses Design. Dein Premium-Design kehrt automatisch zurück, sobald Premium wieder aktiv ist.
            </Text>
          </FinanceCard>
        ) : null}

        {FINANCE_THEMES.map((theme) => {
          const active = selectedTheme === theme.id;
          const palette = theme.palette ?? resolvePaletteName('system', systemPrefersDark);
          const locked = theme.tier === 'premium' && !canUsePremiumThemes;
          return (
            <FinancePressable
              key={theme.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${theme.label}${theme.tier === 'premium' ? ', Premium' : ''}${active ? ', ausgewählt' : ''}`}
              onPress={() => void choose(theme.id)}
              intent="navigation"
              style={{
                marginBottom: spacing.sm,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: active ? colors.primary : colors.border,
                backgroundColor: active ? colors.primarySoft : colors.surface,
              }}
              contentStyle={{ padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
            >
              <ThemeMiniature palette={palette} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Text style={[typography.bodyMedium, { color: colors.text }]}>{theme.label}</Text>
                  {theme.tier === 'premium' ? <PremiumBadge tone={locked ? 'muted' : 'accent'} /> : null}
                </View>
                <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xxs }]}>
                  {theme.description}
                </Text>
              </View>
              {active ? (
                <Text style={[typography.bodyMedium, { color: colors.primary }]}>✓</Text>
              ) : null}
            </FinancePressable>
          );
        })}
      </ScrollView>

      <PremiumSheet
        context={gate}
        onClose={() => setGate(null)}
        personalNote="System, Hell, Dunkel und AMOLED bleiben für dich dauerhaft kostenlos."
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 46, height: 46 },
  backContent: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 28, fontWeight: '600', marginTop: -2 },
  miniature: { width: 68, height: 60, borderRadius: 12, borderWidth: 1, padding: 8, justifyContent: 'center' },
  miniCard: { flex: 1, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, padding: 6, justifyContent: 'center', gap: 3 },
  miniAccent: { height: 4, width: 20, borderRadius: 2, marginBottom: 2 },
  miniLine: { height: 3, borderRadius: 2 },
  miniDots: { flexDirection: 'row', gap: 3, marginTop: 3 },
  miniDot: { width: 5, height: 5, borderRadius: 3 },
});
