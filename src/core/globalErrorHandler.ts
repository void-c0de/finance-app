/**
 * Minimaler globaler Fehler-Auffangpunkt.
 *
 * Zweck (Closed-Test-Beobachtbarkeit, KEIN Crash-SDK):
 *  - jeder nicht abgefangene Fehler und jede nicht behandelte Promise-Ablehnung
 *    landet EINMAL im vorhandenen `debugLog` (mit Redaction).
 *  - der bisherige RN-Handler wird DANACH weiter aufgerufen — die rote Box im
 *    Dev-Build und das Standardverhalten im Release bleiben unangetastet.
 *    Es wird NICHTS verschluckt, kein fataler Bug versteckt.
 *  - keine Netzwerk-Uploads, kein Fehler-Payload nach außen (nur die interne,
 *    redigierte Diagnose-Puffer-Zeile).
 *
 * Der reine Teil (`describeUncaught`) lebt in `@/core/uncaughtError` und ist
 * unter `node --experimental-strip-types` testbar (`scripts/test-global-error.mjs`).
 */
import { debugLog } from '@/core/debugLog';
import { describeUncaught } from '@/core/uncaughtError';

export { describeUncaught };

let installed = false;

/** Einmalig beim App-Start aufrufen. Kein Effekt außerhalb von React Native. */
export function installGlobalErrorHandler(): void {
  if (installed) return;
  installed = true;

  const globalRef = globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
      setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
    };
  };

  const eu = globalRef.ErrorUtils;
  if (eu?.setGlobalHandler && eu.getGlobalHandler) {
    const previous = eu.getGlobalHandler();
    eu.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      try {
        const { message, details } = describeUncaught(error, { fatal: isFatal, kind: 'error' });
        debugLog.error('APP', message, details);
      } catch {
        /* logging darf nie die Fehlerkette unterbrechen */
      }
      previous?.(error, isFatal);
    });
  }

  // Nicht behandelte Promise-Ablehnungen (RN nutzt das `promise`-Polyfill).
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tracking = require('promise/setimmediate/rejection-tracking') as {
      enable?: (opts: {
        allRejections?: boolean;
        onUnhandled?: (id: unknown, error: unknown) => void;
        onHandled?: () => void;
      }) => void;
    };
    tracking.enable?.({
      allRejections: true,
      onUnhandled: (_id: unknown, error: unknown) => {
        try {
          const { message, details } = describeUncaught(error, { kind: 'rejection' });
          debugLog.warn('APP', message, details);
        } catch {
          /* ignore */
        }
      },
      onHandled: () => {},
    });
  } catch {
    /* Polyfill nicht vorhanden (z. B. Web) — kein Problem */
  }
}

/** Nur für Tests. */
export function resetGlobalErrorHandlerForTest(): void {
  installed = false;
}
