import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FinanceDialog, type FinanceDialogConfig } from '@/components/feedback/FinanceDialog';
import { FinanceCard } from '@/components/finance/FinanceCard';
import { FinanceTextField } from '@/components/forms/FinanceTextField';
import { FinanceButton } from '@/components/interaction/FinanceButton';
import { FinanceKeyboardScreen } from '@/components/layout/FinanceKeyboardScreen';
import { useFinanceTheme } from '@/hooks/use-finance-theme';
import { grantPremiumToUser, revokePremiumFromUser } from '@/services/adminProduct';
import { useProductAccessStore } from '@/stores/useProductAccessStore';

const durations = [7, 30, 90, 365];

export default function AdminUsersScreen() {
  const { colors, spacing, typography } = useFinanceTheme();
  const { access, isLoading, refresh } = useProductAccessStore();
  const [email, setEmail] = useState('');
  const [duration, setDuration] = useState(30);
  const [permanent, setPermanent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dialog, setDialog] = useState<FinanceDialogConfig | null>(null);
  useEffect(() => { void refresh(); }, [refresh]);
  if (!isLoading && !access.isSuperuser) return <Redirect href="/(tabs)/more" />;

  async function grant() {
    if (!email.includes('@') || busy) return;
    setBusy(true); setMessage(null);
    try { await grantPremiumToUser(email, duration, permanent); setMessage('Premium wurde serverseitig gewährt.'); }
    catch (error) { setMessage(error instanceof Error && error.message.includes('user_not_found') ? 'Kein Konto mit dieser E-Mail gefunden.' : 'Premium konnte nicht gewährt werden.'); }
    finally { setBusy(false); }
  }

  function confirmRevoke() {
    if (!email.includes('@')) return;
    setDialog({ title: 'Premium entziehen?', message: 'Der Standardzugang und alle Finanzdaten bleiben erhalten. Nur Premium-Capabilities werden entfernt.', tone: 'danger', confirmLabel: 'Premium entziehen', cancelLabel: 'Abbrechen', onConfirm: () => { void (async () => { setBusy(true); try { await revokePremiumFromUser(email); setMessage('Premium wurde entzogen.'); } catch { setMessage('Premium konnte nicht entzogen werden.'); } finally { setBusy(false); } })(); } });
  }

  return <>
    <FinanceKeyboardScreen backgroundColor={colors.background} contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}>
      <View style={styles.header}><FinanceButton label="‹" variant="ghost" size="small" onPress={() => router.back()} /><Text style={[typography.title, { color: colors.text }]}>Nutzer-Entitlements</Text><View style={styles.spacer} /></View>
      <FinanceCard style={{ marginTop: spacing.xl }}>
        <Text style={[typography.body, { color: colors.textSecondary }]}>Gezielte Premium-Grants verwenden das bestehende Supabase-Auth-Konto. Passwörter oder Auth-Secrets sind hier niemals sichtbar.</Text>
        <FinanceTextField label="E-Mail des Kontos" value={email} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} onChangeText={setEmail} containerStyle={{ marginTop: spacing.lg }} />
        <Text style={[typography.label, { color: colors.textSecondary, marginTop: spacing.lg }]}>Dauer</Text>
        <View style={[styles.wrap, { gap: spacing.sm, marginTop: spacing.sm }]}>{durations.map((days) => <FinanceButton key={days} label={`${days} Tage`} size="small" variant={!permanent && duration === days ? 'primary' : 'secondary'} onPress={() => { setPermanent(false); setDuration(days); }} />)}<FinanceButton label="Permanent" size="small" variant={permanent ? 'primary' : 'secondary'} onPress={() => setPermanent(true)} /></View>
        {message ? <Text style={[typography.small, { color: message.includes('wurde') ? colors.positive : colors.negative, marginTop: spacing.md }]}>{message}</Text> : null}
        <FinanceButton label="Premium gewähren" loading={busy} disabled={!email.includes('@')} onPress={() => { void grant(); }} style={{ marginTop: spacing.lg }} />
        <FinanceButton label="Premium entziehen" variant="danger" disabled={!email.includes('@') || busy} onPress={confirmRevoke} style={{ marginTop: spacing.sm }} />
      </FinanceCard>
    </FinanceKeyboardScreen>
    <FinanceDialog visible={dialog !== null} config={dialog} onClose={() => setDialog(null)} />
  </>;
}
const styles = StyleSheet.create({ header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, spacer: { width: 44 }, wrap: { flexDirection: 'row', flexWrap: 'wrap' } });
