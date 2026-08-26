import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FinanceCard } from '@/components/finance/FinanceCard';
import { FinanceButton } from '@/components/interaction/FinanceButton';
import { FinanceTextField } from '@/components/forms/FinanceTextField';
import { FinanceKeyboardScreen } from '@/components/layout/FinanceKeyboardScreen';
import { useFinanceTheme } from '@/hooks/use-finance-theme';
import { redeemPremiumCoupon } from '@/services/productAccess';
import { useProductAccessStore } from '@/stores/useProductAccessStore';

const benefits = [
  'Erweiterte Planung und automatische Sparziel-Logik',
  'Tiefere Analysen, Prognosen und wiederkehrende Zahlungen',
  'Erweiterte Kategorie-Regeln und zukünftige Exporte',
];

export default function PremiumScreen() {
  const { colors, spacing, typography } = useFinanceTheme();
  const { access, isLoading, refresh, setAccess } = useProductAccessStore();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void refresh(); }, [refresh]);

  async function redeem() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const result = await redeemPremiumCoupon(code);
    if (result.ok) {
      setAccess(result.access);
      setCode('');
      setMessage('Premium wurde erfolgreich aktiviert.');
    } else setMessage(result.message);
    setBusy(false);
  }

  const status = access.isSuperuser
    ? 'Superuser · Premium dauerhaft freigeschaltet'
    : access.isPremium
      ? `Premium aktiv${access.premiumExpiresAt ? ` bis ${new Date(access.premiumExpiresAt).toLocaleDateString('de-DE')}` : ''}`
      : 'Standard';

  return (
    <FinanceKeyboardScreen backgroundColor={colors.background} contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}>
      <View style={styles.header}>
        <FinanceButton label="‹" variant="ghost" size="small" onPress={() => router.back()} />
        <Text style={[typography.title, { color: colors.text }]}>Premium</Text>
        <View style={styles.headerSpacer} />
      </View>

      <FinanceCard variant="highlight" style={{ marginTop: spacing.xl }}>
        <Text style={[typography.caption, { color: colors.primary }]}>DEIN PLAN</Text>
        <Text style={[typography.cardTitle, { color: colors.text, marginTop: spacing.sm }]}>{isLoading ? 'Wird geprüft…' : status}</Text>
        <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm }]}>Kernfunktionen, Konten, Umsätze, Sicherheit und Basisplanung bleiben im Standard-Tarif vollständig nutzbar.</Text>
      </FinanceCard>

      <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xxxl, marginBottom: spacing.sm }]}>PREMIUM-VORTEILE</Text>
      <FinanceCard>
        {benefits.map((benefit) => <Text key={benefit} style={[typography.body, { color: colors.text, marginBottom: spacing.md }]}>✓ {benefit}</Text>)}
        <Text style={[typography.small, { color: colors.textMuted }]}>Bezahlte Abonnements sind noch nicht freigeschaltet. Es werden keine Käufe vorgetäuscht.</Text>
      </FinanceCard>

      {!access.isSuperuser ? (
        <FinanceCard style={{ marginTop: spacing.xl }}>
          <FinanceTextField label="Premium-Coupon" value={code} autoCapitalize="characters" autoCorrect={false} maxLength={32} placeholder="WELCOME30" onChangeText={(value) => setCode(value.toUpperCase().replace(/\s/g, ''))} />
          {message ? <Text style={[typography.small, { color: message.includes('erfolgreich') ? colors.positive : colors.negative, marginTop: spacing.sm }]}>{message}</Text> : null}
          <FinanceButton label="Coupon einlösen" loading={busy} disabled={code.length < 4} onPress={() => { void redeem(); }} style={{ marginTop: spacing.lg }} />
        </FinanceCard>
      ) : null}
    </FinanceKeyboardScreen>
  );
}

const styles = StyleSheet.create({ header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headerSpacer: { width: 44 } });
