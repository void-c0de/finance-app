// Finalises an account deletion: purges the caller's finance data (via the
// SECURITY DEFINER RPC) and then deletes the auth.users row itself.
//
// The auth-user delete needs the service-role credential, which never reaches
// the client — hence this Edge Function. The caller authenticates with their
// OWN JWT; this function only ever deletes the CALLER. No target-user argument.
//
// Server credentials are provided automatically by the Supabase hosted Edge
// runtime (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY). Nothing
// is set manually and nothing is stored in Git.
//
// verify_jwt defaults to true for this function, so the platform validates the
// JWT signature before this code runs. We then read the `sub` claim, confirm
// the user exists with the service client, and act only on that caller.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
// SUPABASE_SERVICE_ROLE_KEY is auto-provided by the hosted Edge runtime and is a
// plain PostgREST-usable key. SUPABASE_SECRET_KEYS is the newer form; take the
// first entry that looks like a bare key (sb_secret_* or a JWT).
function firstBareKey(raw: string): string {
  for (const part of raw.split(',')) {
    const value = part.includes(':') ? part.slice(part.indexOf(':') + 1) : part;
    const trimmed = value.trim();
    if (/^sb_secret_/.test(trimmed) || /^eyJ/.test(trimmed)) return trimmed;
  }
  return '';
}
const SERVICE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  firstBareKey(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '') ||
  '';

/** Decode a JWT payload. The platform (verify_jwt=true) already verified the signature. */
function jwtSub(token: string): string | null {
  try {
    let b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    b64 += '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(b64));
    const authenticated = payload.role === 'authenticated' || payload.aud === 'authenticated';
    return typeof payload.sub === 'string' && authenticated ? payload.sub : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'not_configured' });

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json(401, { error: 'authentication_required' });

  const callerId = jwtSub(token);
  if (!callerId) return json(401, { error: 'authentication_required' });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // The RPC is the single source of truth: it finalises only a *due* request
  // for this caller (grace window elapsed) and reports whether an auth-user
  // delete is still pending. Idempotent — a second call returns no_due_request.
  // Run it AS the caller so auth.uid() inside the SECURITY DEFINER function
  // resolves to callerId.
  const asCaller = createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: finalize, error: finalizeError } = await asCaller.rpc('finalize_my_due_deletion', {
    p_allow_account: true,
  });
  if (finalizeError) return json(400, { error: 'finalize_failed', detail: finalizeError.message });
  if (!finalize?.finalized) {
    return json(409, { error: 'not_due', reason: finalize?.reason ?? 'unknown' });
  }
  if (!finalize?.authUserDeletionPending) {
    return json(200, { ok: true, kind: 'finance_data', rowsDeleted: finalize.rowsDeleted });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(callerId);
  if (deleteError && !/not.*found|does not exist/i.test(deleteError.message)) {
    return json(500, { error: 'auth_delete_failed', detail: deleteError.message });
  }

  return json(200, { ok: true, kind: 'account', rowsDeleted: finalize.rowsDeleted });
});
