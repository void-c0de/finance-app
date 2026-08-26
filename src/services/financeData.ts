import {
    initializeDatabase,
} from '@/db/database';

import {
    getAccounts,
} from '@/db/repositories/accounts';

import {
    getBudgets,
} from '@/db/repositories/budgets';

import {
    ensureDefaultCategories,
    getCategories,
} from '@/db/repositories/categories';

import {
    getTransactions,
} from '@/db/repositories/transactions';

import {
    getActiveGoals,
} from '@/db/repositories/savingsGoals';

import {
    autoCategorizeTransactions,
} from '@/services/autoCategorization';

import {
    syncAllBankConnections,
} from '@/services/bankSync';

import {
    applySavingsGoalRules,
} from '@/services/goalTracking';

import {
    detectAndPersistRecurringTransactions,
} from '@/services/recurringDetection';

import {
    withDbLock,
} from '@/core/dbWriteLock';

import {
    APP_ERROR_CODES,
} from '@/core/errorCodes';

import {
    debugLog,
} from '@/core/debugLog';

import type {
    BankAccount,
    Budget,
    Category,
    SavingsGoal,
    Transaction,
} from '@/types/finance';

export type FinanceSnapshot = {
  accounts: BankAccount[];

  transactions: Transaction[];

  categories: Category[];

  budgets: Budget[];

  goals: SavingsGoal[];

  syncFailureCount: number;
};

export type FinanceRefreshOptions = {
  forceSync?: boolean;
};

export async function refreshFinanceSnapshot(
  options?: FinanceRefreshOptions
): Promise<FinanceSnapshot> {
  /*
   * Bank-Sync/Refresh und Cloud-Sync
   * teilen denselben Schreib-Lock,
   * damit sie die SQLite-Verbindung
   * nie gleichzeitig beschreiben.
   */
  return withDbLock(async () => {
  /*
   * SQLCipher + Schema zuerst
   * vollständig bereitstellen.
   */
  await initializeDatabase();

  /*
   * Kategorien müssen existieren,
   * bevor Umsätze automatisch
   * kategorisiert werden können.
   */
  await ensureDefaultCategories();

  /*
   * Bankdaten synchronisieren.
   *
   * Ohne forceSync entscheidet der
   * Sync-Service selbst anhand der
   * letzten Synchronisierung, ob ein
   * neuer Bankabruf nötig ist.
   */
  const syncResult =
    await syncAllBankConnections({
      force:
        options?.forceSync ??
        false,
    });

  /*
   * Aktuellen Stand zunächst aus der
   * lokalen verschlüsselten Datenbank
   * laden.
   */
  let transactions =
    await getTransactions();

  /*
   * Nur bisher unkategorisierte
   * Transaktionen automatisch zuordnen.
   */
  const categorizedCount =
    await autoCategorizeTransactions(
      transactions
    );

  /*
   * Falls SQLite-Kategorien verändert
   * wurden, müssen wir die Umsätze
   * erneut aus der DB laden.
   *
   * Sonst hätte unser Zustand-Store
   * noch die alten Transaction-Objekte
   * ohne categoryId.
   */
  if (
    categorizedCount > 0
  ) {
    transactions =
      await getTransactions();
  }

  const recurringCount =
    await detectAndPersistRecurringTransactions(
      transactions,
    );

  if (recurringCount > 0) {
    debugLog.info(
      'FINANCE',
      `${recurringCount} wiederkehrende Transaktionen erkannt`,
    );

    transactions =
      await getTransactions();
  }

  /*
   * Automatisches Sparziel-Tracking:
   * passende Eingaenge erzeugen
   * idempotente Beitraege (source
   * 'transaction'), bevor die Ziele
   * frisch geladen werden. Fehler
   * duerfen den Refresh nicht
   * scheitern lassen.
   */
  try {
    await applySavingsGoalRules(
      transactions,
    );
  } catch (trackError) {
    debugLog.error(
      'PLANNING',

      `${APP_ERROR_CODES.GOALS_TRACK_FAILED}: applySavingsGoalRules fehlgeschlagen`,

      trackError,
    );
  }

  /*
   * Unabhängige lokale Daten parallel
   * laden.
   */
  const [
    accounts,
    categories,
    budgets,
  ] =
    await Promise.all([
      getAccounts(),

      getCategories(),

      getBudgets(),
    ]);

  /*
   * Sparziele laden - bewusst
   * fehlertolerant: Ein Ziel-Ladefehler
   * darf den kompletten Refresh nicht
   * scheitern lassen.
   */
  let goals:
    SavingsGoal[] =
    [];

  try {
    goals =
      await getActiveGoals();
  } catch (goalsError) {
    debugLog.error(
      'PLANNING',

      `${APP_ERROR_CODES.GOALS_LOAD_FAILED}: Sparziele konnten nicht geladen werden`,

      goalsError,
    );
  }

  return {
    accounts,

    transactions,

    categories,

    budgets,

    goals,

    syncFailureCount:
      syncResult.failed.length,
  };
  });
}
