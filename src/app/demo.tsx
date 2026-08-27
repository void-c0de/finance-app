import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FinanceCard } from '@/components/finance/FinanceCard';
import { FinanceButton } from '@/components/interaction/FinanceButton';
import { FinancePressable } from '@/components/interaction/FinancePressable';
import { FinanceDialog, type FinanceDialogConfig } from '@/components/feedback/FinanceDialog';
import { useFinanceTheme } from '@/hooks/use-finance-theme';
import { clearDemoData, countDemoRows, seedDemoData } from '@/services/demoData';
import { getPersonalAccountInfo } from '@/services/cloud/authService';
import { useFinanceStore } from '@/stores/useFinanceStore';
import { useProductAccessStore } from '@/stores/useProductAccessStore';

/**
 * Demo-Daten – Entwickler-/Superuser-Werkzeug für Screenshots & QA.
 * Nicht für normale Nutzer sichtbar.
 */
export default function DemoScreen() {
  const { colors, spacing, typography } = useFinanceTheme();
  const { access, isLoading } = useProductAccessStore();
  const refreshFinanceData = useFinanceStore((state) => state.refreshFinanceData);

  const [demoRows, setDemoRows] = useState<number | null>(null);
  const [cloudConnected, setCloudConnected] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<FinanceDialogConfig | null>(null);

  const reload = useCallback(async () => {
    const [rows, info] = await Promise.all([countDemoRows(), getPersonalAccountInfo()]);
    setDemoRows(rows);
    setCloudConnected(info.mode === 'personal');
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (isLoading) return <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} />;
  if (!__DEV__ && !access.isSuperuser) return <Redirect href="/(tabs)/more" />;

  async function seed() {
    setBusy('seed');
    try {
      const result = await seedDemoData();
      await refreshFinanceData();
      await reload();
      setDialog(
        result.ok
          ? { title: 'Demo-Daten geladen', message: `${result.written} synthetische Einträge wurden lokal angelegt.`, confirmLabel: 'OK' }
          : { title: 'Fehlgeschlagen', message: 'Die Demo-Daten konnten nicht geladen werden.', confirmLabel: 'OK' },
      );
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    setBusy('reset');
    try {
      await clearDemoData();
      const seedResult = await seedDemoData();
      await refreshFinanceData();
      await reload();
      setDialog(
        seedResult.ok
          ? { title: 'Demo-Daten zurückgesetzt', message: 'Der bekannte synthetische Datensatz wurde wiederhergestellt.', confirmLabel: 'OK' }
          : { title: 'Fehlgeschlagen', message: 'Der Reset konnte nicht abgeschlossen werden.', confirmLabel: 'OK' },
      );
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy('remove');
    try {
      const result = await clearDemoData();
      await refreshFinanceData();
      await reload();
      setDialog({
        title: 'Demo-Daten entfernt',
        message: `${result.removed} Demo-Zeilen wurden als gelöscht markiert.`,
        confirmLabel: 'OK',
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.background }]}>
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
        <Text style={[typography.bodyMedium, { color: colors.text }]}>Demo-Daten</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.huge }}>
        <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
          Deterministischer, klar synthetischer Datensatz für Store-Screenshots und QA: 3 Demo-Konten, ~6 Monate Umsätze, 3 Budgets, 2 Sparziele, wiederkehrende Zahlungen mit Preisänderung.
        </Text>

        <FinanceCard>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[typography.body, { color: colors.textSecondary }]}>Aktuell geladen</Text>
            <Text style={[typography.bodyMedium, { color: colors.text }]}>
              {demoRows === null ? '…' : `${demoRows} Zeilen`}
            </Text>
          </View>
        </FinanceCard>

        {cloudConnected ? (
          <View
            style={[
              styles.warn,
              { backgroundColor: colors.warningSoft, borderRadius: 12, padding: spacing.md, marginTop: spacing.md },
            ]}
          >
            <Text style={[typography.caption, { color: colors.warning }]}>
              Ein Cloud-Konto ist verbunden – Demo-Daten werden mitsynchronisiert. Für saubere Store-Screenshots am besten ein separates Demo-Konto oder ohne Cloud-Konto verwenden.
            </Text>
          </View>
        ) : null}

        <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
          <FinanceButton label="Demo-Daten laden" loading={busy === 'seed'} onPress={() => void seed()} />
          <FinanceButton label="Demo-Daten zurücksetzen" variant="secondary" loading={busy === 'reset'} onPress={() => void reset()} />
          <FinanceButton label="Demo-Daten entfernen" variant="ghost" loading={busy === 'remove'} onPress={() => void remove()} />
        </View>

        <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.lg }]}>
          {'„Entfernen" markiert nur demo-Zeilen als gelöscht; echte Finanzdaten werden nie angetastet.'}
        </Text>
      </ScrollView>

      <FinanceDialog visible={dialog !== null} config={dialog} onClose={() => setDialog(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 46, height: 46 },
  backContent: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 28, fontWeight: '600', marginTop: -2 },
  warn: {},
});
