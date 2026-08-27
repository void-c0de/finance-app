import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Redirect, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FinanceCard } from '@/components/finance/FinanceCard';
import { FinanceButton } from '@/components/interaction/FinanceButton';
import { getRecentDebugLogs } from '@/core/debugLog';
import { getDatabase } from '@/db/database';
import { getBankConnectionHealth } from '@/services/bankConnectionHealth';
import { useFinanceTheme } from '@/hooks/use-finance-theme';
import { useCloudSyncStore } from '@/stores/useCloudSyncStore';
import { useFinanceStore } from '@/stores/useFinanceStore';
import { useProductAccessStore } from '@/stores/useProductAccessStore';

export default function AdminDiagnosticsScreen() {
  const { colors, spacing, typography } = useFinanceTheme();
  const { access, isLoading, refresh } = useProductAccessStore();
  const accounts = useFinanceStore((state) => state.accounts);
  const lastLoadedAt = useFinanceStore((state) => state.lastLoadedAt);
  const recurringOverrides = useFinanceStore((state) => state.recurringOverrides);
  const bankConnections = useFinanceStore((state) => state.bankConnections);
  const cloud = useCloudSyncStore();
  const [schemaVersion, setSchemaVersion] = useState<number | null>(null);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    void getDatabase().then((db) => db.getFirstAsync<{ version: number }>('SELECT MAX(version) AS version FROM schema_migrations')).then((row) => setSchemaVersion(row?.version ?? null));
  }, []);

  const recentCodes = useMemo(() => Array.from(new Set(
    getRecentDebugLogs()
      .filter((entry) => entry.level === 'error' || entry.level === 'warn')
      .flatMap((entry) => entry.message.match(/[A-Z]+-[A-Z]+-\d{3}/g) ?? [])
      .slice(-8),
  )), []);

  if (isLoading) return <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} />;
  if (!access.isSuperuser) return <Redirect href="/(tabs)/more" />;

  const mutedSeries = Array.from(recurringOverrides.values()).filter((entry) => entry.muted).length;
  const attentionConnections = bankConnections.filter(
    (connection) => getBankConnectionHealth(connection).userActionRequired,
  ).length;

  const rows = [
    ['App-Version', Constants.expoConfig?.version ?? 'unbekannt'],
    ['Android-Build', String(Constants.expoConfig?.android?.versionCode ?? 'unbekannt')],
    ['Runtime', Updates.runtimeVersion ?? 'embedded'],
    ['DB-Schema', schemaVersion === null ? 'wird gelesen' : String(schemaVersion)],
    ['Letzter Cloud-Sync', cloud.lastSyncedAt ? new Date(cloud.lastSyncedAt).toLocaleString('de-DE') : 'noch nicht in dieser Sitzung'],
    ['Lokaler Datenstand', lastLoadedAt ? new Date(lastLoadedAt).toLocaleString('de-DE') : 'noch nicht geladen'],
    ['Konten', `${accounts.length} · ${accounts.filter((account) => account.lastSyncedAt).length} mit Sync-Stand`],
    ['Bankverbindungen', `${bankConnections.length} · ${attentionConnections} brauchen Aktion`],
    ['Wiederkehrend-Korrekturen', `${recurringOverrides.size} · davon ${mutedSeries} stumm`],
    ['Interne Fehlercodes', recentCodes.length ? recentCodes.join(' · ') : 'keine in dieser Sitzung'],
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}>
        <View style={styles.header}><FinanceButton label="‹" variant="ghost" size="small" onPress={() => router.back()} /><Text style={[typography.title, { color: colors.text }]}>Diagnose</Text><View style={styles.spacer} /></View>
        <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.lg }]}>Sichere Betriebsinformationen für Supportfälle. Zugangsdaten, Tokens und Finanztransaktionen werden hier nicht angezeigt.</Text>
        <FinanceCard style={{ marginTop: spacing.xl }}>
          {rows.map(([label, value]) => <View key={label} style={{ marginBottom: spacing.md }}><Text style={[typography.caption, { color: colors.textMuted }]}>{label.toUpperCase()}</Text><Text style={[typography.bodyMedium, { color: colors.text, marginTop: spacing.xxs }]}>{value}</Text></View>)}
        </FinanceCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ safe: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, spacer: { width: 44 } });
