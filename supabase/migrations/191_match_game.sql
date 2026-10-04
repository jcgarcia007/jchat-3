-- 191: JChat Match — el juego: swipes, super likes (5/día), detección de match (trigger), chat efímero en DMs, primer mensaje con límite, supervivencia por follow mutuo, mazo y actividad.
-- APLICADA EN PRODUCCIÓN POR PLANNING (2026-10-03). Este archivo solo la versiona.

-- 1) Swipes
create table if not exists public.match_swipes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  swiper_id uuid not null references public.users(id) on delete cascade,
  target_id uuid not null references public.users(id) on delete cascade,
  action text not null check (action in ('like','pass','super')),
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  check (swiper_id <> target_id),
  unique (business_id, swiper_id, target_id)
);
create index if not exists match_swipes_target_idx on public.match_swipes (business_id, target_id) where undone_at is null;
alter table public.match_swipes enable row level security;
drop policy if exists match_swipes_own on public.match_swipes;
create policy match_swipes_own on public.match_swipes for select to authenticated using (swiper_id = auth.uid());
-- escrituras solo por RPC

-- 2) Cuota diaria de super likes (NO se borra con el wipe: evita reiniciarla saliendo y entrando)
create table if not exists public.match_super_quota (
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  used integer not null default 0,
  primary key (user_id, day)
);
alter table public.match_super_quota enable row level security;
drop policy if exists match_super_quota_own on public.match_super_quota;
create policy match_super_quota_own on public.match_super_quota for select to authenticated using (user_id = auth.uid());

create or replace function public.match_today()
returns date language sql stable as $$ select (now() at time zone 'America/New_York')::date $$;

-- 3) Matches
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_a uuid not null references public.users(id) on delete cascade,
  user_b uuid not null references public.users(id) on delete cascade,
  is_super boolean not null default false,
  conversation_id uuid references public.dm_conversations(id) on delete set null,
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (business_id, user_a, user_b)
);
alter table public.matches enable row level security;
drop policy if exists matches_participant on public.matches;
create policy matches_participant on public.matches for select to authenticated using (auth.uid() in (user_a, user_b));

-- 4) DMs: marca efímera por local + regla de primer mensaje
alter table public.dm_conversations
  add column if not exists ephemeral_business_id uuid references public.businesses(id) on delete set null,
  add column if not exists first_sender_id uuid references public.users(id) on delete set null,
  add column if not exists awaiting_reply boolean not null default false;
create index if not exists dm_conversations_ephemeral_idx on public.dm_conversations (ephemeral_business_id) where ephemeral_business_id is not null;

-- Primer mensaje con límite: en chats efímeros, quien inicia solo puede enviar UN mensaje hasta que el otro responda
create or replace function public.dm_first_message_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_conv public.dm_conversations%rowtype;
begin
  select * into v_conv from public.dm_conversations where id = new.conversation_id for update;
  if v_conv.ephemeral_business_id is null then return new; end if;
  if v_conv.first_sender_id is null then
    update public.dm_conversations set first_sender_id = new.sender_id, awaiting_reply = true where id = v_conv.id;
  elsif v_conv.awaiting_reply and new.sender_id = v_conv.first_sender_id then
    raise exception 'awaiting_reply' using errcode = '23514';
  elsif v_conv.awaiting_reply and new.sender_id <> v_conv.first_sender_id then
    update public.dm_conversations set awaiting_reply = false where id = v_conv.id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_dm_first_message_guard on public.dm_messages;
create trigger trg_dm_first_message_guard before insert on public.dm_messages for each row execute function public.dm_first_message_guard();

-- 5) Detección de match (trigger): like/super mutuo en el mismo local → match + conversación (reutiliza la DM existente si ya hay una)
create or replace function public.match_detect()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_a uuid; v_b uuid; v_super boolean; v_conv uuid; v_reverse public.match_swipes%rowtype;
begin
  if new.undone_at is not null or new.action = 'pass' then return new; end if;
  select * into v_reverse from public.match_swipes s
   where s.business_id = new.business_id and s.swiper_id = new.target_id and s.target_id = new.swiper_id
     and s.action in ('like','super') and s.undone_at is null;
  if v_reverse.id is null then return new; end if;
  if public.is_blocked(new.swiper_id, new.target_id) then return new; end if;

  v_a := least(new.swiper_id, new.target_id); v_b := greatest(new.swiper_id, new.target_id);
  v_super := (new.action = 'super' or v_reverse.action = 'super');

  select c.id into v_conv from public.dm_conversations c where c.user_a = v_a and c.user_b = v_b;
  if v_conv is null then
    insert into public.dm_conversations (user_a, user_b, ephemeral_business_id) values (v_a, v_b, new.business_id) returning id into v_conv;
  end if;

  insert into public.matches (business_id, user_a, user_b, is_super, conversation_id)
  values (new.business_id, v_a, v_b, v_super, v_conv)
  on conflict (business_id, user_a, user_b) do nothing;
  return new;
