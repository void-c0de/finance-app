# OTA rollback & failure playbook

Self-hosted `expo-updates` on GitHub Pages. Config (`app.json`):
`runtimeVersion.policy = appVersion`, `checkAutomatically: NEVER`,
`fallbackToCacheTimeout: 0`, `useEmbeddedUpdate: true`. The Supabase Edge
Function `expo-updates` proxies `docs/api/manifest.json`, rewrites asset URLs,
and 404s when the device runtime ≠ the manifest `runtimeVersion`.

## Safety properties (why an OTA can't brick the app)

- `checkAutomatically: NEVER` — the app only checks when code explicitly calls
  it (`checkProductUpdate`), and applying is gated behind a user dialog
  (`_layout.tsx`).
- `fallbackToCacheTimeout: 0` — launch never waits on the network; the embedded
  or last-good bundle starts immediately.
- A manifest the client can't parse or store is **rejected wholesale** — the
  running bundle is untouched (this is exactly the RC10 bug: bad asset keys →
  `UpdateFailedToLoad`, app kept running). `npm run test:ota-manifest` now
  guards the manifest shape.
- Runtime mismatch → the function returns 404 → no update offered. A native
  version can never receive a bundle built for a different `runtimeVersion`.

## Roll BACK an OTA (there is no "un-apply")

Updates are forward-only. To move devices off a bad bundle you publish a **new**
manifest (new `id`) whose bundle is the good code:

1. `git checkout <good-sha> -- .` (or revert the offending JS commits).
2. `npm run ci` green.
3. `npm run publish:ota` — re-exports and rewrites `docs/api/manifest.json` +
   `docs/updates/<version>/`.
4. `npm run test:ota-manifest` (must pass) and eyeball the new `id`.
5. Commit `docs/` + push. GitHub Pages serves it in ~1 min.
6. Devices that call `checkProductUpdate` get the new `id` and move forward.

`scripts/publish-ota.mjs` refuses to publish if a privileged env value
(`EXPO_PUBLIC_SUPABASE_SYNC_PASSWORD`, `TINK_CLIENT_SECRET`,
`SUPABASE_SERVICE_ROLE_KEY`) is found inside the bundle.

## Kill the OTA channel entirely (fastest mitigation)

If a bad bundle is already live and you need every device on the **embedded**
build immediately:

- **Option A (function):** make the `expo-updates` Edge Function return `204 No
  Content` (or 404) for all requests. Devices keep the embedded bundle.
  `supabase functions deploy expo-updates` with the short-circuit.
- **Option B (manifest):** set `docs/api/manifest.json` `runtimeVersion` to a
  value no build uses (e.g. `0.0.0`) and push. Every device 404s the check.
- **Option C (Pages):** delete `docs/api/manifest.json` and push — the function
  proxies a 404.

All three are reversible. None affect a fresh Play install (that ships the
embedded bundle regardless).

## Failure injection done / to do

| Injection | Result | Guard |
|---|---|---|
| asset key with a path separator | client rejects manifest, app keeps running | `test:ota-manifest` ✅ |
| runtime mismatch | function 404, no update | `test:runtime-boundary` ✅ |
| manifest 500 / network down | launch unaffected (`fallbackToCacheTimeout: 0`) | `test:offline-matrix` ✅ |
| truncated / non-JSON manifest | client rejects, app keeps running | manual (curl the function) |
| code-signing-invalid manifest | logged; not separately drilled | manual |

## Related
`RELEASE_ROLLBACK.md` (native), `RELEASE.md` (OTA rules), `DISASTER_RECOVERY.md` #12–13.
