// V20-118 (Dan, Nov 12): sign in with either email on the account.
// A linked email (public.account_emails) signs in to its account: the password is checked against that account,
// and an email link goes to that account's sign-in address. Answers never say whether an email is linked.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let body: { mode?: string; email?: string; password?: string; redirectTo?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!email.includes('@')) return json({ error: 'Enter your email.' }, 400);
  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const pub = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

  // The account's own sign-in email for a linked email, or null.
  const { data: link } = await admin.from('account_emails').select('user_id').eq('email', email).maybeSingle();
  let primary: string | null = null;
  if (link?.user_id) {
    const { data } = await admin.auth.admin.getUserById(link.user_id);
    primary = data?.user?.email ?? null;
  }

  if (body.mode === 'link') {
    if (!primary) return json({ ok: true, linked: false });
    const { error } = await pub.auth.signInWithOtp({ email: primary, options: { shouldCreateUser: false, emailRedirectTo: body.redirectTo } });
    if (error) return json({ error: 'Sign-in link not sent. Try again in a minute.' }, 400);
    return json({ ok: true, linked: true });
  }

  const password = String(body.password ?? '');
  if (!primary || !password) return json({ error: 'Email or password is wrong.' }, 400);
  const { data, error } = await pub.auth.signInWithPassword({ email: primary, password });
  if (error || !data.session) return json({ error: 'Email or password is wrong.' }, 400);
  return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
});
