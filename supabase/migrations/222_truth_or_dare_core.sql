-- Versionada tal cual está en producción (supabase_migrations.schema_migrations, versión 20261011003534). APLICADA 2026-10-11.
-- 222: Truth or Dare — núcleo (fase 1). Solo cartas de JChat; las personalizadas quedan para una fase futura.
-- Juego apagado por defecto en cada local (sin fila en business_games = apagado). games.is_active = interruptor global.
-- Tarjeta y resultado son mensajes de la sala (type 'tod_round' / 'tod_draw'): heredan bloqueo mutuo, ocultación,
-- reportes, retención de evidencia y tiempo real. Solo las funciones de este archivo pueden crearlos (guard de la 221).
-- Las claves foráneas con cascada y la purga de 90 días van en la 223 (se aplica en el SQL Editor).

insert into public.games (key, name_es, name_en, is_active, sort)
values ('truth_or_dare', 'Truth or Dare', 'Truth or Dare', true, 2)
on conflict (key) do nothing;

create table if not exists public.tod_cards (
  id uuid primary key default gen_random_uuid(),
  concept_id text not null,
  category text not null check (category in ('classic','party','laughs','confessions','talent')),
  kind text not null check (kind in ('truth','dare')),
  locale text not null check (locale in ('es','en')),
  body text not null check (char_length(body) between 1 and 200),
  active boolean not null default true,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (concept_id, locale)
);
create index if not exists tod_cards_pick_idx on public.tod_cards (category, kind, active);

create table if not exists public.tod_settings (
  business_id uuid primary key,
  categories text[] not null default array['classic','party','laughs','confessions','talent'],
  updated_at timestamptz not null default now()
);

create table if not exists public.tod_terms (
  user_id uuid primary key,
  version text not null,
  accepted_at timestamptz not null default now()
);

create table if not exists public.tod_kicks (
  business_id uuid not null,
  user_id uuid not null,
  kicked_by uuid,
  reason text,
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid,
  primary key (business_id, user_id)
);

create table if not exists public.tod_rounds (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  room_id uuid not null,
  creator_id uuid not null,
  category text not null check (category in ('classic','party','laughs','confessions','talent')),
  is_official boolean not null default false,
  status text not null default 'active' check (status in ('active','closed','expired','hidden')),
  message_id uuid,
  plays_count integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  closed_at timestamptz
);
create index if not exists tod_rounds_room_active_idx on public.tod_rounds (room_id, expires_at) where status = 'active';
create index if not exists tod_rounds_creator_idx on public.tod_rounds (creator_id, business_id, created_at desc);

