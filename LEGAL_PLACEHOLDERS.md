# Legal placeholders — the facts only you can supply

Every `[BITTE ERGÄNZEN]` / `[BITTE PRÜFEN]` across the repo, in one place. I do
not invent identity, address or legal-entity data. Fill these, then the web
portal and store submission are content-complete.

| # | Field | Where it appears | Notes |
| --- | --- | --- | --- |
| 1 | **Verantwortlicher** – full name (and company, if any) | `docs/datenschutz.html` §1 | GDPR Art. 13. For a purely private free app a full Impressum may not be required, but the controller must be identifiable. |
| 2 | **Anschrift** (postal address) | `docs/datenschutz.html` §1 | A c/o or business address is fine; a P.O. box usually is not sufficient for an Impressum if one is needed. |
| 3 | **Kontakt-E-Mail** (privacy + support) | `docs/datenschutz.html` §1 & §13, `docs/support.html`, `STORE_LISTING.md`, `PLAY_SUBMISSION_PACK.md` | Can be the same address everywhere. Must be monitored (deletion/auskunft requests). |
| 4 | **Zuständige Datenschutz-Aufsichtsbehörde** | `docs/datenschutz.html` §12 | Depends on your Bundesland / residence. E.g. for Bayern: BayLDA. |
| 5 | **Supabase project region** + transfer basis | `docs/datenschutz.html` §10, `PRIVACY_DATA_MAP.md` "Open items" | Check Supabase dashboard → Project Settings → General → Region. If outside the EEA, name the Standard Contractual Clauses as the basis. |
| 6 | **`app_debug_logs` retention statement** | `docs/datenschutz.html` §11 | The technical retention is **14 days** (`prune_my_debug_logs`, migration `20260828120000`). Just confirm the wording. |
| 7 | Store **support email** for the Play listing | Play Console → Store listing; `STORE_LISTING.md` | = #3 is fine. |
| 8 | Decide the **public app name** | `STORE_LISTING.md`, Play Console | Currently "Finance App". The package `com.nocta_xz.financeapp` / iOS `com.nocta-xz.financeapp` are fixed regardless. |

## Nothing else is invented

The privacy policy content otherwise reflects the **actual** architecture
(SQLCipher, Supabase, Tink sandbox, HIBP k-anonymity, redacted diagnostics, no
third-party analytics, no auto-upload). No compliance claim is made without your
review — the page says so.
