# Finance App on a real iPhone — for 0 €

**Can you install Finance App on your own iPhone without paying for the Apple
Developer Program?**

**YES — with one constraint: one step needs a Mac *or* a free GitHub-hosted
macOS runner.** Compiling any iOS app fundamentally requires Xcode, which only
runs on macOS. Everything else (signing, installing, the weekly refresh) runs on
**Windows** with your own free Apple ID.

Nothing here needs the paid Apple Developer Program. No jailbreak, no stolen
certificates, no paid signing service. Verified against current Apple / Expo /
AltStore documentation (2026-08).

> **Windows ↔ iPhone connection:** iOS has no ADB. Before the first install the
> iPhone must be **paired once over USB** ("Trust This Computer") — on iOS 26 and
> earlier there is no wireless first-pairing. After that pairing, everything
> (install, weekly refresh, logs) is Wi-Fi-only. Full diagnosis of *this* PC and
> the minimal one-time cable step: **[`IOS_WINDOWS_WLAN_BRIDGE.md`](./IOS_WINDOWS_WLAN_BRIDGE.md)**.
> Run `npm run ios:device:doctor` to see the current state.

---

## The three routes

| | Cost | Compile step | Install to real iPhone? | 7-day refresh |
| --- | --- | --- | --- |
| **A — Xcode Personal Team** (reference) | 0 € | your own / a borrowed Mac | ✅ directly from Xcode | rebuild+reinstall from Xcode |
| **B — Windows + GitHub macOS runner + AltStore** | 0 € | free GitHub Actions macOS runner | ✅ via AltStore on Windows | AltStore auto-refreshes over Wi-Fi |
| **C — EAS iOS Simulator build** | 0 € | EAS free tier | ❌ Simulator only (needs a Mac to run) | n/a |

**Recommended for a Windows-only setup: Route B.** Route A is simplest *if* you
have any Mac access. Route C only proves the code compiles.

---

## Facts about free Apple provisioning (verify before relying on them)

