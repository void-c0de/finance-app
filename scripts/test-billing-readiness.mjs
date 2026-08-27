import assert from 'node:assert/strict';

import {
  formatPriceLine,
  isWellFormedPurchaseRequest,
  mergePurchaseExpiry,
  PREMIUM_PRICING,
  PREMIUM_PRODUCTS,
  resolveEntitlement,
} from '../src/services/billingCore.ts';

/**
 * Billing Readiness – keine echte Abrechnung, nur die deterministischen Regeln.
 * Client-Kauf-Claim ≠ Premium; nur verifizierter Serverzustand zählt.
 */

const now = new Date('2026-08-27T00:00:00.000Z');
const inDays = (d) => new Date(now.getTime() + d * 86_400_000).toISOString();

// --- Produktkatalog ist konsistent, aber ohne erfundene Preise --------
assert.equal(PREMIUM_PRODUCTS.length, 2);
assert.deepEqual(
  PREMIUM_PRODUCTS.map((p) => p.interval).sort(),
  ['monthly', 'yearly'],
);
assert.equal(PREMIUM_PRICING, null, 'es gibt noch keine aktiven Preise');
assert.match(formatPriceLine(null), /Kauffreigabe/);
assert.match(
  formatPriceLine({ currency: 'EUR', monthlyMinor: 299, yearlyMinor: 2990, source: 'store_catalog' }),
  /2,99 EUR \/ Monat/,
);

// --- Anfrage-Grundprüfung -------------------------------------------
assert.equal(
  isWellFormedPurchaseRequest({ platform: 'google_play', productId: 'premium.monthly', purchaseToken: 'tok_abcdefgh' }),
  true,
);
assert.equal(
  isWellFormedPurchaseRequest({ platform: 'google_play', productId: 'premium.monthly', purchaseToken: 'short' }),
  false,
  'zu kurzer Token',
);
assert.equal(
  isWellFormedPurchaseRequest({ platform: 'paypal', productId: 'premium.monthly', purchaseToken: 'tok_abcdefgh' }),
  false,
  'unbekannte Plattform',
);
assert.equal(
  isWellFormedPurchaseRequest({ platform: 'revenuecat', productId: 'unknown', purchaseToken: 'tok_abcdefgh' }),
  false,
  'unbekanntes Produkt',
);

// --- Präzedenz: Superuser schlägt alles ------------------------------
{
  const r = resolveEntitlement(
    [
      { source: 'superuser' },
      { source: 'coupon', expiresAt: inDays(5) },
    ],
    now,
  );
  assert.equal(r.isSuperuser, true);
  assert.equal(r.isPremium, true);
  assert.equal(r.premiumExpiresAt, null);
}

// --- Präzedenz: spätester Ablauf gewinnt ----------------------------
{
  // bezahlt bis +30, danach 30-Tage-Coupon -> Coupon verlängert auf +60
  const paid = { source: 'google_play', expiresAt: inDays(30) };
  const couponExtended = { source: 'coupon', expiresAt: mergePurchaseExpiry(paid.expiresAt, 30, now) };
  const r = resolveEntitlement([paid, couponExtended], now);
  assert.equal(r.isPremium, true);
  assert.equal(r.source, 'coupon');
  assert.equal(r.premiumExpiresAt, inDays(60), 'Coupon verlängert, verkürzt nie');
}

// --- kürzere Quelle ersetzt keine längere --------------------------
{
  const longPaid = { source: 'google_play', expiresAt: inDays(200) };
  const shortCoupon = { source: 'coupon', expiresAt: inDays(10) };
  const r = resolveEntitlement([longPaid, shortCoupon], now);
  assert.equal(r.premiumExpiresAt, inDays(200));
  assert.equal(r.source, 'google_play');
}

// --- permanent schlägt jedes Datum --------------------------------
{
  const r = resolveEntitlement(
    [
      { source: 'google_play', expiresAt: inDays(400) },
      { source: 'admin', expiresAt: null, permanent: true },
    ],
    now,
  );
  assert.equal(r.permanent, true);
  assert.equal(r.premiumExpiresAt, null);
  assert.equal(r.source, 'admin');
}

// --- abgelaufene / widerrufene Kandidaten zählen nicht ------------
{
  const r = resolveEntitlement(
    [
      { source: 'google_play', expiresAt: inDays(-1) },
      { source: 'coupon', expiresAt: inDays(5), active: false },
    ],
    now,
  );
  assert.equal(r.isPremium, false);
  assert.equal(r.source, 'none');
}

// --- admin -> coupon Reihenfolge egal, Ergebnis identisch --------
{
  const a = resolveEntitlement([{ source: 'admin', expiresAt: inDays(20) }, { source: 'coupon', expiresAt: inDays(50) }], now);
  const b = resolveEntitlement([{ source: 'coupon', expiresAt: inDays(50) }, { source: 'admin', expiresAt: inDays(20) }], now);
  assert.deepEqual(a, b);
  assert.equal(a.premiumExpiresAt, inDays(50));
}

// --- mergePurchaseExpiry ab „jetzt", wenn bereits abgelaufen -----
{
  const merged = mergePurchaseExpiry(inDays(-10), 30, now);
  assert.equal(merged, inDays(30), 'abgelaufene Laufzeit verlängert ab jetzt, nicht rückwirkend');
}

console.log('Billing readiness: precedence & purchase-request rules passed');
