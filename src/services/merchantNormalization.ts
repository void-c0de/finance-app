/**
 * Händler-Normalisierung (M2).
 *
 * Bankdaten enthalten Buchungstext-Rauschen:
 * SEPA-Präfixe, Kartenterminal-IDs, lange
 * Referenznummern, IBAN-Fragmente, Doppel-
 * Leerzeichen, GROSSSCHREIBUNG.
 *
 * normalizeMerchantName() erzeugt daraus
 * einen sauberen, stabilen Anzeigenamen -
 * identische Eingaben liefern identische
 * Namen, was auch Regel-Matching und
 * spätere Händler-Gruppierung stützt.
 */

const NOISE_PREFIXES: readonly RegExp[] = [
  /^sepa[- ]?(überweisung|ueberweisung|lastschrift|lastschrift aktiv|gutschrift|übertrag|uebertrag)\s*/i,
  /^online[- ]?banking\s*/i,
  /^karten(kauf|zahlung)?\s*/i,
  /^(ec|pos)\s+/i,
  /^paypal\s*\*\s*/i,
  /^pp\.?\s*/i,
  /^apple\s*pay\s*/i,
  /^google\s*pay\s*/i,
  /^kfn[:.]?\s*/i,
  /^ref[.:\s]+/i,
];

const INLINE_NOISE: readonly RegExp[] = [
  /\b(?:de|it|fr|en)\b(?=\s|$)/gi,

  // Karten-/Terminal-/Referenznummern
  /\b\d{6,}\b/g,

  // IBAN-Fragmente
  /\b[A-Z]{2}\d{2}[A-Z0-9]{4,}/g,

  // Datum-artige Segmente
  /\b\d{1,2}[.]\d{1,2}[.]\d{2,4}\b/g,

  // Zeitstempel
  /\b\d{1,2}:\d{2}(:\d{2})?\b/g,

  // Trenner-Runs
  /\/{2,}|\*{2,}|-{3,}/g,

  // Sonderzeichen außer & . ' - / + #
  /[^a-zäöüß&.'\-+/#\s]/gi,
];

const KEEP_UPPERCASE =
  new Set([
    'ag',
    'kg',
    'ohg',
    'mbh',
    'se',
    'ev',
    'e.v.',
    'ug',
    'dm',
    'de',
    'uk',
    'usa',
    'gbr',
    'bv',
    'nv',
    'sa',
    'sas',
  ]);

const KEEP_LOWER =
  new Set([
    'und',
    'der',
    'die',
    'das',
    'of',
    'the',
    '&',
  ]);

function titleCaseToken(
  token:
    string,

  isFirst:
    boolean,
): string {
  const lowered =
    token.toLocaleLowerCase('de-DE');

  if (
    KEEP_UPPERCASE.has(lowered)
  ) {
    return token.toLocaleUpperCase(
      'de-DE',
    );
  }

  if (
    !isFirst &&
    KEEP_LOWER.has(lowered)
  ) {
    return lowered;
  }

  return (
    lowered.charAt(0).toLocaleUpperCase('de-DE') +
    lowered.slice(1)
  );
}

export function normalizeMerchantName(
  rawName: string | null | undefined,
): string {
  let value =
    typeof rawName === 'string'
      ? rawName.trim()
      : '';

  if (!value) {
    return '';
  }

  for (const prefix of NOISE_PREFIXES) {
    let previous;

    do {
      previous = value;

      value = value.replace(prefix, '');
    } while (value !== previous);
  }

  for (const noise of INLINE_NOISE) {
    value = value.replace(noise, ' ');
  }

  value = value.replace(/\s+/g, ' ').trim();

  if (!value) {
    return '';
  }

  const tokens = value.split(' ');

  const titled = tokens.map((token, index) =>
    titleCaseToken(token, index === 0),
  );

  let result = titled.join(' ');

  if (result.length > 40) {
    result = `${result.slice(0, 37).trimEnd()}…`;
  }

  return result;
}

/**
 * Kombinierter Titel für Zeilen:
 * bevorzugt normalisierter Händlername,
 * sonst Beschreibung.
 */
export function buildDisplayTitle(
  counterpartyName:
    | string
    | null
    | undefined,

  description:
    | string
    | null
    | undefined,
): string {
  const merchant =
    normalizeMerchantName(counterpartyName);

  if (merchant) {
    return merchant;
  }

  const normalizedDescription =
    normalizeMerchantName(description);

  if (normalizedDescription) {
    return normalizedDescription;
  }

  return description?.trim() || 'Unbekannter Umsatz';
}
