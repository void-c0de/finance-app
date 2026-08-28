# Disaster & recovery drills — 1.6.0

Each row: the failure, what the app is expected to do, how the user recovers,
the automated guard, and any residual gap. "Guard" = a test in `npm run ci`.

Local data model: the **encrypted SQLite (SQLCipher) DB is the source of truth
on-device**; for a signed-in user the Supabase cloud copy is authoritative and
the local DB is a rebuildable cache. Encryption key: 32 random bytes in
`expo-secure-store` (`finance_database_key`), created on first launch
(`src/security/databaseKey.ts`).

| # | Scenario | Expected behaviour | User recovery | Guard | Residual gap |
|---|---|---|---|---|---|
| 1 | **App killed mid-write** | `withTransactionAsync` (BEGIN/COMMIT/ROLLBACK) + WAL → the partial write is rolled back atomically on next open | none needed | `test:sqlite-repo`, `test:transfers` | — |
| 2 | **Corrupted DB file** (`file is not a database` / malformed) | `initializeDatabase()` rejects → boot lands on the **"Start fehlgeschlagen"** screen with the SQLite message (not a black screen / silent crash) | signed-in: reinstall → cloud re-pull restores everything. local-only: data is lost (no unencrypted copy by design) | `test:global-error` (boot error is surfaced, redacted) | **"Erneut versuchen" is the only button and cannot fix a corrupt/again-unreadable file** — see "Known gap A" |
| 3 | **SecureStore key lost** (OS restore to new device, SecureStore cleared) | `getDatabaseEncryptionKey()` mints a *new* key → `PRAGMA key` cannot open the existing ciphertext → same "Start fehlgeschlagen" screen | same as #2 | same as #2 | same as "Known gap A" |
| 4 | **Wrong key supplied to a backup import** | N/A — backups are **plaintext JSON export**, not an encrypted DB copy. A malformed/foreign file is rejected by the import validator before any write | re-export and retry | `test:backup-import`, `test:export` | — |
| 5 | **Tampered / truncated backup JSON** | Strict schema + type validation rejects the file; conservative merge never deletes existing rows on import | pick a good backup | `test:backup-import` | — |
| 6 | **Migration fails partway** | Each migration runs in its own transaction and is recorded in `schema_migrations` only on success; a failure rolls that migration back, earlier ones stay applied, pending ones retry next launch | relaunch; if it still fails, reinstall (cloud re-pull) | `test:sqlite-repo` (schema v9→v13 DDL is the real app DDL), `test:runtime-boundary` | migrations are **forward-only** (no down-migrations) — acceptable for a store app, documented |
| 7 | **Sync conflict** (same row edited on two devices offline) | Deterministic "last writer to sync wins" — server upsert on `id`, `set_updated_at` trigger stamps server time; tombstones (`deleted_at`) always win a delete race | none — converges on next sync both ways | `test:offline-matrix`, `test:sync-merge`, `test:pending` | soft-delete means a delete can lose to a *later* edit on the other device until that device also syncs — by design, documented in `test:offline-matrix` |
| 8 | **Account isolation** (user A's device pulls after user B logged in) | On auth change the local cache + sync cursors are wiped before the new account's first pull (`resetForAccountChange`, `wipeLocalFinanceDataLocked` inside the sync lock) | none | `test:sync-merge`, `test:entitlements`, `test:product-access` | — |
| 9 | **Rapid login / logout churn** | Sync is best-effort and serialized under `withDbLock`; boot never blocks on it; a cancelled pull leaves cursors unchanged so the next pull is a superset | none | `test:offline-matrix`, `test:resilience` | — |
| 10 | **Account deletion** | Grace window → due date → FK-safe server-side cascade (`data-lifecycle` migration); local `wipeLocalFinanceData` on the device | deletion can be aborted within the grace window | `test:data-lifecycle` | — |
| 11 | **Provider outage** (Supabase / Tink / Play down) | All three are best-effort: DB stays fully usable offline, billing shows "Preise folgen" / cached entitlement, banking shows the connection as degraded | retry later; nothing is lost | `test:offline-matrix`, `test:bank-health`, `test:billing-readiness`, `test:resilience` | — |
| 12 | **Bad OTA manifest** | `expo-updates` rejects a manifest it cannot store and keeps the embedded bundle; `checkAutomatically: NEVER` + `fallbackToCacheTimeout: 0` means a bad update never blocks launch | none — app keeps running the shipped bundle | `test:ota-manifest` (guards the exact regression that shipped in RC6–RC9: path separators in asset keys), `test:runtime-boundary` | a *code-signing*-invalid manifest is logged but not separately drilled |
| 13 | **OTA rollback** | Re-publish the previous bundle as a new manifest `id`; devices move forward to it. There is no "un-apply"; forward-only | publish a corrected bundle | `OTA_ROLLBACK.md` procedure | manual |

## Known gap A — no self-service recovery from an unreadable encrypted DB

Scenarios **#2 and #3** both dead-end on the "Start fehlgeschlagen" screen whose
only action is **"Erneut versuchen"**, which re-runs the identical failing open
and fails identically. `wipeLocalFinanceData()` cannot help here — it needs a
*working* connection (it runs `DELETE FROM`), and the connection is exactly what
failed.

**Manual recovery today:** reinstall the app.
- Signed-in user: **zero data loss** — the next login re-pulls the full dataset
  from Supabase.
- Local-only user (never signed in): local data is unrecoverable. This is the
  documented cost of "no unencrypted copy ever touches disk".

**Proposed fix (needs maintainer sign-off — boot-flow change, held under the
release freeze):** when `initializeDatabase()` fails specifically with a
SQLCipher open error, show a second, clearly-worded button on the error screen
that calls `SQLite.deleteDatabaseAsync('finance.db')` + clears the SecureStore
key and retries. Gate it to that error class only; word it as destructive for
local-only users. Tracked as a follow-up task.

## Running the drills

Most drills are continuously enforced by `npm run ci` (54 suites). The
device-level ones (kill mid-write, reinstall re-pull, provider outage with the
radio off) are in `REAL_USER_QA.md` as manual closed-test steps.
