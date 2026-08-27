import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as common from '@zxcvbn-ts/language-common';
import * as german from '@zxcvbn-ts/language-de';

const MINIMUM_LENGTH = 12;
const MINIMUM_SCORE = 3;

const passwordEstimator = new ZxcvbnFactory({
  translations: german.translations,
  graphs: common.adjacencyGraphs,
  dictionary: { ...common.dictionary, ...german.dictionary },
});

export type PasswordSecurityFailure =
  | 'too_short'
  | 'too_weak'
  | 'compromised'
  | 'check_unavailable';

export type PasswordSecurityResult =
  | { ok: true; score: number }
  | { ok: false; code: PasswordSecurityFailure; message: string; score?: number };

export type PasswordSecurityDependencies = {
  sha1Hex(password: string): Promise<string>;
  fetchRange(prefix: string): Promise<string>;
};

export function parsePwnedRange(rangeBody: string, suffix: string): number {
  const normalizedSuffix = suffix.toUpperCase();

  for (const line of rangeBody.split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    if (line.slice(0, separator).trim().toUpperCase() !== normalizedSuffix) continue;
    const count = Number.parseInt(line.slice(separator + 1).trim(), 10);
    return Number.isFinite(count) ? count : 1;
  }

  return 0;
}

export async function validatePasswordSecurityCore(
  password: string,
  dependencies: PasswordSecurityDependencies,
): Promise<PasswordSecurityResult> {
  if (password.length < MINIMUM_LENGTH) {
    return { ok: false, code: 'too_short', message: 'Das Passwort muss mindestens 12 Zeichen lang sein.' };
  }

  const strength = passwordEstimator.check(password);
  if (strength.score < MINIMUM_SCORE) {
    return {
      ok: false,
      code: 'too_weak',
      score: strength.score,
      message: 'Das Passwort ist noch zu leicht zu erraten. Verwende am besten eine längere, ungewöhnliche Passphrase aus mehreren Wörtern.',
    };
  }

  try {
    const hash = (await dependencies.sha1Hex(password)).toUpperCase();
    if (!/^[A-F0-9]{40}$/.test(hash)) throw new Error('invalid_sha1_result');
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const rangeBody = await dependencies.fetchRange(prefix);
    const occurrences = parsePwnedRange(rangeBody, suffix);

    if (occurrences > 0) {
      return {
        ok: false,
        code: 'compromised',
        score: strength.score,
        message: 'Dieses Passwort ist in bekannten Datenlecks aufgetaucht. Bitte wähle ein neues, einzigartiges Passwort.',
      };
    }

    return { ok: true, score: strength.score };
  } catch {
    return {
      ok: false,
      code: 'check_unavailable',
      score: strength.score,
      message: 'Die sichere Passwortprüfung ist gerade nicht erreichbar. Aus Sicherheitsgründen wurde nichts gespeichert. Bitte versuche es später erneut.',
    };
  }
}
