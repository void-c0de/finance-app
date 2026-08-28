# Release rollback playbook (native / server)

What to do when a shipped 1.6.0 build or a backend change is bad. OTA-specific
steps are in `OTA_ROLLBACK.md`.

## 1. Native Android build (Play)

Play does **not** let you un-publish a version to users who already have it. The
only forward path is a higher `versionCode`.

1. Fix on `master`, `npm run ci` green.
2. Bump **only** `android.versionCode` (7 → 8). Leave `expo.version` at `1.6.0`
   **if** the JS/runtime is compatible; otherwise bump the version too and treat
   it as a new runtime (`OTA_ROLLBACK.md`).
3. `npm run release:candidate -- --production` (needs the upload keystore).
4. Upload to the **same track** the bad build is on. Set rollout to a small % if
   it's production.
5. On a closed test track you can also just **halt the rollout** of the bad
   release in Play Console — testers stay on the previous one.

Pre-mitigation while the fix builds: **halt rollout** / **deactivate** the bad
release in Play Console (Testing → your track → Releases → Halt).

## 2. Supabase Edge Functions

Functions are deployed individually and are **stateless**. Rollback = redeploy
the previous source.

```bash
git checkout <good-sha> -- supabase/functions/<name>
npx supabase functions deploy <name>
```

Functions in play: `expo-updates`, `verify-purchase`, `billing-webhook`,
`account-deletion` (see `supabase/functions/`). `verify-purchase` and
`billing-webhook` are **idempotent** (replay-guarded via `billing_webhook_events`
+ SHA-256 token store + first-verified-account-wins), so a redeploy or a
re-delivered provider event cannot double-grant.

## 3. Database migrations

Forward-only. There are **no down-migrations**. Classification of the 17 local
migrations:

| Class | Meaning | Rollback |
|---|---|---|
| **additive** (most) | new table / column / index / trigger / RPC | safe to leave in place even if the app is rolled back — older code ignores it |
| **repair** (e.g. `20260828181000`) | fixes a prior migration's function body | never roll back; roll *forward* with another repair |
| **data-lifecycle** (`prune_*`, deletion cascade) | scheduled deletes | pause the `pg_cron` job before it runs if the logic is suspect: `SELECT cron.unschedule('<job>')` |

If a migration must be neutralised: write a new migration that `DROP`s / reverts
the object. Never edit an applied migration file — `schema_migrations` already
records its version and it won't re-run.

**Before applying any migration to production:** `npx supabase db dump` (schema +
data) so there is a restore point. Supabase also keeps daily PITR backups
(dashboard → Database → Backups).

## 4. Provider config (secrets)

Setting a secret wrong (e.g. bad Google service account) fails **closed** —
verification returns `not_configured` / errors, entitlements are simply not
granted, the app keeps working in fixture/sandbox mode. To back out:
`npx supabase secrets unset <NAME>` and redeploy the function. No user data is
affected.

## 5. Tink

Sandbox only today. If a future production key misbehaves: set
`EXPO_PUBLIC_TINK_ENVIRONMENT` back to sandbox (client) / unset the server
`TINK_*` secrets. Banking degrades to "connection unavailable"; local finance
data is untouched (`test:bank-health`, `test:tink-lifecycle`).

## Decision order when something is on fire

1. **Halt the Play rollout** (or kill the OTA channel — `OTA_ROLLBACK.md`).
2. Assess blast radius: client-only? → OTA fix. server? → redeploy function.
   schema? → §3.
3. Fix forward on `master`, CI green.
4. Ship the higher `versionCode` / new OTA `id` / redeployed function.
5. Record what happened in `store-assets/release-evidence.json` `notes`.
