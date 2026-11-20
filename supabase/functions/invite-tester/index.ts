// V20-361 (Dan, Nov 19): ⚙ › Beta Testers › INVITE. Sends a Supabase invitation email to an invite request's
// address (from hello@l4unchp4ge.com via Resend SMTP) and marks the request invited. Only for the admin: the
// caller's JWT must carry app_metadata.role = 'admin' (set on the server; users can't set it themselves).
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const APP = 'https://app.l4unchp4ge.com';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!;
  const auth = req.headers.get('Authorization') ?? '';
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: me } = await caller.auth.getUser();
  if (me?.user?.app_metadata?.role !== 'admin') return json({ error: 'Only the admin can send invites.' }, 403);

  let body: { requestId?: string; resend?: boolean; remove?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: r } = await admin.from('beta_requests').select('id, name, email, invited_at').eq('id', String(body.requestId ?? '')).maybeSingle();
  if (!r) return json({ error: 'That request is gone.' }, 404);
  const email = String(r.email).trim().toLowerCase();

  // V20-443 (Dan, Nov 20): × takes the request off the list. An invite that was never opened is withdrawn too (the
  // unused, empty invited account goes, so its START link stops working). Someone who has already signed in keeps
  // their account; only the request leaves the list.
  if (body.remove) {
    const { data: list, error: le } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (le) return json({ error: `Not removed: ${le.message}` }, 400);
    const u = list.users.find((x) => (x.email ?? '').toLowerCase() === email);
    let withdrawn = false;
    if (u && !u.last_sign_in_at && !u.email_confirmed_at) {
      const { error: de } = await admin.auth.admin.deleteUser(u.id);
      if (de) return json({ error: `Not removed: ${de.message}` }, 400);
      withdrawn = true;
    }
    const { error: re } = await admin.from('beta_requests').delete().eq('id', r.id);
    if (re) return json({ error: `Not removed: ${re.message}` }, 400);
    return json({ ok: true, removed: true, withdrawn, keptAccount: !!u && !withdrawn });
  }

  // V20-441 (Dan, Nov 20): RESEND. An invite that was never opened (the account has never signed in) is sent again:
  // the unused, empty invited account is removed and a fresh invite goes out (a new one-time link). Someone who has
  // already signed in doesn't need one: they sign in, or use Email me a sign-in link / a reset link.
  if (body.resend) {
    const { data: list, error: le } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (le) return json({ error: `Invite not sent: ${le.message}` }, 400);
    const u = list.users.find((x) => (x.email ?? '').toLowerCase() === email);
    if (u && (u.last_sign_in_at || u.email_confirmed_at)) {
      return json({ error: `${email} has already signed in. They can use Email me a sign-in link on the sign-in page.` }, 409);
    }
    if (u) {
      const { error: de } = await admin.auth.admin.deleteUser(u.id);
      if (de) return json({ error: `Invite not sent: ${de.message}` }, 400);
    }
  }
  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: APP, data: { name: r.name } });
  if (error) {
    const already = /already|registered|exists/i.test(error.message);
    return json({ error: already ? `${email} already has an account.` : `Invite not sent: ${error.message}` }, already ? 409 : 400);
  }
  const at = new Date().toISOString();
  await admin.from('beta_requests').update({ invited_at: at }).eq('id', r.id);
  return json({ ok: true, invited_at: at });
});
