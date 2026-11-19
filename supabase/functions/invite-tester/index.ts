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

  let body: { requestId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: r } = await admin.from('beta_requests').select('id, name, email, invited_at').eq('id', String(body.requestId ?? '')).maybeSingle();
  if (!r) return json({ error: 'That request is gone.' }, 404);
  const email = String(r.email).trim().toLowerCase();

  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: APP, data: { name: r.name } });
  if (error) {
    const already = /already|registered|exists/i.test(error.message);
    return json({ error: already ? `${email} already has an account.` : `Invite not sent: ${error.message}` }, already ? 409 : 400);
  }
  const at = new Date().toISOString();
  await admin.from('beta_requests').update({ invited_at: at }).eq('id', r.id);
  return json({ ok: true, invited_at: at });
});
