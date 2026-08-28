# Release freeze — 1.6.0 / versionCode 7 / runtime 1.6.0

Declared 2026-08-28 (RC10). In effect until the first **real** Play Closed Test
release exists, or the maintainer explicitly lifts it.

The goal is a **stable, reproducible, submittable** release candidate. The
engineering is complete; what remains is external activation (see
`RELEASE_ACCEPTANCE.md` / `npm run release:go-no-go`).

## Allowed while frozen

- **Blocker / crash / ANR fixes.**
- **Data-loss fixes.**
- **Security fixes.**
- **Store-compliance fixes** (permissions, Data Safety accuracy, listing claims,
  icon/splash/asset problems — e.g. the RC10 splash-image fix).
- **Test fixes and new tests / drills.**
- **Provider configuration** (secrets, product IDs, keystore) — this is the
  point of the freeze.
- **Release tooling** (`release:candidate`, `release:doctor`, `providers:doctor`,
  fingerprinting, submission bundle).
- **Legal / store metadata** and generated static pages.
- **Documentation.**
- **Deterministic asset regeneration** from `build:brand` / `build:legal`.

## NOT allowed while frozen

- New finance features or screens (unless a screen is genuinely required for a
  compliance/blocker fix).
- Redesign waves. *(A targeted, user-requested polish fix — e.g. the RC10 touch
  feedback — is a fix, not a wave.)*
- Architecture rewrites or speculative refactors.
- Dependency churn / SDK upgrades without a blocker driving them.
- Schema redesign. **No new migration unless a real bug requires one.**
- OTA publishing without an actual JS fix that must ship.

## Version discipline

- `expo.version` stays **1.6.0**, `android.versionCode` **7**, `runtimeVersion`
  policy **appVersion** → runtime **1.6.0**.
- `versionCode` increments **only** if Play proves vc7 was already consumed.
- A new runtime / native generation happens **only** on a real native
  compatibility change (new native module, Expo SDK bump, config-plugin change
  that affects the binary). RC-number ≠ app version.

## How a change enters

1. Fix on `master` (or a short branch), small and reviewed.
2. `npm run ci` green + `npm run release:doctor` no new FAIL.
3. `npm run guard:secrets` clean.
4. If it touches the JS bundle and must reach existing devices: decide
   deliberately whether it is an OTA (`RELEASE.md` OTA rules) — the default is
   **no**.
5. Commit with a clear message; push; wait for CI green.

## Related

`RELEASE_ROLLBACK.md` · `OTA_ROLLBACK.md` · `RELEASE_ACCEPTANCE.md` ·
`RELEASE_CHECKLIST.md` · `CLOSED_TEST_CHECKLIST.md`
