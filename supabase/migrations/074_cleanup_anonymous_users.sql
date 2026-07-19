-- 074: daily cleanup of stale anonymous users (pre-requisite for anonymous login).
--
-- When anonymous login is enabled, every table QR scan mints an auth.users row
-- (is_anonymous = true). Abandoned ones would pile up forever. This job removes
-- them, guarded so it never deletes anyone who still matters:
--   1) Idle > 24h — uses last_sign_in_at (falls back to created_at) so a guest
--      who came back today is NEVER killed.
--   2) No OPEN tab — someone with an open tab may owe money or still be seated.
--
-- What SURVIVES: orders (orders.user_id → SET NULL, sales history untouched),
-- tabs (table_tabs.owner_uid/created_by/closed_by → SET NULL), and messages
-- (messages.user_id → SET NULL). public.users cascades away with its auth row.
-- Only 24h-irrelevant rows (room_members, check_ins, notifications, …) cascade.
--
-- Callable ONLY by the pg_cron job (postgres). No app role may execute it.

begin;

create or replace function public.cleanup_anonymous_users()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_deleted int;
begin
  with victims as (
    select u.id
    from auth.users u
    where u.is_anonymous = true
      -- Guard 1: idle > 24h (last_sign_in_at, else created_at).
      and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '24 hours'
      -- Guard 2: no OPEN tab (could owe money / still seated).
      and not exists (
        select 1 from public.table_tabs t
        where t.owner_uid = u.id and t.status = 'open'
      )
  )
  delete from auth.users u using victims v where u.id = v.id;
  get diagnostics v_deleted = row_count;
  raise log '[cleanup_anonymous_users] deleted % stale anonymous users', v_deleted;
  return v_deleted;
end $$;

-- Nobody from the app may run this — only the cron job (postgres).
revoke execute on function public.cleanup_anonymous_users() from public, anon, authenticated;

-- Schedule daily at 05:00 UTC (low-traffic). Idempotent: drop any existing job
-- with this name first so re-applying the migration doesn't duplicate it.
do $$
begin
  perform cron.unschedule('cleanup-anon-users');
exception when others then
  null; -- no existing job — fine
end $$;

select cron.schedule(
  'cleanup-anon-users',
  '0 5 * * *',
  $$select public.cleanup_anonymous_users()$$
);

commit;
