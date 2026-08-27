/**
 * Reiner Kern für das Support-Diagnosepaket.
 *
 * Baut aus bereits sicheren, aggregierten Werten einen kompakten Text.
 * Enthält NIEMALS: Umsätze, Salden, Beträge, Kontonummern, E-Mail, Namen,
 * Tokens, Passwörter, Backup-Inhalte, Transaktionsbeschreibungen.
 *
 * Nur `import type` – testbar unter `node --experimental-strip-types`.
 */

export type SupportDiagnosticsInput = {
  appVersion: string;
  runtimeVersion: string;
  buildNumber: string | number;
  platform: string;
  osVersion?: string | null;
  updateChannel?: string | null;
  isEmbeddedUpdate?: boolean;
  schemaVersion: number | null;
  cloudSyncStatus: string;
  lastSyncedAt: string | null;
  lastLocalLoadAt: string | null;
  accountCount: number;
  bankConnectionCount: number;
  /** Distinkte Health-Zustände der Bankverbindungen, z. B. ['active', 'requires_action']. */
  bankConnectionStates: string[];
  bankConnectionsNeedingAction: number;
  recurringSeriesCount: number;
  mutedSeriesCount: number;
  budgetCount: number;
  activeGoalCount: number;
  unsyncedChangeCount: number | null;
  foreignCurrencies: string[];
  /** Nur strukturierte Fehlercodes wie CLD-PULL-003, keine Nachrichten. */
  recentErrorCodes: string[];
  premiumPlan: string;
  premiumSource: string;
  now?: Date;
};

const ERROR_CODE_RE = /^[A-Z]{2,5}-[A-Z]{2,6}-\d{2,3}$/;

export function buildSupportDiagnostics(input: SupportDiagnosticsInput): string {
  const now = input.now ?? new Date();
  const codes = [...new Set(input.recentErrorCodes)].filter((code) => ERROR_CODE_RE.test(code)).slice(0, 12);

  const lines = [
    'Finance App – Support-Diagnose',
    `Erstellt: ${now.toISOString()}`,
    '',
    `App-Version: ${input.appVersion} (Build ${input.buildNumber})`,
    `Runtime: ${input.runtimeVersion}`,
    `Update: ${input.isEmbeddedUpdate ? 'eingebettet' : 'OTA'}${input.updateChannel ? ` · Kanal ${input.updateChannel}` : ''}`,
    `Plattform: ${input.platform}${input.osVersion ? ` ${input.osVersion}` : ''}`,
    `DB-Schema: ${input.schemaVersion ?? 'unbekannt'}`,
    '',
    `Cloud-Sync: ${input.cloudSyncStatus}`,
    `Letzter Sync: ${input.lastSyncedAt ?? 'in dieser Sitzung nicht'}`,
    `Lokaler Datenstand: ${input.lastLocalLoadAt ?? 'nicht geladen'}`,
    `Ungesyncte Änderungen: ${input.unsyncedChangeCount === null ? 'unbekannt' : input.unsyncedChangeCount}`,
    '',
    `Konten: ${input.accountCount}`,
    `Bankverbindungen: ${input.bankConnectionCount} · Zustände: ${input.bankConnectionStates.join(', ') || 'keine'} · Aktion nötig: ${input.bankConnectionsNeedingAction}`,
    `Fremdwährungen: ${input.foreignCurrencies.join(', ') || 'keine'}`,
    `Wiederkehrende Serien: ${input.recurringSeriesCount} (davon stumm: ${input.mutedSeriesCount})`,
    `Budgets: ${input.budgetCount} · Aktive Sparziele: ${input.activeGoalCount}`,
    '',
    `Tarif: ${input.premiumPlan} (Quelle: ${input.premiumSource})`,
    `Interne Fehlercodes (Sitzung): ${codes.length ? codes.join(', ') : 'keine'}`,
    '',
    'Dieses Paket enthält bewusst keine Beträge, Umsätze, Kontonummern, Namen, E-Mail-Adressen oder Zugangsdaten.',
  ];

  return lines.join('\n') + '\n';
}

/** Grobe Prüfung, dass ein Diagnosetext keine offensichtlich sensiblen Muster enthält. */
export function diagnosticsLooksSafe(text: string): boolean {
  const forbidden = [
    /\beyJ[A-Za-z0-9_-]{10,}\./, // JWT
    /Bearer\s+[A-Za-z0-9._-]{10,}/i,
    /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/, // IBAN-ähnlich
    /[\w.+-]+@[\w-]+\.[a-z]{2,}/i, // E-Mail
    /(password|passwort|secret|token)\s*[:=]/i,
    /\d+[.,]\d{2}\s*(EUR|€|USD|\$)/, // Geldbetrag
  ];
  return !forbidden.some((re) => re.test(text));
}
