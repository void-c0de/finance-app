import {
  type Href,
  router,
  useFocusEffect,
  useLocalSearchParams,
} from 'expo-router';

import {
  useCallback,
  useState,
} from 'react';

import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
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

  formatMinorUnits,
} from '@/core/money';

import {
  addContribution,

  deleteContribution,

  deleteGoal,

  getGoalById,

  listContributions,
} from '@/db/repositories/savingsGoals';

import {
  goalProgressBarPercent,
  goalProgressPercent,
} from '@/services/goalProgressCore';

import {
  FinanceCard,
} from '@/components/finance/FinanceCard';

import {
  MoneyText,
} from '@/components/finance/MoneyText';

import {
  FinanceTextField,
} from '@/components/forms/FinanceTextField';

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
  type FinanceDialogConfig,

  FinanceDialog,
} from '@/components/feedback/FinanceDialog';

import {
  useFinanceTheme,
} from '@/hooks/use-finance-theme';

import {
  performFinanceHaptic,
} from '@/services/haptics';

import {
  useFinanceStore,
} from '@/stores/useFinanceStore';

import type {
  GoalContribution,

  SavingsGoal,
} from '@/types/finance';

const QUICK_ADD_EUR =
  [10, 25, 50];

export default function GoalDetailScreen() {
  const {
    colors,
    spacing,
    typography,
  } =
    useFinanceTheme();

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

  const refreshFinanceData =
    useFinanceStore(
      (
        state
      ) =>
        state.refreshFinanceData,
    );

  const accounts = useFinanceStore((state) => state.accounts);

  const [
    goal,
    setGoal,
  ] =
    useState<SavingsGoal | null>(
      null,
    );

  const [
    contributions,
    setContributions,
  ] =
    useState<GoalContribution[]>(
      [],
    );

  const [
    isLoading,
    setIsLoading,
  ] =
    useState(true);

  const [
    depositAmount,
    setDepositAmount,
  ] =
    useState('');

  /*
   * +1 = Einzahlung,
   * -1 = Entnahme/Korrektur.
   * Der decimal-pad hat keine
   * Minus-Taste - deshalb der
   * dedizierte Vorzeichen-Toggle.
   */
  const [
    depositSign,
    setDepositSign,
  ] =
    useState<
      1 | -1
    >(1);

  const [
    isBusy,
    setIsBusy,
  ] =
    useState(false);

  const [
    dialog,
    setDialog,
  ] =
    useState<FinanceDialogConfig | null>(
      null,
    );

  const reload =
    useCallback(
      async () => {
        if (
          !goalId
        ) {
          setIsLoading(false);

          return;
        }

        try {
          const loadedGoal =
            await getGoalById(
              goalId,
            );

          setGoal(
            loadedGoal,
          );

          if (
            loadedGoal &&
            loadedGoal.trackingMode !== 'account_balance'
          ) {
            const rows =
              await listContributions(
                goalId,
              );

            setContributions(
              rows,
            );
          } else {
            setContributions(
              [],
            );
          }
        } catch (error) {
          debugLog.error(
            'PLANNING',

            `${APP_ERROR_CODES.GOALS_LOAD_FAILED}: Sparziel ${goalId} konnte nicht geladen werden`,

            error,
          );

          setGoal(null);
        } finally {
          setIsLoading(false);
        }
      },

      [
        goalId,
      ],
    );

  useFocusEffect(
    useCallback(
      () => {
        void reload();

        return undefined;
      },

      [
        reload,
      ],
    ),
  );

  async function persistContribution(
    amountMinor:
      number,

    note?:
      string,
  ) {
    if (
      isBusy ||
      !goal ||
      amountMinor ===
        0
    ) {
      return;
    }

    setIsBusy(true);

    try {
      await addContribution({
        goalId:
          goal.id,

        amountMinor,

        note,
      });

      await refreshFinanceData();

      await reload();

      await performFinanceHaptic(
        'success',
      );
    } catch (error) {
      debugLog.error(
        'PLANNING',

        `${APP_ERROR_CODES.CONTRIBUTION_FAILED}: Beitrag für ${goal.id} fehlgeschlagen`,

        error,
      );

      setDialog({
        title: 'Beitrag konnte nicht gespeichert werden',

        message: 'Bitte versuche es erneut.',

        confirmLabel: 'Verstanden',
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function saveManualDeposit() {
    if (goal?.trackingMode === 'account_balance') {
      setDialog({ title: 'Kontostand wird automatisch verfolgt', message: 'Bei diesem Ziel ist ausschließlich der verknüpfte Kontostand maßgeblich. Dadurch werden Einzahlungen nicht doppelt gezählt.', confirmLabel: 'Verstanden' });
      return;
    }
    const normalized =
      depositAmount.trim().replace(
        ',',
        '.',
      );

    if (
      !normalized
    ) {
      return;
    }

    let magnitudeMinor =
      0;

    try {
      magnitudeMinor =
        Math.abs(
          decimalToMinorUnits(
            normalized,
          ),
        );
    } catch {
      magnitudeMinor =
        0;
    }

    const amountMinor =
      depositSign *
        magnitudeMinor;

    if (
      amountMinor ===
      0
    ) {
      setDialog({
        title: 'Betrag prüfen',

        message: 'Bitte einen Betrag größer Null eingeben.',

        confirmLabel: 'Verstanden',
      });

      return;
    }

    await persistContribution(
      amountMinor,

      depositSign ===
        1
        ? 'Manuelle Einzahlung'

        : 'Manuelle Korrektur/Entnahme',
    );

    setDepositAmount('');

    setDepositSign(1);
  }

  async function quickAdd(
    euros:
      number,
  ) {
    await persistContribution(
      euros *
        100,

      `Schnell-Buchung +${euros} €`,
    );
  }

  function requestRemoveContribution(
    contribution:
      GoalContribution,
  ) {
    setDialog({
      title: 'Beitrag entfernen?',

      message: `${formatMinorUnits(
        Math.abs(
          contribution.amountMinor,
        ),
        goal?.currency ?? 'EUR',
      )} wird aus der Historie und vom Fortschritt abgezogen.`,

      tone: 'danger',

      confirmLabel: 'Entfernen',

      cancelLabel: 'Abbrechen',

      onConfirm: () => {
        void removeContribution(
          contribution,
        );
      },
    });
  }

  async function removeContribution(
    contribution:
      GoalContribution,
  ) {
    if (
      isBusy ||
      !goal
    ) {
      return;
    }

    setIsBusy(true);

    try {
      await deleteContribution(
        contribution.id,
      );

      await refreshFinanceData();

      await reload();

      await performFinanceHaptic(
        'warning',
      );
    } catch (error) {
      debugLog.error(
        'PLANNING',

        `${APP_ERROR_CODES.CONTRIBUTION_DELETE_FAILED}: Beitrag ${contribution.id} konnte nicht entfernt werden`,

        error,
      );

      setDialog({
        title: 'Beitrag konnte nicht entfernt werden',

        message: 'Bitte versuche es erneut.',

        confirmLabel: 'Verstanden',
      });
    } finally {
      setIsBusy(false);
    }
  }

  function requestDeleteGoal() {
    if (
      !goal
    ) {
      return;
    }

    setDialog({
      title: 'Sparziel löschen?',

      message: `${goal.name} wird entfernt und auf deinen anderen Geräten ausgeblendet.`,

      tone: 'danger',

      confirmLabel: 'Löschen',

      cancelLabel: 'Abbrechen',

      onConfirm: () => {
        void removeGoal();
      },
    });
  }

  async function removeGoal() {
    if (
      !goal ||
      isBusy
    ) {
      return;
    }

    setIsBusy(true);

    try {
      await deleteGoal(
        goal.id,
      );

      await refreshFinanceData();

      await performFinanceHaptic(
        'warning',
      );

      router.back();
    } catch (error) {
      debugLog.error(
        'PLANNING',

        `${APP_ERROR_CODES.GOAL_DELETE_FAILED}: Sparziel ${goal.id} konnte nicht gelöscht werden`,

        error,
      );

      setDialog({
        title: 'Sparziel konnte nicht gelöscht werden',

        message: 'Bitte versuche es erneut.',

        confirmLabel: 'Verstanden',
      });
    } finally {
      setIsBusy(false);
    }
  }

  if (
    isLoading
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
    !goal
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

  const remainingMinor =
    Math.max(
      0,

      goal.targetAmountMinor -
        goal.currentAmountMinor,
    );

  const linkedAccount = goal.linkedAccountId
    ? accounts.find((account) => account.id === goal.linkedAccountId) ?? null
    : null;

  const progressPercent =
    goalProgressPercent(
      goal.currentAmountMinor,
      goal.targetAmountMinor,
    );

  const progressWidth =
    `${goalProgressBarPercent(
      goal.currentAmountMinor,
      goal.targetAmountMinor,
    )}%` as `${number}%`;

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
          Sparziel
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

      <ScrollView
        showsVerticalScrollIndicator={
          false
        }

        contentContainerStyle={{
          paddingHorizontal:
            spacing.lg,

          paddingBottom:
            spacing.huge,
        }}
      >
        <FinanceCard>
          <Text
            style={[
              typography.screenTitle,

              {
                color:
                  colors.text,
              },
            ]}
          >
            {goal.name}
          </Text>

          <View
            style={[
              styles.progressTrack,

              {
                backgroundColor:
                  colors.surfaceSecondary,

                marginTop:
                  spacing.lg,
              },
            ]}
          >
            <View
              style={[
                styles.progressFill,

                {
                  width:
                    progressWidth,

                  backgroundColor:
                    progressPercent >=
                    100
                      ? colors.positive

                      : colors.primary,
                },
              ]}
            />
          </View>

          <View
            style={[
              styles.goalStats,

              {
                marginTop:
                  spacing.lg,
              },
            ]}
          >
            <MoneyText
              amountMinor={
                goal.currentAmountMinor
              }

              currency={
                goal.currency
              }

              size="m"

              forceSign={null}
            />

            <Text
              style={[
                typography.caption,

                {
                  color:
                    colors.textSecondary,
                },
              ]}
            >
              {progressPercent} % von{' '}

              {formatMinorUnits(
                goal.targetAmountMinor,
                goal.currency,
              )}
            </Text>

            <Text
              style={[
                typography.caption,

                {
                  color:
                    colors.textSecondary,
                },
              ]}
            >
              {remainingMinor ===
              0
                ? 'Ziel erreicht'
                : `Noch ${formatMinorUnits(
                    remainingMinor,
                    goal.currency,
                  )} offen`}
            </Text>

            {goal.targetDate ? (
              <Text
                style={[
                  typography.caption,

                  {
                    color:
                      colors.textMuted,
                  },
                ]}
              >
                Zieldatum: {goal.targetDate}
              </Text>
            ) : null}

            {goal.ruleKeyword ? (
              <Text
                style={[
                  typography.caption,

                  {
                    color:
                      colors.primary,
                  },
                ]}
              >
                Automatisch · Stichwort „{goal.ruleKeyword}“
              </Text>
            ) : null}

            {goal.trackingMode === 'account_balance' ? (
              <View style={{ marginTop: spacing.sm }}>
                <Text style={[typography.caption, { color: linkedAccount ? colors.primary : colors.negative }]}>
                  {linkedAccount
                    ? `Kontostand · ${linkedAccount.name}`
                    : 'Verknüpftes Konto nicht verfügbar'}
                </Text>
                {linkedAccount ? (
                  <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xxs }]}>
                    {linkedAccount.institutionName ?? linkedAccount.providerId}
                    {linkedAccount.lastSyncedAt ? ` · Stand ${formatTimestamp(linkedAccount.lastSyncedAt)}` : ' · letzter lokaler Kontostand'}
                  </Text>
                ) : (
                  <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xxs }]}>Der letzte bekannte Fortschritt bleibt erhalten. Ändere das Konto über „Bearbeiten“.</Text>
                )}
              </View>
            ) : null}
          </View>
        </FinanceCard>

        <Text
          style={[
            typography.sectionTitle,

            {
              color:
                colors.text,

              marginTop:
                spacing.xxxl,

              marginBottom:
                spacing.md,
            },
          ]}
        >
          Einzahlung
        </Text>

        <FinanceCard>
          <View
            style={
              styles.quickRow
            }
          >
            {QUICK_ADD_EUR.map(
              (
                euros,
              ) => (
                <FinanceButton
                  key={
                    euros
                  }

                  label={`+${euros} €`}

                  size="small"

                  variant="secondary"

                  disabled={
                    isBusy || goal.trackingMode === 'account_balance'
                  }

                  onPress={() => {
                    void quickAdd(
                      euros,
                    );
                  }}

                  style={
                    styles.quickButton
                  }
                />
              ),
            )}
          </View>

          <View
            style={[
              styles.depositRow,

              {
                marginTop:
                  spacing.md,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"

              accessibilityLabel={
                depositSign ===
                1
                  ? 'Auf Entnahme umschalten'

                  : 'Auf Einzahlung umschalten'
              }

              onPress={() =>
                setDepositSign(
                  (sign) =>
                    -sign as
                      1 |
                      -1,
                )
              }

              style={[
                styles.signToggle,

                {
                  backgroundColor:

                    depositSign ===
                    1
                      ? colors.positiveSoft

                      : colors.negativeSoft,

                  borderColor:

                    depositSign ===
                    1
                      ? colors.positive

                      : colors.negative,

                  borderRadius:
                    12,
                },
              ]}
            >
              <Text
                style={[
                  typography.bodyMedium,

                  {
                    color:

                      depositSign ===
                      1
                        ? colors.positive

                        : colors.negative,
                  },
                ]}
              >
                {depositSign ===
                1
                  ? '+'

                  : '−'}
              </Text>
            </Pressable>

            <View
              style={
                styles.depositField
              }
            >
              <FinanceTextField
                label="BETRAG (EUR)"

                value={
                  depositAmount
                }

                onChangeText={
                  setDepositAmount
                }

                placeholder="0,00"

                keyboardType="decimal-pad"

                returnKeyType="done"

                onSubmitEditing={() => {
                  void saveManualDeposit();
                }}
              />
            </View>
          </View>

          <Text
            style={[
              typography.caption,

              {
                color:
                  colors.textMuted,

                marginTop:
                  spacing.xs,
              },
            ]}
          >
            {
              depositSign ===
              1
                ? 'Einzahlung'
                : 'Entnahme'
            }
            {' · Mit +/− korrigieren'}
          </Text>

          <FinanceButton
            label="Buchung speichern"

            loading={
              isBusy &&
              depositAmount !==
                ''
            }

            disabled={
              isBusy || goal.trackingMode === 'account_balance'
            }

            onPress={() => {
              void saveManualDeposit();
            }}

            style={{
              width:
                '100%',

              marginTop:
                spacing.md,
            }}
          />
        </FinanceCard>

        <Text
          style={[
            typography.sectionTitle,

            {
              color:
                colors.text,

              marginTop:
                spacing.xxxl,

              marginBottom:
                spacing.md,
            },
          ]}
        >
          {goal.trackingMode === 'account_balance' ? 'Kontostand-Tracking' : 'Beitrags-Historie'}

          {contributions.length >
          0
            ? ` (${contributions.length})`
            : ''}
        </Text>

        {contributions.length >
          0 && (
          <Text
            style={[
              typography.caption,

              {
                color:
                  colors.textMuted,

                marginBottom:
                  spacing.sm,
              },
            ]}
          >
            Zeile gedrückt halten, um einen Beitrag zu entfernen.
          </Text>
        )}

        <FinanceCard
          padded={
            false
          }
        >
          {contributions.length ===
          0 ? (
            <FinanceEmptyState
              title="Noch keine Beiträge"

              description={goal.trackingMode === 'account_balance' ? 'Der Fortschritt wird ausschließlich aus dem letzten lokalen Kontostand abgeleitet.' : 'Jede Einzahlung und Entnahme erscheint hier als eigener Eintrag.'}

              style={{
                margin:
                  spacing.lg,
              }}
            />
          ) : (
            contributions.map(
              (
                contribution,
                index,
              ) => (
                <View
                  key={
                    contribution.id
                  }
                >
                  <Pressable
                    accessibilityRole="button"

                    accessibilityLabel={`Beitrag entfernen: ${contribution.note ?? 'Buchung'}`}

                    onLongPress={() => {
                      requestRemoveContribution(
                        contribution,
                      );
                    }}

                    delayLongPress={
                      400
                    }
                  >
                    <View
                      style={[
                        styles.contributionRow,

                        {
                          paddingHorizontal:
                            spacing.lg,

                          paddingVertical:
                            spacing.md,
                        },
                      ]}
                    >
                    <View
                      style={
                        styles.contributionText
                      }
                    >
                      <Text
                        style={[
                          typography.smallMedium,

                          {
                            color:
                              colors.text,
                          },
                        ]}
                      >
                        {contribution.note ??
                          (contribution.amountMinor >=
                          0
                            ? 'Einzahlung'
                            : 'Entnahme')}
                      </Text>

                      <Text
                        style={[
                          typography.caption,

                          {
                            color:
                              colors.textSecondary,

                            marginTop:
                              spacing.xxs,
                          },
                        ]}
                      >
                        {formatTimestamp(
                          contribution.occurredAt,
                        )}
                      </Text>
                    </View>

                    <MoneyText
                      amountMinor={
                        contribution.amountMinor
                      }

                      currency={
                        goal.currency
                      }

                      size="s"

                      tone="auto"

                      forceSign={
                        contribution.amountMinor <
                        0
                          ? 'negative'

                          : 'positive'
                      }
                    />
                    </View>
                  </Pressable>

                  {index <
                    contributions.length -
                      1 && (
                    <View
                      style={[
                        styles.divider,

                        {
                          backgroundColor:
                            colors.border,
                        },
                      ]}
                    />
                  )}
                </View>
              ),
            )
          )}
        </FinanceCard>

        <FinanceButton
          label="Bearbeiten"

          variant="secondary"

          disabled={
            isBusy
          }

          onPress={() => {
            router.push(
              `/goal/${goal.id}/edit` as Href,
            );
          }}

          style={{
            width:
              '100%',

            marginTop:
              spacing.xxl,
          }}
        />

        <FinanceButton
          label="Sparziel löschen"

          variant="danger"

          disabled={
            isBusy
          }

          onPress={
            requestDeleteGoal
          }

          style={{
            width:
              '100%',

            marginTop:
              spacing.xxl,
          }}
        />
      </ScrollView>

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
    </SafeAreaView>
  );
}

function formatTimestamp(
  value:
    string,
): string {
  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return date.toLocaleDateString(
    'de-DE',

    {
      day:
        '2-digit',

      month:
        '2-digit',

      year:
        'numeric',
    },
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

    progressTrack: {
      height:
        7,

      borderRadius:
        4,

      overflow:
        'hidden',
    },

    progressFill: {
      height:
        '100%',

      borderRadius:
        4,
    },

    goalStats: {
      alignItems:
        'flex-start',

      gap:
        6,
    },

    quickRow: {
      flexDirection:
        'row',

      flexWrap:
        'wrap',

      gap:
        8,
    },

    quickButton: {
      minWidth:
        72,
    },

    depositRow: {
      flexDirection:
        'row',

      alignItems:
        'flex-start',
    },

    signToggle: {
      width:
        48,

      minHeight:
        48,

      alignItems:
        'center',

      justifyContent:
        'center',

      borderWidth:
        1,

      marginRight:
        10,
    },

    depositField: {
      flex:
        1,
    },

    contributionRow: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',
    },

    contributionText: {
      flex:
        1,

      marginRight:
        12,
    },

    divider: {
      height:
        StyleSheet.hairlineWidth,

      width:
        '100%',
    },
  });
