# Play Data Safety — source of truth

Developer-facing mapping of **actual** app data flows to the Google Play Data
Safety form. Derived from the code, not from memory. Update this file whenever a
data flow changes, then transcribe it into Play Console.

Last verified: 2026-08-28 against Finance App 1.6.0 (RC8 — no data-flow change since RC7).

## Third-party SDKs

**None.** A dependency scan (`package.json` + `node_modules`) finds no analytics,
tracking, attribution, advertising or crash-reporting SDK (no Firebase, Sentry,
Amplitude, Segment, AppsFlyer, Adjust, Facebook, etc.). No advertising ID is
read or requested.

## Data processors

| Processor | Role | When |
| --- | --- | --- |
| Supabase (Postgres, Auth, Edge Functions) | cloud storage, authentication, server-authoritative operations | only if the user connects a cloud account |
| Tink AB | Open Banking account-information aggregation (read-only) | only if the user connects a bank; currently **sandbox** |
| Have I Been Pwned (Pwned Passwords range API) | password breach check | signup / password change — receives only the first 5 hex chars of the SHA-1 hash (k-anonymity) |
| GitHub Pages | serves the privacy / account-deletion website | web only |

## Data collected / shared

"Collected" = leaves the device to a server. "Shared" = passed to a third party
for their own use — **nothing is shared** in that sense.

| Data type (Play category) | Collected? | Shared? | Optional/Required | Purpose | Encrypted in transit |
| --- | --- | --- | --- | --- | --- |
| Email address | Yes (Supabase Auth), only with a cloud account | No | Optional (feature the user initiates) | Account management, sync | Yes (HTTPS) |
| Password | Not stored by us; hashed server-side by Supabase Auth. HIBP check sends only a 5-char hash prefix. | No | Optional | Authentication, breach protection | Yes |
| Financial info — user payment/transaction data | Yes, only with a cloud account (accounts, transactions, balances, categories, budgets, savings goals, contributions, recurring series) | No | Optional | App functionality (sync, multi-device, restore) | Yes |
| Financial info — bank account metadata | Yes if a bank is connected: institution name, account name/type, IBAN, balance. Via Tink. No bank credentials on device. | No | Optional | Account aggregation | Yes |
| Purchase / entitlement data | Yes if a cloud account: Premium plan, source, start/expiry timestamps, provider (google_play/app_store), environment (production/sandbox). The store purchase token is **transmitted transiently** to the verify-purchase function and **stored only as a SHA-256 hash** — never in the clear. Provider transaction identifiers (opaque, non-personal) are stored to correlate renewal/refund notifications. | No | Optional | Entitlement enforcement, subscription lifecycle | Yes |
| App diagnostics / crash-adjacent logs | Yes if a cloud account: short, **redacted** technical event log (amounts, names, tokens, emails stripped before upload). No stack traces with personal data. | No | Optional (tied to cloud account) | Debugging sync issues, stability | Yes |
| Deletion requests | Yes if a cloud account: request kind, timestamps, status | No | Optional | Fulfilling deletion within the grace window | Yes |
| Device or other IDs / Advertising ID | **No** | No | — | — | — |
| Location / Contacts / Photos / Files / Messages / Calendar / Health | **No** | No | — | — | — |
| Approximate usage analytics | **No** third-party analytics. In-memory-only counters (e.g. how often an upsell was shown) are never uploaded. | No | — | — | — |

## Data deletion

- Account deletion available **in app** (`Mehr → Daten & Datenschutz → Konto löschen`).
- Account deletion available **on the web** without reinstalling:
  `https://void-c0de.github.io/finance-app/konto-loeschen.html` — this is the URL
  to enter in the Data Safety form.
- Data is **deleted**, not deactivated/paused. A 3-day cancellable grace window
  applies; after it, the purge is irreversible. Cloud finance rows are removed by
  `purge_owner_finance_data`; the auth user is removed by the
  `finalize-account-deletion` Edge Function.
- Local-only data is cleared via `Mehr → Daten & Datenschutz → Lokale Daten zurücksetzen`.

## Security practices to declare

- Data encrypted in transit: **Yes** (all endpoints HTTPS).
- Local data encrypted at rest: SQLCipher database, key in Android
  Keystore-backed SecureStore.
- Users can request deletion: **Yes** (in app + web).
- Independent security review: **No** (declare honestly).
- Committed to Play Families policy: N/A (not a families app).
