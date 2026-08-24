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
    autoCategorizeTransactions,
} from '@/services/autoCategorization';

import {
    syncAllBankConnections,
} from '@/services/bankSync';

import {
    withDbLock,
} from '@/core/dbWriteLock';

import type {
    BankAccount,
    Budget,
    Category,
    Transaction,
} from '@/types/finance';

export type FinanceSnapshot = {
  accounts: BankAccount[];

  transactions: Transaction[];

  categories: Category[];

  budgets: Budget[];

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

  return {
    accounts,

    transactions,

    categories,

    budgets,

    syncFailureCount:
      syncResult.failed.length,
  };
  });
}