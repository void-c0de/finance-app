# Play Console transcription pack — 1.6.0 closed test

Everything to type/upload into the Google Play Console, in order, with the exact
source. Nothing here is invented — each row points at the committed file it
comes from. Items marked **⛔ maintainer** need a fact only you can supply.

Package: `com.nocta_xz.financeapp` · version `1.6.0` · versionCode `7`

---

## A. Create the app
| Field | Value | Source |
|---|---|---|
| App name | Finance App | `STORE_LISTING.md` |
| Default language | German (Germany) – de-DE | — |
| App or game | App | — |
| Free or paid | Free (with in-app products later) | `PLAY_FINANCIAL_FEATURES.md` |

## B. Store listing → Main store listing
| Field | Limit | Source |
|---|---|---|
| Short description | 80 | `STORE_LISTING.md` → "Short description (DE)" |
| Full description | 4000 | `STORE_LISTING.md` → "Full description (DE)" |
| App icon | 512×512, 32-bit PNG, ≤1 MB | `store-assets/submission/graphics/icon-512.png` |
| Feature graphic | 1024×500 | `store-assets/submission/graphics/feature-graphic-1024x500.png` |
| Phone screenshots | 2–8, 16:9–9:16 | `store-assets/submission/screenshots-phone/` |
| Tablet screenshots | optional | not provided (phone-first) |

Run `npm run build:submission` — it fails if any text is over the limit and
prints the exact counts.

## C. Store settings
| Field | Value | Source |
|---|---|---|
| App category | Finance | — |
| Tags | budgeting, personal finance | — |
| Store listing contact email | ⛔ maintainer | `legal/legal.config.json → contact_email` |
| Website | https://void-c0de.github.io/finance-app/ | live |
| Phone / address | optional; leave blank unless an Impressum requires it | `LEGAL_PLACEHOLDERS.md` |

## D. Policy → App content (Dashboard declarations)
| Section | Answer | Source |
|---|---|---|
| Privacy policy URL | https://void-c0de.github.io/finance-app/datenschutz.html | live |
| Ads | No ads | `PLAY_APP_CONTENT.md` |
| App access | All functionality available without special access; provide a test login OR mark that a self-service account is created in-app | `PLAY_APP_CONTENT.md` |
| Content rating (IARC) | Complete the questionnaire using `PLAY_IARC_PREP.md`; expected: PEGI 3 / everyone | `PLAY_IARC_PREP.md` |
| Target audience | 18+ | `PLAY_APP_CONTENT.md` |
| News app | No | — |
| COVID-19 contact tracing | No | — |
| Data safety | transcribe section E below | `PLAY_DATA_SAFETY.md` |
| Government app | No | — |
| Financial features | transcribe section F below | `PLAY_FINANCIAL_FEATURES.md` |
| Health | No | — |

## E. Data safety form
Transcribe `PLAY_DATA_SAFETY.md` field by field. Summary of what it says:

- **Data collected & sent off device** (only if cloud sync / login is used):
  account email (auth), and the user's finance data (accounts, transactions,
  budgets, goals) — stored on Supabase, **encrypted in transit and at rest**,
  **not sold**, **not shared** with third parties, used only to provide sync.
- **On-device only** (no collection): everything, if the user never signs in.
- **Diagnostics:** a local redacted debug log; **not** transmitted (no crash SDK,
  no analytics). Auto-deleted after 14 days server-side if sync is on.
- **Data deletion:** in-app (Settings → Data & privacy) and via
  https://void-c0de.github.io/finance-app/konto-loeschen.html
- Banking (Tink) is **read-only** and currently **sandbox** — no real bank data.

## F. Financial features declaration
Transcribe `PLAY_FINANCIAL_FEATURES.md`. Key answers:

- The app **provides personal financial management / budgeting tools**.
- It is **not** a bank, **not** a payment processor, does **not** execute
  payments, does **not** custody funds, is **not** a lending / crypto product.
- Open-banking access is **read-only account information** through a licensed
  third-party AISP (Tink), currently in their test environment.
- No stock/crypto trading, no P2P payments, no debt collection.

## G. Release → Testing → Closed testing
| Step | Detail | Source |
|---|---|---|
| Create track | "Closed testing" → new track e.g. "closed-alpha" | `CLOSED_TEST_CHECKLIST.md` |
| Testers | email list or Google Group; ⛔ maintainer supplies testers | `CLOSED_TEST_CHECKLIST.md` |
| App bundle | upload the **upload-signed** AAB (`npm run release:candidate -- --production`) | `RELEASE.md` |
| Release name | `1.6.0 (7)` | — |
| Release notes | `PLAY_RELEASE_NOTES.md` → first-closed-test block (≤500 chars) | `PLAY_RELEASE_NOTES.md` |
| Countries | pick the test countries (DE at minimum) | — |

> ⚠ The AAB must be signed with a **real upload key** (`FINANCE_UPLOAD_*`).
> `release:candidate --production` refuses to build otherwise — it never
> substitutes the debug key. Until then only the **engineering** APK exists
> (`release:candidate --engineering`), which is fine for sideload QA but Play
> will reject a debug-signed / Play-App-Signing-mismatched upload.

## H. Monetisation (later — not needed for the first closed test)
| Step | Detail | Source |
|---|---|---|
| Create subscription products | base plan IDs must match `EXPO_PUBLIC_PREMIUM_MONTHLY_ID` / `_YEARLY_ID` | `BILLING_SERVER_CONTRACT.md` |
| Real-time developer notifications | Pub/Sub topic → `billing-webhook` function URL | `BILLING_SERVER_CONTRACT.md` |
| License testers | add the test accounts for sandbox purchases | `CLOSED_TEST_CHECKLIST.md` |

## What is still blocked (maintainer-held)
See `RELEASE_ACCEPTANCE.md` for the live matrix. As of this commit:
- ⛔ upload keystore (`FINANCE_UPLOAD_*`)
- ⛔ Play Console account + app creation
- ⛔ `legal/legal.config.json` (5 fields — see `LEGAL_PLACEHOLDERS.md`)
- ⛔ Google Play service account (server verification) — optional for a
  no-billing closed test
