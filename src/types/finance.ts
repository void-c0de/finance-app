export type AccountType =
  | 'checking'
  | 'savings'
  | 'credit'
  | 'cash'
  | 'investment'
  | 'other';

export type TransactionDirection =
  | 'income'
  | 'expense';

export type BudgetPeriod =
  | 'weekly'
  | 'monthly'
  | 'yearly';

export interface BankAccount {
  id:
    string;

  bankConnectionId?:
    string;

  providerId:
    string;

  externalAccountId:
    string;

  name:
    string;

  iban?:
    string;

  currency:
    string;

  balanceMinor:
    number;

  type:
    AccountType;

  institutionName?:
    string;

  lastSyncedAt?:
    string;
}

export interface Transaction {
  id:
    string;

  accountId:
    string;

  externalTransactionId?:
    string;

  amountMinor:
    number;

  currency:
    string;

  direction:
    TransactionDirection;

  bookingDate:
    string;

  valueDate?:
    string;

  description:
    string;

  counterpartyName?:
    string;

  counterpartyIBAN?:
    string;

  categoryId?:
    string;

  /**
   * Woher kommt die aktuelle Kategorie?
   * manual > rule > auto > none.
   */
  categorySource?:
    CategorySource;

  isRecurring?:
    boolean;

  createdAt:
    string;
}

export interface Category {
  id:
    string;

  name:
    string;

  icon?:
    string;

  isIncomeCategory?:
    boolean;
}

export interface Budget {
  id:
    string;

  categoryId?:
    string;

  name:
    string;

  amountMinor:
    number;

  period:
    BudgetPeriod;
}

export interface SavingsGoal {
  id:
    string;

  name:
    string;

  targetAmountMinor:
    number;

  currentAmountMinor:
    number;

  targetDate?:
    string;
}
export type CategorySource =
  | 'manual'
  | 'rule'
  | 'auto'
  | 'none';

export type CategoryRuleMatchType =
  | 'merchant_contains'
  | 'merchant_equals'
  | 'description_contains';

export interface CategoryRule {
  id:
    string;

  name:
    string;

  matchType:
    CategoryRuleMatchType;

  matchValue:
    string;

  categoryId:
    string;

  enabled:
    boolean;

  priority:
    number;

  createdAt:
    string;

  updatedAt:
    string;

  deletedAt?:
    string;
}
