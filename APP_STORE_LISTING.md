# App Store listing — Finance App (future, not prioritised)

Mirrors [`STORE_LISTING.md`](./STORE_LISTING.md) (Google Play) with Apple field
names + limits. **Not needed for the free personal-iPhone path** — only for a
real App Store submission, which requires the paid Apple Developer Program.

## Fields

| Field | Limit | Value |
| --- | --- | --- |
| App name | 30 chars | `Finance App` |
| Subtitle | 30 chars | `Konten, Budgets, Sparziele` |
| Promotional text | 170 chars | `Alle Konten an einem Ort. Budgets, Sparziele, wiederkehrende Kosten und Prognosen — offline-first, verschlüsselt, ohne Werbung.` |
| Primary category | — | Finance |
| Secondary category | — | Productivity |
| Age rating | — | 4+ (no objectionable content; see [`APPLE_REVIEW_CHECKLIST.md`](./APPLE_REVIEW_CHECKLIST.md)) |

## Description (DE)

Reuse the long description from [`STORE_LISTING.md`](./STORE_LISTING.md). Same
banking disclaimer applies: **Finance App is not a bank and does not provide
payment services.** Account aggregation is read-only via a licensed provider
(Tink).

## Keywords (100 chars, comma-separated, no spaces)

```
finanzen,budget,haushaltsbuch,sparziele,ausgaben,konto,geld,übersicht,offline,datenschutz
```

## URLs

| Field | Value |
| --- | --- |
| Marketing URL | `https://void-c0de.github.io/finance-app/` |
| Support URL | `https://void-c0de.github.io/finance-app/support.html` |
| Privacy Policy URL | `https://void-c0de.github.io/finance-app/datenschutz.html` |

## Assets required (not yet produced — needs the paid program to upload anyway)

| Asset | Spec |
| --- | --- |
| App icon | 1024×1024 PNG, no alpha, no rounded corners |
| iPhone 6.9" screenshots | 1320×2868 or 2868×1320, 2–10 images |
| iPhone 6.5" screenshots | 1242×2688, 2–10 images |
| iPad screenshots | only if `supportsTablet` — currently **false**, so not required |

Screenshot **content** is already solved: the in-app `/demo` synthetic dataset
(same as [`SCREENSHOT_PLAN.md`](./SCREENSHOT_PLAN.md)) renders on the iOS
simulator or a sideloaded build. No private data.

## In-app purchases (when billing is enabled)

| Product | Ref name | Type |
| --- | --- | --- |
| `premium.monthly` | Finance App Premium (monatlich) | Auto-renewable subscription |
| `premium.yearly` | Finance App Premium (jährlich) | Auto-renewable subscription |

Same server-authoritative entitlement as Google Play — one resolver, see
[`BILLING_SERVER_CONTRACT.md`](./BILLING_SERVER_CONTRACT.md).
