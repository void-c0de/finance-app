import type {
  BankConnectionStatus,
  BankInstitution,
  ProviderAccount,
  ProviderTransaction,
} from '@/types/banking';

export interface BankProviderConnectionResult {
  externalConnectionId: string;

  institution: BankInstitution;

  status: BankConnectionStatus;
}

export interface BankProvider {
  readonly id: string;

  readonly name: string;

  readonly mode:
    | 'demo'
    | 'production';

  searchInstitutions(
    query?: string
  ): Promise<BankInstitution[]>;

  connect(
    institution: BankInstitution
  ): Promise<BankProviderConnectionResult>;

  disconnect(
    externalConnectionId: string
  ): Promise<void>;

  getAccounts(
    externalConnectionId: string
  ): Promise<ProviderAccount[]>;

  getTransactions(
    externalConnectionId: string,
    externalAccountId: string,
    from?: Date,
    to?: Date
  ): Promise<ProviderTransaction[]>;

  refresh(
    externalConnectionId: string
  ): Promise<void>;
}