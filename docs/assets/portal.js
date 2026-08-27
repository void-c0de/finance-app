// Finance App – Konto-Portal. Nutzt ausschließlich den öffentlichen
// (publishable) Supabase-Schlüssel; jede Sicherheit läuft über Supabase Auth +
// Row Level Security. Kein Service-Key, kein Tracking, keine Cookies außer der
// Supabase-Session in localStorage.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.3/+esm';

const SUPABASE_URL = 'https://cqemndaghehbehtjnkwy.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_es-OZ7_aM8DuhwYMCOaVGQ_qFuAE5Zc';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export function $(sel, root = document) {
  return root.querySelector(sel);
}

export function showMsg(el, kind, text) {
  if (!el) return;
  el.className = `msg ${kind}`;
  el.textContent = text;
  el.classList.remove('hidden');
}

export function clearMsg(el) {
  if (el) el.classList.add('hidden');
}

const AUTH_ERRORS = {
  invalid_credentials: 'E-Mail oder Passwort ist falsch.',
  email_not_confirmed: 'Diese E-Mail-Adresse ist noch nicht bestätigt.',
  over_request_rate_limit: 'Zu viele Versuche. Bitte kurz warten.',
};

export function friendlyAuthError(error) {
  if (!error) return 'Unbekannter Fehler.';
  const code = error.code || '';
  return AUTH_ERRORS[code] || error.message || 'Anmeldung fehlgeschlagen.';
}

export function fmtDateTime(iso) {
  try {
    return new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function hoursUntil(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 3_600_000);
}
