# Store screenshot plan

**Never use real financial data in store assets.** Capture from a synthetic demo
account only. Biometric app-lock must not be bypassed — unlock normally on the
device, then capture.

## Prerequisites

- A dedicated demo Supabase account (not the personal one) seeded with synthetic
  data: 2–3 fake accounts, ~40 transactions across ~8 categories over 2 months,
  1–2 budgets, 1 savings goal, a couple of recurring items.
- Or use the app's mock provider (`connect-bank` → demo) which generates
  synthetic accounts/transactions with no real bank involved.
- A Premium coupon redeemed on the demo account (for the Premium surfaces).
- Device: the Samsung (Android 16). `adb exec-out screencap -p > shot.png`
  after unlocking, or the device's own screenshot gesture.

## Shots (phone, 1080×1920 or device-native; 2–8 required by Play)

1. **Dashboard** — attention card + current-month cashflow + planning grid.
2. **Planning** — budgets with remaining/over, savings goal progress, the quick-create "+".
3. **Analytics (Premium)** — month comparison + a category trend.
4. **Themes** — the `/themes` grid with a Premium theme selected (shows the free/Premium split).
5. **Transactions** — list with categories + a recurring badge.
6. **Data & Privacy** — the hub (backup / import / deletion), demonstrates trust/control.
7. *(optional)* **Premium Center** — the pillar layout with the honest "prices follow" line.
8. *(optional)* **Backup import** — the preview step with counts.

## Feature graphic (1024×500)

Simple: app mark + "Budgets · Sparziele · Analysen · Backups" + "offline-first,
lokal verschlüsselt". No fake numbers, no fake bank logos.

## Icon

`assets/images/icon.png` (1024²) is the current custom mark. Confirm it reads
well at 48px and on both light/dark launchers. Adaptive icon foreground/background
already configured. Not a placeholder.

## Do NOT show

- Real IBANs, real balances, real merchant names from a real bank.
- Any Tink production branding (sandbox only).
- Debug overlays, the dev menu, or Metro.
