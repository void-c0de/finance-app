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

/**
 * Extern verwaltete Provider werden
 * NICHT ueber die lokale Registry
 * refreshed (z.B. Tink: Consent-Flow
 * laeuft ueber Tink Link, Tokens sind
 * server-/user-seitig). Der BankSync
 * muss sie ueberspringen statt sie
 * als Fehler zu werten.
 */
export const EXTERNAL_MANAGED_PROVIDER_IDS:
  readonly string[] = [
  'tink',
];

export function isExternalManagedProvider(
  providerId: string
): boolean {
  return EXTERNAL_MANAGED_PROVIDER_IDS.includes(
    providerId
  );
}

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