// Finalises an account deletion: purges the caller's finance data (via the
// SECURITY DEFINER RPC) and then deletes the auth.users row itself.
//
// The auth-user delete needs the service_role key, which never reaches the
// client — hence this Edge Function. The caller is authenticated with their own
// JWT; this function only ever deletes the CALLER. No target-user argument.
//
// DEPLOY (external, maintainer only):
//   supabase functions deploy finalize-account-deletion --project-ref <ref>
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<key> --project-ref <ref>
//   (SUPABASE_URL is provided by the platform.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';

const jsonHeaders = { 'Content-Type': 'application/json' };

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceRole || !anonKey) {
    return json(500, { error: 'not_configured' });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'authentication_required' });

  // Identify the caller from THEIR token (never trust a body-supplied id).
  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await asUser.auth.getUser();
  if (userError || !userData.user) return json(401, { error: 'authentication_required' });
  const callerId = userData.user.id;

  const admin = createClient(url, serviceRole);

  // The RPC only finalises a *due* request for the caller and reports whether an
  // auth-user delete is still pending. It is the single source of truth.
  const { data: finalize, error: finalizeError } = await asUser.rpc('finalize_my_due_deletion');
  if (finalizeError) return json(400, { error: 'finalize_failed', detail: finalizeError.message });
  if (!finalize?.finalized) return json(409, { error: 'not_due', detail: finalize });
  if (!finalize?.authUserDeletionPending) {
    return json(200, { ok: true, kind: 'finance_data', rowsDeleted: finalize.rowsDeleted });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(callerId);
  if (deleteError) return json(500, { error: 'auth_delete_failed', detail: deleteError.message });

  return json(200, { ok: true, kind: 'account', rowsDeleted: finalize.rowsDeleted });
});