end;
$$;
drop trigger if exists trg_match_detect on public.match_swipes;
create trigger trg_match_detect after insert or update of action, undone_at on public.match_swipes for each row execute function public.match_detect();

-- 6) Supervivencia: follow mutuo → la conversación deja de ser efímera (conserva el historial)
create or replace function public.match_follow_survival()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.follows f where f.follower_id = new.following_id and f.following_id = new.follower_id) then
    update public.dm_conversations set ephemeral_business_id = null, awaiting_reply = false
    where user_a = least(new.follower_id, new.following_id) and user_b = greatest(new.follower_id, new.following_id)
      and ephemeral_business_id is not null;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_match_follow_survival on public.follows;
create trigger trg_match_follow_survival after insert on public.follows for each row execute function public.match_follow_survival();

-- 7) Helper interno: borrar un match (y su chat efímero) en silencio
create or replace function public.match_remove_pair(p_business_id uuid, p_u1 uuid, p_u2 uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_conv uuid;
begin
  delete from public.matches m where m.business_id = p_business_id and m.user_a = least(p_u1,p_u2) and m.user_b = greatest(p_u1,p_u2)
  returning m.conversation_id into v_conv;
  if v_conv is not null then
    delete from public.dm_conversations c where c.id = v_conv and c.ephemeral_business_id = p_business_id;  -- las permanentes no se tocan
  end if;
  delete from public.notifications n where n.type = 'match_match' and n.user_id in (p_u1, p_u2)
    and (n.payload->>'business_id')::uuid = p_business_id and (n.payload->>'other_user_id')::uuid in (p_u1, p_u2);
end;
$$;
revoke all on function public.match_remove_pair(uuid, uuid, uuid) from public, anon, authenticated;

-- 8) Swipe
create or replace function public.match_swipe(p_business_id uuid, p_target_id uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_used int; v_swipe public.match_swipes%rowtype; v_match public.matches%rowtype; v_existing public.match_swipes%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_action not in ('like','pass','super') then raise exception 'invalid_action' using errcode = '22023'; end if;
  if public.match_common_business(v_uid, p_target_id) is distinct from p_business_id then
    raise exception 'not_in_same_venue' using errcode = '42501';
  end if;

  select * into v_existing from public.match_swipes s where s.business_id = p_business_id and s.swiper_id = v_uid and s.target_id = p_target_id;
  if v_existing.id is not null and v_existing.undone_at is null then
    return jsonb_build_object('swiped', false, 'reason', 'already_swiped');
  end if;

  if p_action = 'super' then
    insert into public.match_super_quota (user_id, day, used) values (v_uid, public.match_today(), 0) on conflict do nothing;
    select used into v_used from public.match_super_quota q where q.user_id = v_uid and q.day = public.match_today() for update;
    if v_used >= 5 then raise exception 'super_like_quota' using errcode = '22023'; end if;
    update public.match_super_quota set used = used + 1 where user_id = v_uid and day = public.match_today();
  end if;

  if v_existing.id is not null then
    update public.match_swipes set action = p_action, undone_at = null, created_at = now() where id = v_existing.id returning * into v_swipe;
  else
    insert into public.match_swipes (business_id, swiper_id, target_id, action) values (p_business_id, v_uid, p_target_id, p_action) returning * into v_swipe;
  end if;

  select * into v_match from public.matches m where m.business_id = p_business_id and m.user_a = least(v_uid, p_target_id) and m.user_b = greatest(v_uid, p_target_id);

  if v_match.id is not null and v_match.created_at >= v_swipe.created_at - interval '2 seconds' then
    -- match recién creado: avisar a los dos
    insert into public.notifications (user_id, type, payload) values
      (p_target_id, 'match_match', jsonb_build_object('business_id', p_business_id, 'other_user_id', v_uid, 'match_id', v_match.id, 'conversation_id', v_match.conversation_id)),
      (v_uid,       'match_match', jsonb_build_object('business_id', p_business_id, 'other_user_id', p_target_id, 'match_id', v_match.id, 'conversation_id', v_match.conversation_id));
  elsif p_action in ('like','super') then
    insert into public.notifications (user_id, type, payload)
    values (p_target_id, case when p_action = 'super' then 'match_super' else 'match_like' end,
            jsonb_build_object('business_id', p_business_id, 'from_user_id', v_uid, 'swipe_id', v_swipe.id));
  end if;

  return jsonb_build_object('swiped', true, 'is_match', v_match.id is not null, 'match_id', v_match.id, 'conversation_id', v_match.conversation_id,
                            'super_left', case when p_action = 'super' then 5 - (v_used + 1) else null end);
end;
$$;
revoke all on function public.match_swipe(uuid, uuid, text) from public, anon;
grant execute on function public.match_swipe(uuid, uuid, text) to authenticated;

-- 9) Deshacer el último swipe (restituye el super like; si había match lo elimina en silencio)
create or replace function public.match_undo_last(p_business_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_s public.match_swipes%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_s from public.match_swipes s where s.business_id = p_business_id and s.swiper_id = v_uid and s.undone_at is null
  order by s.created_at desc limit 1;
  if v_s.id is null then return jsonb_build_object('undone', false); end if;
  update public.match_swipes set undone_at = now() where id = v_s.id;
  if v_s.action = 'super' then update public.match_super_quota set used = greatest(used - 1, 0) where user_id = v_uid and day = public.match_today(); end if;
  delete from public.notifications n where n.type in ('match_like','match_super') and (n.payload->>'swipe_id')::uuid = v_s.id;
  perform public.match_remove_pair(p_business_id, v_uid, v_s.target_id);
  return jsonb_build_object('undone', true, 'target_id', v_s.target_id, 'action', v_s.action);
end;
$$;
revoke all on function public.match_undo_last(uuid) from public, anon;
grant execute on function public.match_undo_last(uuid) to authenticated;

-- 10) Borrar un like (o todos) desde "Mi actividad"; borrar un match
create or replace function public.match_delete_like(p_swipe_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_s public.match_swipes%rowtype;
begin
  select * into v_s from public.match_swipes s where s.id = p_swipe_id and s.swiper_id = v_uid and s.undone_at is null and s.action in ('like','super');
  if v_s.id is null then return; end if;
  update public.match_swipes set undone_at = now() where id = v_s.id;
  delete from public.notifications n where n.type in ('match_like','match_super') and (n.payload->>'swipe_id')::uuid = v_s.id;
  perform public.match_remove_pair(v_s.business_id, v_uid, v_s.target_id);
end;
$$;
create or replace function public.match_clear_likes(p_business_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r record;
begin
  for r in select id from public.match_swipes s where s.business_id = p_business_id and s.swiper_id = v_uid and s.undone_at is null and s.action in ('like','super') loop
    perform public.match_delete_like(r.id);
  end loop;
end;
$$;
create or replace function public.match_delete_match(p_match_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_m public.matches%rowtype;
begin
  select * into v_m from public.matches m where m.id = p_match_id and v_uid in (m.user_a, m.user_b);
  if v_m.id is null then return; end if;
  perform public.match_remove_pair(v_m.business_id, v_m.user_a, v_m.user_b);
end;
$$;
revoke all on function public.match_delete_like(uuid) from public, anon;
revoke all on function public.match_clear_likes(uuid) from public, anon;
revoke all on function public.match_delete_match(uuid) from public, anon;
grant execute on function public.match_delete_like(uuid), public.match_clear_likes(uuid), public.match_delete_match(uuid) to authenticated;

-- 11) Tarjeta pública de un usuario (sin birth_year ni edad)
create or replace function public.match_card(p_viewer uuid, p_user uuid, p_business_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', u.id, 'username', u.username, 'display_name', u.display_name, 'avatar_url', u.avatar_url, 'bio', u.bio, 'is_verified', u.is_verified,
    'photos', coalesce((select jsonb_agg(p.path order by p.sort, p.created_at) from public.match_photos p where p.user_id = u.id and p.status = 'approved'), '[]'::jsonb),
    'interests', coalesce((select jsonb_agg(ui.interest_key order by ui.interest_key) from public.user_interests ui where ui.user_id = u.id), '[]'::jsonb),
    'common_interests', (select count(*) from public.user_interests a join public.user_interests b on b.interest_key = a.interest_key and b.user_id = p_user where a.user_id = p_viewer),
    'super_liked_me', exists (select 1 from public.match_swipes s where s.business_id = p_business_id and s.swiper_id = p_user and s.target_id = p_viewer and s.action = 'super' and s.undone_at is null)
  )
  from public.users u where u.id = p_user;
$$;
revoke all on function public.match_card(uuid, uuid, uuid) from public, anon, authenticated;

-- 12) Mazo: presentes activos en el local, con opt-in y ≥1 foto aprobada, no vistos, no bloqueados, no expulsados; filtro de edad ±1; super-likers primero, luego intereses en común, luego llegada
create or replace function public.match_get_deck(p_business_id uuid, p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_min int; v_max int; v_year int := extract(year from now())::int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.match_presence p where p.user_id = v_uid and p.business_id = p_business_id and p.active_since is not null and p.expires_at > now()) then
    raise exception 'not_present' using errcode = '42501';
  end if;
  select (u.settings->>'matchAgeMin')::int, (u.settings->>'matchAgeMax')::int into v_min, v_max from public.users u where u.id = v_uid;

  return coalesce((
    select jsonb_agg(public.match_card(v_uid, c.user_id, p_business_id) order by c.super_me desc, c.common desc, c.entered_at desc)
    from (
      select t.user_id, t.entered_at,
        exists (select 1 from public.match_swipes s where s.business_id = p_business_id and s.swiper_id = t.user_id and s.target_id = v_uid and s.action = 'super' and s.undone_at is null) as super_me,
        (select count(*) from public.user_interests a join public.user_interests b on b.interest_key = a.interest_key and b.user_id = t.user_id where a.user_id = v_uid) as common
      from public.match_presence t
      join public.users u on u.id = t.user_id
      where t.business_id = p_business_id and t.user_id <> v_uid
        and public.match_common_business(v_uid, t.user_id) = p_business_id
        and exists (select 1 from public.match_photos p where p.user_id = t.user_id and p.status = 'approved')
        and not exists (select 1 from public.match_swipes s where s.business_id = p_business_id and s.swiper_id = v_uid and s.target_id = t.user_id and s.undone_at is null)
        and (v_min is null or u.birth_year is null or (v_year - u.birth_year) >= v_min - 1)
        and (v_max is null or u.birth_year is null or (v_year - u.birth_year) <= v_max + 1)
      limit greatest(1, least(coalesce(p_limit, 20), 50))
    ) c
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.match_get_deck(uuid, integer) from public, anon;
grant execute on function public.match_get_deck(uuid, integer) to authenticated;

create or replace function public.match_get_profile(p_business_id uuid, p_user_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.match_common_business(auth.uid(), p_user_id) = p_business_id
              or exists (select 1 from public.matches m where m.business_id = p_business_id and auth.uid() in (m.user_a, m.user_b) and p_user_id in (m.user_a, m.user_b))
         then public.match_card(auth.uid(), p_user_id, p_business_id) else null end;
$$;
revoke all on function public.match_get_profile(uuid, uuid) from public, anon;
grant execute on function public.match_get_profile(uuid, uuid) to authenticated;

-- 13) Mi actividad: likes dados, les gusté (quiénes), matches
create or replace function public.match_get_activity(p_business_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'likes_given', coalesce((select jsonb_agg(jsonb_build_object('swipe_id', s.id, 'action', s.action, 'created_at', s.created_at, 'user', public.match_card(auth.uid(), s.target_id, p_business_id)) order by s.created_at desc)
                              from public.match_swipes s where s.business_id = p_business_id and s.swiper_id = auth.uid() and s.action in ('like','super') and s.undone_at is null), '[]'::jsonb),
    'liked_me', coalesce((select jsonb_agg(jsonb_build_object('action', s.action, 'created_at', s.created_at, 'user', public.match_card(auth.uid(), s.swiper_id, p_business_id)) order by (s.action='super') desc, s.created_at desc)
                           from public.match_swipes s where s.business_id = p_business_id and s.target_id = auth.uid() and s.action in ('like','super') and s.undone_at is null), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(jsonb_build_object('match_id', m.id, 'is_super', m.is_super, 'conversation_id', m.conversation_id, 'created_at', m.created_at,
                                            'user', public.match_card(auth.uid(), case when m.user_a = auth.uid() then m.user_b else m.user_a end, p_business_id)) order by m.created_at desc)
                          from public.matches m where m.business_id = p_business_id and auth.uid() in (m.user_a, m.user_b)), '[]'::jsonb),
    'super_left', 5 - coalesce((select used from public.match_super_quota q where q.user_id = auth.uid() and q.day = public.match_today()), 0)
  );
$$;
revoke all on function public.match_get_activity(uuid) from public, anon;
grant execute on function public.match_get_activity(uuid) to authenticated;
