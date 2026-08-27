import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FinanceDialog, type FinanceDialogConfig } from '@/components/feedback/FinanceDialog';
import { FinanceTextField } from '@/components/forms/FinanceTextField';
import { FinanceButton } from '@/components/interaction/FinanceButton';
import { FinancePressable } from '@/components/interaction/FinancePressable';
import { FinanceKeyboardScreen } from '@/components/layout/FinanceKeyboardScreen';
import { debugLog } from '@/core/debugLog';
import { decimalToMinorUnits } from '@/core/money';
import { upsertMonthlyCategoryBudget } from '@/db/repositories/budgets';
import { useFinanceTheme } from '@/hooks/use-finance-theme';
import { performFinanceHaptic } from '@/services/haptics';
import { useFinanceStore } from '@/stores/useFinanceStore';

export default function BudgetNewScreen() {
  const { colors, spacing, typography } = useFinanceTheme();
  const categories = useFinanceStore((state) => state.categories);
  const budgets = useFinanceStore((state) => state.budgets);
  const refreshFinanceData = useFinanceStore((state) => state.refreshFinanceData);
  const expenseCategories = useMemo(
    () => categories.filter((category) => !category.isIncomeCategory),
    [categories],
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [dialog, setDialog] = useState<FinanceDialogConfig | null>(null);
  const amountRef = useRef<TextInput | null>(null);

  async function saveBudget() {
    if (isSaving) return;
    const category = expenseCategories.find((item) => item.id === selectedCategoryId);

    if (!category) {
      setDialog({ title: 'Kategorie auswählen', message: 'Ein Monatsbudget braucht eine Ausgabenkategorie.', confirmLabel: 'Verstanden' });
      return;
    }

    const amountMinor = decimalToMinorUnits(amount.trim().replace(',', '.') || '0');
    if (amountMinor <= 0) {
      setDialog({ title: 'Budgetbetrag fehlt', message: 'Bitte gib ein monatliches Limit größer als 0 Euro ein.', confirmLabel: 'Verstanden' });
      return;
    }

    setIsSaving(true);
    try {
      await upsertMonthlyCategoryBudget({ categoryId: category.id, name: category.name, amountMinor });
      await refreshFinanceData();
      await performFinanceHaptic('success');
      router.back();
    } catch (error) {
      debugLog.error('PLANNING', 'Monatsbudget konnte nicht gespeichert werden', error);
      setDialog({ title: 'Budget konnte nicht gespeichert werden', message: 'Deine Eingaben bleiben erhalten. Bitte versuche es erneut.', confirmLabel: 'Verstanden' });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: colors.background }]}>
      <FinanceKeyboardScreen
        backgroundColor={colors.background}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}
        header={
          <View style={[styles.header, { paddingHorizontal: spacing.md, paddingVertical: spacing.md }]}>
            <FinancePressable accessibilityRole="button" accessibilityLabel="Zurück" onPress={() => router.back()} intent="navigation" style={[styles.backButton, { backgroundColor: colors.surface, borderRadius: 23 }]} contentStyle={styles.backContent}>
              <Text style={[styles.backIcon, { color: colors.text }]}>‹</Text>
            </FinancePressable>
            <Text style={[typography.bodyMedium, { color: colors.text }]}>Neues Monatsbudget</Text>
            <View style={styles.headerSpacer} />
          </View>
        }
      >
        <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>AUSGABENKATEGORIE</Text>
        <View style={{ gap: spacing.xs }}>
          {expenseCategories.map((category) => {
            const selected = selectedCategoryId === category.id;
            const existing = budgets.some((budget) => budget.categoryId === category.id && budget.period === 'monthly');
            return (
              <FinancePressable
                key={category.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${category.name}${existing ? ', vorhandenes Budget ändern' : ''}`}
                onPress={() => { setSelectedCategoryId(category.id); amountRef.current?.focus(); }}
                intent="navigation"
                style={{ backgroundColor: selected ? colors.surfaceInteractive : colors.surface, borderRadius: 12, borderWidth: 1, borderColor: selected ? colors.primary : colors.border }}
                contentStyle={{ padding: spacing.md }}
              >
                <Text style={[typography.bodyMedium, { color: colors.text }]}>{category.icon ? `${category.icon} ` : ''}{category.name}</Text>
                {existing ? <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xxs }]}>Vorhandenes Monatsbudget wird aktualisiert</Text> : null}
              </FinancePressable>
            );
          })}
        </View>
        {expenseCategories.length === 0 ? <Text style={[typography.body, { color: colors.textSecondary }]}>Lege zuerst eine Ausgabenkategorie an.</Text> : null}
        <FinanceTextField
          containerStyle={{ marginTop: spacing.xl }}
          inputRef={amountRef}
          label="MONATLICHES LIMIT (EUR)"
          value={amount}
          onChangeText={setAmount}
          placeholder="0,00"
          keyboardType="decimal-pad"
          returnKeyType="done"
          helperText="Gebuchte Ausgaben dieser Kategorie zählen automatisch. Eigene Überweisungen und vorgemerkte Umsätze zählen nicht."
          onSubmitEditing={() => { void saveBudget(); }}
        />
        <FinanceButton label="Monatsbudget speichern" loading={isSaving} disabled={isSaving || expenseCategories.length === 0} onPress={() => { void saveBudget(); }} style={{ width: '100%', marginTop: spacing.xl }} />
      </FinanceKeyboardScreen>
      <FinanceDialog visible={dialog !== null} config={dialog} onClose={() => setDialog(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 46, height: 46 },
  backContent: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 28, fontWeight: '600', marginTop: -2 },
  headerSpacer: { width: 46 },
});
