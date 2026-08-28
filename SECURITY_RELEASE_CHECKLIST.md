# Security release checklist — run before every store submission

Pass/fail gate. Most rows are automated in `npm run ci`; the rest are one command
each. Deeper analysis: `THREAT_MODEL.md`, `PRIVACY_DATA_MAP.md`, `DEPENDENCY_AUDIT.md`.

## Automated (part of `npm run ci` — 54 suites)

| # | Control | Guard |
|---|---|---|
| 1 | No secrets in tracked files or the JS bundle | `npm run guard:secrets` (`ci-secret-guard.mjs`) |
| 2 | Debug logs strip Bearer/JWT/secret assignments | `test:debug-redaction` |
| 3 | Backup import treats the file as hostile (proto pollution, money overflow, FK, dup-id, size caps) | `test:backup-import` |
| 4 | Export contains no tokens / keys / SecureStore contents | `test:export` |
| 5 | Premium is never granted client-side | `test:entitlements`, `test:product-access`, `test:purchase-state-machine` |
| 6 | Server purchase verification is replay-guarded & idempotent | `test:billing-server`, `test:webhook-auth`, `test:subscription-lifecycle` |
| 7 | Apple JWS trust chain pinned to Apple Root CA G3 | `test:apple-verify` |
| 8 | Google RTDN requires OIDC auth / verification token | `test:webhook-auth`, `test:google-verify` |
| 9 | Account deletion derives identity from the JWT only (no target-user arg) | `test:data-lifecycle` |
| 10 | Uncaught-error handler redacts before it logs | `test:global-error` |
| 11 | Core functions never throw on empty/broken/extreme input | `test:resilience` |
| 12 | Android permissions stay on the allowlist | `test:android-permissions` (checks the built APK) |
| 13 | OTA manifest can't carry an unstorable/foreign payload | `test:ota-manifest` |
| 14 | Runtime/embedded boundary is enforced | `test:runtime-boundary` |

## Manual — one command each

| # | Control | Command | Expected |
|---|---|---|---|
| 15 | Dependency inventory pinned & current | `npm run build:sbom -- --check` | up to date |
| 16 | `npm audit --omit=dev` reviewed | `npm audit --omit=dev` | 12 moderate, build-tooling only (`DEPENDENCY_AUDIT.md` — documented, not fixable without an Expo SDK change) |
| 17 | Expo config sane | `npx expo-doctor` | no issues (or documented) |
| 18 | Release AAB is upload-signed, not debug | `npm run verify:release-signing -- <aab> --expect-production` | production-signed |
| 19 | Semantic build fingerprint recorded | `npm run aab:fingerprint -- <aab> --write` | recorded; diff reviewed if changed |
| 20 | `allowBackup=false` in the built manifest | `aapt dump xmltree <apk> AndroidManifest.xml \| grep allowBackup` | `false` |
| 21 | Provider secrets fail closed | `npm run providers:doctor` | unconfigured → verification returns `not_configured`, no entitlement granted |
| 22 | Legal / privacy pages consistent with the code | `npm run check:legal` | (blocked on the 5 maintainer facts — `LEGAL_PLACEHOLDERS.md`) |

## Network egress inventory

Every host the app or its Edge Functions talk to (grep of `src/` + `supabase/`):

| Host | Purpose | Notes |
|---|---|---|
| `<project>.supabase.co` | auth, cloud sync, Edge Functions | publishable anon key only in the client; RLS per `owner_id` |
| `void-c0de.github.io` | OTA manifest + bundle, legal/support pages | static, public |
| `raw.githubusercontent.com` | OTA bundle proxy source (via the Edge Function) | static, public |
| `api.pwnedpasswords.com` | HIBP **k-anonymity** password check | only a 5-char SHA-1 prefix leaves the device |
| `api.tink.com`, `link.tink.com` | open-banking (read-only) | **sandbox**; client secret is server-side only |
| `androidpublisher.googleapis.com`, `oauth2.googleapis.com`, `accounts.google.com`, `www.googleapis.com` | Google Play purchase verification | **server-side only** (`verify-purchase` function); not reachable from the app |
| `api.storekit.itunes.apple.com`, `api.storekit-sandbox.itunes.apple.com`, `www.apple.com` | Apple purchase verification + cert chain | **server-side only** |
| `esm.sh` | Deno import for Edge Functions at deploy time | build-time, not runtime egress from the app |

No analytics / advertising / attribution / crash-reporting host. Verified by name
scan of `package.json` + `node_modules` (`DEPENDENCY_AUDIT.md`).

## Sign-off

- [ ] rows 1–14 green (`npm run ci`)
- [ ] rows 15–21 checked
- [ ] row 22 — legal facts filled (production only)
- [ ] `THREAT_MODEL.md` re-reviewed if a new data flow / third party was added
- [ ] `store-assets/release-evidence.json` reflects only real verifications
