-- ============================================================
-- JChat 3.0 — Service Call: table_label column + cooldown trigger + owner notification trigger
--
-- 1. Adds table_label (optional text) to service_calls for mesa/ubicación.
-- 2. enforce_service_call_cooldown(): BEFORE INSERT on service_calls —
--    rejects the insert when the same user has already opened a call in the
--    same room within the last 5 minutes (server-side guard, mirrors the
--    client-side cooldown in ServiceCallSheet).
-- 3. notify_owner_on_service_call(): AFTER INSERT on service_calls —
--    creates a notification row for the business owner so the dashboard and
--    push logic can react without polling.
-- ============================================================


-- ── 1. Column ─────────────────────────────────────────────────────────────────

alter table public.service_calls
  add column if not exists table_label text;


-- ── 2. Cooldown trigger ───────────────────────────────────────────────────────
-- Called BEFORE INSERT; raises an exception if a recent call already exists.
-- SECURITY DEFINER so the function can read service_calls even when RLS would
-- otherwise restrict it (we need to look at other users' rows to enforce the
-- per-user cooldown).
-- search_path is pinned to public to prevent search-path injection attacks.

create or replace function public.enforce_service_call_cooldown()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from   public.service_calls sc
    where  sc.user_id  = new.user_id
      and  sc.room_id  = new.room_id
      and  sc.created_at > now() - interval '5 minutes'
  ) then
    raise exception 'service_call_cooldown'
      using hint = 'Ya llamaste hace poco, espera unos minutos antes de volver a llamar.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_service_call_cooldown on public.service_calls;
create trigger trg_service_call_cooldown
  before insert on public.service_calls
  for each row execute function public.enforce_service_call_cooldown();


-- ── 3. Owner notification trigger ────────────────────────────────────────────
-- Called AFTER INSERT; inserts a notification for the business owner.
-- SECURITY DEFINER to read businesses.owner_id and write to notifications
-- on behalf of the triggering user (who only has insert on their own rows).
-- search_path pinned to public.

create or replace function public.notify_owner_on_service_call()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
begin
  select b.owner_id
    into v_owner_id
    from public.businesses b
   where b.id = new.business_id;

  -- Guard: if the business no longer exists or has no owner, skip silently.
  if v_owner_id is null then
    return new;
  end if;

  insert into public.notifications (
    user_id,
    type,
    payload,
    is_read
  ) values (
    v_owner_id,
    'service_call',
    jsonb_build_object(
      'service_call_id', new.id,
      'room_id',         new.room_id,
      'table_label',     new.table_label,
      'notes',           new.notes,
      'type',            new.type
    ),
    false
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_owner_on_service_call on public.service_calls;
create trigger trg_notify_owner_on_service_call
  after insert on public.service_calls
  for each row execute function public.notify_owner_on_service_call();
