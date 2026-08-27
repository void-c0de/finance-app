import {
  router,
} from 'expo-router';

import {
  useRef,
  useState,
} from 'react';

import {
  StyleSheet,
  Text,
  View,
  type TextInput,
} from 'react-native';

import {
  SafeAreaView,
} from 'react-native-safe-area-context';

import {
  FinanceTextField,
} from '@/components/forms/FinanceTextField';

import {
  FinanceKeyboardScreen,
} from '@/components/layout/FinanceKeyboardScreen';

import {
  FinanceButton,
} from '@/components/interaction/FinanceButton';

import {
  FinancePressable,
} from '@/components/interaction/FinancePressable';

import {
  type FinanceDialogConfig,

  FinanceDialog,
} from '@/components/feedback/FinanceDialog';

import {
  APP_ERROR_CODES,
} from '@/core/errorCodes';

import {
  decimalToMinorUnits,
} from '@/core/money';

import {
  debugLog,
} from '@/core/debugLog';

import {
  createGoal,
} from '@/db/repositories/savingsGoals';

import {
  useFinanceTheme,
} from '@/hooks/use-finance-theme';

import {
  performFinanceHaptic,
} from '@/services/haptics';

import {
  useFinanceStore,
} from '@/stores/useFinanceStore';

import { hasCapability, quotaState, type PremiumGateContext } from '@/services/entitlementCore';
import { PremiumSheet } from '@/components/premium/PremiumSheet';
import { useProductAccessStore } from '@/stores/useProductAccessStore';

