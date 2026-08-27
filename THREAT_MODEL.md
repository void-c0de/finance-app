# Threat model — Finance App

Concise, per-threat. Mitigation = what exists now · Residual = what remains.
Not security theater — only threats that actually apply to this app.

Scope: an offline-first personal finance Android app (RC 1.5.0), optional
Supabase cloud sync, optional Tink (sandbox) bank aggregation, public GitHub repo,
no paid billing yet, iOS sideload path in progress.

| # | Threat | Mitigation | Residual risk |
| --- | --- | --- | --- |
| 1 | **Local device compromise / stolen unlocked phone** | SQLCipher-encrypted DB; key in Android Keystore-backed SecureStore (hardware-backed where available); biometric app lock on cold start and resume; `allowBackup=false` so adb/cloud backup can't lift the DB. | If the device is unlocked *and* the app is already past the biometric gate, finance data is visible (same as any finance app). No remote wipe. |
| 2 | **Stolen backup file** (`finance-app-backup*.json`) | Backup contains user finance data but **no** passwords, sessions, JWTs, Tink/provider tokens, Supabase secrets or the SQLCipher key. It cannot be used to authenticate or to decrypt the on-device DB. | The file does contain transaction history in the clear — it's the user's data to guard. The app never auto-uploads it; the user chooses where it goes. |
| 3 | **Stolen Supabase auth token / session** | Tokens live only in SecureStore; redaction strips `Bearer`/JWT from every log line before console or upload; RLS scopes every `finance_*` row to `owner_id = auth.uid()`. A leaked token grants only that user's own data until it expires; the user can sign out (revokes) from any device. | A live token = that user's cloud finance data until expiry. No token binding to device. HIBP + zxcvbn reduce credential-stuffing that leads here. |
| 4 | **Malicious backup import** | `inspectBackup` treats the file as hostile: byte-size cap, JSON guard, format/version whitelist, per-field validation (id pattern, enum, ISO timestamp, **safe-integer money only**, string length cap), duplicate-id rejection, required-FK integrity, `__proto__`/`constructor`/`prototype` rejection, total-row cap. Restore is one transaction — any failure rolls back; LWW merge never overwrites newer local data or resurrects a newer tombstone. `test:backup-import`. | A validly-shaped backup with plausible-but-wrong numbers imports as-is (it's the user's own file). No signature on backups. |
| 5 | **Public Git repo exposure** | `scripts/ci-secret-guard.mjs` scans every tracked file on every push (sb_secret_*, service JWTs, private keys, GSA keys, keystore passwords, `.env`); `.env.local` gitignored; only the **publishable** Supabase key (designed for public clients) is in the repo and the bundle. Secret scan run before every commit batch this milestone. | Git *history* is not rewritten; if a real secret had ever been committed it would need history surgery + rotation. Audited this milestone — none found (see WS BE below). |
| 6 | **Tink secret leakage** | `EXPO_PUBLIC_TINK_CLIENT_ID` is public by design; the **client secret** is never in the app — the OAuth code→token exchange is server-side (`tink-banking` Edge Function, service-role env). No bank credentials or Tink tokens touch the device. | Currently sandbox only — low value. Production requires secure server token storage (external blocker). |
| 7 | **Admin / Superuser misuse** | Every admin action goes through a `SECURITY DEFINER` RPC that re-checks `is_superuser()` server-side; client role cache is UX-only; each mutation writes an `admin_audit_log` row (no finance content, no tokens); the deletion sweep and billing merge are service-role-only. Audit-log viewer + deletion panel show metadata only. | A compromised Superuser account could grant Premium, publish releases, sweep due deletions, read the audit log. It cannot read arbitrary users' transactions (no such endpoint) or see purchase tokens. Mitigate with a strong Superuser password + 2FA (Supabase Auth). |
| 8 | **Fake purchase claim** | Premium never comes from the client. `verify-purchase` verifies with the store server-side; `apply_verified_subscription` is service-role-only; the client `verifyPurchase()` wrapper has no code path that grants Premium locally. `billingCore.resolveEntitlement` is deterministic. `supabase/tests/billing.sql`. | Until `verifyWithGooglePlay()` is filled in, the endpoint returns `not_configured` — no purchase can succeed, so no fake one can either. |
| 9 | **Account-deletion abuse** (deleting someone else) | Every deletion RPC / the Edge Function derives identity from the platform-verified JWT `sub`; **no** target-user argument anywhere; RLS blocks reading another user's deletion request; 3-day cancellable grace window; typed `LÖSCHEN` confirmation. `supabase/tests/data_lifecycle.sql`. | A user can delete *their own* data/account — intended. A stolen live session could request deletion, but the 3-day grace + email notification path (future) gives the real user time to cancel. |
| 10 | **Update-server compromise / malicious OTA** | `expo-updates` exact runtime-version match; `useEmbeddedUpdate` + `fallbackToCacheTimeout: 0` so a bad/unreachable OTA never bricks the app; the update check runs only after local unlock and never blocks finance data. OTA metadata comes from a Superuser-only RPC. | A compromised Supabase project could push a malicious OTA to matching runtimes. Same trust boundary as the cloud data itself. No code-signing of OTA bundles beyond Expo's manifest. |
| 11 | **Screen capture / shoulder-surfing** | Biometric lock; sensitive data only visible past the lock. `FLAG_SECURE` deliberately **not** set globally (users want screenshots of their own finance app) — see `PRODUCT.md` note. | Screenshots/screen-record of the unlocked app capture finance data. Acceptable trade-off; can be narrowed to specific screens later if wanted. |
| 12 | **Debug-log privacy** | Logs are a short ring buffer; `redactSensitiveLogText` strips Bearer/JWT/secret assignments; message capped 500 / details 2000 chars; only redacted lines upload, only for a signed-in owner, RLS-scoped; **14-day retention** (`prune_my_debug_logs`, lazy). `test:debug-redaction`. | A redacted log line could still contain a merchant name from an error message. Low sensitivity; bounded retention. |

## Not applicable

- Payment fraud / money movement — the app moves no money.
- Card data / PCI — no card numbers stored (only masked account metadata from Tink).
- Multi-tenant data mixing — single-owner RLS on every table; `test:offline-matrix` + live rollback authz tests.

## Review cadence

Re-run this table whenever a new data flow, Edge Function, or third party is
added. Live authorization regression: `supabase/tests/*.sql` (run against the
linked project, always rollback).
