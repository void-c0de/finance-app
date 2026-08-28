# Release acceptance matrix — 1.6.0 / vc7

The single "can we ship" view. Regenerate the machine version with
`npm run release:go-no-go -- --json`. Three independent tracks — a lower track
being GO does not imply the one below it.

| | Track | Verdict | What it means |
|---|---|---|---|
| 1 | **Engineering closed test** | **GO** (when CI green + tree clean) | A debug-signed APK for sideload / internal QA. Banking = Tink sandbox, billing = fixtures. Everything in this repo is done. |
| 2 | **Real Play closed test** | **NO-GO** | Needs the upload keystore + a Play Console app + filled legal facts. All maintainer-held. |
| 3 | **Production** | **NO-GO** | Needs a completed real closed test, real Google (and, for iOS, Apple) verification, and a Tink production decision. |

## Track 1 — Engineering closed test — acceptance criteria

| Criterion | Check | State |
|---|---|---|
| All test suites green | `npm run ci` (54 suites) | ✅ enforced |
| No secrets in tree/bundle | `npm run guard:secrets` | ✅ enforced |
| OTA manifest is client-loadable | `npm run test:ota-manifest` | ✅ enforced (fixed in RC10) |
| Brand/store images valid | `npm run validate:store-assets` | ✅ enforced |
| Submission text within limits | `npm run build:submission` | ✅ enforced |
| Deterministic brand assets | `npm run test:brand-assets` | ✅ enforced |
| Release signing plugin correct | `npm run test:signing-gate` | ✅ enforced |
| App boots on a physical device | `adb install -r` + smoke | ✅ vc7 installed & running on the S25 Ultra |
| Semantic build fingerprint recorded | `npm run aab:fingerprint -- <artefact> --write` | ✅ `store-assets/aab-fingerprint.json` |
| Disaster drills pass | `DISASTER_RECOVERY.md` table | ✅ except "Known gap A" (documented, follow-up) |

→ **GO for the engineering closed test** once the working tree is committed & pushed.

## Track 2 — Real Play closed test — blocking (all maintainer)

| # | Blocker | Unblock | Doc |
|---|---|---|---|
| 1 | Upload keystore not configured | set `FINANCE_UPLOAD_STORE_FILE/_STORE_PASSWORD/_KEY_ALIAS/_KEY_PASSWORD`, then `npm run release:candidate -- --production` | `RELEASE.md`, `check:upload-signing` |
| 2 | No Play Console app | create `com.nocta_xz.financeapp`, enrol in Play App Signing | `PLAY_CONSOLE_TRANSCRIPTION.md` §A |
| 3 | Legal facts unfilled (5) | fill `legal/legal.config.json`, `npm run build:legal` | `LEGAL_PLACEHOLDERS.md` |
| 4 | No testers | 1+ tester email / Google Group | `CLOSED_TEST_CHECKLIST.md` |

Data safety, financial features, IARC, listing text & assets are **content-ready**
(`store-assets/submission/`) — they only need transcription, not authorship.

## Track 3 — Production — blocking

| # | Blocker | Unblock | Doc |
|---|---|---|---|
| 1 | No real closed test completed | run track 2 | — |
| 2 | No real Google Play verification | Google Play service account → `verify-purchase` secrets; one real sandbox purchase | `BILLING_SERVER_CONTRACT.md`, `providers:doctor` |
| 3 | No real Apple verification | paid Apple Developer Program → `APP_STORE_*` secrets | `APPLE_*` docs |
| 4 | Tink is sandbox-only | Tink production application + approval, or ship with banking disabled | `PLAN.md` |
| 5 | iPhone never QA'd on device | one-time USB trust pairing | `IOS_PHYSICAL_QA.md` |
| 6 | 12-tester / 14-day gate (Play policy for new personal accounts) | run the closed test for the required window | `CLOSED_TEST_CHECKLIST.md` |

## Evidence discipline

`store-assets/release-evidence.json` records every "REAL" fact as a boolean +
timestamp + git sha. Do **not** flip a `*_real` flag from a fixture/mock — only
from an actual provider round-trip. `release:doctor` and `release:go-no-go` read
that file; inflating it corrupts every downstream verdict.
