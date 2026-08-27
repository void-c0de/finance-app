import * as Crypto from 'expo-crypto';

import { validatePasswordSecurityCore } from '@/security/passwordSecurityCore';

const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/';

export function validatePasswordSecurity(password: string) {
  return validatePasswordSecurityCore(password, {
    sha1Hex: (value) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA1, value),
    async fetchRange(prefix) {
      const response = await fetch(`${HIBP_RANGE_URL}${prefix}`, {
        headers: {
          'Add-Padding': 'true',
          'User-Agent': 'FinanceApp-PasswordSecurity/1.0',
        },
      });

      if (!response.ok) throw new Error('hibp_range_unavailable');
      return response.text();
    },
  });
}
