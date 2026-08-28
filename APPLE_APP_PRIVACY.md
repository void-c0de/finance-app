# Apple App Privacy — Finance App

Source of truth for the **App Privacy** questionnaire in App Store Connect and
for the on-device **`PrivacyInfo.xcprivacy`** (generated from
`app.json → expo.ios.privacyManifests`, asserted by `npm run test:ios-config`).

Kept consistent with the Google side: [`PLAY_DATA_SAFETY.md`](./PLAY_DATA_SAFETY.md).
Legal identity gaps: [`LEGAL_PLACEHOLDERS.md`](./LEGAL_PLACEHOLDERS.md).

## Does the app track? (ATT)

**No.** No IDFA, no ad SDK, no attribution SDK, no cross-app/-site data sharing,
no data brokers. `NSPrivacyTracking = false`, `NSPrivacyTrackingDomains = []`.
The app therefore does **not** present an App Tracking Transparency prompt and
carries **no** `NSUserTrackingUsageDescription`.

## Data collected

"Collected" = leaves the device. Local-only mode collects **nothing** — the
encrypted SQLCipher database never leaves the phone unless the user turns on
cloud sync.

| Apple data type | Collected? | When | Linked to identity | Tracking | Purpose |
| --- | --- | --- | --- | --- | --- |
| Email address | Yes | only if the user creates a cloud-sync account | Yes (`owner_id`) | No | App Functionality (auth, account recovery) |
| Other financial info (accounts, transactions, budgets, goals) | Yes | only with cloud sync enabled | Yes (`owner_id`) | No | App Functionality (sync across devices, backup) |
| Other diagnostic data (redacted error codes, sync phase, schema version, app/OS version) | Yes | only with cloud sync enabled; see [`PRIVACY_DATA_MAP.md`](./PRIVACY_DATA_MAP.md) | Yes (`owner_id`) | No | App Functionality (support, troubleshooting) |
| Purchase history (subscription status, product id, period end) | Yes, **once billing is switched on** | after an in-app purchase | Yes (`owner_id`) | No | App Functionality (entitlement) |
| Payment info | **No** | card data is handled entirely by Apple / Google; the app never sees it | — | — | — |
| Bank credentials / access tokens | **No** | held by the Tink SDK / Tink servers, never in app storage or our DB | — | — | — |
| Contacts, Location, Photos, Browsing history, Identifiers (IDFA), Usage data, Sensitive info | **No** | not accessed | — | — | — |

### Diagnostic-data minimisation (already enforced)

`app_debug_logs` stores only: error code, safe screen/context string, app
version, runtime version, schema version, sync phase, platform. **Never**:
balances, transaction descriptions, IBAN, tokens, passwords, the SQLCipher key,
backup contents. Retention: **14 days**, capped at 500 newest rows per user
(`prune_my_debug_logs`, [`RELEASE.md`](./RELEASE.md)). Redaction is regression-
tested (`test:debug-redaction`).

## Required Reason APIs (`PrivacyInfo.xcprivacy`)

Declared in `app.json`; Expo merges them with each native module's own manifest
at prebuild.

| API category | Reason code | Why |
| --- | --- | --- |
| File timestamp | `C617.1` | `expo-file-system` / RN read timestamps of files **inside the app container** (backup export, cache). |
| Disk space | `E174.1` | check free space before writing a backup / DB migration. |
| System boot time | `35F9.1` | RN / Reanimated use `systemUptime` for monotonic animation + timing. |
| User defaults | `CA92.1` | RN + Expo read/write `NSUserDefaults` for **this app only**. |

No `NSPrivacyAccessedAPICategoryActiveKeyboards` and no
`NSPrivacyAccessedAPICategoryFileTimestamp` reason `DDA9.1` (that is for other
apps' files — not us).

## Third-party SDK privacy manifests

| SDK | Ships its own manifest | Notes |
| --- | --- | --- |
| React Native 0.86 core | Yes | boot time, user defaults, file timestamp |
| `expo-*` (SDK 57) | Yes | `expo-modules-core`, `expo-file-system`, `expo-secure-store` bundle manifests |
| Tink Link iOS SDK | **verify at integration** | must be checked when the iOS Tink build is wired; Tink publishes a manifest — confirm the version in `Podfile.lock` includes it. |
| Supabase (`supabase-js`) | N/A | pure JS, no native binary, no manifest needed |

## What a reviewer needs to know

- All financial data is optional to sync; the app is fully usable offline with
  zero server contact.
- Account + all data deletion is available **in-app** (Mehr → Daten &
  Datenschutz → Konto löschen) and on the **web**
  (`https://void-c0de.github.io/finance-app/konto-loeschen.html`).
- Encryption at rest: SQLCipher (AES-256), key in the iOS Keychain via
  `expo-secure-store`.
