import {
    addMoney,
    createMoney,
    decimalToMinorUnits,
    formatMinorUnits,
    subtractMoney,
} from './money';

function assertEqual<T>(
  actual: T,
  expected: T,
  message: string
): void {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, got ${String(actual)}`
    );
  }
}

export function runMoneySelfTest():
void {
  assertEqual(
    decimalToMinorUnits(
      '19.99',
      'EUR'
    ),
    1999,
    '19.99 EUR should be 1999 minor units'
  );

  assertEqual(
    decimalToMinorUnits(
      '100',
      'EUR'
    ),
    10000,
    '100 EUR should be 10000 minor units'
  );

  assertEqual(
    decimalToMinorUnits(
      '-4.50',
      'EUR'
    ),
    -450,
    '-4.50 EUR should be -450 minor units'
  );

  assertEqual(
    decimalToMinorUnits(
      '1500.05',
      'EUR'
    ),
    150005,
    '1500.05 EUR should be 150005 minor units'
  );

  const tenEuros =
    createMoney(
      1000,
      'EUR'
    );

  const fiveEuros =
    createMoney(
      500,
      'EUR'
    );

  assertEqual(
    addMoney(
      tenEuros,
      fiveEuros
    ).amountMinor,
    1500,
    '10 EUR + 5 EUR should be 15 EUR'
  );

  assertEqual(
    subtractMoney(
      tenEuros,
      fiveEuros
    ).amountMinor,
    500,
    '10 EUR - 5 EUR should be 5 EUR'
  );

  const formatted =
    formatMinorUnits(
      1999,
      'EUR',
      'de-DE'
    );

  if (
    !formatted.includes(
      '19,99'
    )
  ) {
    throw new Error(
      `Unexpected EUR formatting: ${formatted}`
    );
  }
}