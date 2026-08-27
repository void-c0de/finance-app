import * as Linking from 'expo-linking';

import {
  type Href,
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
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  SafeAreaView,
} from 'react-native-safe-area-context';

import {
  type FinanceDialogConfig,

  FinanceDialog,
} from '@/components/feedback/FinanceDialog';

import {
  FinanceCard,
} from '@/components/finance/FinanceCard';

import {
  FinanceButton,
} from '@/components/interaction/FinanceButton';

import {
  FinancePressable,
} from '@/components/interaction/FinancePressable';

import {
  debugLog,
} from '@/core/debugLog';

import {
  APP_ERROR_CODES,
} from '@/core/errorCodes';

import {
  tinkUnscaledToMinorUnits,

  buildTinkLinkUrl,

  fetchTinkImport,

  isTinkProduction,

  TinkImportError,

  type TinkAccount,

  type TinkTransaction,
} from '@/banking/tink/tinkClient';

import {
  groupTinkTransactionsByLocalAccount,
  mapTinkBookingStatus,
  readTinkAmount,
} from '@/banking/tink/tinkImport';

import {
  createBankConnection,

  getBankConnections,

  updateBankConnectionStatus,
} from '@/db/repositories/bankConnections';

import {
  upsertProviderAccount,
} from '@/db/repositories/accounts';

import {
  upsertProviderTransactions,
} from '@/db/repositories/transactions';

import {
  useFinanceTheme,
} from '@/hooks/use-finance-theme';

import {
  performFinanceHaptic,
} from '@/services/haptics';

import {
  useCloudSyncStore,
} from '@/stores/useCloudSyncStore';

import {
  useFinanceStore,
} from '@/stores/useFinanceStore';

import type {
  AccountType,
} from '@/types/finance';

const TINK_PROVIDER_ID =
  'tink';

const TINK_EXTERNAL_CONNECTION_ID =
  'tink-default-user';

function mapTinkAccountType(
  type:
    string |

    undefined,
): AccountType {
  const normalized =
    (type ?? '')
      .toUpperCase();

  if (
    normalized.includes(
      'SAVING',
    ) ||
    normalized.includes(
      'CHECKING',
    )
  ) {
    return normalized.includes(
      'SAVING',
    )
      ? 'savings'
      : 'checking';
  }

  if (
    normalized.includes(
      'CREDIT',
    ) ||
    normalized.includes(
      'CARD',
    )
  ) {
    return 'credit';
  }

  if (
    normalized.includes(
      'INVEST',
    )
  ) {
    return 'investment';
  }

  if (
    normalized.includes(
      'CASH',
    )
  ) {
    return 'cash';
  }

  return 'other';
}

function extractBalanceMinor(
  account:
    TinkAccount,
): { amountMinor:
    number;

  currency:
    string;
} {
  /*
   * Bekannte Shapes der Reihe nach
   * probieren:
   * 1) balances[]: TinkAmount direkt
   * 2) balances[]: { amount: TinkAmount }
   * 3) balance[]: { amount: TinkAmount }
   */
  const firstBalance =
    account.balances?.[0];

  const candidates:
    unknown[] =
    [];

  if (
    firstBalance
  ) {
    candidates.push(
      firstBalance,
    );

    candidates.push(
      (
        firstBalance as Record<
          string,
          unknown
        >
      ).amount,
    );
  }

  const legacyBalance = (
    account.balance as

      | unknown[]
      | undefined
  )?.[0];

  if (
    legacyBalance
  ) {
    candidates.push(
      legacyBalance,
    );

    candidates.push(
      (
        legacyBalance as Record<
          string,
          unknown
        >
      ).amount,
    );
  }

  for (
    const candidate of
    candidates
  ) {
    const amount =
      readTinkAmount(
        candidate,
      );

    if (
      amount?.unscaledValue
    ) {
      return {
        amountMinor:
          tinkUnscaledToMinorUnits(
            amount.unscaledValue,

            amount.scale,
          ),

        currency:

          amount.currencyCode ??
          'EUR',
      };
    }
  }

  return {
    amountMinor:
      0,

    currency: 'EUR',
  };
}

