import { Redirect } from 'expo-router';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FinanceCard } from '@/components/finance/FinanceCard';
import { FinanceTextField } from '@/components/forms/FinanceTextField';
import { FinanceButton } from '@/components/interaction/FinanceButton';
import { FinanceKeyboardScreen } from '@/components/layout/FinanceKeyboardScreen';
import { useFinanceTheme } from '@/hooks/use-finance-theme';
import { publishAppRelease } from '@/services/adminProduct';
import { getInstalledVersionInfo } from '@/services/appUpdates';
import type { UpdateLevel } from '@/services/releaseCore';
import { useProductAccessStore } from '@/stores/useProductAccessStore';

const levels: { id: UpdateLevel; label: string }[] = [{ id: 'optional', label: 'Optional' }, { id: 'recommended', label: 'Empfohlen' }, { id: 'required', label: 'Erforderlich' }];

export default function AdminReleasesScreen() {
  const { colors, spacing, typography } = useFinanceTheme();
  const { access, isLoading, refresh } = useProductAccessStore();
  const installed = getInstalledVersionInfo();
  const [version, setVersion] = useState(installed.version);
  const [build, setBuild] = useState('2');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [level, setLevel] = useState<UpdateLevel>('optional');
  const [minimum, setMinimum] = useState('');
  const [storeUrl, setStoreUrl] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void refresh(); }, [refresh]);
  if (isLoading) return <View style={[styles.loading, { backgroundColor: colors.background }]}><Text style={[typography.body, { color: colors.textSecondary }]}>Berechtigung wird geprüft…</Text></View>;
  if (!access.isSuperuser) return <Redirect href="/(tabs)/more" />;
  async function publish() {
    const buildNumber = Number(build);
    if (!version.trim() || !Number.isInteger(buildNumber) || !title.trim() || !summary.trim()) { setMessage('Version, Build, Titel und Zusammenfassung sind erforderlich.'); return; }
    setBusy(true); setMessage(null);
    try { await publishAppRelease({ version: version.trim(), buildNumber, runtimeVersion: version.trim(), title: title.trim(), summary: summary.trim(), level, minimumNativeVersion: minimum.trim() || null, storeUrl: storeUrl.trim() || null }); setMessage('Release-Metadaten und Patch Notes wurden veröffentlicht.'); }
    catch { setMessage('Release konnte nicht veröffentlicht werden.'); }
    finally { setBusy(false); }
  }
  return <FinanceKeyboardScreen backgroundColor={colors.background} contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}>
    <ScreenHeader title="Release-Steuerung" />
    <FinanceCard style={{ marginTop: spacing.xl }}>
      <FinanceTextField label="App-Version" value={version} onChangeText={setVersion} />
      <FinanceTextField label="Android Build-Nummer" value={build} keyboardType="number-pad" onChangeText={setBuild} containerStyle={{ marginTop: spacing.lg }} />
      <FinanceTextField label="Patch-Notes Titel" value={title} maxLength={80} onChangeText={setTitle} containerStyle={{ marginTop: spacing.lg }} />
      <FinanceTextField label="Kurzbeschreibung" value={summary} multiline maxLength={400} onChangeText={setSummary} containerStyle={{ marginTop: spacing.lg }} />
      <Text style={[typography.label, { color: colors.textSecondary, marginTop: spacing.lg }]}>Dringlichkeit</Text>
      <View style={[styles.wrap, { gap: spacing.sm, marginTop: spacing.sm }]}>{levels.map((item) => <FinanceButton key={item.id} label={item.label} size="small" variant={level === item.id ? 'primary' : 'secondary'} onPress={() => setLevel(item.id)} />)}</View>
      <FinanceTextField label="Mindestversion" value={minimum} placeholder="Leer = kein Zwang" onChangeText={setMinimum} containerStyle={{ marginTop: spacing.lg }} />
      <FinanceTextField label="Store-/Download-Link" value={storeUrl} placeholder="Nur für native Updates" autoCapitalize="none" onChangeText={setStoreUrl} containerStyle={{ marginTop: spacing.lg }} />
      {message ? <Text style={[typography.small, { color: message.includes('veröffentlicht') ? colors.positive : colors.negative, marginTop: spacing.md }]}>{message}</Text> : null}
      <FinanceButton label="Patch Notes veröffentlichen" loading={busy} onPress={() => { void publish(); }} style={{ marginTop: spacing.lg }} />
    </FinanceCard>
  </FinanceKeyboardScreen>;
}
const styles = StyleSheet.create({ loading: { flex: 1, padding: 24, justifyContent: 'center' }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, spacer: { width: 44 }, wrap: { flexDirection: 'row', flexWrap: 'wrap' } });
