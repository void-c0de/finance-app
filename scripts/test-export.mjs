import assert from 'node:assert/strict';

import {
  buildExportLookup,
  buildRecurringCsv,
  buildSavingsGoalsCsv,
  buildTransactionsCsv,
  csvCell,
  exportFileName,
  minorToPlain,
  toCsv,
} from '../src/services/exportCore.ts';

// --- integer money formatting, no floats ------------------------------
assert.equal(minorToPlain(1799), '17.99');
assert.equal(minorToPlain(-1799), '-17.99');
assert.equal(minorToPlain(5), '0.05');
assert.equal(minorToPlain(0), '0.00');
assert.equal(minorToPlain(100000000000), '1000000000.00', 'große Beträge exakt');
assert.equal(minorToPlain(2500, 0), '2500');

// --- CSV escaping ----------------------------------------------------
assert.equal(csvCell('einfach'), 'einfach');
assert.equal(csvCell('mit,Komma'), '"mit,Komma"');
assert.equal(csvCell('mit "Anführung"'), '"mit ""Anführung"""');
assert.equal(csvCell('zeile1\nzeile2'), '"zeile1\nzeile2"');
assert.equal(csvCell('carriage\rreturn'), '"carriage\rreturn"');
assert.equal(csvCell(null), '');
assert.equal(csvCell('Müller & Söhne KG'), 'Müller & Söhne KG', 'Umlaute unverändert');

const csv = toCsv(['a', 'b'], [['1', 'x,y'], ['ü', '"q"']]);
assert.ok(csv.startsWith('﻿'), 'BOM für Excel');
assert.ok(csv.includes('\r\n'), 'CRLF-Zeilenenden');
assert.equal(csv.split('\r\n')[1], '1,"x,y"');
assert.equal(csv.split('\r\n')[2], 'ü,"""q"""');

// --- transactions export -------------------------------------------
const lookup = buildExportLookup(
  [{ id: 'food', name: 'Lebensmittel' }],
  [{ id: 'acc', name: 'Girokonto', providerId: 'x', externalAccountId: 'e', currency: 'EUR', balanceMinor: 0, type: 'checking' }],
);
const txCsv = buildTransactionsCsv([
  {
    id: 't1', accountId: 'acc', amountMinor: 4599, currency: 'EUR', direction: 'expense',
    bookingDate: '2026-08-04', bookingStatus: 'booked', description: 'REWE, Filiale 12',
    counterpartyName: 'REWE Markt GmbH', categoryId: 'food', isRecurring: false, isInternalTransfer: false, createdAt: '',
  },
  {
    id: 't2', accountId: 'acc', amountMinor: 250000, currency: 'EUR', direction: 'income',
    bookingDate: '2026-08-01', bookingStatus: 'booked', description: 'Gehalt', counterpartyName: 'Firma',
    categoryId: null, isRecurring: true, isInternalTransfer: false, createdAt: '',
  },
], lookup);
const lines = txCsv.split('\r\n');
assert.equal(lines[0], '﻿Datum,Empfänger/Beschreibung,Betrag,Währung,Richtung,Kategorie,Konto,Wiederkehrend,Interne Umbuchung,Buchungsstatus');
// newest first, no comma in the name so it is not quoted
assert.equal(lines[1], '2026-08-04,REWE Markt GmbH,-45.99,EUR,Ausgabe,Lebensmittel,Girokonto,nein,nein,gebucht');
assert.equal(lines[2], '2026-08-01,Firma,2500.00,EUR,Einnahme,,Girokonto,ja,nein,gebucht');

// --- savings goals + recurring ------------------------------------
const goalsCsv = buildSavingsGoalsCsv([
  { id: 'g', name: 'Notgroschen', description: undefined, targetAmountMinor: 300000, currentAmountMinor: 120000,
    startingAmountMinor: 0, currency: 'EUR', trackingMode: 'account_balance', status: 'active', createdAt: '', updatedAt: '' },
]);
assert.ok(goalsCsv.includes('Notgroschen,3000.00,1200.00,EUR,,account_balance,active'));

const recCsv = buildRecurringCsv([
  { key: 'k', title: 'Netflix', accountId: 'acc', currency: 'EUR', direction: 'expense', kind: 'subscription',
    confidence: 'high', cadence: 'monthly', intervalDays: 30, userConfirmed: true, amountMinor: 1799,
    monthlyEstimateMinor: 1799, occurrences: 4, lastDate: '2026-08-04', expectedDate: '2026-09-03',
    nextDate: '2026-09-03', amountHistoryMinor: [1799], reason: 'Bestätigt' },
]);
assert.ok(recCsv.includes('Netflix,subscription,Ausgabe,high,ja,monthly,17.99,17.99,EUR,2026-08-04,2026-09-03'));

assert.match(exportFileName('transactions', new Date('2026-08-27T00:00:00Z')), /^finance-transactions-2026-08-27\.csv$/);

console.log('Export core: all tests passed');
