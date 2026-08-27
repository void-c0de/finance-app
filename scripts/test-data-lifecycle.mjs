import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DELETION_GRACE_DAYS,
  FINANCE_PURGE_ORDER,
  graceHoursRemaining,
  graceUntilFrom,
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
  assert.match(fn, /auth\.getUser\(\)/, 'Aufrufer wird aus dem eigenen Token bestimmt');
  assert.match(fn, /admin\.auth\.admin\.deleteUser\(callerId\)/, 'löscht callerId, kein Body-Argument');
  assert.ok(!/req\.json\(\)/.test(fn) || !/deleteUser\(\s*body/.test(fn), 'kein Opfer-User-Argument aus dem Body');
  assert.match(fn, /finalize_my_due_deletion/, 'Fälligkeit/Umfang kommt aus der RPC');
}

console.log('Data lifecycle: grace window, purge order & migration guards passed');
