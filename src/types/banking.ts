import type {
  AccountType,
  TransactionDirection,
} from '@/types/finance';

export type BankAuthenticationMethod =
  | 'mock'
  | 'redirect'
  | 'fints';

export type BankConnectionStatus =
  | 'active'
  | 'requires_action'
  | 'error'
  | 'disconnected';

export interface BankInstitution {
  id: string;

  providerId: string;

  name: string;

  shortName: string;

  countryCode: string;

  authenticationMethod:
    BankAuthenticationMethod;

  demoOnly: boolean;

  description?: string;
}

export interface BankConnection {
  id: string;

  providerId: string;

  externalConnectionId: string;

  institutionId: string;

  institutionName: string;

  status: BankConnectionStatus;

  isDemo: boolean;

  createdAt: string;

  updatedAt: string;

  lastSyncedAt?: string;
}

/**
 * Kontoobjekt direkt vom Bankprovider.
 *
 * Das ist bewusst NICHT BankAccount aus
 * finance.ts.
 *
 * BankAccount ist unser lokales,
 * persistiertes Datenmodell.
 */
export interface ProviderAccount {
  externalAccountId: string;

  name: string;

  iban?: string;

  currency: string;

  balanceMinor: number;

  type: AccountType;

  institutionName?: string;
}

/**
 * Umsatzobjekt direkt vom Provider.
 *
 * Auch dieses Objekt besitzt noch keine
 * lokale SQLite-ID.
 */
export interface ProviderTransaction {
  externalTransactionId: string;

  amountMinor: number;

  currency: string;

  direction: TransactionDirection;

  bookingDate: string;

  valueDate?: string;

  description: string;

  counterpartyName?: string;

  counterpartyIBAN?: string;

  isRecurring?: boolean;
}