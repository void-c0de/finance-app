# Release checklist — Finance App → Google Play

Concrete gap list from current (Aug 2026) Play requirements. ✅ done · ⏳ ready,
needs one external action · ❌ not started.

## Policy / compliance

| Item | Status | Notes |
| --- | --- | --- |
| targetSdk 36 (Android 16) — new-app/update deadline 31 Aug 2026 | ✅ | Verified in merged manifest + APK aapt. No SDK bump needed. |
| AAB upload format | ✅ | `npm run release:android:aab` (bundleRelease). |
| App signing by Google Play (upload key) | ⏳ | Needs `FINANCE_UPLOAD_*` keystore (maintainer). `npm run verify:release-signing` fails the build path if a "production" build is debug-signed. |
| In-app account deletion | ✅ | `Mehr → Daten & Datenschutz → Konto löschen`. |
| Web account deletion (no login wall to view, HTTPS, direct link) | ✅ | `https://void-c0de.github.io/finance-app/konto-loeschen.html` — live, tested. |
| Data actually deleted (not deactivated) | ✅ | `purge_owner_finance_data` + Edge Function; 3-day grace only. |
| Privacy policy URL (HTTPS) | ✅ (content ⏳) | `.../datenschutz.html` live; `[BITTE ERGÄNZEN]` legal fields remain. |
| Data Safety form answers | ✅ prepared | `PLAY_DATA_SAFETY.md`. Transcribe into console. |
| Financial Features declaration | ✅ prepared | `PLAY_FINANCIAL_FEATURES.md`. Account aggregation = Yes; everything regulated = No. |
| Google Play Billing Library v8+ (deadline 31 Aug 2026) | ✅ N/A | No billing library present. Applies only when billing is added. |
| Permissions minimised | ✅ | `SYSTEM_ALERT_WINDOW` removed; only INTERNET, ACCESS_NETWORK_STATE, USE_BIOMETRIC/USE_FINGERPRINT, VIBRATE, legacy storage (maxSdk 32). |
| Content rating (IARC) | ❌ | Complete questionnaire (Finance, no ads, no gambling → Everyone/PEGI 3). |
| Store listing (text, screenshots, feature graphic, icon 512²) | ⏳ | Text ready (`STORE_LISTING.md`); screenshots need a synthetic-data capture pass (`SCREENSHOT_PLAN.md`). |
| App access (review-team instructions) | ⏳ | Provide a Premium coupon + Tink sandbox note. |
| Closed test: 12 testers / 14 days (if new personal account) | ❌ | See `CLOSED_TEST_CHECKLIST.md`. Confirm account type first. |

## Build / technical

| Item | Status |
| --- | --- |
| `npx tsc --noEmit` clean | ✅ |
| `npm run lint` clean | ✅ |
| `npx expo-doctor` 21/21 | ✅ |
| All `npm run test:*` green | ✅ |
| Supabase migration parity + `db lint` | ✅ |
| Deletion authorization rollback test | ✅ (`supabase/tests/data_lifecycle.sql`) |
| `finalize-account-deletion` Edge Function deployed + live-tested | ✅ |
| Runtime boundary test (1.5.0 / vc6) | ✅ |
| AAB structurally validated (bundletool) | ✅ (see `RELEASE.md`) |
| Cold start on a physical Android 16 device, no Metro | ✅ |

## Version

- Native generation **1.5.0 / versionCode 6 / runtime 1.5.0** (RC1).
- Reason for the bump from 1.4.0: native manifest hardening (permission removal,
  `allowBackup=false`, app label) — not OTA-deliverable to 1.4.0 devices.
- OTA: the 1.5.0 channel starts empty; devices run the embedded bundle.

## The only external blockers

1. **Play upload keystore** (`FINANCE_UPLOAD_*`) — to produce a Play-signable AAB.
2. **Google Play Console access** — to transcribe Data Safety / Financial
   Features, upload the AAB, set up the closed test, complete IARC.
3. **Legal fields** in the privacy policy (`[BITTE ERGÄNZEN]`).
4. **Tink production agreement** — only needed to leave sandbox; not a store blocker.
