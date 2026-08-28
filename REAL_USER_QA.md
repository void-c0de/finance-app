# Real-user QA plan (tester script)

Lightweight manual QA for closed-test users. Priority: **real confusion** and
**data loss**, not cosmetic nitpicks. ~15 minutes per pass; repeat a few times
over the 14 days.

## First 3 minutes (onboarding)

1. Install, open. Does the first screen make sense without instructions?
2. Create an account. Was the password rule clear? Did anything block you?
3. After sign-in: is it obvious what to do next on an empty dashboard?
   → Note anything that felt like a dead end.

## Core flows

| # | Scenario | Watch for |
| --- | --- | --- |
| 1 | Add a manual account + a few transactions | Can you find "add"? Keyboard covering a field? |
| 2 | Categorise a transaction, then "always this merchant" | Does the rule offer appear? Is the Premium gate honest? |
| 3 | Create a budget | Remaining/over shown correctly? |
| 4 | Create 3 budgets (Standard) | The 3rd should hit a contextual Premium sheet **before** you fill the form, not after. |
| 5 | Create a savings goal | Manual works free; "with account" shows a Premium sheet, not a silent no-op. |
| 6 | Open **Analytics** without Premium | Real preview cards (your own numbers), not a blank wall. |
| 7 | Redeem a coupon | Premium unlocks; status shows expiry. |
| 8 | Switch to a Premium theme, then let Premium "expire" (use a short coupon or ask dev) | App still works; falls back to a free theme; your preference is remembered. |
| 9 | Export transactions CSV | Real file in the share sheet; opens in a spreadsheet. |
| 10 | Create a backup, then **import** it | Preview with counts; nothing duplicated; nothing lost. |
| 11 | `Daten & Datenschutz → Lokale Daten zurücksetzen` with an unsynced change | You get a warning naming the unsynced count. |
| 12 | Request account deletion, then **cancel** it within the grace window | Banner shows the deadline; cancel restores normal state. |
| 13 | Web: open `.../konto-loeschen.html`, sign in, view status, sign out | Works on a phone browser; no errors. |
| 14 | Sign out, sign back in on the same device | Data still there. Premium status matches the server (not stale from before sign-out). |
| 15 | Airplane mode, cold-start the app | Opens to your data; no error wall; sync catches up later. |

## Premium / store purchase (only if store products are live for testers)

> When `EXPO_PUBLIC_PREMIUM_*_ID` are unset the Premium screen shows "Preise
> folgen" and there is no buy button — that is correct, skip this block.

| # | Scenario | Watch for |
| --- | --- | --- |
| P1 | Open Premium Center | If products are live: real localized price from Google Play (e.g. "3,99 €"), never a hard-coded number. "Käufe wiederherstellen" is visible. |
| P2 | Start a test purchase, then **cancel** the Google dialog | Back to the plan list, no error, Premium still OFF. |
| P3 | Complete a **test** purchase | Brief "wird geprüft"; Premium turns ON **only after** the check. If it says "serverseitige Prüfung… noch nicht eingerichtet" → Premium stays OFF, nothing was charged wrongly, report it. |
| P4 | Force-close the app right after buying, reopen | Premium is correct on reopen (silent reconcile). No second purchase prompt. |
| P5 | With Premium active: sign out, sign back in | Premium recovers from the server. No duplicate subscription in the account. |
| P6 | Tap "Käufe wiederherstellen" | Premium restored if you own it; a clear message if not. Never a charge. |
| P7 | (Play test track) turn off auto-renew for the test sub | Premium stays until the period end, then ends. Your budgets/goals/themes are **still there** afterwards. |

## Data-loss red flags (report immediately)

- Any transaction/budget/goal that disappears after sync.
- A budget/goal count that resets.
- Backup import that overwrote newer data or resurrected something you deleted.
- Local reset that ate an unsynced change **without** warning.

## Reporting

Per issue: what you did → what you expected → what happened → device model +
Android version + app version (`Mehr → App-Aktualisierung`). No screenshots with
real account numbers or balances.
