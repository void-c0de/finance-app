// src/security/databaseKey.ts

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const DATABASE_KEY_STORAGE_NAME = 'finance_database_key';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function getDatabaseEncryptionKey(): Promise<string> {
  const existingKey = await SecureStore.getItemAsync(
    DATABASE_KEY_STORAGE_NAME
  );

  if (existingKey) {
    return existingKey;
  }

  const randomBytes = await Crypto.getRandomBytesAsync(32);
  const newKey = bytesToHex(randomBytes);

  await SecureStore.setItemAsync(
    DATABASE_KEY_STORAGE_NAME,
    newKey
  );

  return newKey;
}