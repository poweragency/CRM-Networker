// Seed COUNT real Supabase Auth users for the load test, each linked to an EXISTING
// seeded marketer (via a membership), so logins issue tokens with real claims and
// RLS behaves like a real user. Writes credentials to loadtest/users.json.
//
// Requires the SERVICE ROLE key (admin API). NEVER commit it. Run:
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   ORG_ID=ad9a57f3-b658-4178-9124-daf2d1904518 \
//   COUNT=500 node seed-test-users.mjs
//
// Cleanup afterwards with cleanup-test-users.mjs.

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';

// NB: don't name this `URL` — that shadows the global URL constructor used below.
const SUPA_URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG = process.env.ORG_ID;
const COUNT = Number(process.env.COUNT || 200);
const PASSWORD = process.env.TEST_PASSWORD || 'LoadTest!2026';
const PREFIX = process.env.EMAIL_PREFIX || 'loadtest+';
const DOMAIN = process.env.EMAIL_DOMAIN || 'example.com';

if (!SUPA_URL || !SERVICE || !ORG) {
  console.error('Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ORG_ID');
  process.exit(1);
}

const sb = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } });

// Marketers that already have a membership — we won't touch those (real accounts).
const { data: existing, error: e1 } = await sb
  .from('memberships')
  .select('marketer_id')
  .eq('org_id', ORG)
  .is('deleted_at', null);
if (e1) throw e1;
const taken = new Set((existing ?? []).map((r) => r.marketer_id));

const { data: mks, error: e2 } = await sb
  .from('marketers')
  .select('id')
  .eq('org_id', ORG)
  .is('deleted_at', null)
  .limit(50000);
if (e2) throw e2;

const free = (mks ?? []).map((m) => m.id).filter((id) => !taken.has(id)).slice(0, COUNT);
if (free.length < COUNT) {
  console.warn(`Only ${free.length} free marketers available (wanted ${COUNT}).`);
}

const users = [];
let made = 0;
const CHUNK = 20; // small concurrency so we don't trip admin-API limits

for (let i = 0; i < free.length; i += CHUNK) {
  const batch = free.slice(i, i + CHUNK);
  await Promise.all(
    batch.map(async (marketerId, j) => {
      const idx = i + j;
      const email = `${PREFIX}${idx}@${DOMAIN}`;
      const { data: created, error: ce } = await sb.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (ce) {
        // Already created on a previous run → still usable for the test (same
        // password + membership already linked), so record it in users.json.
        const dup = /registered|already|exists/i.test(ce.message || '') || ce.code === 'email_exists';
        if (dup) {
          users.push({ email, password: PASSWORD });
          made += 1;
        } else {
          console.warn(`createUser ${email}: ${ce.message}`);
        }
        return;
      }
      const userId = created.user.id;
      const { error: me } = await sb.from('memberships').insert({
        org_id: ORG,
        user_id: userId,
        marketer_id: marketerId,
        role: 'member',
        status: 'active',
      });
      if (me) {
        console.warn(`membership ${email}: ${me.message}`);
        // best-effort: drop the orphan auth user so re-runs stay clean
        await sb.auth.admin.deleteUser(userId).catch(() => {});
        return;
      }
      users.push({ email, password: PASSWORD });
      made += 1;
    }),
  );
  console.log(`  …${Math.min(i + CHUNK, free.length)}/${free.length}`);
}

writeFileSync(new URL('./users.json', import.meta.url), JSON.stringify(users, null, 2));
console.log(`Done. Created ${made} test users → users.json`);
