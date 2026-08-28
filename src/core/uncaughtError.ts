/**
 * Reine Beschreibung eines nicht abgefangenen Fehlers / einer nicht behandelten
 * Promise-Ablehnung → (message, details) für `debugLog`. Keine Imports, keine
 * Seiteneffekte — testbar unter `node --experimental-strip-types`
 * (`scripts/test-global-error.mjs`).
 */

export function describeUncaught(
  error: unknown,
  context: { fatal?: boolean; kind: 'error' | 'rejection' },
): { message: string; details: Record<string, unknown> } {
  const name =
    error && typeof error === 'object' && 'name' in error && typeof (error as { name?: unknown }).name === 'string'
      ? (error as { name: string }).name
      : 'Error';
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : (() => {
            try {
              return JSON.stringify(error);
            } catch {
              return String(error);
            }
          })();
  const message = `${context.kind === 'rejection' ? 'UnhandledRejection' : 'UncaughtError'}${context.fatal ? ' (fatal)' : ''}: ${name}`;
  const stackFirst =
    error instanceof Error && typeof error.stack === 'string'
      ? error.stack.split('\n').slice(0, 4).join(' | ')
      : undefined;
  return {
    message,
    details: {
      name,
      reason: String(raw).slice(0, 300),
      ...(stackFirst ? { stack: stackFirst.slice(0, 600) } : {}),
      fatal: Boolean(context.fatal),
    },
  };
}
