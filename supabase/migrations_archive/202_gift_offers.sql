-- 202 (+202b): Regalo entre usuarios dentro del local. Cobro RETENIDO al enviar (Stripe capture manual), capturado solo al aceptar.
-- Estados: draft → awaiting_payment → held → accepted → paid | declined | expired | cancelled | failed
-- APLICADA EN PRODUCCIÓN POR PLANNING (2026-10-04). Este archivo solo la versiona.

create table if not exists public.gift_offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  from_user_id uuid not null references public.users(id) on delete cascade,
  to_user_id uuid not null references public.users(id) on delete cascade,
  conversation_id uuid references public.dm_conversations(id) on delete set null,
  items jsonb not null,
  note text,
  status text not null default 'draft' check (status in ('draft','awaiting_payment','held','accepted','paid','declined','expired','cancelled','failed')),
  subtotal_cents integer, tax_cents integer, total_cents integer,
  stripe_pi_id text unique,
  table_label text, table_details text,
  order_id uuid references public.orders(id) on delete set null,
  held_at timestamptz, expires_at timestamptz, responded_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (from_user_id <> to_user_id)
);
create index if not exists gift_offers_to_idx on public.gift_offers (to_user_id, status);
create index if not exists gift_offers_from_idx on public.gift_offers (from_user_id, created_at desc);
create index if not exists gift_offers_expiry_idx on public.gift_offers (expires_at) where status = 'held';
alter table public.gift_offers enable row level security;
create policy gift_offers_participants_read on public.gift_offers for select to authenticated
  using (from_user_id = auth.uid() or to_user_id = auth.uid());

create or replace function public.gift_offers_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
drop trigger if exists trg_gift_offers_touch on public.gift_offers;
create trigger trg_gift_offers_touch before update on public.gift_offers for each row execute function public.gift_offers_touch();

alter table public.dm_messages add column if not exists gift_offer_id uuid references public.gift_offers(id) on delete set null;

