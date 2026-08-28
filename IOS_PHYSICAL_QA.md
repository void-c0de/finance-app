# iOS physical-device QA — Finance App

Run once after the **first** sideload, and again after the **first re-sign**
(you don't need to wait 7 days — re-signing immediately exercises the same
install-over-existing path). All data below is synthetic.

## Before you start

1. In the app: **Mehr → Demo-Daten → Laden** (Superuser/dev build) — or seed a
   few manual accounts/transactions.
2. **Mehr → Daten & Datenschutz → Backup exportieren** → save the `.json` to
   Files. This is your safety net.
3. Note down (non-sensitive): number of accounts, number of transactions, the
   active theme, whether Face-ID lock is on.

## First-run checklist

| # | Test | Pass = |
| --- | --- | --- |
| 1 | Install the signed IPA via AltStore/Sideloadly (never uninstall an existing copy) | app appears, opens |
| 2 | Cold launch (swipe-kill, reopen, no Mac/Metro connected) | Dashboard renders, no white screen |
| 3 | SQLCipher DB opens | data visible, no "database is locked / not a database" error |
| 4 | Create a local account + a manual transaction | persists after app restart |
| 5 | Face ID / Touch ID lock (enable in settings, background, reopen) | biometric prompt in German; cancel → lock screen, not a crash |
| 6 | App-lock privacy: background the app | no Dashboard content in the app switcher snapshot |
| 7 | Keyboard: open every form (Login, coupon, budget, goal, search, backup import, typed confirm) | the focused field is never covered by the keyboard |
| 8 | Safe area: notch / Dynamic Island / home indicator | no control under the notch or the home bar; tab bar reachable |
| 9 | Export CSV → Share sheet → "Save to Files" | file lands in Files, opens, umlauts intact |
| 10 | Backup import: pick the `.json` from step 2 via the Files picker | preview shows the right counts; restore matches |
| 11 | Backup import: pick a deliberately broken `.json` | clear German error, no crash |
| 12 | Deep link: open `financeapp://` from Safari (e.g. a bookmark) | app opens, no crash |
| 13 | Bank connect (Tink sandbox): "Bank verbinden" → complete or cancel in the sheet | cancel → "Bankverbindung abgebrochen", nothing broken; complete → accounts imported |
| 14 | Demo mode reset | only `demo-` data cleared, real data untouched |
| 15 | Premium: redeem a coupon (admin-issued) | Premium features unlock; no fake checkout shown |
| 16 | Offline: enable Airplane Mode, cold launch | app fully usable, no infinite spinner |
| 17 | Background/resume 10× rapidly | no crash, no state loss |

## Re-sign survival test (do this second)

1. Record: `accounts=N`, `transactions=M`, `theme=X`, `faceIdLock=on/off`.
2. In AltStore: **My Apps → Refresh** (or re-add the IPA) — **same Apple ID**,
   same bundle id `com.nocta-xz.financeapp`. Do **not** delete the app.
3. Reopen. Verify:
   - [ ] DB opens (data still there, `accounts=N`, `transactions=M`)
   - [ ] SecureStore key survived → no "enter password again" / no re-encryption
   - [ ] Face-ID lock preference is still `X`
   - [ ] Theme is still `X`
   - [ ] No migration ran unexpectedly (schema version unchanged)
4. If anything is missing → restore the backup from "Before you start".

**Expected:** re-signing with the same Apple ID / Team / bundle id keeps the
Keychain access group, so the SQLCipher key and the DB both survive. This is
**documented behaviour that still needs this physical confirmation** — the
GitHub build proves the code compiles with SQLCipher, not that the key survives
a real re-sign.

## If a step fails

Capture: `Mehr → Daten & Datenschutz → Diagnose für Support erstellen` (redacted).
Note which step, expected vs actual. No screenshots of real balances.
