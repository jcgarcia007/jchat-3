-- JChat 3.0 — baseline: what `supabase db dump --schema-only` does NOT carry.  READ-ONLY (only SELECTs).
-- Run it by hand in the production SQL Editor and paste the result back; nothing here writes anything.
--
-- The dump holds the `public` and `otunity` schemas. A database rebuilt from it alone ends up with 0 storage buckets, 0 storage policies,
-- 0 cron jobs and no trigger on auth.users (checked on a local rebuild). These five queries list what the baseline must add by hand.
--
-- REVIEW BEFORE PASTING: (3) shows the cron COMMANDS; if any of them embeds a key, token or password, redact it. (5) lists secret NAMES only;
-- never run `select * from vault.decrypted_secrets`.

-- 1 · Storage buckets (configuration rows).
select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id;

-- 2 · Policies on storage.objects (the final state after migrations 011, 024, 041, 042, 046, 061, 063…).
select policyname, cmd, roles, qual, with_check from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname;

-- 3 · pg_cron jobs (the repo schedules 11: chat TTL purge, anonymous cleanup, guest payments, match wipe/photo retry, gift expire/reconcile, DM photo retry, truth-or-dare expire/purge, venue exits purge).
select jobname, schedule, command from cron.job order by jobname;

-- 4 · Triggers on auth.users (the repo creates on_auth_user_created, migration 048).
select tgname, pg_get_triggerdef(oid) as definition from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal order by tgname;

-- 5 · Vault secret NAMES only (the functions read 'push_webhook_secret'; a new environment must create its own value by hand).
select name from vault.secrets order by name;
