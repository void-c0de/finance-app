import type {
  BankInstitution,
} from '@/types/banking';

import type {
  BankProvider,
} from './BankProvider';

import {
  mockBankProvider,
} from './MockBankProvider';

const providers: readonly BankProvider[] = [
  mockBankProvider,
];

export function getBankProvider(
  providerId: string
): BankProvider {
  const provider =
    providers.find(
      (candidate) =>
        candidate.id === providerId
    );

  if (!provider) {
    throw new Error(
      `Unknown bank provider: ${providerId}`
    );
  }

  return provider;
}

export async function searchBankInstitutions(
  query = ''
): Promise<BankInstitution[]> {
  const results =
    await Promise.all(
      providers.map(
        (provider) =>
          provider.searchInstitutions(
            query
          )
      )
    );

  return results.flat();
}