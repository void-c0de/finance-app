import {
  router,
} from 'expo-router';

import {
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

    const targetMinor =
      decimalToMinorUnits(
        normalizedTarget || '0',
      );

    if (
      targetMinor <=
      0
    ) {
      Alert.alert(
        'Zielbetrag fehlt',

        'Bitte gib an, wie viel du sparen möchtest.',
      );

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
      Alert.alert(
        'Zieldatum prüfen',

        'Bitte das Datum im Format JJJJ-MM-TT eingeben oder leer lassen.',
      );

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

      Alert.alert(
        'Sparziel konnte nicht angelegt werden',

        'Bitte versuche es erneut.',
      );
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
            targetInputRef.current?.focus()
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

          label="STARTBETRAG (EUR, OPTIONAL)"

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
