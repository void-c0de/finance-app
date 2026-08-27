import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { debugLog } from '@/core/debugLog';
import type { BankAccount, Budget, Category, SavingsGoal, Transaction } from '@/types/finance';
import type { RecurringItem } from '@/services/recurringInsightsCore';
import type { RecurringSeries } from '@/db/repositories/recurringSeries';
import {
  buildBudgetsCsv,
  buildExportLookup,
  buildFinanceBackupJson,
  buildRecurringCsv,
  buildSavingsGoalsCsv,
  buildTransactionsCsv,
  EXPORT_KIND_LABEL,
  exportFileName,
  type ExportKind,
} from '@/services/exportCore';

export type ExportResult = 'shared' | 'unavailable' | 'error';

export type ExportBundle = {
  transactions: readonly Transaction[];
  budgets: readonly Budget[];
  goals: readonly SavingsGoal[];
  categories: readonly Category[];
  accounts: readonly BankAccount[];
  recurringItems: readonly RecurringItem[];
  recurringSeries: readonly RecurringSeries[];
};

function contentFor(kind: ExportKind, bundle: ExportBundle): { body: string; mimeType: string; uti: string } {
  const lookup = buildExportLookup(bundle.categories, bundle.accounts);
  switch (kind) {
    case 'transactions':
      return { body: buildTransactionsCsv(bundle.transactions, lookup), mimeType: 'text/csv', uti: 'public.comma-separated-values-text' };
    case 'budgets':
      return { body: buildBudgetsCsv(bundle.budgets, lookup), mimeType: 'text/csv', uti: 'public.comma-separated-values-text' };
    case 'savings_goals':
      return { body: buildSavingsGoalsCsv(bundle.goals), mimeType: 'text/csv', uti: 'public.comma-separated-values-text' };
    case 'recurring':
      return { body: buildRecurringCsv(bundle.recurringItems), mimeType: 'text/csv', uti: 'public.comma-separated-values-text' };
    case 'full_backup':
      return {
        body: buildFinanceBackupJson({
          accounts: bundle.accounts,
          transactions: bundle.transactions,
          categories: bundle.categories,
          budgets: bundle.budgets,
          savingsGoals: bundle.goals,
          recurringSeries: bundle.recurringSeries,
          appVersion: Constants.expoConfig?.version ?? null,
        }),
        mimeType: 'application/json',
        uti: 'public.json',
      };
  }
}

/**
 * Schreibt den Export in eine temporäre App-Datei (Cache-Verzeichnis) und
 * öffnet das System-Teilen-Menü. Die App lädt NICHTS automatisch hoch. Die
 * Datei liegt im vom System bereinigbaren Cache; ein Best-Effort-Löschen
 * erfolgt nach dem Teilen.
 */
export async function exportAndShare(kind: ExportKind, bundle: ExportBundle): Promise<ExportResult> {
  try {
    if (!(await Sharing.isAvailableAsync())) {
      return 'unavailable';
    }

    const { body, mimeType, uti } = contentFor(kind, bundle);
    const file = new File(Paths.cache, exportFileName(kind));

    try {
      if (file.exists) file.delete();
    } catch {
      /* egal – wird gleich überschrieben */
    }
    try {
      file.create({ overwrite: true });
    } catch {
      /* write() legt die Datei ansonsten selbst an */
    }
    file.write(body);

    await Sharing.shareAsync(file.uri, {
      mimeType,
      UTI: uti,
      dialogTitle: `${EXPORT_KIND_LABEL[kind]} teilen`,
    });

    try {
      if (file.exists) file.delete();
    } catch {
      /* Cache wird ohnehin vom System bereinigt */
    }

    return 'shared';
  } catch (error) {
    debugLog.error('EXPORT', `${kind}-Export fehlgeschlagen`, error);
    return 'error';
  }
}
