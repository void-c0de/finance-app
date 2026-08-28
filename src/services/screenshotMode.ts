/**
 * Screenshot-Modus — nur für die Aufnahme von Store-Screenshots mit dem
 * synthetischen `/demo`-Datensatz.
 *
 * Wird AUSSCHLIESSLICH aktiv, wenn beim Build explizit
 * `EXPO_PUBLIC_SCREENSHOT_MODE=1` gesetzt wurde. Standard: aus. Die
 * Play-/App-Store-Builds (`eas.json`) setzen das nie — `test:screenshot-mode`
 * erzwingt das.
 *
 * Das ist KEIN Sicherheits-Bypass:
 *  - `/demo` zeigt nur synthetische Daten (Präfix `demo-`, IBAN `DE00 …`).
 *  - `clearDemoData()` fasst ausschließlich `id LIKE 'demo-%'` an.
 *  - keine Premium-Freischaltung, keine Auth, keine Biometrie betroffen.
 */
export function isScreenshotMode(): boolean {
  return process.env.EXPO_PUBLIC_SCREENSHOT_MODE === '1';
}

/** Darf der `/demo`-Screen geöffnet werden? */
export function canAccessDemo(input: { isDev: boolean; isSuperuser: boolean }): boolean {
  return input.isDev || input.isSuperuser || isScreenshotMode();
}
