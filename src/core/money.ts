export interface Money {
  amountMinor: number;
  currency: string;
}

const DEFAULT_CURRENCY = 'EUR';

const DEFAULT_FRACTION_DIGITS = 2;

const currencyFractionDigitsCache =
  new Map<string, number>();

function normalizeCurrency(
  currency: string
): string {
  const normalized =
    currency
      .trim()
      .toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error(
      `Invalid currency code: ${currency}`
    );
  }

  return normalized;
}

function assertSafeMinorUnits(
  amountMinor: number
): void {
  if (
    !Number.isSafeInteger(
      amountMinor
    )
  ) {
    throw new Error(
      `Money amount must be a safe integer in minor units: ${amountMinor}`
    );
  }
}

function getMinorUnitFactor(
  currency: string
): number {
  const digits =
    getCurrencyFractionDigits(
      currency
    );

  return 10 ** digits;
}

export function getCurrencyFractionDigits(
  currency: string
): number {
  const normalizedCurrency =
    normalizeCurrency(
      currency
    );

  const cached =
    currencyFractionDigitsCache.get(
      normalizedCurrency
    );

  if (cached !== undefined) {
    return cached;
  }

  const formatter =
    new Intl.NumberFormat(
      'en-US',
      {
        style: 'currency',
        currency:
          normalizedCurrency,
      }
    );

  const options =
    formatter.resolvedOptions();

  const fractionDigits =
    typeof options.maximumFractionDigits ===
    'number'
      ? options.maximumFractionDigits
      : DEFAULT_FRACTION_DIGITS;

  currencyFractionDigitsCache.set(
    normalizedCurrency,
    fractionDigits
  );

  return fractionDigits;
}

export function createMoney(
  amountMinor: number,
  currency = DEFAULT_CURRENCY
): Money {
  assertSafeMinorUnits(
    amountMinor
  );

  return {
    amountMinor,

    currency:
      normalizeCurrency(
        currency
      ),
  };
}

/**
 * Konvertiert einen kanonischen
 * Dezimalwert exakt in Minor Units.
 *
 * Beispiele:
 *
 * "19.99"  -> 1999 EUR-Cent
 * "19"     -> 1900 EUR-Cent
 * "-4.50"  -> -450 EUR-Cent
 *
 * Diese Funktion ist für Werte aus
 * Bank-APIs gedacht.
 *
 * Für lokalisierte Eingaben wie
 * "1.234,56" ist sie nicht gedacht.
 */
export function decimalToMinorUnits(
  value: string,
  currency = DEFAULT_CURRENCY
): number {
  const normalizedCurrency =
    normalizeCurrency(
      currency
    );

  const trimmed =
    value.trim();

  const match =
    /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(
      trimmed
    );

  if (!match) {
    throw new Error(
      `Invalid decimal money value: ${value}`
    );
  }

  const signPart =
    match[1] ?? '';

  const wholePart =
    match[2];

  const fractionPart =
    match[3] ?? '';

  if (!wholePart) {
    throw new Error(
      `Invalid decimal money value: ${value}`
    );
  }

  const sign =
    signPart === '-'
      ? -1
      : 1;

  const fractionDigits =
    getCurrencyFractionDigits(
      normalizedCurrency
    );

  if (
    fractionPart.length >
    fractionDigits
  ) {
    const extraDigits =
      fractionPart.slice(
        fractionDigits
      );

    if (
      /[1-9]/.test(extraDigits)
    ) {
      throw new Error(
        `Money value has more fractional precision than ${normalizedCurrency} supports: ${value}`
      );
    }
  }

  const usableFraction =
    fractionPart
      .slice(
        0,
        fractionDigits
      )
      .padEnd(
        fractionDigits,
        '0'
      );

  const factor =
    getMinorUnitFactor(
      normalizedCurrency
    );

  const wholeNumber =
    Number(wholePart);

  if (
    !Number.isSafeInteger(
      wholeNumber
    )
  ) {
    throw new Error(
      `Money whole amount is too large: ${value}`
    );
  }

  const wholeMinor =
    wholeNumber * factor;

  const fractionMinor =
    usableFraction.length > 0
      ? Number(
          usableFraction
        )
      : 0;

  const amountMinor =
    sign *
    (
      wholeMinor +
      fractionMinor
    );

  assertSafeMinorUnits(
    amountMinor
  );

  return amountMinor;
}

