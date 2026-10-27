-- 052: guest checkout (anonymous web QR orders).
-- (a) Per-order contact so a guest can get a receipt / request a refund.
alter table public.orders
  add column if not exists contact_email text,
  add column if not exists contact_phone text;

alter table public.orders
  add constraint orders_contact_email_len
  check (contact_email is null or char_length(contact_email) <= 120);

alter table public.orders
  add constraint orders_contact_phone_len
  check (contact_phone is null or char_length(contact_phone) <= 30);

comment on column public.orders.contact_email is
  'Optional guest contact for receipt/refund (guest checkout). Not an account email.';
comment on column public.orders.contact_phone is
  'Optional guest contact for receipt/refund (guest checkout).';

-- (b) Anonymous guests have no email/name. The existing dedupe loop probes
--     user, user1, user2 … with ONE query per iteration, so it degrades to O(n)
--     queries per signup once guests accumulate. Derive a unique username from the
--     uuid instead — unique by construction, no loop.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  base_username text;
  final_username text;
  suffix int := 0;
  candidate text;
begin
  -- Anonymous guest (web QR checkout): uuid-derived username, no dedupe loop.
  if coalesce(new.is_anonymous, false) then
    insert into public.users (id, username, display_name, language, profile_theme_id)
    values (
      new.id,
      'guest_' || substr(replace(new.id::text, '-', ''), 1, 20),
      null,
      'en',
      1
    )
    on conflict (id) do nothing;
    return new;
  end if;

  -- Registered users (email / OAuth) — unchanged behaviour.
  base_username := public.derive_username(new.email, new.raw_user_meta_data);

  candidate := base_username;
  loop
    exit when not exists (
      select 1 from public.users where lower(username) = lower(candidate)
    );
    suffix := suffix + 1;
    candidate := left(base_username, 30 - length(suffix::text)) || suffix::text;
  end loop;
  final_username := candidate;

  insert into public.users (id, username, display_name, language, profile_theme_id)
  values (
    new.id,
    final_username,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    'en',
    1
  )
  on conflict (id) do nothing;

  return new;
end;
$function$;
