import { type Href, router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FinanceCard } from '@/components/finance/FinanceCard';
import { FinanceButton } from '@/components/interaction/FinanceButton';
import { FinancePressable } from '@/components/interaction/FinancePressable';
import { MoneyText } from '@/components/finance/MoneyText';
import { FinanceEmptyState } from '@/components/states/FinanceEmptyState';
import { formatMinorUnits } from '@/core/money';
import { useFinanceTheme } from '@/hooks/use-finance-theme';
import {
  buildCategoryTrends,
  buildMonthlyComparison,
} from '@/services/analyticsCore';
import { hasCapability } from '@/services/entitlementCore';
import { buildFinanceInsights } from '@/services/financeInsights';
import {
  detectCommitmentPriceChanges,
  detectMissedRecurring,
} from '@/services/recurringInsightsCore';
import { useFinanceStore } from '@/stores/useFinanceStore';
import { useProductAccessStore } from '@/stores/useProductAccessStore';

function HeaderBar({ title }: { title: string }) {
  const { colors, spacing, typography } = useFinanceTheme();
  return (
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
      <Text style={[typography.bodyMedium, { color: colors.text }]}>{title}</Text>
      <View style={styles.back} />
    </View>
  );
}

export default function AnalyticsScreen() {
  const { colors, spacing, radius, typography } = useFinanceTheme();
  const transactions = useFinanceStore((state) => state.transactions);
  const categories = useFinanceStore((state) => state.categories);
  const budgets = useFinanceStore((state) => state.budgets);
  const recurringOverrides = useFinanceStore((state) => state.recurringOverrides);
  const access = useProductAccessStore((state) => state.access);
  const canAnalyze = hasCapability(access, 'premium_analytics');

  const comparison = useMemo(
    () => buildMonthlyComparison({ transactions, categories }),
    [transactions, categories],
  );
  const trendReport = useMemo(
    () => buildCategoryTrends({ transactions, categories, months: 6 }),
    [transactions, categories],
  );
  const recurringItems = useMemo(
    () => buildFinanceInsights({ transactions, categories, budgets, recurringOverrides }).recurringItems,
    [transactions, categories, budgets, recurringOverrides],
  );
  const latestBookedDate = useMemo(() => {
    let latest: string | null = null;
    for (const transaction of transactions) {
      if (transaction.bookingStatus === 'pending') continue;
      if (!latest || transaction.bookingDate > latest) latest = transaction.bookingDate.slice(0, 10);
    }
    return latest;
  }, [transactions]);

  const priceChanges = useMemo(
    () => detectCommitmentPriceChanges(recurringItems),
    [recurringItems],
  );
  const missed = useMemo(
    () => detectMissedRecurring({ items: recurringItems, latestBookedDate }),
    [recurringItems, latestBookedDate],
  );

  if (!canAnalyze) {
    return (
      <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: colors.background }]}>
        <HeaderBar title="Analysen" />
        <View style={{ padding: spacing.lg }}>
          <FinanceCard variant="highlight">
            <Text style={[typography.cardTitle, { color: colors.text }]}>Analysen sind Premium</Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm }]}>
              Monatsvergleich, Kategorie-Trends, Abo-Preisänderungen und Hinweise auf ausgebliebene Zahlungen.
              Deine aktuellen Zahlen – Budgets, Fixkosten, nächste Zahlung – bleiben im Standard-Tarif auf Dashboard und Planung sichtbar.
            </Text>
            <FinanceButton
              label="Premium ansehen"
              onPress={() => router.push('/premium' as Href)}
              style={{ marginTop: spacing.xl }}
            />
          </FinanceCard>
        </View>
      </SafeAreaView>
    );
  }

  const monthName = (key: string) => {
    const [year, month] = key.split('-').map((part) => Number.parseInt(part, 10));
    return new Date(year, month - 1, 1).toLocaleDateString('de-DE', { month: 'long' });
  };

  const deltaLine = (label: string, delta: typeof comparison.expenses) => {
    const percent = delta.deltaPercent === null ? null : Math.round(delta.deltaPercent * 100);
    return (
      <View key={label} style={{ marginTop: spacing.md }}>
        <View style={styles.rowBetween}>
          <Text style={[typography.bodyMedium, { color: colors.text }]}>{label}</Text>
          <MoneyText amountMinor={delta.currentMinor} currency="EUR" size="s" forceSign={null} />
        </View>
        <Text
          style={[
            typography.caption,
            {
              marginTop: spacing.xxs,
              color:
                delta.direction === 'flat'
                  ? colors.textSecondary
                  : (label === 'Ausgaben') === (delta.direction === 'up')
                    ? colors.negative
                    : colors.positive,
            },
          ]}
        >
          {delta.deltaMinor === 0
            ? 'unverändert zum Vormonat'
            : `${delta.deltaMinor > 0 ? '+' : ''}${formatMinorUnits(delta.deltaMinor, 'EUR')}${percent === null ? '' : ` (${percent > 0 ? '+' : ''}${percent} %)`} ggü. ${monthName(comparison.previousKey)}`}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: colors.background }]}>
      <HeaderBar title="Analysen" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {monthName(comparison.currentKey).toUpperCase()} GEGEN {monthName(comparison.previousKey).toUpperCase()}
        </Text>

        {comparison.hasEnoughData ? (
          <FinanceCard style={{ marginTop: spacing.sm }}>
            {deltaLine('Einnahmen', comparison.income)}
            {deltaLine('Ausgaben', comparison.expenses)}
            {deltaLine('Cashflow', comparison.cashflow)}
          </FinanceCard>
        ) : (
          <FinanceEmptyState
            title="Noch kein Vergleich möglich"
            description="Sobald zwei Monate mit Umsätzen vorliegen, erscheint hier der Monatsvergleich."
            style={{ marginTop: spacing.md }}
          />
        )}

        {comparison.topIncrease || comparison.topDecrease ? (
          <FinanceCard style={{ marginTop: spacing.md }}>
            <Text style={[typography.caption, { color: colors.textMuted }]}>GRÖSSTE VERÄNDERUNGEN</Text>
            {comparison.topIncrease ? (
              <View style={[styles.rowBetween, { marginTop: spacing.md }]}>
                <Text style={[typography.bodyMedium, { color: colors.text }]}>{comparison.topIncrease.name}</Text>
                <Text style={[typography.bodyMedium, { color: colors.negative }]}>
                  +{formatMinorUnits(comparison.topIncrease.deltaMinor, 'EUR')}
                </Text>
              </View>
            ) : null}
            {comparison.topDecrease ? (
              <View style={[styles.rowBetween, { marginTop: spacing.sm }]}>
                <Text style={[typography.bodyMedium, { color: colors.text }]}>{comparison.topDecrease.name}</Text>
                <Text style={[typography.bodyMedium, { color: colors.positive }]}>
                  {formatMinorUnits(comparison.topDecrease.deltaMinor, 'EUR')}
                </Text>
              </View>
            ) : null}
          </FinanceCard>
        ) : null}

        {priceChanges.length > 0 ? (
          <FinanceCard style={{ marginTop: spacing.md }}>
            <Text style={[typography.caption, { color: colors.textMuted }]}>ABO-/FIXKOSTEN-PREISÄNDERUNGEN</Text>
            {priceChanges.slice(0, 5).map((change) => (
              <View key={change.seriesKey} style={{ marginTop: spacing.md }}>
                <Text style={[typography.bodyMedium, { color: colors.text }]}>{change.title}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xxs }]}>
                  {formatMinorUnits(change.fromMinor, 'EUR')} → {formatMinorUnits(change.toMinor, 'EUR')}
                  {'  ·  '}
                  {change.deltaMinor > 0 ? '+' : ''}{Math.round(change.deltaPercent * 100)} %
                  {change.confidence === 'low' ? ' · unsicher' : ''}
                </Text>
              </View>
            ))}
          </FinanceCard>
        ) : null}

        {missed.length > 0 ? (
          <FinanceCard style={{ marginTop: spacing.md }}>
            <Text style={[typography.caption, { color: colors.warning }]}>ERWARTETE ZAHLUNG BISHER NICHT ERKANNT</Text>
            {missed.slice(0, 5).map((entry) => (
              <View key={entry.seriesKey} style={{ marginTop: spacing.md }}>
                <Text style={[typography.bodyMedium, { color: colors.text }]}>{entry.title}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xxs }]}>
                  Letzte Zahlung {entry.lastDate} · seit {entry.daysOverdue} Tagen über dem erwarteten Fenster. Keine Aussage über eine Kündigung.
                </Text>
              </View>
            ))}
          </FinanceCard>
        ) : null}

        <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xxxl }]}>
          KATEGORIE-TRENDS · {trendReport.monthKeys.length} MONATE
        </Text>
        {trendReport.trends.slice(0, 8).map((trend) => {
          const peak = Math.max(1, ...trend.points.map((point) => point.amountMinor));
          return (
            <FinanceCard key={trend.categoryId} style={{ marginTop: spacing.sm }}>
              <View style={styles.rowBetween}>
                <Text style={[typography.bodyMedium, { color: colors.text }]}>{trend.name}</Text>
                <Text
                  style={[
                    typography.caption,
                    {
                      color:
                        trend.slope === 'rising'
                          ? colors.negative
                          : trend.slope === 'falling'
                            ? colors.positive
                            : colors.textSecondary,
                    },
                  ]}
                >
                  {trend.slope === 'rising' ? 'steigend' : trend.slope === 'falling' ? 'fallend' : 'stabil'} · {Math.round(trend.sharePercent * 100)} %
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, marginTop: spacing.md, height: 36 }}>
                {trend.points.map((point) => (
                  <View
                    key={point.monthKey}
                    style={{
                      flex: 1,
                      height: `${Math.max(4, Math.round((point.amountMinor / peak) * 100))}%`,
                      borderRadius: radius.sm,
                      backgroundColor: colors.surfaceInteractive,
                    }}
                  />
                ))}
              </View>
              <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                aktuell {formatMinorUnits(trend.currentMinor, 'EUR')} · Ø {formatMinorUnits(trend.averageMinor, 'EUR')}
              </Text>
            </FinanceCard>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 46, height: 46 },
  backContent: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 28, fontWeight: '600', marginTop: -2 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
