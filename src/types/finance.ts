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

export type SavingsGoalTrackingMode =
  | 'manual'
  | 'transaction_rule'
  | 'account_balance'
  | 'hybrid';

export type SavingsGoalStatus =
  | 'active'
  | 'archived';

export interface SavingsGoal {
  id:
    string;

  name:
    string;

  description?:
    string;

  targetAmountMinor:
    number;

  currentAmountMinor:
    number;

  startingAmountMinor:
    number;

  currency:
    string;

  targetDate?:
    string;

  linkedAccountId?:
    string;

  /**
   * Automatisches Tracking: Transaktionen,
   * deren Beschreibung/Empfaenger dieses
   * Stichwort enthalten, erzeugen
   * automatisch Beitraege (idempotent
   * ueber source_transaction_id).
   */
  ruleKeyword?:
    string;

  trackingMode:
    SavingsGoalTrackingMode;

  status:
    SavingsGoalStatus;

  createdAt:
    string;

  updatedAt:
    string;

  deletedAt?:
    string;
}

export type GoalContributionSource =
  | 'manual'
  | 'transaction'
  | 'adjustment';

export interface GoalContribution {
  id:
    string;

  goalId:
    string;

  amountMinor:
    number;

  source:
    GoalContributionSource;

  sourceTransactionId?:
    string;

  note?:
    string;

  occurredAt:
    string;

  createdAt:
    string;

  updatedAt:
    string;

  deletedAt?:
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
