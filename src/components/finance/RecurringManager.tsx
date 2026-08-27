import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { FinanceButton } from '@/components/interaction/FinanceButton';
import { FinancePressable } from '@/components/interaction/FinancePressable';
import { MoneyText } from '@/components/finance/MoneyText';
import { FinanceEmptyState } from '@/components/states/FinanceEmptyState';
import { debugLog } from '@/core/debugLog';
import { formatMinorUnits } from '@/core/money';
import { useFinanceTheme } from '@/hooks/use-finance-theme';
import { performFinanceHaptic } from '@/services/haptics';
import {
  RECURRING_KIND_LABEL,
  type RecurringItem,
  type RecurringKind,
} from '@/services/recurringInsightsCore';
import {
  clearRecurringSeries,
  confirmRecurringSeries,
  muteRecurringSeries,
  setRecurringSeriesKind,
} from '@/services/recurringService';

type Props = {
  items: readonly RecurringItem[];
  /** Wird nach jeder erfolgreichen Korrektur aufgerufen (i. d. R. refreshFinanceData). */
  onChanged: () => void | Promise<void>;
};

const KIND_ORDER: Record<RecurringKind, number> = {
  subscription: 0,
  bill: 1,
  uncertain: 2,
  income: 3,
};

const EXPENSE_KINDS: { kind: RecurringKind; label: string }[] = [
  { kind: 'subscription', label: 'Abo' },
  { kind: 'bill', label: 'Rechnung' },
  { kind: 'income', label: 'Einkommen' },
];

export function RecurringManager({ items, onChanged }: Props) {
  const { colors, spacing, radius, typography } = useFinanceTheme();
  const [active, setActive] = useState<RecurringItem | null>(null);
  const [busy, setBusy] = useState(false);

  const sorted = [...items].sort((left, right) => {
    const byKind = KIND_ORDER[left.kind] - KIND_ORDER[right.kind];
    if (byKind !== 0) return byKind;
    return right.monthlyEstimateMinor - left.monthlyEstimateMinor;
  });

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await performFinanceHaptic('success');
      setActive(null);
      await onChanged();
    } catch (error) {
      debugLog.error('PLANNING', 'Wiederkehrend-Korrektur fehlgeschlagen', error);
      await performFinanceHaptic('warning');
    } finally {
      setBusy(false);
    }
  }

  if (sorted.length === 0) {
    return (
      <FinanceEmptyState
        title="Noch keine wiederkehrenden Zahlungen"
        description="Sobald regelmäßige Umsätze erkannt werden, erscheinen sie hier – mit der Möglichkeit, sie zu bestätigen oder zu korrigieren."
        style={{ margin: spacing.lg }}
      />
    );
  }

  return (
    <View>
      {sorted.map((item, index) => {
        const uncertain = item.kind === 'uncertain' || (!item.userConfirmed && item.confidence !== 'high');
        return (
          <FinancePressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${RECURRING_KIND_LABEL[item.kind]}, bearbeiten`}
            onPress={() => {
              void performFinanceHaptic('selection');
              setActive(item);
            }}
            intent="navigation"
            style={index > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : undefined}
            contentStyle={{ padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
          >
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Text style={[typography.bodyMedium, { color: colors.text }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <View
                  style={{
                    paddingHorizontal: spacing.xs,
                    paddingVertical: 2,
                    borderRadius: radius.sm,
                    backgroundColor: uncertain ? colors.warningSoft : colors.surfaceInteractive,
                  }}
                >
                  <Text
                    style={[
                      typography.caption,
                      { color: uncertain ? colors.warning : colors.textSecondary },
                    ]}
                  >
                    {item.userConfirmed ? 'bestätigt' : RECURRING_KIND_LABEL[item.kind]}
                  </Text>
                </View>
              </View>
              <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xxs }]}>
                {formatMinorUnits(item.monthlyEstimateMinor, item.currency)} / Monat · nächste {item.nextDate}
              </Text>
            </View>
            <MoneyText
              amountMinor={item.amountMinor}
              currency={item.currency}
              size="s"
              forceSign={item.direction === 'income' ? 'positive' : 'negative'}
            />
          </FinancePressable>
        );
      })}

      <Modal
        visible={active !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setActive(null)}
      >
        <FinancePressable
          accessibilityRole="button"
          accessibilityLabel="Schließen"
          onPress={() => setActive(null)}
          intent="navigation"
          style={[styles.scrim, { backgroundColor: colors.scrim }]}
        >
          <View
            onStartShouldSetResponder={() => true}
            style={[
              styles.sheet,
              { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.xl, padding: spacing.lg },
            ]}
          >
            {active ? (
              <>
                <Text style={[typography.title, { color: colors.text }]}>{active.title}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xxs, marginBottom: spacing.lg }]}>
                  {active.reason} · {active.confidence === 'high' ? 'hohe' : active.confidence === 'medium' ? 'mittlere' : 'niedrige'} Konfidenz
                </Text>

                {!active.userConfirmed ? (
                  <FinanceButton
                    label={`Als ${RECURRING_KIND_LABEL[active.kind]} bestätigen`}
                    loading={busy}
                    onPress={() => { void run(() => confirmRecurringSeries(active)); }}
                    style={{ width: '100%' }}
                  />
                ) : null}

                {active.direction === 'expense'
                  ? EXPENSE_KINDS.filter((entry) => entry.kind !== active.kind || !active.userConfirmed).map((entry) => (
                      <FinanceButton
                        key={entry.kind}
                        label={`Als ${entry.label} einordnen`}
                        variant="secondary"
                        loading={busy}
                        onPress={() => { void run(() => setRecurringSeriesKind(active, entry.kind)); }}
                        style={{ width: '100%', marginTop: spacing.sm }}
                      />
                    ))
                  : null}

                <FinanceButton
                  label="Keine wiederkehrende Zahlung"
                  variant="danger"
                  loading={busy}
                  onPress={() => { void run(() => muteRecurringSeries(active)); }}
                  style={{ width: '100%', marginTop: spacing.sm }}
                />

                {active.userConfirmed ? (
                  <FinanceButton
                    label="Automatik entscheiden lassen"
                    variant="ghost"
                    loading={busy}
                    onPress={() => { void run(() => clearRecurringSeries(active.key)); }}
                    style={{ width: '100%', marginTop: spacing.sm }}
                  />
                ) : null}

                <FinanceButton
                  label="Abbrechen"
                  variant="ghost"
                  onPress={() => setActive(null)}
                  style={{ width: '100%', marginTop: spacing.sm }}
                />
              </>
            ) : null}
          </View>
        </FinancePressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', padding: 16 },
  sheet: { width: '100%', maxWidth: 480, alignSelf: 'center', borderWidth: StyleSheet.hairlineWidth, marginBottom: 12 },
});