function mapTinkTransaction(
  transaction:
    TinkTransaction,
):
  | {
      externalTransactionId:
        string;

      amountMinor:
        number;

      currency:
        string;

      direction:
        'income'
        | 'expense';

      bookingDate:
        string;

      bookingStatus:
        'pending'
        | 'booked'
        | 'unknown';

      description:
        string;

      counterpartyName?:
        string;
    }
  | null {
  const externalId =
    transaction.externalId ??
    transaction.transactionId ??
    transaction.id;

  if (
    !externalId
  ) {
    return null;
  }

  const amount =
    readTinkAmount(
      transaction.amount,
    );

  if (
    !amount?.unscaledValue
  ) {
    return null;
  }

  /*
   * Tink-Konvention: negativer Betrag =
   * Ausgangszahlung (expense), positiv =
   * Eingang (income).
   */
  const rawMinor =
    tinkUnscaledToMinorUnits(
      amount.unscaledValue,

      amount.scale,
    );

  const description =
    transaction.descriptions?.display ??
    transaction.description ??
    'Umsatz';

  const bookedDate =
    transaction.dates?.booked ??
    transaction.bookedDate ??
    transaction.bookedDateTime;

  const bookingDate =
    bookedDate
      ? bookedDate.slice(
          0,
          10,
        )
      : new Date()
          .toISOString()
          .slice(
            0,
            10,
          );

  return {
    externalTransactionId:

      externalId,

    amountMinor:
      Math.abs(rawMinor),

    currency:

      amount.currencyCode ??
      'EUR',

    direction:

      rawMinor >=
      0
        ? 'income'

        : 'expense',

    bookingDate,

      bookingStatus:
        mapTinkBookingStatus(
          transaction.status
        ),

    description,

    counterpartyName:
      description,
  };
}