/**
 * Konvertiert einen bereits als
 * JavaScript-number vorliegenden
 * Major-Unit-Wert in Minor Units.
 *
 * Für Dezimalstrings aus Bank-APIs
 * sollte stattdessen
 * decimalToMinorUnits() verwendet
 * werden.
 */
export function majorNumberToMinorUnits(
  value: number,
  currency = DEFAULT_CURRENCY
): number {
  if (!Number.isFinite(value)) {
    throw new Error(
      `Invalid money number: ${value}`
    );
  }

  const factor =
    getMinorUnitFactor(
      currency
    );

  const amountMinor =
    Math.round(
      value * factor
    );

  assertSafeMinorUnits(
    amountMinor
  );

  return amountMinor;
}

/**
 * Diese Konvertierung ist primär für
 * Darstellung, Diagramme und Charts
 * gedacht.
 *
 * Finanzberechnungen sollen weiterhin
 * ausschließlich mit Integer-Minor-Units
 * erfolgen.
 */
export function minorUnitsToMajorNumber(
  amountMinor: number,
  currency = DEFAULT_CURRENCY
): number {
  assertSafeMinorUnits(
    amountMinor
  );

  const factor =
    getMinorUnitFactor(
      currency
    );

  return (
    amountMinor /
    factor
  );
}

export function formatMinorUnits(
  amountMinor: number,
  currency = DEFAULT_CURRENCY,
  locale = 'de-DE'
): string {
  assertSafeMinorUnits(
    amountMinor
  );

  const normalizedCurrency =
    normalizeCurrency(
      currency
    );

  const value =
    minorUnitsToMajorNumber(
      amountMinor,
      normalizedCurrency
    );

  return new Intl.NumberFormat(
    locale,
    {
      style: 'currency',

      currency:
        normalizedCurrency,
    }
  ).format(value);
}

export function formatMoney(
  money: Money,
  locale = 'de-DE'
): string {
  return formatMinorUnits(
    money.amountMinor,
    money.currency,
    locale
  );
}

function assertSameCurrency(
  left: Money,
  right: Money
): void {
  const leftCurrency =
    normalizeCurrency(
      left.currency
    );

  const rightCurrency =
    normalizeCurrency(
      right.currency
    );

  if (
    leftCurrency !==
    rightCurrency
  ) {
    throw new Error(
      `Currency mismatch: ${leftCurrency} !== ${rightCurrency}`
    );
  }
}

export function addMoney(
  left: Money,
  right: Money
): Money {
  assertSameCurrency(
    left,
    right
  );

  const amountMinor =
    left.amountMinor +
    right.amountMinor;

  assertSafeMinorUnits(
    amountMinor
  );

  return createMoney(
    amountMinor,
    left.currency
  );
}

export function subtractMoney(
  left: Money,
  right: Money
): Money {
  assertSameCurrency(
    left,
    right
  );

  const amountMinor =
    left.amountMinor -
    right.amountMinor;

  assertSafeMinorUnits(
    amountMinor
  );

  return createMoney(
    amountMinor,
    left.currency
  );
}

export function negateMoney(
  money: Money
): Money {
  return createMoney(
    -money.amountMinor,
    money.currency
  );
}

export function isZeroMoney(
  money: Money
): boolean {
  return (
    money.amountMinor === 0
  );
}

export function compareMoney(
  left: Money,
  right: Money
): number {
  assertSameCurrency(
    left,
    right
  );

  if (
    left.amountMinor ===
    right.amountMinor
  ) {
    return 0;
  }

  return (
    left.amountMinor <
    right.amountMinor
      ? -1
      : 1
  );
}

export function sumMinorUnits(
  values: readonly number[]
): number {
  let total = 0;

  for (const value of values) {
    assertSafeMinorUnits(
      value
    );

    total += value;

    assertSafeMinorUnits(
      total
    );
  }

  return total;
}