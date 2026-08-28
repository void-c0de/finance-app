import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FinanceCard } from '@/components/finance/FinanceCard';
import { FinanceButton } from '@/components/interaction/FinanceButton';
import { FinanceTextField } from '@/components/forms/FinanceTextField';
import { FinanceKeyboardScreen } from '@/components/layout/FinanceKeyboardScreen';
import { useFinanceTheme } from '@/hooks/use-finance-theme';
import { PREMIUM_PILLARS } from '@/services/entitlementCore';
import { formatPriceLine, PREMIUM_PRICING } from '@/services/billingCore';
import { redeemPremiumCoupon } from '@/services/productAccess';
import { trackPremiumEvent } from '@/services/premiumTelemetry';
import { useProductAccessStore } from '@/stores/useProductAccessStore';
import { usePurchaseStore } from '@/stores/usePurchaseStore';

const SOURCE_LABELS: Record<string, string | null> = {
  coupon: 'Coupon',
  admin: 'Freigabe durch Administration',
  google_play: 'Google Play',
  revenuecat: 'App-Abo',
  store: 'App-Abo',
  migration: 'Bestehende Freigabe',
  superuser: 'Superuser-Rolle',
  none: null,
};

export default function PremiumScreen() {
  const { colors, spacing, radius, typography } = useFinanceTheme();
  const { access, isLoading, refresh, setAccess } = useProductAccessStore();
  const { machine, products, configured, loadProducts, buy, restore, retryVerification } =
    usePurchaseStore();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    trackPremiumEvent('premium_center_opened');
    void refresh();
    void loadProducts();
  }, [refresh, loadProducts]);

  async function redeem() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const result = await redeemPremiumCoupon(code);
    if (result.ok) {
      setAccess(result.access);
      setCode('');
      setMessage('Premium wurde erfolgreich aktiviert.');
    } else {
      setMessage(result.message);
    }
    setBusy(false);
  }

  const statusTitle = access.isSuperuser
    ? 'Superuser'
    : access.isPremium
      ? 'Premium aktiv'
      : 'Standard';

  const statusDetail = access.isSuperuser
    ? 'Alle Premium-Funktionen sind über deine Rolle dauerhaft freigeschaltet.'
    : access.isPremium
      ? access.premiumExpiresAt
        ? `Aktiv bis ${new Date(access.premiumExpiresAt).toLocaleDateString('de-DE')}. Deine Konfiguration bleibt auch danach gespeichert.`
        : 'Aktiv – ohne festes Ablaufdatum.'
      : 'Der kostenlose Tarif ist voll nutzbar. Premium erweitert – es sperrt nichts Wesentliches aus.';

  return (
    <FinanceKeyboardScreen
      backgroundColor={colors.background}
      contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}
      header={
        <View style={styles.header}>
          <FinanceButton label="‹" variant="ghost" size="small" onPress={() => router.back()} />
          <Text style={[typography.title, { color: colors.text }]}>Abos & Premium</Text>
          <View style={styles.headerSpacer} />
        </View>
      }
    >
      <FinanceCard variant="highlight" style={{ marginTop: spacing.md }}>
        <Text style={[typography.caption, { color: colors.primary }]}>DEIN PLAN</Text>
        <Text style={[typography.cardTitle, { color: colors.text, marginTop: spacing.sm }]}>
          {isLoading ? 'Wird geprüft…' : statusTitle}
        </Text>
        <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm }]}>
          {statusDetail}
        </Text>
        {SOURCE_LABELS[access.source] ? (
          <Text style={[typography.small, { color: colors.textMuted, marginTop: spacing.sm }]}>
            Freigabe: {SOURCE_LABELS[access.source]}
          </Text>
        ) : null}
      </FinanceCard>

      <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xxxl, marginBottom: spacing.sm }]}>
        WAS PREMIUM FÜR DICH MACHT
      </Text>

      {PREMIUM_PILLARS.map((pillar) => (
        <FinanceCard key={pillar.id} style={{ marginBottom: spacing.sm }}>
          <Text style={[typography.sectionTitle, { color: colors.text }]}>{pillar.title}</Text>
          <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xxs }]}>
            {pillar.subtitle}
          </Text>
          <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
            {pillar.points.map((point) => (
              <View key={point} style={styles.pointRow}>
                <View style={[styles.dot, { backgroundColor: colors.primary, borderRadius: radius.round }]} />
                <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{point}</Text>
              </View>
            ))}
          </View>
        </FinanceCard>
      ))}

      <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xxl, marginBottom: spacing.sm }]}>
        IMMER KOSTENLOS
      </Text>
      <FinanceCard>
        <Text style={[typography.body, { color: colors.text }]}>
          Konten & Umsätze · manuelle Kategorien und Korrekturen · Basis-Dashboard und Attention Center · zwei Budgets · zwei manuelle Sparziele · erkannte Abos und die nächste Zahlung · Umsätze-CSV · alle Sicherheitsfunktionen · System-, Hell-, Dunkel- und AMOLED-Design.
        </Text>
      </FinanceCard>

      {!access.isSuperuser ? (
        <>
          {configured && products.length > 0 ? (
            <FinanceCard style={{ marginTop: spacing.xxl }}>
              <Text style={[typography.cardTitle, { color: colors.text }]}>Premium abonnieren</Text>
              <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                Abrechnung und Kündigung laufen über deinen App-Store. Premium wird erst nach
                serverseitiger Prüfung des Kaufs aktiv.
              </Text>
              {products.map((product) => (
                <FinanceButton
                  key={product.id}
                  label={`${product.interval === 'monthly' ? 'Monatlich' : 'Jährlich'} · ${product.localizedPrice}`}
                  loading={machine.phase === 'purchasing' || machine.phase === 'verifying'}
                  disabled={machine.phase !== 'ready'}
                  onPress={() => { void buy(product.id); }}
                  style={{ marginTop: spacing.md }}
                />
              ))}
              {machine.phase === 'pending' ? (
                <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.md }]}>
                  Der Kauf ist beim Store ausstehend (z. B. Zahlungsfreigabe). Premium wird aktiv,
                  sobald der Store und die Serverprüfung bestätigen.
                </Text>
              ) : null}
              {machine.phase === 'verified' ? (
                <Text style={[typography.small, { color: colors.positive, marginTop: spacing.md }]}>
                  Premium ist aktiv. Deine Konfiguration bleibt auch nach Ablauf erhalten.
                </Text>
              ) : null}
              {machine.phase === 'verification_failed' ? (
                <>
                  <Text style={[typography.small, { color: colors.negative, marginTop: spacing.md }]}>
                    {machine.message}
                  </Text>
                  <FinanceButton
                    label="Erneut prüfen"
                    variant="secondary"
                    onPress={() => { void retryVerification(); }}
                    style={{ marginTop: spacing.sm }}
                  />
                </>
              ) : null}
              {machine.phase === 'error' ? (
                <Text style={[typography.small, { color: colors.negative, marginTop: spacing.md }]}>
                  {machine.message}
                </Text>
              ) : null}
              <FinanceButton
                label="Käufe wiederherstellen"
                variant="ghost"
                size="small"
                loading={machine.phase === 'verifying'}
                onPress={() => { void restore(); }}
                style={{ marginTop: spacing.lg }}
              />
            </FinanceCard>
          ) : (
            <FinanceCard style={{ marginTop: spacing.xxl }}>
              <Text style={[typography.cardTitle, { color: colors.text }]}>Premium aktivieren</Text>
              <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                Premium wird derzeit über Coupons oder die Administration freigeschaltet. Ein Kauf
                über den App-Store folgt, sobald die Abrechnung serverseitig geprüft werden kann –
                bis dahin gibt es hier bewusst keinen Kauf-Button.
              </Text>
              <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.sm }]}>
                {formatPriceLine(PREMIUM_PRICING)}
              </Text>
              <FinanceButton
                label="Käufe wiederherstellen"
                variant="ghost"
                size="small"
                onPress={() => { void restore(); }}
                style={{ marginTop: spacing.md }}
              />
              {machine.phase === 'verification_failed' || machine.phase === 'error' ? (
                <Text style={[typography.small, { color: colors.textMuted, marginTop: spacing.sm }]}>
                  {machine.message}
                </Text>
              ) : null}
            </FinanceCard>
          )}

          <FinanceCard style={{ marginTop: spacing.lg }}>
            <Text style={[typography.cardTitle, { color: colors.text }]}>Coupon einlösen</Text>
            <FinanceTextField
              containerStyle={{ marginTop: spacing.lg }}
              label="Premium-Coupon"
              value={code}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={32}
              placeholder="WELCOME30"
              onChangeText={(value) => setCode(value.toUpperCase().replace(/\s/g, ''))}
            />
            {message ? (
              <Text
                style={[
                  typography.small,
                  {
                    color: message.includes('erfolgreich') ? colors.positive : colors.negative,
                    marginTop: spacing.sm,
                  },
                ]}
              >
                {message}
              </Text>
            ) : null}
            <FinanceButton
              label="Coupon einlösen"
              loading={busy}
              disabled={code.length < 4}
              onPress={() => { void redeem(); }}
              style={{ marginTop: spacing.lg }}
            />
          </FinanceCard>

          <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.lg }]}>
            Wenn Premium endet, wird nichts gelöscht: Budgets, Sparziele, Regeln, Wiederkehr-Korrekturen und dein Design bleiben gespeichert und werden wieder aktiv, sobald Premium zurückkehrt.
          </Text>
        </>
      ) : null}
    </FinanceKeyboardScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerSpacer: { width: 44 },
  pointRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dot: { width: 5, height: 5, marginTop: 8 },
});
