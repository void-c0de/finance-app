import {
  create,
} from 'zustand';

import {
  refreshFinanceSnapshot,
  type FinanceRefreshOptions,
} from '@/services/financeData';

import type {
  BankAccount,
  Budget,
  Category,
  SavingsGoal,
  Transaction,
} from '@/types/finance';

import type {
  RecurringOverride,
} from '@/services/recurringInsightsCore';

type FinanceState = {
  accounts:
    BankAccount[];

  transactions:
    Transaction[];

  categories:
    Category[];

  budgets:
    Budget[];

  goals:
    SavingsGoal[];

  recurringOverrides:
    ReadonlyMap<string, RecurringOverride>;

  isLoading:
    boolean;

  isRefreshing:
    boolean;

  errorMessage:
    string | null;

  lastLoadedAt:
    string | null;

  setAccounts: (
    accounts:
      BankAccount[]
  ) => void;

  setTransactions: (
    transactions:
      Transaction[]
  ) => void;

  setCategories: (
    categories:
      Category[]
  ) => void;

  setBudgets: (
    budgets:
      Budget[]
  ) => void;

  setGoals: (
    goals:
      SavingsGoal[]
  ) => void;

  refreshFinanceData: (
    options?:
      FinanceRefreshOptions
  ) => Promise<void>;

  reset: () => void;
};

export const useFinanceStore =
  create<FinanceState>(
    (
      set,
      get
    ) => ({
      accounts:
        [],

      transactions:
        [],

      categories:
        [],

      budgets:
        [],

      goals:
        [],

      recurringOverrides:
        new Map(),

      isLoading:
        true,

      isRefreshing:
        false,

      errorMessage:
        null,

      lastLoadedAt:
        null,

      setAccounts: (
        accounts
      ) => {
        set({
          accounts,
        });
      },

      setTransactions: (
        transactions
      ) => {
        set({
          transactions,
        });
      },

      setCategories: (
        categories
      ) => {
        set({
          categories,
        });
      },

      setBudgets: (
        budgets
      ) => {
        set({
          budgets,
        });
      },

      setGoals: (
        goals
      ) => {
        set({
          goals,
        });
      },

      refreshFinanceData:
        async (
          options
        ) => {
          if (
            get().isRefreshing
          ) {
            return;
          }

          const hasExistingData =
            get().accounts.length >
              0 ||

            get().transactions.length >
              0 ||

            get().categories.length >
              0;

          set({
            isRefreshing:
              true,

            isLoading:
              !hasExistingData,

            errorMessage:
              null,
          });

          try {
            const snapshot =
              await refreshFinanceSnapshot(
                options
              );

            set({
              accounts:
                snapshot.accounts,

              transactions:
                snapshot.transactions,

              categories:
                snapshot.categories,

              budgets:
                snapshot.budgets,

              goals:
                snapshot.goals,

              recurringOverrides:
                snapshot.recurringOverrides,

              isLoading:
                false,

              isRefreshing:
                false,

              lastLoadedAt:
                new Date()
                  .toISOString(),

              errorMessage:
                snapshot
                  .syncFailureCount >
                0
                  ? `${snapshot.syncFailureCount} Bankverbindung konnte nicht synchronisiert werden.`
                  : null,
            });
          } catch (error) {
            console.error(
              'Finance data refresh failed:',
              error
            );

            set({
              isLoading:
                false,

              isRefreshing:
                false,

              errorMessage:
                'Finanzdaten konnten nicht geladen werden.',
            });
          }
        },

      reset: () => {
        set({
          accounts:
            [],

          transactions:
            [],

          categories:
            [],

          budgets:
            [],

          goals:
            [],

          recurringOverrides:
            new Map(),

          isLoading:
            true,

          isRefreshing:
            false,

          errorMessage:
            null,

          lastLoadedAt:
            null,
        });
      },
    })
  );