Sources: [Apple – Choosing a Membership](https://developer.apple.com/support/compare-memberships/),
[Apple free provisioning docs](https://learn.microsoft.com/en-us/previous-versions/xamarin/ios/get-started/installation/device-provisioning/free-provisioning).

- Signing into Xcode with a **normal Apple Account** creates a **"Personal
  Team"** — no paid membership.
- Personal Team limits: **10 App IDs**, **3 registered devices per platform**,
  **3 apps installed per device**, and **provisioning profiles expire after
  7 days** → the app must be re-signed / reinstalled weekly.
- **Developer Mode** must be enabled on the iPhone (Settings → Privacy &
  Security → Developer Mode). Free, built in since iOS 16; required for
  sideloaded apps on iOS 26.
- **No entitlement Finance App uses needs a paid membership.** Audited: no push
  notifications, no Associated Domains (only the `financeapp://` custom scheme),
  no App Groups, no iCloud, no HealthKit, no Sign in with Apple. Face ID needs
  only an `Info.plist` string (already set), not an entitlement. Keychain /
  SecureStore work under a Personal Team.

---

## Route A — Xcode Personal Team (if you have any Mac)

You need a Mac **once to set up**, then ideally once a week (or use Route B's
refresh). A borrowed Mac is enough for the weekly rebuild.

1. On the Mac: install Xcode from the App Store.
2. Clone the repo, `npm ci`.
3. `npx expo prebuild --platform ios` → generates `ios/`.
4. `open ios/*.xcworkspace` in Xcode.
5. Xcode → Signing & Capabilities → **Team: (your Apple ID) — Personal Team**,
   "Automatically manage signing". Bundle identifier is
   `com.nocta-xz.financeapp` (already set).
6. Plug in the iPhone, select it as the run target, press **▶**.
   First run: on the iPhone, Settings → General → VPN & Device Management →
   trust your developer certificate.
7. **Weekly:** re-run **▶** from Xcode (install-over, data preserved — see
   "Data preservation" below).

Time per weekly refresh: ~2 minutes.

---

## Route B — Windows + GitHub macOS runner + AltStore

### One-time setup (Windows)

1. Install **iTunes** and **iCloud** from **apple.com** (the standalone
   installers, *not* the Microsoft Store versions). AltServer needs their
   frameworks.
2. Install **AltStore / AltServer** for Windows from
   [altstore.io](https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows).
3. On the iPhone: enable **Developer Mode** (Settings → Privacy & Security →
   Developer Mode → on → restart).
4. In AltServer: **Install AltStore** to the iPhone (USB first time). It asks for
   your Apple ID + password — these go **only to Apple** (AltServer authenticates
   to create your free Personal Team certificate). Use an
   [app-specific password](https://support.apple.com/en-us/102654) if you have
   2FA.

### Produce the unsigned IPA (free GitHub macOS runner)

The repo has a workflow `.github/workflows/ios-unsigned.yml`. Two ways to run it:

- **From Windows:** `npm run ios:unsigned` — dispatches the workflow and streams
  progress; `npm run ios:unsigned:info` shows the last run + artifact. (Uses the
  GitHub token from your local git credential helper — nothing Apple-related.)
- **From the browser:** GitHub → **Actions** → **"iOS unsigned build"** →
  **Run workflow**.

It runs on `macos-latest` (currently `macos-26`, Xcode 26.6), does
`expo prebuild` + `pod install` + an **unsigned** `xcodebuild`
(`CODE_SIGNING_ALLOWED=NO`), verifies the bundle, packages
`FinanceApp-ios-unsigned.ipa` and uploads it as an artifact (7-day retention).
Then: GitHub → the run → **Artifacts** → download `FinanceApp-ios-unsigned-ipa`,
unzip it.

Last verified build: `arm64`, `com.nocta-xz.financeapp`, 1.5.0 (6),
`MinimumOSVersion 16.4`, unsigned (`cryptid 0`), SQLCipher symbols
(`_exsqlite3_key_v2`) present, `PrivacyInfo.xcprivacy` bundled. 18.2 MB.

Public repositories get **free macOS Actions minutes**. No Apple credentials are
in CI — the build is unsigned; AltStore signs it on your machine.

Build time: ~15–25 min.

### One-time pairing (unavoidable — but not iTunes)

Per `npm run ios:device:doctor`, this PC has **never** been paired with the
iPhone. Once:

1. Unlock the iPhone, connect it by cable. Windows auto-installs the Apple USB
   driver (Apple Mobile Device Support is already present — no download).
2. Tap **"Trust This Computer"** + passcode. A pairing record now lives in
   `C:\ProgramData\Apple\Lockdown`.
3. Unplug the cable. iTunes is never needed again.

Local network shortcut (no AltServer dialog needed to *get the file* onto the
phone): `npm run ios:ipa:serve`, then on the iPhone open `http://<PC-IP>:8788/`
in Safari and save `FinanceApp.ipa` to Files. **Downloading is not installing.**

### Sign + install (Windows, over Wi-Fi)

1. **Shift-click** the AltServer tray icon → **"Sideload .ipa…"** → pick
   `.artifacts/ios/FinanceApp-ios-unsigned.ipa` (from `npm run ios:unsigned:prepare`).
   *Or* open **AltStore on the iPhone** → **My Apps** → **+** → the IPA.
2. AltServer/AltStore signs it with your free Apple ID (entered only in that
   dialog) and installs it over Wi-Fi.
3. On the iPhone: **Settings → General → VPN & Device Management** → trust your
   developer certificate. **Settings → Privacy & Security → Developer Mode** → on.

### Weekly refresh

- Keep **AltServer running** on Windows and the iPhone on the **same Wi-Fi**.
  AltStore **auto-refreshes** app signatures in the background — you usually
  never touch the 7-day limit.
- Manual refresh: AltStore → **My Apps** → **Refresh All**.
- You only need a **new IPA from CI** when the app code changes, not for the
  weekly signature refresh.

**Sideloadly** ([sideloadly.io](https://sideloadly.io)) is an equivalent
alternative to AltStore for step "Sign + install"; same rules (your own Apple
ID, your own device).

---

## Route C — EAS iOS Simulator build (compile proof only)

```bash
npm i -g eas-cli
eas login                       # free Expo account
eas build --platform ios --profile ios-simulator
```

`eas.json` has the `ios-simulator` profile (`"ios": { "simulator": true }`),
which EAS builds **without any Apple Developer account**. The output `.tar.gz`
contains a `.app` that runs **only in the iOS Simulator on a Mac**. Use it to
prove the native project, CocoaPods, Expo Modules and the JS bundle all compile
on Apple's toolchain. It cannot be installed on a physical iPhone.

---

## SQLCipher on iOS — preserved

`app.json` sets `["expo-sqlite", { "useSQLCipher": true }]` at the top level; the
`expo-sqlite` config plugin applies that to **both** platforms, so the iOS build
uses the **SQLCipher** pod and the local finance database stays **encrypted at
rest**. This is not a plain-SQLite fallback. The encryption key lives in the iOS
**Keychain** via `expo-secure-store`.

## Data preservation across the weekly re-sign

**Status: expected from how iOS works — confirm it once on the device
(`IOS_PHYSICAL_QA.md` → "Re-sign survival test"). The GitHub build proves the
app compiles *with* SQLCipher; it cannot prove the key survives a real re-sign.**

- SecureStore (the SQLCipher key) uses the iOS Keychain with the app's default
  access group, derived from **Team ID + bundle identifier**.
- Re-signing with the **same Apple ID** keeps the same Team ID → same access
  group. AltStore's refresh and Xcode's ▶ both do **install-over-existing**, so
  the app container **and** the Keychain entry are expected to survive → the
  encrypted database stays readable. **You do not need to delete the app weekly.**
- Apple's own docs are explicit that free provisioning profiles expire after
  7 days and that the app then simply won't launch until re-signed — the data is
  not wiped by the expiry itself.
- Data is lost only if: you use a **different Apple ID**, you **delete** the app,
  or you let iOS remove a long-unrefreshed app.
- **Defense in depth:** before any re-provisioning you're unsure about, create a
  backup in the app — `Mehr → Daten & Datenschutz → Backup erstellen` — and, if
  you use cloud sync, confirm it's synced. A fresh install can then be restored
  via cloud login + backup import.

---

## What still needs the paid Apple Developer Program (not this)

- App Store / TestFlight distribution.
- EU alternative app marketplaces / Web Distribution (Apple still requires
  Developer Program enrollment, notarization and, for marketplaces,
  organization status — this is **not** free personal sideloading).
- More than 3 test devices or removing the 7-day expiry.

Your goal — *your* app on *your* iPhone for testing — does **not** need any of it.