export default function TinkCallbackScreen() {
  const {
    colors,
    spacing,
    typography,
  } =
    useFinanceTheme();

  const params =
    useLocalSearchParams<{
      code?:
        string;

      error?:
        string;
    }>();

  const codeParam =
    typeof params.code ===
      'string'
      ? params.code
      : undefined;

  const refreshFinanceData =
    useFinanceStore(
      (
        state
      ) =>
        state.refreshFinanceData,
    );

  const [
    phase,
    setPhase,
  ] = useState<
    'idle'
    | 'working'
    | 'success'
  >('idle');

  const [
    statusText,
    setStatusText,
  ] =
    useState('');

  const [
    dialog,
    setDialog,
  ] =
    useState<FinanceDialogConfig | null>(
      null,
    );

  const handledCodeRef =
    useRef<
      string | null
    >(null);

  async function ensureConnection():
    Promise<string> {
    const existing =
      await getBankConnections();

    const found =
      existing.find(
        (
          connection,
        ) =>
          connection.providerId ===
            TINK_PROVIDER_ID,
      );

    if (
      found
    ) {
      return found.id;
    }

    const created =
      await createBankConnection({
        providerId:
          TINK_PROVIDER_ID,

        externalConnectionId:

          TINK_EXTERNAL_CONNECTION_ID,

        institutionId:
          'tink-link',

        institutionName:
          isTinkProduction()
            ? 'Tink Open Banking'
            : 'Tink Open Banking Test',

        status: 'active',

        isDemo:
          !isTinkProduction(),
      });

    return created.id;
  }

  async function importWithCode(
    code:
      string,
  ) {
    setPhase('working');

    try {
      setStatusText(
        'Tink-Zugriff wird autorisiert…',
      );

      const importPayload =
        await fetchTinkImport(
          code,
        );

      setStatusText(
        'Konten werden geladen…',
      );

      const accounts =
        importPayload.accounts;

      if (
        accounts.length ===
        0
      ) {
        throw new Error(
          'Keine Konten in der Tink-Antwort.',
        );
      }

      const connectionId =
        await ensureConnection();

      const syncedAt =
        new Date().toISOString();

      const accountIdMap =
        new Map<string, string>();

      for (
        const account of
        accounts
      ) {
        const externalAccountId =
          account.accountId ??
          account.id;

        if (
          !externalAccountId
        ) {
          continue;
        }

        setStatusText(
          `Importiere ${account.name ?? 'Konto'}…`,
        );

        const balanceInfo =
          extractBalanceMinor(
            account,
          );

        const localAccount =
          await upsertProviderAccount({
            connectionId,

            providerId:
              TINK_PROVIDER_ID,

            account: {
              externalAccountId,

              name:

                account.name ??
                'Tink-Konto',

              currency:

                balanceInfo.currency,

              balanceMinor:

                balanceInfo.amountMinor,

              type:
                mapTinkAccountType(
                  account.type,
                ),

              institutionName:
                isTinkProduction()
                  ? 'Tink Open Banking'
                  : 'Tink Open Banking Test',
            },

            syncedAt,
          });

        accountIdMap.set(
          externalAccountId,
          localAccount.id,
        );
      }

      setStatusText(
        'Umsätze werden zugeordnet…',
      );

      const {
        grouped,
        assignedCount,
        unmatchedCount,
      } = groupTinkTransactionsByLocalAccount(
        importPayload.transactions,
        accountIdMap,
        mapTinkTransaction,
      );

      for (const [localAccountId, transactions] of grouped) {
        await upsertProviderTransactions(
          localAccountId,
          transactions.map((item) => ({
            ...item,
            isRecurring: false,
          })),
        );
      }

      debugLog.info(
        'BANK',
        `Tink-Import: ${accountIdMap.size} Konten · ${importPayload.transactions.length} Umsätze · ${assignedCount} zugeordnet`,
      );

      if (unmatchedCount > 0) {
        debugLog.warn(
          'BANK',
          `${APP_ERROR_CODES.BNK_TINK_SYNC_FAILED}: ${unmatchedCount} Tink-Umsätze ohne sichere Kontozuordnung übersprungen`,
        );
      }

      await refreshFinanceData();

      await useCloudSyncStore
        .getState()
        .refreshCloudSync();

      await performFinanceHaptic(
        'success',
      );

      setPhase('success');
    } catch (error) {
      debugLog.error(
        'BANK',

        `${APP_ERROR_CODES.BNK_TINK_EXCHANGE_FAILED}: Tink-Import fehlgeschlagen`,

        error,
      );

      setPhase('idle');

      const needsReauth =
        error instanceof TinkImportError &&
        error.requiresReauthorization;

      if (needsReauth) {
        /*
         * Freigabe abgelaufen/abgelehnt: bestehende Verbindung auf
         * "requires_action" setzen, damit die Bankverbindungen-Liste den
         * Reconnect-Hinweis zeigt. Lokale Konten und Umsätze bleiben erhalten.
         */
        try {
          const tink = (await getBankConnections()).find(
            (connection) => connection.providerId === TINK_PROVIDER_ID,
          );

          if (tink) {
            await updateBankConnectionStatus(tink.id, 'requires_action');
            await refreshFinanceData();
          }
        } catch (statusError) {
          debugLog.warn(
            'BANK',
            `${APP_ERROR_CODES.BNK_TINK_SYNC_FAILED}: Reconnect-Status konnte nicht gesetzt werden`,
            statusError,
          );
        }
      }

      setDialog({
        title: needsReauth
          ? 'Bankfreigabe erneuern'
          : 'Bankverbindung fehlgeschlagen',

        message: needsReauth
          ? 'Die Freigabe bei deiner Bank ist abgelaufen oder wurde abgelehnt. Deine bisherigen Konten und Umsätze bleiben erhalten – starte die Verbindung einfach neu.'
          : error instanceof Error
            ? error.message
            : 'Der Tink-Import konnte nicht abgeschlossen werden.',

        confirmLabel: needsReauth ? 'Erneut verbinden' : 'Verstanden',

        onConfirm: needsReauth ? () => startTinkLink() : undefined,
      });
    }
  }

  useFocusEffect(
    useCallback(
      () => {
        if (
          !codeParam ||
          handledCodeRef.current ===
            codeParam ||
          phase ===
            'working'
        ) {
          return;
        }

        handledCodeRef.current =
          codeParam;

        void importWithCode(
          codeParam,
        );
      },

      // eslint-disable-next-line react-hooks/exhaustive-deps
      [
        codeParam,
      ],
    ),
  );

  function startTinkLink() {
    try {
      const url =
        buildTinkLinkUrl({});

      void Linking.openURL(
        url,
      );
    } catch (error) {
      debugLog.error(
        'BANK',

        `${APP_ERROR_CODES.BNK_TINK_EXCHANGE_FAILED}: Tink Link konnte nicht geöffnet werden`,

        error,
      );

      setDialog({
        title: 'Tink nicht konfiguriert',

        message: 'Es fehlen die Tink-Zugangsdaten im Build.',

        confirmLabel: 'Verstanden',
      });
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

            styles.headerTitle,

            {
              color:
                colors.text,
            },
          ]}
        >
          Bank verbinden · Tink
        </Text>

        <View
          style={
            styles.headerSpacer
          }
        />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal:
            spacing.lg,

          paddingBottom:
            spacing.huge,
        }}
      >
        {phase ===
        'working' ? (
          <FinanceCard>
            <ActivityIndicator
              size="small"

              color={
                colors.primary
              }
            />

            <Text
              style={[
                typography.body,

                {
                  color:
                    colors.textSecondary,

                  marginTop:
                    spacing.md,
                },
              ]}
            >
              {statusText}
            </Text>
          </FinanceCard>
        ) : phase ===
          'success' ? (
          <FinanceCard variant="highlight">
            <Text
              style={[
                typography.title,

                {
                  color:
                    colors.text,
                },
              ]}
            >
              Bank verbunden
            </Text>

            <Text
              style={[
                typography.body,

                {
                  color:
                    colors.textSecondary,

                  marginTop:
                    spacing.sm,
                },
              ]}
            >
              Konten und Umsätze wurden verschlüsselt importiert.
            </Text>

            <FinanceButton
              label="Zu meinen Konten"

              onPress={() =>
                router.replace(
                  '/(tabs)' as Href,
                )
              }

              style={{
                width:
                  '100%',

                marginTop:
                  spacing.xl,
              }}
            />
          </FinanceCard>
        ) : (
          <>
            <FinanceCard>
              <Text
                style={[
                  typography.title,

                  {
                    color:
                      colors.text,
                  },
                ]}
              >
                Über Tink verbinden
              </Text>

              <Text
                style={[
                  typography.small,

                  {
                    color:
                      colors.textSecondary,

                    marginTop:
                      spacing.sm,
                  },
                ]}
              >
                Tink ist Teil von Klarna und der legitime, PSD2-konforme Weg zu deinen Bankdaten. Du wählst deine Bank auf einer sicheren Tink-Seite - wir erhalten niemals deine Bankzugänge. Nur Lesezugriff.

                {params.error
                  ? `\n\nFehler von Tink: ${params.error}`
                  : ''}
              </Text>

              <FinanceButton
                label="Bank auswählen"

                onPress={
                  startTinkLink
                }

                style={{
                  width:
                    '100%',

                  marginTop:
                    spacing.xl,
                }}
              />
            </FinanceCard>

            {codeParam ? (
              <FinanceCard
                style={{
                  marginTop:
                    spacing.sm,
                }}
              >
                <Text
                  style={[
                    typography.caption,

                    {
                      color:
                        colors.textMuted,
                    },
                  ]}
                >
                  Autorisierung empfangen - Import läuft beim nächsten Öffnen dieses Bildschirms erneut, falls er abgebrochen war.
                </Text>
              </FinanceCard>
            ) : null}
          </>
        )}
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
