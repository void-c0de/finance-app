import {
  router,
  useFocusEffect,
  useLocalSearchParams,
} from 'expo-router';

import {
  useCallback,
  useRef,
  useState,
} from 'react';

import {
  Alert,
  StyleSheet,
  Text,
  View,
  type TextInput,
} from 'react-native';

import {
  SafeAreaView,
} from 'react-native-safe-area-context';

import {
  debugLog,
} from '@/core/debugLog';

import {
  APP_ERROR_CODES,
} from '@/core/errorCodes';

import {
  decimalToMinorUnits,

  minorUnitsToMajorNumber,
} from '@/core/money';

import {
  archiveGoal,

  getGoalById,

  updateGoal,
} from '@/db/repositories/savingsGoals';

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
  FinanceEmptyState,
} from '@/components/states/FinanceEmptyState';

import {
  useFinanceTheme,
} from '@/hooks/use-finance-theme';

import {
  performFinanceHaptic,
} from '@/services/haptics';

import {
  useFinanceStore,
} from '@/stores/useFinanceStore';

export default function GoalEditScreen() {
  const {
    id,
  } =
    useLocalSearchParams<{
      id:
        string;
    }>();

  const goalId =
    typeof id ===
      'string'
      ? id
      : '';

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
    targetDate,
    setTargetDate,
  ] =
    useState('');

  const [
    ruleKeyword,
    setRuleKeyword,
  ] =
    useState('');

  const [
    isLoaded,
    setIsLoaded,
  ] =
    useState(false);

  const [
    goalNotFound,
    setGoalNotFound,
  ] =
    useState(false);

  const [
    isBusy,
    setIsBusy,
  ] =
    useState(false);

  const dateInputRef =
    useRef<TextInput | null>(
      null,
    );

  useFocusEffect(
    useCallback(
      () => {
        let active =
          true;

        async function load() {
          if (
            !goalId
          ) {
            setGoalNotFound(true);

            setIsLoaded(true);

            return;
          }

          try {
            const goal =
              await getGoalById(
                goalId,
              );

            if (
              !active
            ) {
              return;
            }

            if (
              !goal
            ) {
              setGoalNotFound(true);
            } else {
              setName(
                goal.name,
              );

              setTargetAmount(
                minorUnitsToMajorNumber(
                  goal.targetAmountMinor,
                  goal.currency,
                )
                  .toString()
                  .replace(
                    '.',
                    ',',
                  ),
              );

              setTargetDate(
                goal.targetDate ??
                  '',
              );

              setRuleKeyword(
                goal.ruleKeyword ??
                  '',
              );
            }

            setIsLoaded(true);
          } catch (error) {
            debugLog.error(
              'PLANNING',

              `${APP_ERROR_CODES.GOALS_LOAD_FAILED}: Sparziel ${goalId} konnte nicht geladen werden`,

              error,
            );

            if (active) {
              setGoalNotFound(true);

              setIsLoaded(true);
            }
          }
        }

        void load();

        return () => {
          active = false;
        };
      },

      [
        goalId,
      ],
    ),
  );

  async function saveChanges() {
    if (
      isBusy ||
      !goalId
    ) {
      return;
    }

    const trimmedName =
      name.trim();

    if (
      !trimmedName
    ) {
      Alert.alert(
        'Name fehlt',

        'Bitte gib deinem Sparziel einen Namen.',
      );

      return;
    }

    const normalizedTarget =
      targetAmount.trim().replace(
        ',',
        '.',
      );

    let targetMinor =
      0;

    try {
      targetMinor =
        decimalToMinorUnits(
          normalizedTarget || '0',
        );
    } catch {
      targetMinor =
        0;
    }

    if (
      targetMinor <=
      0
    ) {
      Alert.alert(
        'Zielbetrag prüfen',

        'Bitte gib einen Zielbetrag größer Null an.',
      );

      return;
    }

    const normalizedDate =
      targetDate.trim();

    if (
      normalizedDate &&
      !/^\d{4}-\d{2}-\d{2}$/.test(
        normalizedDate,
      )
    ) {
      Alert.alert(
        'Zieldatum prüfen',

        'Bitte das Datum im Format JJJJ-MM-TT eingeben oder leer lassen.',
      );

      return;
    }

    setIsBusy(true);

    try {
      await updateGoal(
        goalId,

        {
          name:
            trimmedName,

          targetAmountMinor:
            targetMinor,

          targetDate:

            normalizedDate ||
            null,

          ruleKeyword:

            ruleKeyword.trim() ||
            null,
        },
      );

      await refreshFinanceData();

      await performFinanceHaptic(
        'success',
      );

      router.back();
    } catch (error) {
      debugLog.error(
        'PLANNING',

        `${APP_ERROR_CODES.GOAL_UPDATE_FAILED}: Sparziel ${goalId} konnte nicht aktualisiert werden`,

        error,
      );

      Alert.alert(
        'Sparziel konnte nicht aktualisiert werden',

        'Bitte versuche es erneut.',
      );
    } finally {
      setIsBusy(false);
    }
  }

  function requestArchive() {
    Alert.alert(
      'Sparziel archivieren?',

      'Das Ziel verschwindet aus der Planung, bleibt aber mit seiner Historie erhalten.',

      [
        {
          text:
            'Abbrechen',

          style:
            'cancel',
        },

        {
          text:
            'Archivieren',

          style:
            'destructive',

          onPress: () => {
            void runArchive();
          },
        },
      ],
    );
  }

  async function runArchive() {
    if (
      isBusy ||
      !goalId
    ) {
      return;
    }

    setIsBusy(true);

    try {
      await archiveGoal(
        goalId,
      );

      await refreshFinanceData();

      await performFinanceHaptic(
        'warning',
      );

      router.back();
    } catch (error) {
      debugLog.error(
        'PLANNING',

        `${APP_ERROR_CODES.GOAL_UPDATE_FAILED}: Sparziel ${goalId} konnte nicht archiviert werden`,

        error,
      );

      Alert.alert(
        'Sparziel konnte nicht archiviert werden',

        'Bitte versuche es erneut.',
      );
    } finally {
      setIsBusy(false);
    }
  }

  if (
    !isLoaded
  ) {
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
        <HeaderBar />

        <FinanceEmptyState
          title="Sparziel wird geladen…"

          style={{
            margin:
              spacing.xl,
          }}
        />
      </SafeAreaView>
    );
  }

  if (
    goalNotFound
  ) {
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
        <HeaderBar />

        <FinanceEmptyState
          title="Sparziel nicht gefunden"

          description="Möglicherweise wurde es bereits gelöscht."

          style={{
            margin:
              spacing.xl,
          }}
        />
      </SafeAreaView>
    );
  }

  function HeaderBar() {
    return (
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
          numberOfLines={
            1
          }

          style={[
            typography.bodyMedium,

            styles.headerTitle,

            {
              color:
                colors.text,
            },
          ]}
        >
          Sparziel bearbeiten
        </Text>

        <View
          style={
            styles.headerSpacer
          }
        />
      </View>
    );
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
      <HeaderBar />

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
      >
        <FinanceTextField
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
            dateInputRef.current?.focus()
          }

          blurOnSubmit={
            false
          }
        />

        <FinanceTextField
          containerStyle={{
            marginTop:
              spacing.md,
          }}

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

          onSubmitEditing={() => {
            void saveChanges();
          }}
        />

        <FinanceTextField
          containerStyle={{
            marginTop:
              spacing.md,
          }}

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
            void saveChanges();
          }}
        />

        <FinanceTextField
          containerStyle={{
            marginTop:
              spacing.lg,
          }}

          label="AUTOMATISCHES TRACKING (OPTIONAL)"

          value={
            ruleKeyword
          }

          onChangeText={
            setRuleKeyword
          }

          placeholder="z. B. SPARPLAN"

          autoCapitalize="characters"

          returnKeyType="done"

          helperText="Eingehende Umsätze mit diesem Stichwort zählen automatisch auf das Ziel. Leer = nur manuell."

          onSubmitEditing={() => {
            void saveChanges();
          }}
        />

        <FinanceButton
          label="Änderungen speichern"

          loading={
            isBusy
          }

          disabled={
            isBusy
          }

          onPress={() => {
            void saveChanges();
          }}

          style={{
            width:
              '100%',

            marginTop:
              spacing.xl,
          }}
        />

        <FinanceButton
          label="Archivieren"

          variant="secondary"

          disabled={
            isBusy
          }

          onPress={
            requestArchive
          }

          style={{
            width:
              '100%',

            marginTop:
              spacing.md,
          }}
        />
      </FinanceKeyboardScreen>
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

    headerTitle: {
      flex:
        1,

      textAlign:
        'center',
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
