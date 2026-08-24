/**
 * App-weiter Schreib-Lock für
 * datenbanklastige Durchläufe.
 *
 * Verhindert Interleaving zwischen
 * Cloud-Sync und Bank-Sync/Refresh,
 * die sonst gleichzeitig auf dieselbe
 * SQLite-Verbindung schreiben.
 */

let queue: Promise<unknown> =
  Promise.resolve();

export function withDbLock<T>(
  task: () => Promise<T>,
): Promise<T> {
  const run =
    queue.then(
      task,

      task,
    );

  queue = run.catch(() => undefined);

  return run;
}
