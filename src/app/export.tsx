import { type Href, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FinanceCard } from '@/components/finance/FinanceCard';
import { FinanceButton } from '@/components/interaction/FinanceButton';
import { FinancePressable } from '@/components/interaction/FinancePressable';
import { debugLog } from '@/core/debugLog';
import { useFinanceTheme } from '@/hooks/use-finance-theme';
import { buildFinanceInsights } from '@/services/financeInsights';
import { hasCapability } from '@/services/entitlementCore';
import { performFinanceHaptic } from '@/services/haptics';
import {
  buildBudgetsCsv,
  buildExportLookup,
  buildRecurringCsv,
  buildSavingsGoalsCsv,
  buildTransactionsCsv,
  EXPORT_KIND_LABEL,
  exportFileName,
  type ExportKind,
} from '@/services/exportCore';
import { useFinanceStore } from '@/stores/useFinanceStore';
import { useProductAccessStore } from '@/stores/useProductAccessStore';

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
  const [busy, setBusy] = useState<ExportKind | null>(null);

  const lookup = useMemo(
    () => buildExportLookup(categories, accounts),
    [categories, accounts],
  );
  const recurringItems = useMemo(
    () => buildFinanceInsights({ transactions, categories, budgets, recurringOverrides }).recurringItems,
    [transactions, categories, budgets, recurringOverrides],
  );

  async function exportKind(kind: ExportKind) {
    if (busy) return;
    setBusy(kind);
    try {
      const csv =
        kind === 'transactions'
          ? buildTransactionsCsv(transactions, lookup)
          : kind === 'budgets'
            ? buildBudgetsCsv(budgets, lookup)
            : kind === 'savings_goals'
              ? buildSavingsGoalsCsv(goals)
              : buildRecurringCsv(recurringItems);

      await performFinanceHaptic('selection');
      await Share.share({
        title: `${EXPORT_KIND_LABEL[kind]} · ${exportFileName(kind)}`,
        message: csv,
      });
    } catch (error) {
      debugLog.error('EXPORT', `${kind}-Export fehlgeschlagen`, error);
      await performFinanceHaptic('warning');
    } finally {
      setBusy(null);
    }
  }

  const rows: { kind: ExportKind; count: number; premium: boolean }[] = [
    { kind: 'transactions', count: transactions.length, premium: false },
    { kind: 'budgets', count: budgets.length, premium: true },
    { kind: 'savings_goals', count: goals.length, premium: true },
    { kind: 'recurring', count: recurringItems.length, premium: true },
  ];

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
          Exportierte Dateien enthalten deine Finanzdaten. Teile sie nur mit Zielen, denen du vertraust; die App lädt nichts automatisch hoch.
        </Text>

        <FinanceCard padded={false}>
          {rows.map((row, index) => {
            const locked = row.premium && !canExportAll;
            return (
              <View
                key={row.kind}
                style={index > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : undefined}
              >
                <View style={{ padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                      <Text style={[typography.bodyMedium, { color: colors.text }]}>
                        {EXPORT_KIND_LABEL[row.kind]}
                      </Text>
                      {row.premium ? (
                        <View style={{ paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: colors.surfaceInteractive }}>
                          <Text style={[typography.caption, { color: locked ? colors.textMuted : colors.primary }]}>Premium</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xxs }]}>
                      {row.count} {row.count === 1 ? 'Eintrag' : 'Einträge'} · CSV
                    </Text>
                  </View>
                  <FinanceButton
                    label={locked ? 'Premium' : 'Teilen'}
                    variant={locked ? 'ghost' : 'secondary'}
                    size="small"
                    loading={busy === row.kind}
                    disabled={busy !== null || row.count === 0}
                    onPress={() => (locked ? router.push('/premium' as Href) : exportKind(row.kind))}
                  />
                </View>
              </View>
            );
          })}
        </FinanceCard>

        <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.lg }]}>
          Die CSV-Datei wird über das Android-Teilen-Menü bereitgestellt (z. B. an E-Mail, Notizen oder Dateien). Direkte Datei-Anhänge folgen mit einem nativen Update.
        </Text>
      </View>
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
