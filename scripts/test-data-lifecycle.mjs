import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DELETION_GRACE_DAYS,
  FINANCE_PURGE_ORDER,
  graceHoursRemaining,
  graceUntilFrom,
  groupDeletionRequests,
  isDeletionDue,
  nextDeletionStep,
} from '../src/services/dataLifecycleCore.ts';

/**
 * Lösch-Lebenszyklus: Kulanzfenster, Fälligkeit, FK-sichere Reihenfolge und
 * die Sicherheitsmerkmale der serverseitigen Migration.
 */

const now = new Date('2026-08-27T12:00:00.000Z');

// --- Kulanzfenster ---------------------------------------------------
{
  const grace = graceUntilFrom(now);
  assert.equal(grace, new Date(now.getTime() + DELETION_GRACE_DAYS * 86_400_000).toISOString());
  assert.equal(isDeletionDue({ status: 'pending', graceUntil: grace }, now), false, 'frisch: nicht fällig');
  assert.equal(
    isDeletionDue({ status: 'pending', graceUntil: grace }, new Date(now.getTime() + 4 * 86_400_000)),
    true,
    'nach 4 Tagen: fällig',
  );
  assert.equal(isDeletionDue({ status: 'cancelled', graceUntil: grace }, new Date('2999-01-01')), false);
  assert.equal(graceHoursRemaining({ status: 'pending', graceUntil: grace }, now), 72);
}

// --- nächster Schritt ----------------------------------------------
{
  const grace = graceUntilFrom(now);
  assert.equal(nextDeletionStep({ status: 'none' }, now), 'idle');
  assert.equal(nextDeletionStep({ status: 'pending', kind: 'finance_data', graceUntil: grace }, now), 'awaiting_grace');
  const later = new Date(now.getTime() + 5 * 86_400_000);
  assert.equal(nextDeletionStep({ status: 'pending', kind: 'finance_data', graceUntil: grace }, later), 'ready_finance_purge');
  assert.equal(nextDeletionStep({ status: 'pending', kind: 'account', graceUntil: grace }, later), 'ready_account_edge_function');
}

// --- Admin-Panel: Gruppierung der Löschanträge --------------------
{
  const rows = [
    { status: 'pending', grace_until: graceUntilFrom(new Date(now.getTime() - 5 * 86_400_000)) }, // fällig
    { status: 'pending', grace_until: graceUntilFrom(now) }, // im Fenster
    { status: 'completed', grace_until: graceUntilFrom(now) },
    { status: 'cancelled', grace_until: graceUntilFrom(now) },
  ];
  const g = groupDeletionRequests(rows, now);
  assert.equal(g.due.length, 1, 'genau ein fälliger Antrag');
  assert.equal(g.pending.length, 1, 'genau ein Antrag im Kulanzfenster');
  assert.equal(g.closed.length, 2, 'abgeschlossen + storniert');
}

// --- FK-sichere Reihenfolge: Kinder vor Eltern --------------------
{
  const pos = new Map(FINANCE_PURGE_ORDER.map((t, i) => [t, i]));
  assert.ok(pos.get('finance_goal_contributions') < pos.get('finance_savings_goals'));
  assert.ok(pos.get('finance_transactions') < pos.get('finance_accounts'));
  assert.ok(pos.get('finance_budgets') < pos.get('finance_categories'));
  assert.ok(pos.get('finance_accounts') < pos.get('finance_categories'));
}

// --- Migration: Sicherheitsmerkmale --------------------------------
{
  const sql = readFileSync('supabase/migrations/20260827160000_add_data_lifecycle.sql', 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

  // Jede öffentliche Funktion: SECURITY DEFINER + fixierter search_path.
  const definerCount = (sql.match(/SECURITY DEFINER/g) ?? []).length;
  const searchPathCount = (sql.match(/SET search_path = public/g) ?? []).length;
  assert.ok(definerCount >= 6, `erwartete >= 6 SECURITY DEFINER, fand ${definerCount}`);
  assert.ok(searchPathCount >= definerCount, 'jede DEFINER-Funktion pinnt search_path');

  // Kein Ziel-User-Argument in den Nutzer-RPCs: sie arbeiten über auth.uid().
  assert.match(sql, /request_data_deletion\(p_kind text/);
  assert.ok(!/request_data_deletion\([^)]*uuid/.test(sql), 'kein uuid-Argument in request_data_deletion');
  assert.ok(!/finalize_my_due_deletion\([^)]*uuid/.test(sql), 'kein uuid-Argument in finalize_my_due_deletion');
  assert.match(sql, /v_user_id uuid := auth\.uid\(\)/);

  // anon darf nichts ausführen.
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.request_data_deletion\(text\) FROM PUBLIC, anon/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.finalize_my_due_deletion\(\) FROM PUBLIC, anon/);

  // purge_owner_finance_data ist keine Client-API.
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.purge_owner_finance_data\(uuid\) FROM PUBLIC, anon, authenticated/);

  // Sweep + Liste sind Superuser-geschützt.
  assert.match(sql, /IF NOT public\.is_superuser\(\) THEN RAISE EXCEPTION 'admin_required'/);

  // Fälligkeit wird serverseitig geprüft (kein Löschen im Kulanzfenster).
  assert.match(sql, /IF v_row\.grace_until > now\(\) THEN/);

  // Reihenfolge in der Migration = Konstante im Core.
  const purgeBlock = sql.slice(sql.indexOf('purge_owner_finance_data'));
  const deletes = [...purgeBlock.matchAll(/DELETE FROM public\.([a-z_]+) WHERE owner_id/g)].map((m) => m[1]);
  assert.deepEqual(deletes, [...FINANCE_PURGE_ORDER], 'Migrations-Löschreihenfolge stimmt mit FINANCE_PURGE_ORDER überein');
}

// --- Edge Function: löscht nur den Aufrufer ------------------------
{
  const fn = readFileSync('supabase/functions/finalize-account-deletion/index.ts', 'utf8');
  // Identität kommt ausschließlich aus dem (plattform-verifizierten) JWT.
  assert.match(fn, /jwtSub\(token\)/, 'Aufrufer-ID aus dem eigenen JWT');
  assert.match(fn, /const callerId = jwtSub\(token\)/, 'callerId ist die JWT-sub');
  assert.match(fn, /admin\.auth\.admin\.deleteUser\(callerId\)/, 'löscht callerId, kein Body-Argument');
  // Kein Request-Body, kein Ziel-User-Parameter irgendwo.
  assert.ok(!/req\.json\(\)/.test(fn), 'liest keinen Request-Body');
  assert.ok(!/deleteUser\((?!callerId\))/.test(fn), 'deleteUser wird nur mit callerId aufgerufen');
  assert.match(fn, /finalize_my_due_deletion/, 'Fälligkeit/Umfang kommt aus der RPC');
  // Server-Credential kommt aus der Laufzeitumgebung, nie aus einem Literal.
  assert.match(fn, /Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/, 'Service-Key aus der Edge-Umgebung');
  assert.ok(!/sb_secret_[A-Za-z0-9]/.test(fn), 'kein Secret-Literal im Function-Code');
  assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(fn), 'kein JWT-Literal im Function-Code');
  // Idempotenz: eine bereits abgeschlossene Löschung wird sauber abgewiesen.
  assert.match(fn, /not_due/, 'nicht fälliger / abgeschlossener Zustand → 409');
  assert.match(fn, /method_not_allowed/, 'nur POST');
}

console.log('Data lifecycle: grace window, purge order & migration guards passed');
