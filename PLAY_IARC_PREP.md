# IARC content-rating questionnaire — answer preparation

**Do not submit this — it is a preparation guide.** The IARC questionnaire is
completed once in Play Console (and separately mirrored for the App Store age
rating). This file states, for each question, the answer that follows from what
the app **actually** contains, and flags the few that must be confirmed in the
console UI.

No official PEGI / ESRB / USK result is claimed here — the rating is only
assigned by the IARC engine after the questionnaire is submitted.

Last derived: 2026-08-28 against Finance App 1.6.0 (RC7).

| Topic | Answer | Confidence | Basis |
| --- | --- | --- | --- |
| Violence (realistic / fantasy / sexual) | **No** | LIKELY ANSWER | No game content, no imagery of violence anywhere in the app. |
| Sexual content / nudity | **No** | LIKELY ANSWER | None. |
| Profanity / crude humour | **No** | LIKELY ANSWER | German finance UI copy; no profanity (enforced tone; `test:product-access` bans dark-pattern wording). |
| Controlled substances (drugs / alcohol / tobacco) | **No** | LIKELY ANSWER | Not referenced. |
| Gambling — simulated | **No** | LIKELY ANSWER | No games of chance, no loot mechanics. |
| Gambling — real money | **No** | LIKELY ANSWER | The app holds no funds and offers no wagering. |
| Scares / horror | **No** | LIKELY ANSWER | None. |
| User-generated content shared with others | **No** | LIKELY ANSWER | All user data is private to the user's own account (RLS `owner_id = auth.uid()`). Nothing is posted, shared or made visible to other users. |
| User-to-user interaction / chat / social features | **No** | LIKELY ANSWER | No messaging, no social graph, no comments. |
| Shares the user's physical location with other users | **No** | LIKELY ANSWER | No location permission is requested (verified in `app.json` + `test:android-permissions`). |
| Digital purchases / in-app purchases | **Yes** | MUST CONFIRM IN PLAY CONSOLE | RC7 adds native subscriptions via Google Play Billing 9.1.0 / StoreKit 2. Currently gated off (no store products) but the capability ships. Answer "Yes" for IAP presence. |
| In-app purchases can be made with real money | **Yes** | MUST CONFIRM IN PLAY CONSOLE | Subscriptions (`premium_monthly` / `premium_yearly`) once the store products exist. |
| Contains advertising | **No** | LIKELY ANSWER | No ad SDK, no ad inventory (dependency scan clean, `PLAY_DATA_SAFETY.md`). |
| Ads target children / contain mature ad content | **N/A** | LIKELY ANSWER | No ads at all. |
| Unrestricted internet access / web browser | **No** | LIKELY ANSWER | Network use is limited to Supabase, Tink's hosted link, and the HIBP range API. No general-purpose browser. `expo-web-browser` opens only the Tink authorization URL and the app's own web pages. |
| Financial / real-money features | **Yes — personal finance management + read-only account aggregation** | MUST CONFIRM IN PLAY CONSOLE | See `PLAY_FINANCIAL_FEATURES.md`. Not a bank, no payments, no lending, no investing, no crypto, no FX. |
| Collects personal / sensitive information | **Yes — see Data Safety** | MUST CONFIRM IN PLAY CONSOLE | Email + financial info, only with a cloud account, all optional. Full mapping in `PLAY_DATA_SAFETY.md`. |
| Target age group | **General audience / not directed at children** | MUST CONFIRM IN PLAY CONSOLE | A personal-finance tool; not designed for or marketed to children. Answer the "Target Audience and Content" section accordingly (no children's categories). |

## Expected outcome (not a claim)

With the answers above, the IARC engine typically returns a low age rating
(Everyone / USK 0 / PEGI 3 / ESRB Everyone), possibly with an "In-App Purchases"
interactive-elements descriptor once billing is live. **Confirm the actual
result in the console after submitting.**

## App Store age rating (mirror)

Apple's age-rating questionnaire asks equivalent questions. All "frequency"
sliders → **None**. "Unrestricted Web Access" → No. In-app purchases are declared
separately in App Store Connect, not in the age questionnaire. Expected: 4+.