create or replace function public.gift_available(p_business_id uuid, p_other_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and auth.uid() <> p_other_user_id
     and public.venue_presence_ok(p_business_id, auth.uid())
     and public.venue_presence_ok(p_business_id, p_other_user_id)
     and not exists (select 1 from public.blocks b where (b.blocker_id = auth.uid() and b.blocked_id = p_other_user_id) or (b.blocker_id = p_other_user_id and b.blocked_id = auth.uid()));
$$;
revoke all on function public.gift_available(uuid, uuid) from public, anon;
grant execute on function public.gift_available(uuid, uuid) to authenticated;

create or replace function public.gift_offer_create(p_business_id uuid, p_to_user_id uuid, p_items jsonb, p_note text default null, p_conversation_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_items jsonb; v_sub int; v_id uuid; v_n int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.gift_available(p_business_id, p_to_user_id) then raise exception 'gift_unavailable' using errcode = '42501'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 10 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;
  if (select count(*) from public.gift_offers g where g.from_user_id = v_uid and g.created_at > now() - interval '1 hour') >= 3 then
    raise exception 'gift_rate_limit' using errcode = '42501';
  end if;
  if exists (select 1 from public.gift_offers g where g.from_user_id = v_uid and g.to_user_id = p_to_user_id and g.status in ('awaiting_payment','held','accepted')) then
    raise exception 'gift_pending' using errcode = '42501';
  end if;
  select jsonb_agg(jsonb_build_object('menu_item_id', m.id, 'name', m.name, 'description', m.description, 'qty', q.qty,
                                      'price_cents', m.price_cents, 'id_required', coalesce(m.id_required,false))), count(*)
  into v_items, v_n
  from (select (i->>'menu_item_id')::uuid as mid, greatest(least(coalesce((i->>'qty')::int,1), 10), 1) as qty from jsonb_array_elements(p_items) i) q
  join public.menu_items m on m.id = q.mid and m.business_id = p_business_id and coalesce(m.is_available, true);
  if v_n is null or v_n <> jsonb_array_length(p_items) then raise exception 'invalid_items' using errcode = '22023'; end if;
  select sum((i->>'price_cents')::int * (i->>'qty')::int) into v_sub from jsonb_array_elements(v_items) i;
  insert into public.gift_offers (business_id, from_user_id, to_user_id, conversation_id, items, note, subtotal_cents, status)
  values (p_business_id, v_uid, p_to_user_id, p_conversation_id, v_items, nullif(left(trim(coalesce(p_note,'')),200),''), v_sub, 'draft')
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'subtotal_cents', v_sub, 'items', v_items);
end;
$$;
revoke all on function public.gift_offer_create(uuid, uuid, jsonb, text, uuid) from public, anon;
grant execute on function public.gift_offer_create(uuid, uuid, jsonb, text, uuid) to authenticated;

create or replace function public.gift_offer_set_hold(p_offer_id uuid, p_stripe_pi_id text, p_subtotal int, p_tax int, p_total int)
returns void language sql security definer set search_path = public as $$
  update public.gift_offers set stripe_pi_id = p_stripe_pi_id, subtotal_cents = p_subtotal, tax_cents = p_tax, total_cents = p_total, status = 'awaiting_payment'
  where id = p_offer_id and status in ('draft','awaiting_payment');
$$;
create or replace function public.gift_offer_mark_held(p_stripe_pi_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.gift_offers%rowtype; v_conv uuid; v_name text;
begin
  select * into g from public.gift_offers where stripe_pi_id = p_stripe_pi_id for update;
  if g.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if g.status <> 'awaiting_payment' then return jsonb_build_object('ok', true, 'status', g.status); end if;
  update public.gift_offers set status = 'held', held_at = now(), expires_at = now() + interval '15 minutes' where id = g.id;
  v_conv := g.conversation_id;
  if v_conv is null then
    select id into v_conv from public.dm_conversations c where (c.user_a = g.from_user_id and c.user_b = g.to_user_id) or (c.user_a = g.to_user_id and c.user_b = g.from_user_id) limit 1;
    if v_conv is null then
      insert into public.dm_conversations (user_a, user_b, ephemeral_business_id) values (least(g.from_user_id, g.to_user_id), greatest(g.from_user_id, g.to_user_id), g.business_id) returning id into v_conv;
    end if;
    update public.gift_offers set conversation_id = v_conv where id = g.id;
  end if;
  insert into public.dm_messages (conversation_id, sender_id, body, gift_offer_id) values (v_conv, g.from_user_id, '🎁', g.id);
  update public.dm_conversations set last_message_at = now() where id = v_conv;
  select coalesce(display_name, '@' || username) into v_name from public.users where id = g.from_user_id;
  insert into public.notifications (user_id, type, payload) values (g.to_user_id, 'gift_offer',
    jsonb_build_object('gift_offer_id', g.id, 'business_id', g.business_id, 'from_user_id', g.from_user_id, 'conversation_id', v_conv, 'item_count', jsonb_array_length(g.items)));
  return jsonb_build_object('ok', true, 'status', 'held', 'conversation_id', v_conv);
end;
$$;
revoke all on function public.gift_offer_set_hold(uuid, text, int, int, int), public.gift_offer_mark_held(text) from public, anon, authenticated;
grant execute on function public.gift_offer_set_hold(uuid, text, int, int, int), public.gift_offer_mark_held(text) to service_role;

create or replace function public.gift_offer_respond(p_offer_id uuid, p_accept boolean, p_table_label text default null, p_table_details text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.gift_offers%rowtype;
begin
  select * into g from public.gift_offers where id = p_offer_id for update;
  if g.id is null or g.to_user_id <> auth.uid() then raise exception 'not_your_gift' using errcode = '42501'; end if;
  if g.status <> 'held' then raise exception 'gift_not_open' using errcode = '22023'; end if;
  if g.expires_at < now() then update public.gift_offers set status = 'expired' where id = g.id; raise exception 'gift_expired' using errcode = '22023'; end if;
  if p_accept then
    if not public.venue_presence_ok(g.business_id, auth.uid()) then raise exception 'not_in_venue' using errcode = '42501'; end if;
    if nullif(trim(coalesce(p_table_label,'')), '') is null then raise exception 'table_required' using errcode = '22023'; end if;
    update public.gift_offers set status = 'accepted', table_label = left(trim(p_table_label), 40), table_details = nullif(left(trim(coalesce(p_table_details,'')),200),''), responded_at = now() where id = g.id;
  else
    update public.gift_offers set status = 'declined', responded_at = now() where id = g.id;
  end if;
  return jsonb_build_object('status', case when p_accept then 'accepted' else 'declined' end);
end;
$$;
revoke all on function public.gift_offer_respond(uuid, boolean, text, text) from public, anon;
grant execute on function public.gift_offer_respond(uuid, boolean, text, text) to authenticated;

create or replace function public.gift_offer_dispatch()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_secret text;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status not in ('accepted','declined','expired','cancelled') or new.stripe_pi_id is null then return new; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;
  if v_secret is null then return new; end if;
  perform net.http_post(
    url := 'https://klfsgcfoahdtkojyqspd.supabase.co/functions/v1/gift-worker',
    body := jsonb_build_object('gift_offer_id', new.id, 'status', new.status, 'stripe_pi_id', new.stripe_pi_id),
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret', v_secret),
    timeout_milliseconds := 20000);
  return new;
exception when others then
  raise warning 'gift_offer_dispatch failed: %', sqlerrm; return new;
end;
$$;
drop trigger if exists trg_gift_offer_dispatch on public.gift_offers;
create trigger trg_gift_offer_dispatch after update of status on public.gift_offers for each row execute function public.gift_offer_dispatch();

create or replace function public.gift_offer_mark_paid(p_stripe_pi_id text, p_order_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.gift_offers set status = 'paid', order_id = p_order_id where stripe_pi_id = p_stripe_pi_id and status = 'accepted';
$$;
create or replace function public.gift_offer_mark_failed(p_stripe_pi_id text)
returns void language sql security definer set search_path = public as $$
  update public.gift_offers set status = 'failed' where stripe_pi_id = p_stripe_pi_id and status in ('awaiting_payment','accepted');
$$;
revoke all on function public.gift_offer_mark_paid(text, uuid), public.gift_offer_mark_failed(text) from public, anon, authenticated;
grant execute on function public.gift_offer_mark_paid(text, uuid), public.gift_offer_mark_failed(text) to service_role;

create or replace function public.gift_offers_expire()
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with u as (update public.gift_offers set status = 'expired' where status = 'held' and expires_at < now() returning 1)
  select count(*) into n from u;
  update public.gift_offers set status = 'cancelled' where status in ('draft','awaiting_payment') and created_at < now() - interval '30 minutes';
  return n;
end;
$$;
revoke all on function public.gift_offers_expire() from public, anon, authenticated;
select cron.unschedule('gift-offers-expire') where exists (select 1 from cron.job where jobname = 'gift-offers-expire');
select cron.schedule('gift-offers-expire', '*/2 * * * *', $$select public.gift_offers_expire()$$);

create or replace function public.gift_offer_view(p_offer_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g public.gift_offers%rowtype; v_from jsonb; v_to jsonb; v_is_sender boolean;
begin
  select * into g from public.gift_offers where id = p_offer_id;
  if g.id is null or (g.from_user_id <> auth.uid() and g.to_user_id <> auth.uid()) then raise exception 'not_found' using errcode = '42501'; end if;
  v_is_sender := g.from_user_id = auth.uid();
  select jsonb_build_object('id', u.id, 'name', coalesce(u.display_name, '@'||u.username), 'avatar_url', u.avatar_url) into v_from from public.users u where u.id = g.from_user_id;
  select jsonb_build_object('id', u.id, 'name', coalesce(u.display_name, '@'||u.username), 'avatar_url', u.avatar_url) into v_to from public.users u where u.id = g.to_user_id;
  return jsonb_build_object('id', g.id, 'business_id', g.business_id, 'status', g.status, 'is_sender', v_is_sender, 'from', v_from, 'to', v_to,
    'items', (select jsonb_agg(i - 'price_cents') from jsonb_array_elements(g.items) i), 'item_count', (select sum((i->>'qty')::int) from jsonb_array_elements(g.items) i),
    'note', g.note, 'expires_at', g.expires_at, 'table_label', case when v_is_sender then null else g.table_label end,
    'total_cents', case when v_is_sender then g.total_cents else null end, 'order_id', g.order_id);
end;
$$;
revoke all on function public.gift_offer_view(uuid) from public, anon;
grant execute on function public.gift_offer_view(uuid) to authenticated;

-- 202b: avisos de respuesta
create or replace function public.gift_offer_notify_response()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status in ('accepted','declined','expired') then
    insert into public.notifications (user_id, type, payload) values (new.from_user_id, 'gift_response',
      jsonb_build_object('gift_offer_id', new.id, 'business_id', new.business_id, 'to_user_id', new.to_user_id, 'conversation_id', new.conversation_id, 'result', new.status));
  elsif new.status = 'paid' then
    insert into public.notifications (user_id, type, payload) values (new.to_user_id, 'gift_response',
      jsonb_build_object('gift_offer_id', new.id, 'business_id', new.business_id, 'from_user_id', new.from_user_id, 'conversation_id', new.conversation_id, 'result', 'paid', 'order_id', new.order_id));
  end if;
  return new;
end;
$$;
drop trigger if exists trg_gift_offer_notify on public.gift_offers;
create trigger trg_gift_offer_notify after update of status on public.gift_offers for each row execute function public.gift_offer_notify_response();
