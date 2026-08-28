# Play Financial Features declaration — source of truth

Google Play requires a Financial Features declaration for apps with financial
functionality, including on testing tracks. This maps the **actual** app to the
declaration categories. Transcribe into Play Console; do not overstate.

Last verified: 2026-08-28 against Finance App 1.6.0 (RC7).

> RC7 note: the app now ships a native in-app **subscription** (Google Play
> Billing 9.1.0 / StoreKit 2) for its own Premium tier. A subscription to the
> app's own features is **not** a regulated financial feature — it does not
> change any answer below. It is declared separately under Play's "In-app
> purchases" / monetisation, not here.

## What the app IS

- A **personal finance management (PFM)** app: budgeting, savings goals,
  spending analytics, forecasts, recurring-payment detection, data export/backup.
- An **account-information aggregator (read-only)**: it can connect to a bank via
  a licensed Open Banking provider (**Tink**) to *read* account and transaction
  data. Currently the Tink **sandbox** is used; production requires a separate
  agreement with Tink and is not active.
- Manual entry / import also works with no bank connection at all.

## What the app is NOT — declare "No" to all of these

| Feature | Provided? | Notes |
| --- | --- | --- |
| Banking / deposit accounts (we are a bank) | **No** | We hold no funds. |
| Payment initiation / money transfer / P2P payments | **No** | Tink integration is AIS (account information) only, not PIS. |
| Lending / credit / loans / BNPL / debt collection | **No** | |
| Personal loans matching / lead generation | **No** | |
| Investing / securities / brokerage / robo-advisor | **No** | Forecasts are deterministic projections of the user's own known income/fixed costs, clearly labelled by certainty. Not investment advice. |
| Cryptocurrency exchange / wallet / trading | **No** | |
| Foreign exchange | **No** | |
| Insurance | **No** | |
| Tax preparation / filing | **No** | |
| Money transmitter / remittance | **No** | |

## Financial Features categories (Play form)

- **Personal loans**: No
- **Debt management / credit repair**: No
- **Banking (regulated)**: No
- **Investments / securities**: No
- **Crypto**: No
- **Payment aggregation / initiation**: No
- **Account aggregation (read-only, PFM)**: **Yes** — via Tink, an authorised
  Open Banking provider. Region: [confirm — EEA/Germany]. Provider licence held
  by Tink, not by this app.

## Required supporting info (prepare)

- Country/region of operation: Germany / EEA (confirm before submission).
- The app does not require any financial services licence itself because it does
  not hold funds, initiate payments, lend, or give regulated advice. Account
  aggregation is performed by the licensed provider (Tink).
- Banking disclaimer text (also used in the store listing):
  *„Finance App ist keine Bank und kein Zahlungsdienst. Die App führt keine
  Zahlungen aus und verwahrt kein Geld. Die optionale Bankanbindung dient
  ausschließlich dem Lesen deiner Kontoinformationen über einen lizenzierten
  Open-Banking-Anbieter."*

## Screenshots / evidence Google may request

- The connect-bank flow (shows the Tink hosted authorisation, read-only scope).
- The privacy policy URL: `https://void-c0de.github.io/finance-app/datenschutz.html`.
- Account deletion URL: `https://void-c0de.github.io/finance-app/konto-loeschen.html`.
