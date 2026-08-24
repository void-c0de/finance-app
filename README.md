# finance-app

Personal, local-first Android finance app built with Expo / React Native.

- Offline-first with encrypted on-device storage (SQLCipher)
- Biometric app lock
- Bank connection demo provider with swappable provider architecture
- Optional cloud sync (design docs kept privately)

> This public repository contains the application source only.
> Internal development documentation is maintained privately.

## Tech stack

Expo SDK 57 · React Native 0.86 · TypeScript · Expo Router · SQLite (SQLCipher) · Zustand · Supabase (optional sync)

## Development

```bash
npm install
npx expo start --dev-client
```

Android-first. See `app.json` for configuration.

## License

MIT
