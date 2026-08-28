import assert from 'node:assert/strict';

/**
 * RC6 — Store-Produkt-Konfiguration. Ohne echte IDs = not_configured,
 * kein Absturz, keine erfundenen Produkte.
 */
const { getConfiguredProducts, isBillingConfigured, internalIdForStoreProduct } = await import(
  '../src/services/billing/productConfig.ts'
);

// --- leere Umgebung → nicht eingerichtet -------------------------
assert.deepEqual(getConfiguredProducts({}), []);
assert.equal(isBillingConfigured({}), false);
assert.equal(internalIdForStoreProduct('irgendwas', {}), null);

// --- nur eine ID gesetzt → weiterhin nicht eingerichtet --------
assert.deepEqual(getConfiguredProducts({ EXPO_PUBLIC_PREMIUM_MONTHLY_ID: 'x' }), []);
assert.deepEqual(getConfiguredProducts({ EXPO_PUBLIC_PREMIUM_YEARLY_ID: 'y' }), []);
assert.equal(isBillingConfigured({ EXPO_PUBLIC_PREMIUM_MONTHLY_ID: '   ' }), false);

// --- beide IDs gesetzt → zwei Produkte ------------------------
{
  const env = {
    EXPO_PUBLIC_PREMIUM_MONTHLY_ID: 'finance.premium.monthly',
    EXPO_PUBLIC_PREMIUM_YEARLY_ID: 'finance.premium.yearly',
  };
  const products = getConfiguredProducts(env);
  assert.equal(products.length, 2);
  assert.deepEqual(products.map((p) => p.id).sort(), ['premium_monthly', 'premium_yearly']);
  assert.equal(products.find((p) => p.interval === 'monthly').storeProductId, 'finance.premium.monthly');
  assert.equal(isBillingConfigured(env), true);
  assert.equal(internalIdForStoreProduct('finance.premium.yearly', env), 'premium_yearly');
  assert.equal(internalIdForStoreProduct('unbekannt', env), null);
}

// --- getrimmt -----------------------------------------------
{
  const env = {
    EXPO_PUBLIC_PREMIUM_MONTHLY_ID: '  a.b.monthly  ',
    EXPO_PUBLIC_PREMIUM_YEARLY_ID: 'a.b.yearly',
  };
  assert.equal(getConfiguredProducts(env)[0].storeProductId, 'a.b.monthly');
}

// --- KEINE erfundenen Produkt-IDs im Quellcode ---------------
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/services/billing/productConfig.ts', import.meta.url), 'utf8');
  assert.ok(!/premium_monthly_real|_real['"]|fake|dummy/i.test(src), 'keine Fake-Produkt-IDs');
}

console.log('product config: keine Fake-IDs, beide ENV-IDs nötig, sonst not_configured — grün');
