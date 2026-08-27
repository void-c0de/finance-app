import { type Href, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FinanceCard } from '@/components/finance/FinanceCard';
import { FinanceDialog, type FinanceDialogConfig } from '@/components/feedback/FinanceDialog';
import { FinanceButton } from '@/components/interaction/FinanceButton';
import { FinancePressable } from '@/components/interaction/FinancePressable';
import { PremiumSheet } from '@/components/premium/PremiumSheet';
import { useFinanceTheme } from '@/hooks/use-finance-theme';
import { listRecurringSeries, type RecurringSeries } from '@/db/repositories/recurringSeries';
import { buildFinanceInsights } from '@/services/financeInsights';
import { hasCapability, type PremiumGateContext } from '@/services/entitlementCore';
import { EXPORT_KIND_LABEL, type ExportKind } from '@/services/exportCore';
import { exportAndShare } from '@/services/exportService';
import { performFinanceHaptic } from '@/services/haptics';
import { trackPremiumEvent } from '@/services/premiumTelemetry';
import { useFinanceStore } from '@/stores/useFinanceStore';
import { useProductAccessStore } from '@/stores/useProductAccessStore';

type Row = { kind: ExportKind; premium: boolean; count: number; hint: string; context: PremiumGateContext };

export default function ExportScreen() {
  const { colors, spacing, radius, typography } = useFinanceTheme();
  const transactions = useFinanceStore((state) => state.transactions);
  const budgets = useFinanceStore((state) => state.budgets);
  const goals = useFinanceStore((state) => state.goals);
  const categories = useFinanceStore((state) => state.categories);
  const accounts = useFinanceStore((state) => state.accounts);
  const recurringOverrides = useFinanceStore((state) => state.recurringOverrides);
  const access = useProductAccessStore((state) => state.access);
  const canExportAll = hasCapability(access, 'advanced_exports');
  const canFullExport = hasCapability(access, 'full_finance_export');

  const [recurringSeries, setRecurringSeries] = useState<RecurringSeries[]>([]);
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [gate, setGate] = useState<PremiumGateContext | null>(null);
  const [dialog, setDialog] = useState<FinanceDialogConfig | null>(null);

  useEffect(() => {
    void listRecurringSeries().then(setRecurringSeries).catch(() => setRecurringSeries([]));
  }, []);

  const recurringItems = useMemo(
    () => buildFinanceInsights({ transactions, categories, budgets, recurringOverrides }).recurringItems,
    [transactions, categories, budgets, recurringOverrides],
  );

  const bundle = {
    transactions,
    budgets,
    goals,
    categories,
    accounts,
    recurringItems,
    recurringSeries,
  };

  async function runExport(kind: ExportKind) {
    if (busy) return;
    setBusy(kind);
    try {
      await performFinanceHaptic('selection');
      const result = await exportAndShare(kind, bundle);
      if (result === 'unavailable') {
        setDialog({
          title: 'Teilen nicht verfügbar',
          message: 'Auf diesem Gerät steht das System-Teilen-Menü nicht bereit.',
          confirmLabel: 'Verstanden',
        });
      } else if (result === 'error') {
        setDialog({
          title: 'Export fehlgeschlagen',
          message: 'Bitte versuche es erneut. Es wurde nichts hochgeladen.',
          confirmLabel: 'Verstanden',
        });
      }
    } finally {
      setBusy(null);
    }
  }

  const rows: Row[] = [
    { kind: 'transactions', premium: false, count: transactions.length, hint: 'CSV · alle Umsätze', context: 'advanced_export' },
    { kind: 'budgets', premium: true, count: budgets.length, hint: 'CSV', context: 'advanced_export' },
    { kind: 'savings_goals', premium: true, count: goals.length, hint: 'CSV', context: 'advanced_export' },
    { kind: 'recurring', premium: true, count: recurringItems.length, hint: 'CSV', context: 'advanced_export' },
    { kind: 'full_backup', premium: true, count: transactions.length + budgets.length + goals.length, hint: 'JSON · Backup zum Aufbewahren', context: 'full_export' },
  ];

  function isLocked(row: Row): boolean {
    if (!row.premium) return false;
    return row.kind === 'full_backup' ? !canFullExport : !canExportAll;
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
        <Text style={[typography.bodyMedium, { color: colors.text }]}>Daten exportieren</Text>
        <View style={styles.back} />
      </View>

      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
          Exportierte Dateien enthalten deine Finanzdaten – keine Zugangsdaten oder Tokens. Sie werden als echte Datei über das System-Teilen-Menü bereitgestellt; die App lädt nichts automatisch hoch.
        </Text>

        <FinanceCard padded={false}>
          {rows.map((row, index) => {
            const locked = isLocked(row);
            return (
              <View
                key={row.kind}
                style={index > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : undefined}
              >
                <View style={{ padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                      <Text style={[typography.bodyMedium, { color: colors.text }]}>{EXPORT_KIND_LABEL[row.kind]}</Text>
                      {row.premium ? (
                        <View style={{ paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: colors.surfaceInteractive }}>
                          <Text style={[typography.caption, { color: locked ? colors.textMuted : colors.primary }]}>Premium</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xxs }]}>
                      {row.count} {row.count === 1 ? 'Eintrag' : 'Einträge'} · {row.hint}
                    </Text>
                  </View>
                  <FinanceButton
                    label={locked ? 'Premium' : 'Teilen'}
                    variant={locked ? 'ghost' : 'secondary'}
                    size="small"
                    loading={busy === row.kind}
                    disabled={busy !== null || row.count === 0}
                    onPress={() => {
                      if (locked) {
                        trackPremiumEvent('premium_gate_opened', `export:${row.kind}`);
                        setGate(row.context);
                      } else {
                        void runExport(row.kind);
                      }
                    }}
                  />
                </View>
              </View>
            );
          })}
        </FinanceCard>

        <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.lg }]}>
          Der Umsätze-Export bleibt im Standard-Tarif – deine eigenen Daten sollen dir gehören. Ein Wieder-Import des Backups ist noch nicht möglich; die Datei dient dem Aufbewahren.
        </Text>
        <FinancePressable
          accessibilityRole="button"
          onPress={() => router.push('/premium' as Href)}
          intent="navigation"
          contentStyle={{ paddingTop: spacing.md }}
        >
          <Text style={[typography.caption, { color: colors.primary }]}>Was Premium sonst noch kann →</Text>
        </FinancePressable>
      </View>

      <PremiumSheet context={gate} onClose={() => setGate(null)} />
      <FinanceDialog visible={dialog !== null} config={dialog} onClose={() => setDialog(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 46, height: 46 },
  backContent: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 28, fontWeight: '600', marginTop: -2 },
});
