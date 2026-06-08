// Remove every load-test user (auth user + its membership). Matches by email prefix.
// Run with the SERVICE ROLE key:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node cleanup-test-users.mjs

import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PREFIX = process.env.EMAIL_PREFIX || 'loadtest+';

if (!URL || !SERVICE) {
  console.error('Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });

let page = 1;
let removed = 0;
for (;;) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  const batch = (data?.users ?? []).filter((u) => (u.email ?? '').startsWith(PREFIX));
  for (const u of batch) {
    // Hard-delete the membership rows for this user, then the auth user.
    await sb.from('memberships').delete().eq('user_id', u.id).catch(() => {});
    const { error: de } = await sb.auth.admin.deleteUser(u.id);
    if (de) console.warn(`deleteUser ${u.email}: ${de.message}`);
    else removed += 1;
  }
  if (!data || data.users.length < 200) break;
  page += 1;
}
console.log(`Removed ${removed} load-test users.`);
