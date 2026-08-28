import assert from 'node:assert/strict';

/**
 * STREAM 5 — Finanz-Wahrheit: die Zuordnungs-Priorität
 *   manual > user-rule (nach priority) > Heuristik > Fallback
 * Eine manuelle Kategorie darf NIE automatisch überschrieben werden.
 */
const { resolveCategory, isCategorizationCandidate, ruleMatches, normalizeSearchText, EXPENSE_RULES } =
  await import('../src/services/autoCategorizationCore.ts');

const rule = (over = {}) => ({
  id: 'r1',
  name: 'Regel',
  matchType: 'merchant_contains',
  matchValue: 'rewe',
  categoryId: 'cat-custom',
  enabled: true,
  priority: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

// Aufrufer normalisieren vor resolveCategory — hier direkt nachgebildet.
const resolve = ({ merchant = '', description = '', direction = 'expense', categoryId = null, categorySource = 'none', rules = [] }) =>
  resolveCategory({
    categoryId,
    categorySource,
    direction,
    normalizedMerchant: normalizeSearchText(merchant),
    normalizedDescription: normalizeSearchText(description),
    rules,
  });

// 1. Manuell schlägt eine passende Regel UND die Heuristik.
{
  const r = resolve({
    merchant: 'REWE Markt GmbH',
    description: 'REWE sagt Lebensmittel',
    categoryId: 'cat-user-choice',
    categorySource: 'manual',
    rules: [rule()],
  });
  assert.equal(r.kind, 'manual');
  assert.equal(r.categoryId, 'cat-user-choice');
}

// 2. Regel schlägt die eingebaute Heuristik.
{
  const r = resolve({ merchant: 'REWE Markt', description: 'Einkauf', rules: [rule({ categoryId: 'cat-custom-groceries' })] });
  assert.equal(r.kind, 'rule');
  assert.equal(r.categoryId, 'cat-custom-groceries');
  assert.equal(r.ruleId, 'r1');
}

// 3. Regel-Reihenfolge: der Aufrufer sortiert nach priority, die erste passende gewinnt.
{
  const r = resolve({
    merchant: 'REWE',
    description: 'x',
    rules: [rule({ id: 'high', priority: 10, categoryId: 'cat-high' }), rule({ id: 'low', priority: 1, categoryId: 'cat-low' })],
  });
  assert.equal(r.categoryId, 'cat-high');
}

// 4. Deaktivierte Regel wird ignoriert → fällt auf die Heuristik zurück.
{
  const r = resolve({ merchant: 'REWE Supermarkt', description: 'x', rules: [rule({ enabled: false })] });
  assert.equal(r.kind, 'auto');
  assert.equal(r.categoryId, 'cat-groceries');
}

// 5. Einnahmen → cat-income, unabhängig vom Text.
{
  const r = resolve({ merchant: 'REWE Lohnbüro', direction: 'income' });
  assert.equal(r.categoryId, 'cat-income');
}

// 6. Heuristik-Treffer über die Beschreibung.
{
  const r = resolve({ description: 'Zahlung an Shell Tankstelle' });
  assert.equal(r.categoryId, 'cat-mobility');
}

// 7. Nichts passt → Fallback cat-other.
{
  const r = resolve({ merchant: 'Unbekannter Empfaenger 12345', description: 'xyz' });
  assert.equal(r.kind, 'auto');
  assert.equal(r.categoryId, 'cat-other');
}

// 8. Umlaut-/Diakritika-Normalisierung im Regel-Matching.
{
  assert.equal(ruleMatches(rule({ matchValue: 'Bäckerei', matchType: 'merchant_contains' }), 'baeckerei mueller', ''), false);
  assert.equal(ruleMatches(rule({ matchValue: 'Bäckerei', matchType: 'merchant_contains' }), normalizeSearchText('Bäckerei am Markt'), ''), true);
  assert.equal(ruleMatches(rule({ matchValue: 'REWE', matchType: 'merchant_equals' }), 'rewe', ''), true);
}

// 9. isCategorizationCandidate — der Batch-Guard.
{
  assert.equal(isCategorizationCandidate({ categoryId: 'cat-x', categorySource: 'manual' }), false, 'manuell: nie');
  assert.equal(isCategorizationCandidate({ categoryId: 'cat-groceries', categorySource: 'rule' }), false, 'sinnvoll auto: nein');
  assert.equal(isCategorizationCandidate({ categoryId: 'cat-other', categorySource: 'auto' }), true, 'Fallback: ja');
  assert.equal(isCategorizationCandidate({ categoryId: null, categorySource: 'none' }), true, 'ohne Kategorie: ja');
}

// 10. Heuristik-Reihenfolge stabil (Regressionsanker).
assert.deepEqual(EXPENSE_RULES.map((r) => r.categoryId), [
  'cat-housing',
  'cat-groceries',
  'cat-subscriptions',
  'cat-mobility',
  'cat-shopping',
  'cat-telecom',
  'cat-utilities',
  'cat-dining',
  'cat-health',
]);

console.log('auto-categorization: manual > rule > heuristic > fallback — 10 Fälle grün');