create table if not exists public.tod_draws (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.tod_rounds(id),
  business_id uuid not null,
  room_id uuid not null,
  user_id uuid not null,
  kind text not null check (kind in ('truth','dare')),
  is_random boolean not null default false,
  concept_id text not null,
  status text not null default 'drawn' check (status in ('drawn','published','passed')),
  message_id uuid,
  applause_count integer not null default 0,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists tod_draws_user_biz_idx on public.tod_draws (user_id, business_id, created_at desc);
create index if not exists tod_draws_round_idx on public.tod_draws (round_id);

create table if not exists public.tod_votes (
  draw_id uuid not null references public.tod_draws(id),
  voter_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (draw_id, voter_id)
);

create table if not exists public.tod_moderation_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  actor_id uuid,
  action text not null,
  target_type text,
  target_id uuid,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists tod_modlog_biz_idx on public.tod_moderation_log (business_id, created_at desc);

alter table public.tod_cards enable row level security;
alter table public.tod_settings enable row level security;
alter table public.tod_terms enable row level security;
alter table public.tod_kicks enable row level security;
alter table public.tod_rounds enable row level security;
alter table public.tod_draws enable row level security;
alter table public.tod_votes enable row level security;
alter table public.tod_moderation_log enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tod_cards' and policyname='tod_cards_read') then
    create policy tod_cards_read on public.tod_cards for select to authenticated using (active);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tod_settings' and policyname='tod_settings_read') then
    create policy tod_settings_read on public.tod_settings for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tod_settings' and policyname='tod_settings_owner_write') then
    create policy tod_settings_owner_write on public.tod_settings for all to authenticated
      using (exists (select 1 from public.businesses b where b.id = tod_settings.business_id and b.owner_id = (select auth.uid())))
      with check (exists (select 1 from public.businesses b where b.id = tod_settings.business_id and b.owner_id = (select auth.uid()))
                  and categories <@ array['classic','party','laughs','confessions','talent']);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tod_terms' and policyname='tod_terms_own') then
    create policy tod_terms_own on public.tod_terms for select to authenticated using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tod_kicks' and policyname='tod_kicks_read') then
    create policy tod_kicks_read on public.tod_kicks for select to authenticated
      using (user_id = (select auth.uid()) or public.is_venue_staff(business_id, (select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tod_rounds' and policyname='tod_rounds_read') then
    create policy tod_rounds_read on public.tod_rounds for select to authenticated
      using ((public.can_access_room(room_id) and not public.is_blocked((select auth.uid()), creator_id))
             or public.is_venue_staff(business_id, (select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tod_draws' and policyname='tod_draws_own') then
    create policy tod_draws_own on public.tod_draws for select to authenticated using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tod_votes' and policyname='tod_votes_own') then
    create policy tod_votes_own on public.tod_votes for select to authenticated using (voter_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tod_moderation_log' and policyname='tod_modlog_staff') then
    create policy tod_modlog_staff on public.tod_moderation_log for select to authenticated
      using (public.is_venue_staff(business_id, (select auth.uid())));
  end if;
end $$;

create or replace function public.messages_type_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or coalesce(current_setting('jchat.trusted_message', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if coalesce(new.is_system, false) or new.type = 'system' or new.type like 'tod\_%' then
      raise exception 'message_type_not_allowed' using errcode = '42501';
    end if;
  else
    if new.type is distinct from old.type or new.is_system is distinct from old.is_system then
      raise exception 'message_type_readonly' using errcode = '42501';
    end if;
    if old.type like 'tod\_%' and (new.body is distinct from old.body or new.metadata is distinct from old.metadata
        or new.room_id is distinct from old.room_id or new.user_id is distinct from old.user_id) then
      raise exception 'message_type_readonly' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.tod_enabled_for_business(p_business_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select bg.enabled from public.business_games bg where bg.business_id = p_business_id and bg.game_key = 'truth_or_dare'), false)
     and exists (select 1 from public.games g where g.key = 'truth_or_dare' and g.is_active);
$$;

create or replace function public.tod_category_enabled(p_business_id uuid, p_category text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_category in ('classic','party','laughs','confessions','talent')
     and coalesce((select p_category = any(s.categories) from public.tod_settings s where s.business_id = p_business_id), true);
$$;

create or replace function public.tod_post_message(p_room_id uuid, p_user_id uuid, p_type text, p_body text, p_metadata jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform set_config('jchat.trusted_message', 'on', true);
  insert into public.messages (room_id, user_id, body, type, metadata, is_system)
  values (p_room_id, p_user_id, p_body, p_type, p_metadata, false)
  returning id into v_id;
  perform set_config('jchat.trusted_message', '', true);
  return v_id;
end;
$$;

create or replace function public.tod_patch_message(p_message_id uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_message_id is null then return; end if;
  perform set_config('jchat.trusted_message', 'on', true);
  update public.messages set metadata = coalesce(metadata, '{}'::jsonb) || p_patch where id = p_message_id;
  perform set_config('jchat.trusted_message', '', true);
end;
$$;

revoke all on function public.tod_post_message(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.tod_patch_message(uuid, jsonb) from public, anon, authenticated;

create or replace function public.tod_accept_terms(p_version text default '2026-10')
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  insert into public.tod_terms (user_id, version, accepted_at) values (v_uid, left(coalesce(p_version, '2026-10'), 20), now())
  on conflict (user_id) do update set version = excluded.version, accepted_at = now();
end;
$$;

create or replace function public.tod_create_round(p_room_id uuid, p_category text, p_official boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_biz uuid; v_round public.tod_rounds%rowtype; v_last timestamptz; v_msg uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select r.business_id into v_biz from public.rooms r where r.id = p_room_id and r.is_active;
  if v_biz is null then return jsonb_build_object('status','denied','reason','room_not_found'); end if;
  if not exists (select 1 from public.users u where u.id = v_uid and u.age_confirmed_at is not null) then
    return jsonb_build_object('status','denied','reason','age_not_confirmed'); end if;
  if not exists (select 1 from public.users u where u.id = v_uid and coalesce((u.settings->>'gamesEnabled')::boolean, true)) then
    return jsonb_build_object('status','denied','reason','games_disabled'); end if;
  if not exists (select 1 from public.tod_terms t where t.user_id = v_uid) then
    return jsonb_build_object('status','denied','reason','terms_required'); end if;
  if not public.tod_enabled_for_business(v_biz) then return jsonb_build_object('status','denied','reason','game_disabled'); end if;
  if not public.tod_category_enabled(v_biz, p_category) then return jsonb_build_object('status','denied','reason','category_disabled'); end if;
  if exists (select 1 from public.tod_kicks k where k.business_id = v_biz and k.user_id = v_uid and k.lifted_at is null) then
    return jsonb_build_object('status','denied','reason','unavailable'); end if;

  if coalesce(p_official, false) then
    if not public.is_venue_staff(v_biz, v_uid) then return jsonb_build_object('status','denied','reason','not_staff'); end if;
  else
    if not public.can_access_room(p_room_id) then return jsonb_build_object('status','denied','reason','not_in_room'); end if;
    select max(created_at) into v_last from public.tod_rounds where creator_id = v_uid and business_id = v_biz and not is_official;
    if v_last is not null and v_last > now() - interval '5 minutes' then
      return jsonb_build_object('status','cooldown','seconds', ceil(extract(epoch from (v_last + interval '5 minutes' - now())))::int);
    end if;
  end if;

  insert into public.tod_rounds (business_id, room_id, creator_id, category, is_official)
  values (v_biz, p_room_id, v_uid, p_category, coalesce(p_official, false))
  returning * into v_round;

  v_msg := public.tod_post_message(p_room_id, v_uid, 'tod_round', 'Truth or Dare',
    jsonb_build_object('round_id', v_round.id, 'category', v_round.category, 'official', v_round.is_official,
                       'expires_at', v_round.expires_at, 'status', 'active', 'plays', 0));
  update public.tod_rounds set message_id = v_msg where id = v_round.id;

  if v_round.is_official then
    insert into public.tod_moderation_log (business_id, actor_id, action, target_type, target_id, detail)
    values (v_biz, v_uid, 'official_round', 'round', v_round.id, v_round.category);
  end if;

  return jsonb_build_object('status','ok','round_id', v_round.id, 'message_id', v_msg, 'expires_at', v_round.expires_at);
end;
$$;

create or replace function public.tod_draw(p_round_id uuid, p_choice text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_round public.tod_rounds%rowtype; v_last timestamptz; v_kind text; v_random boolean := false;
  v_concept text; v_draw public.tod_draws%rowtype; v_plays int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_choice not in ('truth','dare','random') then raise exception 'invalid_choice' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('tod_draw:' || v_uid::text));

  select * into v_round from public.tod_rounds where id = p_round_id;
  if v_round.id is null then return jsonb_build_object('status','denied','reason','round_not_found'); end if;
  if v_round.status <> 'active' or v_round.expires_at <= now() then return jsonb_build_object('status','denied','reason','round_ended'); end if;
  if v_round.creator_id = v_uid then return jsonb_build_object('status','denied','reason','own_round'); end if;
  if not exists (select 1 from public.tod_terms t where t.user_id = v_uid) then return jsonb_build_object('status','denied','reason','terms_required'); end if;
  if not exists (select 1 from public.users u where u.id = v_uid and u.age_confirmed_at is not null
                 and coalesce((u.settings->>'gamesEnabled')::boolean, true)) then
    return jsonb_build_object('status','denied','reason','unavailable'); end if;
  if not public.tod_enabled_for_business(v_round.business_id) or not public.tod_category_enabled(v_round.business_id, v_round.category) then
    return jsonb_build_object('status','denied','reason','game_disabled'); end if;
  if exists (select 1 from public.tod_kicks k where k.business_id = v_round.business_id and k.user_id = v_uid and k.lifted_at is null)
     or public.is_blocked(v_uid, v_round.creator_id) then
    return jsonb_build_object('status','denied','reason','unavailable'); end if;
  if not public.can_access_room(v_round.room_id) then return jsonb_build_object('status','denied','reason','not_in_room'); end if;

  select * into v_draw from public.tod_draws
   where user_id = v_uid and business_id = v_round.business_id and status = 'drawn' and created_at > now() - interval '15 minutes'
   order by created_at desc limit 1;
  if v_draw.id is not null then
    return jsonb_build_object('status','pending','draw_id', v_draw.id, 'round_id', v_draw.round_id, 'kind', v_draw.kind,
                              'is_random', v_draw.is_random, 'concept_id', v_draw.concept_id);
  end if;

  select max(created_at) into v_last from public.tod_draws where user_id = v_uid and business_id = v_round.business_id;
  if v_last is not null and v_last > now() - interval '5 minutes' then
    return jsonb_build_object('status','cooldown','seconds', ceil(extract(epoch from (v_last + interval '5 minutes' - now())))::int);
  end if;

  if p_choice = 'random' then
    v_random := true;
    v_kind := case when random() < 0.7 then 'dare' else 'truth' end;
  else
    v_kind := p_choice;
  end if;

  select c.concept_id into v_concept
    from (select distinct concept_id from public.tod_cards where category = v_round.category and kind = v_kind and active) c
   where c.concept_id not in (select d.concept_id from public.tod_draws d
                               where d.user_id = v_uid and d.business_id = v_round.business_id and d.created_at > now() - interval '12 hours')
   order by random() limit 1;
  if v_concept is null then
    select c.concept_id into v_concept
      from (select distinct concept_id from public.tod_cards where category = v_round.category and kind = v_kind and active) c
     order by random() limit 1;
  end if;
  if v_concept is null then return jsonb_build_object('status','denied','reason','no_cards'); end if;

  insert into public.tod_draws (round_id, business_id, room_id, user_id, kind, is_random, concept_id)
  values (v_round.id, v_round.business_id, v_round.room_id, v_uid, v_kind, v_random, v_concept)
  returning * into v_draw;

  select count(distinct user_id) into v_plays from public.tod_draws where round_id = v_round.id;
  update public.tod_rounds set plays_count = v_plays where id = v_round.id;
  perform public.tod_patch_message(v_round.message_id, jsonb_build_object('plays', v_plays));

  return jsonb_build_object('status','ok','draw_id', v_draw.id, 'round_id', v_round.id, 'kind', v_kind,
                            'is_random', v_random, 'concept_id', v_concept);
end;
$$;

create or replace function public.tod_decide(p_draw_id uuid, p_publish boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_draw public.tod_draws%rowtype; v_round public.tod_rounds%rowtype; v_msg uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_draw from public.tod_draws where id = p_draw_id and user_id = v_uid for update;
  if v_draw.id is null then return jsonb_build_object('status','denied','reason','not_found'); end if;
  if v_draw.status <> 'drawn' then return jsonb_build_object('status','denied','reason','already_decided'); end if;

  if not coalesce(p_publish, false) then
    update public.tod_draws set status = 'passed', decided_at = now() where id = v_draw.id;
    return jsonb_build_object('status','ok','published', false);
  end if;

  select * into v_round from public.tod_rounds where id = v_draw.round_id;
  if v_draw.created_at <= now() - interval '15 minutes' then return jsonb_build_object('status','denied','reason','draw_expired'); end if;
  if v_round.status = 'hidden' or exists (select 1 from public.tod_kicks k where k.business_id = v_draw.business_id and k.user_id = v_uid and k.lifted_at is null) then
    return jsonb_build_object('status','denied','reason','unavailable'); end if;
  if not public.venue_presence_ok(v_draw.business_id, v_uid) then return jsonb_build_object('status','denied','reason','not_in_venue'); end if;

  v_msg := public.tod_post_message(v_draw.room_id, v_uid, 'tod_draw', '',
    jsonb_build_object('round_id', v_draw.round_id, 'draw_id', v_draw.id, 'category', v_round.category, 'kind', v_draw.kind,
                       'is_random', v_draw.is_random, 'concept_id', v_draw.concept_id, 'applause', 0));
  update public.tod_draws set status = 'published', decided_at = now(), message_id = v_msg where id = v_draw.id;
  return jsonb_build_object('status','ok','published', true, 'message_id', v_msg);
end;
$$;

create or replace function public.tod_applaud(p_draw_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_draw public.tod_draws%rowtype; v_count int; v_new boolean;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_draw from public.tod_draws where id = p_draw_id;
  if v_draw.id is null or v_draw.status <> 'published' then return jsonb_build_object('status','denied','reason','not_found'); end if;
  if v_draw.user_id = v_uid then return jsonb_build_object('status','denied','reason','own_result'); end if;
  if public.is_blocked(v_uid, v_draw.user_id) then return jsonb_build_object('status','denied','reason','unavailable'); end if;
  if not public.can_access_room(v_draw.room_id) then return jsonb_build_object('status','denied','reason','not_in_room'); end if;

  insert into public.tod_votes (draw_id, voter_id) values (v_draw.id, v_uid) on conflict do nothing;
  get diagnostics v_count = row_count;
  v_new := v_count > 0;
  if v_new then
    update public.tod_draws set applause_count = applause_count + 1 where id = v_draw.id returning applause_count into v_count;
    perform public.tod_patch_message(v_draw.message_id, jsonb_build_object('applause', v_count));
  else
    select applause_count into v_count from public.tod_draws where id = v_draw.id;
  end if;
  return jsonb_build_object('status','ok','applause', v_count, 'new', v_new);
end;
$$;

create or replace function public.tod_close_round(p_round_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_round public.tod_rounds%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_round from public.tod_rounds where id = p_round_id for update;
  if v_round.id is null then return jsonb_build_object('status','denied','reason','not_found'); end if;
  if v_round.creator_id <> v_uid and not public.is_venue_staff(v_round.business_id, v_uid) then
    return jsonb_build_object('status','denied','reason','forbidden'); end if;
  if v_round.status <> 'active' then return jsonb_build_object('status','ok','already', true); end if;
  update public.tod_rounds set status = 'closed', closed_at = now() where id = v_round.id;
  perform public.tod_patch_message(v_round.message_id, jsonb_build_object('status','closed'));
  if v_round.creator_id <> v_uid then
    insert into public.tod_moderation_log (business_id, actor_id, action, target_type, target_id)
    values (v_round.business_id, v_uid, 'round_closed', 'round', v_round.id);
  end if;
  return jsonb_build_object('status','ok');
end;
$$;

create or replace function public.tod_staff_hide(p_message_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_msg record; v_biz uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select m.id, m.type, m.metadata, m.room_id into v_msg from public.messages m where m.id = p_message_id;
  if v_msg.id is null or v_msg.type not like 'tod\_%' then return jsonb_build_object('status','denied','reason','not_found'); end if;
  select r.business_id into v_biz from public.rooms r where r.id = v_msg.room_id;
  if not public.is_venue_staff(v_biz, v_uid) then return jsonb_build_object('status','denied','reason','forbidden'); end if;

  perform set_config('jchat.trusted_message', 'on', true);
  update public.messages set hidden_at = now(), hidden_by = v_uid where id = p_message_id;
  perform set_config('jchat.trusted_message', '', true);
  if v_msg.type = 'tod_round' then
    update public.tod_rounds set status = 'hidden', closed_at = now() where id = (v_msg.metadata->>'round_id')::uuid;
  end if;
  insert into public.tod_moderation_log (business_id, actor_id, action, target_type, target_id, detail)
  values (v_biz, v_uid, 'hide', v_msg.type, p_message_id, left(p_reason, 300));
  return jsonb_build_object('status','ok');
end;
$$;

create or replace function public.tod_kick(p_business_id uuid, p_user_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.is_venue_staff(p_business_id, v_uid) then return jsonb_build_object('status','denied','reason','forbidden'); end if;
  if public.is_venue_staff(p_business_id, p_user_id) then return jsonb_build_object('status','denied','reason','invalid_target'); end if;
  insert into public.tod_kicks (business_id, user_id, kicked_by, reason) values (p_business_id, p_user_id, v_uid, left(p_reason, 300))
  on conflict (business_id, user_id) do update set kicked_by = excluded.kicked_by, reason = excluded.reason, created_at = now(),
     lifted_at = null, lifted_by = null;
  update public.tod_draws set status = 'passed', decided_at = now()
   where user_id = p_user_id and business_id = p_business_id and status = 'drawn';
  insert into public.tod_moderation_log (business_id, actor_id, action, target_type, target_id, detail)
  values (p_business_id, v_uid, 'kick', 'user', p_user_id, left(p_reason, 300));
  return jsonb_build_object('status','ok');
end;
$$;

create or replace function public.tod_unkick(p_business_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_n int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.is_venue_staff(p_business_id, v_uid) then return jsonb_build_object('status','denied','reason','forbidden'); end if;
  update public.tod_kicks set lifted_at = now(), lifted_by = v_uid
   where business_id = p_business_id and user_id = p_user_id and lifted_at is null;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into public.tod_moderation_log (business_id, actor_id, action, target_type, target_id)
    values (p_business_id, v_uid, 'unkick', 'user', p_user_id);
  end if;
  return jsonb_build_object('status','ok');
end;
$$;

create or replace function public.tod_business_stats(p_business_id uuid, p_from timestamptz default now() - interval '30 days', p_to timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_venue_staff(p_business_id, v_uid) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'rounds', (select count(*) from public.tod_rounds where business_id = p_business_id and created_at between p_from and p_to),
    'official_rounds', (select count(*) from public.tod_rounds where business_id = p_business_id and is_official and created_at between p_from and p_to),
    'unique_players', (select count(distinct user_id) from public.tod_draws where business_id = p_business_id and created_at between p_from and p_to),
    'draws', (select count(*) from public.tod_draws where business_id = p_business_id and created_at between p_from and p_to),
    'published', (select count(*) from public.tod_draws where business_id = p_business_id and status = 'published' and created_at between p_from and p_to),
    'by_category', (select coalesce(jsonb_object_agg(category, n), '{}'::jsonb) from (
        select r.category, count(*) n from public.tod_draws d join public.tod_rounds r on r.id = d.round_id
        where d.business_id = p_business_id and d.created_at between p_from and p_to group by r.category) x),
    'by_hour', (select coalesce(jsonb_object_agg(h, n), '{}'::jsonb) from (
        select extract(hour from d.created_at at time zone 'America/New_York')::int h, count(*) n from public.tod_draws d
        where d.business_id = p_business_id and d.created_at between p_from and p_to group by 1) y),
    'reports', (select count(*) from public.reports rp join public.messages m on m.id = rp.content_id
        join public.rooms ro on ro.id = m.room_id
        where rp.content_type = 'message' and m.type like 'tod\_%' and ro.business_id = p_business_id and rp.created_at between p_from and p_to)
  );
end;
$$;

create or replace function public.tod_auto_hide_on_reports()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_type text; v_n int;
begin
  if new.content_type <> 'message' or new.content_id is null then return new; end if;
  select m.type into v_type from public.messages m where m.id = new.content_id;
  if v_type is null or v_type not like 'tod\_%' then return new; end if;
  select count(distinct reporter_id) into v_n from public.reports where content_type = 'message' and content_id = new.content_id and reporter_id is not null;
  if v_n >= 3 then
    perform set_config('jchat.trusted_message', 'on', true);
    update public.messages set hidden_at = coalesce(hidden_at, now()) where id = new.content_id;
    perform set_config('jchat.trusted_message', '', true);
    if v_type = 'tod_round' then
      update public.tod_rounds set status = 'hidden', closed_at = coalesce(closed_at, now())
       where message_id = new.content_id and status = 'active';
    end if;
  end if;
  return new;
end;
$$;
create or replace trigger trg_tod_auto_hide after insert on public.reports
  for each row execute function public.tod_auto_hide_on_reports();

create or replace function public.tod_expire()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in update public.tod_rounds set status = 'expired', closed_at = now()
            where status = 'active' and expires_at <= now() returning message_id loop
    perform public.tod_patch_message(r.message_id, jsonb_build_object('status','expired'));
    n := n + 1;
  end loop;
  update public.tod_draws set status = 'passed', decided_at = now() where status = 'drawn' and created_at <= now() - interval '15 minutes';
  return n;
end;
$$;
revoke all on function public.tod_expire() from public, anon, authenticated;
revoke all on function public.tod_auto_hide_on_reports() from public, anon, authenticated;

select cron.schedule('tod-expire', '*/2 * * * *', $$select public.tod_expire()$$)
where not exists (select 1 from cron.job where jobname = 'tod-expire');

revoke all on function public.tod_accept_terms(text) from public, anon;
revoke all on function public.tod_create_round(uuid, text, boolean) from public, anon;
revoke all on function public.tod_draw(uuid, text) from public, anon;
revoke all on function public.tod_decide(uuid, boolean) from public, anon;
revoke all on function public.tod_applaud(uuid) from public, anon;
revoke all on function public.tod_close_round(uuid) from public, anon;
revoke all on function public.tod_staff_hide(uuid, text) from public, anon;
revoke all on function public.tod_kick(uuid, uuid, text) from public, anon;
revoke all on function public.tod_unkick(uuid, uuid) from public, anon;
revoke all on function public.tod_business_stats(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.tod_accept_terms(text) to authenticated;
grant execute on function public.tod_create_round(uuid, text, boolean) to authenticated;
grant execute on function public.tod_draw(uuid, text) to authenticated;
grant execute on function public.tod_decide(uuid, boolean) to authenticated;
grant execute on function public.tod_applaud(uuid) to authenticated;
grant execute on function public.tod_close_round(uuid) to authenticated;
grant execute on function public.tod_staff_hide(uuid, text) to authenticated;
grant execute on function public.tod_kick(uuid, uuid, text) to authenticated;
grant execute on function public.tod_unkick(uuid, uuid) to authenticated;
grant execute on function public.tod_business_stats(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.tod_enabled_for_business(uuid) to authenticated;
grant execute on function public.tod_category_enabled(uuid, text) to authenticated;

notify pgrst, 'reload schema';