export default function GoalNewScreen() {
  const {
    colors,
    spacing,
    typography,
  } =
    useFinanceTheme();

  const refreshFinanceData =
    useFinanceStore(
      (
        state
      ) =>
        state.refreshFinanceData,
    );

  const accounts = useFinanceStore((state) => state.accounts);
  const goals = useFinanceStore((state) => state.goals);
  const access = useProductAccessStore((state) => state.access);
  const canUseAdvancedTracking = hasCapability(access, 'advanced_planning');
  const manualGoalQuota = quotaState(
    access,
    'activeManualGoals',
    goals.filter((goal) => goal.trackingMode === 'manual').length,
  );
  const [premiumGate, setPremiumGate] = useState<PremiumGateContext | null>(null);
  const [trackingMode, setTrackingMode] = useState<'manual' | 'account_balance'>('manual');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const [
    name,
    setName,
  ] =
    useState('');

  const [
    targetAmount,
    setTargetAmount,
  ] =
    useState('');

  const [
    startingAmount,
    setStartingAmount,
  ] =
    useState('');

  const [
    targetDate,
    setTargetDate,
  ] =
    useState('');

  const [
    isSaving,
    setIsSaving,
  ] =
    useState(false);

  const [
    dialog,
    setDialog,
  ] =
    useState<FinanceDialogConfig | null>(
      null,
    );

  const targetInputRef =
    useRef<TextInput | null>(
      null,
    );

  const startingInputRef =
    useRef<TextInput | null>(
      null,
    );

  const dateInputRef =
    useRef<TextInput | null>(
      null,
    );

  async function saveGoal() {
    const trimmedName =
      name.trim();

    if (
      isSaving
    ) {
      return;
    }

    if (
      !trimmedName
    ) {
      setDialog({
        title: 'Name fehlt',

        message: 'Bitte gib deinem Sparziel einen Namen.',

        confirmLabel: 'Verstanden',
      });

      return;
    }

    const normalizedTarget =
      targetAmount.trim().replace(
        ',',
        '.',
      );

    const targetMinor =
      decimalToMinorUnits(
        normalizedTarget || '0',
      );

    if (
      targetMinor <=
      0
    ) {
      setDialog({
        title: 'Zielbetrag fehlt',

        message: 'Bitte gib an, wie viel du sparen möchtest.',

        confirmLabel: 'Verstanden',
      });

      return;
    }

    if (trackingMode === 'account_balance' && !selectedAccountId) {
      setDialog({ title: 'Konto auswählen', message: 'Bitte wähle das Konto, dessen Kontostand dieses Sparziel verfolgen soll.', confirmLabel: 'Verstanden' });
      return;
    }

    if (trackingMode === 'account_balance' && !canUseAdvancedTracking) {
      setTrackingMode('manual');
      setSelectedAccountId(null);
      setPremiumGate('account_linked_goal');
      return;
    }

    if (trackingMode === 'manual' && manualGoalQuota.reached) {
      setPremiumGate('goals_quota');
      return;
    }

    let startingMinor =
      0;

    const normalizedStarting =
      startingAmount.trim().replace(
        ',',
        '.',
      );

    if (
      normalizedStarting
    ) {
      startingMinor =
        Math.max(
          0,

          decimalToMinorUnits(
            normalizedStarting,
          ),
        );
    }

    const normalizedDate =
      targetDate.trim();

    if (
      normalizedDate &&
      !/^\d{4}-\d{2}-\d{2}$/.test(
        normalizedDate,
      )
    ) {
      setDialog({
        title: 'Zieldatum prüfen',

        message: 'Bitte das Datum im Format JJJJ-MM-TT eingeben oder leer lassen.',

        confirmLabel: 'Verstanden',
      });

      return;
    }

    setIsSaving(true);

    try {
      await createGoal({
        name:
          trimmedName,

        targetAmountMinor:
          targetMinor,

        startingAmountMinor:
          startingMinor,

        targetDate:
          normalizedDate ||
          undefined,

        trackingMode,

        linkedAccountId:
          trackingMode === 'account_balance'
            ? selectedAccountId ?? undefined
            : undefined,
      });

      await refreshFinanceData();

      await performFinanceHaptic(
        'success',
      );

      router.back();
    } catch (error) {
      debugLog.error(
        'PLANNING',

        `${APP_ERROR_CODES.GOAL_CREATE_FAILED}: Sparziel konnte nicht angelegt werden`,

        error,
      );

      setDialog({
        title: 'Sparziel konnte nicht angelegt werden',

        message: 'Bitte versuche es erneut.',

        confirmLabel: 'Verstanden',
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SafeAreaView
      edges={[
        'top',
      ]}

      style={[
        styles.flex,

        {
          backgroundColor:
            colors.background,
        },
      ]}
    >
      <FinanceKeyboardScreen
        backgroundColor={
          colors.background
        }

        contentContainerStyle={{
          paddingHorizontal:
            spacing.lg,

          paddingTop:
            spacing.lg,
        }}

        header={
          <View
            style={[
              styles.header,

              {
                paddingHorizontal:
                  spacing.md,

                paddingVertical:
                  spacing.md,
              },
            ]}
          >
            <FinancePressable
              accessibilityRole="button"

              accessibilityLabel="Zurück"

              onPress={() =>
                router.back()
              }

              intent="navigation"

              style={[
                styles.backButton,

                {
                  backgroundColor:
                    colors.surface,

                  borderRadius:
                    23,
                },
              ]}

              contentStyle={
                styles.backContent
              }
            >
              <Text
                style={[
                  styles.backIcon,

                  {
                    color:
                      colors.text,
                  },
                ]}
              >
                ‹
              </Text>
            </FinancePressable>

            <Text
              style={[
                typography.bodyMedium,

                {
                  color:
                    colors.text,
                },
              ]}
            >
              Neues Sparziel
            </Text>

            <View
              style={
                styles.headerSpacer
              }
            />
          </View>
        }
      >        <FinanceTextField
          label="NAME"

          value={
            name
          }

          onChangeText={
            setName
          }

          placeholder="z. B. Notgroschen"

          returnKeyType="next"

          onSubmitEditing={() =>
            targetInputRef.current?.focus()
          }

          blurOnSubmit={
            false
          }
        />

        <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xl, marginBottom: spacing.sm }]}>FORTSCHRITT</Text>

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <FinanceButton
            label="Manuell"
            size="small"
            variant={trackingMode === 'manual' ? 'primary' : 'secondary'}
            onPress={() => { setTrackingMode('manual'); setSelectedAccountId(null); }}
            style={{ flex: 1 }}
          />
          <FinanceButton
            label={canUseAdvancedTracking ? 'Mit Konto' : 'Mit Konto · Premium'}
            size="small"
            variant={trackingMode === 'account_balance' ? 'primary' : 'secondary'}
            onPress={() => {
              if (canUseAdvancedTracking) setTrackingMode('account_balance');
              else setPremiumGate('account_linked_goal');
            }}
            style={{ flex: 1 }}
          />
        </View>

        {!canUseAdvancedTracking ? (
          <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.sm }]}>Premium kann den Fortschritt direkt aus einem verknüpften Bankkonto übernehmen.</Text>
        ) : null}

        {trackingMode === 'account_balance' ? (
          <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
            {accounts.map((account) => (
              <FinancePressable
                key={account.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: selectedAccountId === account.id }}
                onPress={() => setSelectedAccountId(account.id)}
                intent="navigation"
                style={{ backgroundColor: selectedAccountId === account.id ? colors.surfaceInteractive : colors.surface, borderRadius: 12, borderWidth: 1, borderColor: selectedAccountId === account.id ? colors.primary : colors.border }}
                contentStyle={{ padding: spacing.md }}
              >
                <Text style={[typography.bodyMedium, { color: colors.text }]}>{account.name}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xxs }]}>{account.institutionName ?? account.providerId} · {account.type === 'savings' ? 'Sparkonto' : 'Konto'}</Text>
              </FinancePressable>
            ))}
            {accounts.length === 0 ? <Text style={[typography.caption, { color: colors.textSecondary }]}>Noch kein verfügbares Konto. Verbinde zuerst eine Bank.</Text> : null}
          </View>
        ) : null}

        <FinanceTextField
          containerStyle={{
            marginTop:
              spacing.md,
          }}

          inputRef={
            targetInputRef
          }

          label="ZIELBETRAG (EUR)"

          value={
            targetAmount
          }

          onChangeText={
            setTargetAmount
          }

          placeholder="0,00"

          keyboardType="decimal-pad"

          helperText="Komma oder Punkt erlaubt"
        />

        <FinanceTextField
          containerStyle={{
            marginTop:
              spacing.md,
          }}

          inputRef={
            startingInputRef
          }

          label={trackingMode === 'account_balance' ? 'STARTBETRAG (NICHT VERWENDET)' : 'STARTBETRAG (EUR, OPTIONAL)'}

          value={
            startingAmount
          }

          onChangeText={
            setStartingAmount
          }

          placeholder="0,00"

          keyboardType="decimal-pad"

          returnKeyType="next"

          onSubmitEditing={() =>
            dateInputRef.current?.focus()
          }

          blurOnSubmit={
            false
          }

          helperText={trackingMode === 'account_balance' ? 'Der verknüpfte Kontostand ist die einzige Fortschrittsquelle.' : undefined}
        />

        <FinanceTextField
          containerStyle={{
            marginTop:
              spacing.md,
          }}

          inputRef={
            dateInputRef
          }

          label="ZIELDATUM (OPTIONAL)"

          value={
            targetDate
          }

          onChangeText={
            setTargetDate
          }

          placeholder="JJJJ-MM-TT"

          returnKeyType="done"

          onSubmitEditing={() => {
            void saveGoal();
          }}
        />

        <FinanceButton
          label="Sparziel anlegen"

          loading={
            isSaving
          }

          disabled={
            isSaving
          }

          onPress={() => {
            void saveGoal();
          }}

          style={{
            width:
              '100%',

            marginTop:
              spacing.xl,
          }}
        />
      </FinanceKeyboardScreen>

      <FinanceDialog
        visible={
          dialog !==
          null
        }

        config={
          dialog
        }

        onClose={() =>
          setDialog(null)
        }
      />

      <PremiumSheet
        context={premiumGate}
        onClose={() => setPremiumGate(null)}
        personalNote={
          premiumGate === 'goals_quota'
            ? `Du nutzt bereits deine ${manualGoalQuota.limit} Standard-Sparziele. Deine bestehenden Sparziele bleiben erhalten.`
            : undefined
        }
      />
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    flex: {
      flex:
        1,
    },

    header: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',
    },

    backButton: {
      width:
        46,

      height:
        46,
    },

    backContent: {
      width:
        46,

      height:
        46,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    backIcon: {
      fontSize:
        28,

      fontWeight:
        '600',

      marginTop:
        -2,
    },

    headerSpacer: {
      width:
        46,
    },
  });
