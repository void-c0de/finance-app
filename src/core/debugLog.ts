/**
 * Zentrales Debug-Journal.
 *
 * - Ring-Puffer der letzten Einträge im Speicher
 * - Spiegelung an console.* für Metro
 * - Export für den Upload in die
 *   Supabase-Tabelle app_debug_logs,
 *   damit Fehler remote analysiert werden können.
 */

export type DebugLogLevel =
  | 'debug'
  | 'info'
  | 'warn'
  | 'error';

export type DebugLogEntry = {
  ts: string;

  level:
    DebugLogLevel;

  tag:
    string;

  message:
    string;

  details?:
    | string
    | null;
};

const MAX_ENTRIES =
  250;

const buffer: DebugLogEntry[] =
  [];

let nextId = 1;

/**
 * Letzte Schutzlinie vor Konsole und
 * Supabase-Supportjournal. Sie ersetzt
 * typische Auth-/Provider-Secrets, ohne
 * harmlose Fehlercodes und UUIDs zu entfernen.
 */
export function redactSensitiveLogText(
  value: string,
): string {
  return value
    .replace(
      /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
      'Bearer [REDACTED]',
    )
    .replace(
      /\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g,
      '[REDACTED_JWT]',
    )
    .replace(
      /(["']?(?:access_token|refresh_token|client_secret|password|pin|service_role)["']?\s*[:=]\s*["']?)[^"'\s,}\]]+/gi,
      '$1[REDACTED]',
    );
}

function pushEntry(
  entry: DebugLogEntry,
): void {
  buffer.push(entry);

  if (
    buffer.length >
    MAX_ENTRIES
  ) {
    buffer.splice(
      0,

      buffer.length -
        MAX_ENTRIES,
    );
  }
}

function toDetailsText(
  details: unknown,
): string | null {
  if (
    details ===
      undefined ||
    details === null
  ) {
    return null;
  }

  if (
    details instanceof
    Error
  ) {
    const parts = [
      `${details.name}: ${details.message}`,
    ];

    const coded =
      details as Error & {
        code?: string;
      };

    if (coded.code) {
      parts.push(
        `code=${coded.code}`,
      );
    }

    if (
      details.stack
    ) {
      parts.push(
        details.stack.slice(
          0,
          1200,
        ),
      );
    }

    return redactSensitiveLogText(
      parts.join(
        '\n',
      ),
    );
  }

  if (
    typeof details ===
    'string'
  ) {
    return redactSensitiveLogText(
      details,
    );
  }

  try {
    return redactSensitiveLogText(
      JSON.stringify(
        details,
        null,
        2,
      ),
    );
  } catch {
    return redactSensitiveLogText(
      String(
        details,
      ),
    );
  }
}

function emit(
  level:
    DebugLogLevel,

  tag:
    string,

  message:
    string,

  details?: unknown,
): DebugLogEntry {
  const entry: DebugLogEntry =
    {
      ts: new Date().toISOString(),

      level,

      tag,

      message:
        redactSensitiveLogText(
          message,
        ),

      details:
        toDetailsText(
          details,
        ),
    };

  pushEntry(entry);

  const line =
    `[${tag}] ${message}`;

  if (
    level ===
    'error'
  ) {
    console.error(
      line,

      details ??
        '',
    );
  } else if (
    level ===
    'warn'
  ) {
    console.warn(
      line,

      details ??
        '',
    );
  } else {
    console.log(
      line,

      details ??
        '',
    );
  }

  return entry;
}

export const debugLog = {
  debug: (
    tag: string,

    message: string,

    details?: unknown,
  ) =>
    emit(
      'debug',
      tag,
      message,
      details,
    ),

  info: (
    tag: string,

    message: string,

    details?: unknown,
  ) =>
    emit(
      'info',
      tag,
      message,
      details,
    ),

  warn: (
    tag: string,

    message: string,

    details?: unknown,
  ) =>
    emit(
      'warn',
      tag,
      message,
      details,
    ),

  error: (
    tag: string,

    message: string,

    details?: unknown,
  ) =>
    emit(
      'error',
      tag,
      message,
      details,
    ),
};

export function getRecentDebugLogs(): DebugLogEntry[] {
  return [...buffer];
}

/**
 * Kompakte Nutzlast für den Upload.
 *
 * Ältere Einträge zuerst, damit die
 * Reihenfolge serverseitig stabil bleibt.
 */
export function buildDebugUploadPayload(
  limit = 50,
): Array<{
  ts: string;

  level: string;

  tag: string;

  message: string;

  details:
    | string
    | null;
}> {
  return buffer
    .slice(
      -limit,
    )
    .map((entry) => ({
      ts: entry.ts,

      level: entry.level,

      tag: entry.tag,

      message:
        entry.message.slice(
          0,
          500,
        ),

      details:
        entry.details?.slice(
          0,
          2000,
        ) ?? null,
    }));
}

export function clearDebugLogsForTest(): void {
  buffer.length = 0;
}

void nextId;
