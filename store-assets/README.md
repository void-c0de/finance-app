# Store assets

Screenshots and graphics for Google Play / the App Store.

**Only synthetic demo data.** Seed it in the app via **Mehr → Demo-Daten →
Laden** (dev/Superuser build) before capturing. Never capture real balances,
IBANs, emails, or account IDs. See `../SCREENSHOT_PLAN.md`.

## Layout

```
store-assets/
  android/
    raw/        <- gitignored: device-native captures straight from screencap
    *.png       <- final, cropped/normalised candidates (committed)
  ios/
    raw/        <- gitignored
    *.png       <- final candidates (committed once an iPhone build is signed)
```

## Capture (Android)

1. Build a **release** APK with the screenshot flag (no dev overlay, `/demo`
   reachable): `EXPO_PUBLIC_SCREENSHOT_MODE=1` then `gradlew assembleRelease`
   (or `npx expo run:android --variant release`). The flag is off by default and
   no `eas.json` profile sets it (`test:screenshot-mode`).
2. Install on an emulator (`Medium_Phone_API_36.0`) or an unlocked device.
   In the app: **Mehr → Demo-Daten → Laden**.
3. `npm run screenshots:android` — walks the surfaces (deep links + tab taps),
   `adb exec-out screencap`, writes `store-assets/android/raw/`. It refuses to
   save a frame if a real email / IBAN shows in the UI dump and **never** bypasses
   the OS keyguard.

`candidate-*.png` in this folder are captured from the API-36 emulator with the
deterministic demo dataset (1080×2400). Crop the status bar / normalise before
uploading.

## Play requirements (verify at upload time)

| Asset | Spec |
| --- | --- |
| Phone screenshots | 2–8, PNG/JPEG, 16:9 or 9:16, each side 320–3840 px |
| Feature graphic | 1024 × 500 PNG/JPEG, no alpha |
| App icon | 512 × 512 PNG, 32-bit, ≤ 1 MB |

## App Store requirements (verify at upload time)

| Asset | Spec |
| --- | --- |
| iPhone 6.9" | 1320 × 2868 or 2868 × 1320 |
| iPhone 6.5" | 1242 × 2688 |
| App icon | 1024 × 1024 PNG, no alpha, no rounded corners |

## Captions (factual only — no "AI", no "alle Banken")

1. Dashboard — „Alle Konten. Ein Blick."
2. Planung — „Budgets und Sparziele, die mitrechnen."
3. Analytics (Premium) — „Sieh, wohin dein Geld wirklich geht."
4. Themes — „Zehn Designs. Vier kostenlos."
5. Umsätze — „Kategorien, die sich selbst sortieren — und die du korrigieren kannst."
6. Daten & Datenschutz — „Deine Daten. Exportierbar. Löschbar."
