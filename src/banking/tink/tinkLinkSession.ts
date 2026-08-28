/**
 * Tink-Link-Sitzung: erzeugt den `state`-Nonce, speichert ihn sicher und
 * konsumiert ihn beim Rücksprung genau einmal (Replay-Schutz). Überlebt einen
 * App-Neustart, weil der hosted Browser-Flow die App backgrounden kann.
 */
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { buildTinkAuthorizeUrl } from '@/banking/tink/tinkCallbackCore';

const STATE_KEY = 'tink_link_state';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function startTinkLinkSession(input: {
  clientId: string;
  market?: string;
  locale?: string;
  scope?: string;
}): Promise<{ url: string; state: string }> {
  const state = bytesToHex(await Crypto.getRandomBytesAsync(16));
  await SecureStore.setItemAsync(STATE_KEY, state);
  const url = buildTinkAuthorizeUrl({ ...input, state });
  return { url, state };
}

/** Liest den erwarteten `state`, ohne ihn zu löschen (für die Klassifikation). */
export async function peekTinkLinkState(): Promise<string | null> {
  return SecureStore.getItemAsync(STATE_KEY);
}

/** Löscht den gespeicherten `state` — nach erfolgreichem Austausch oder Abbruch. */
export async function clearTinkLinkState(): Promise<void> {
  await SecureStore.deleteItemAsync(STATE_KEY);
}
