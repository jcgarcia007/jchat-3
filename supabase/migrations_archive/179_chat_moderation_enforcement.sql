-- 179: moderación del chat — solo el dueño escribe baneos/silencios/bitácora, y se hacen cumplir

-- Helpers
create or replace function public.owns_business(p_business uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.businesses b where b.id = p_business and b.owner_id = (select auth.uid()));
$$;

create or replace function public.owns_room_business(p_room uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.rooms r join public.businesses b on b.id = r.business_id
    where r.id = p_room and b.owner_id = (select auth.uid())
  );
$$;

create or replace function public.is_banned_from_room(p_room uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bans x
    where x.user_id = p_user
      and (x.room_id = p_room
           or (x.room_id is null and x.business_id = (select r.business_id from public.rooms r where r.id = p_room)))
  );
$$;

create or replace function public.is_muted_in_room(p_room uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.room_mutes m
    where m.room_id = p_room and m.user_id = p_user
      and (m.expires_at is null or m.expires_at > now())
  );
$$;

-- Bloqueos en ambas direcciones, para que la app filtre mensajes
create or replace function public.my_block_relations()
returns setof uuid language sql stable security definer set search_path = public as $$
  select blocked_id from public.blocks where blocker_id = (select auth.uid())
  union
  select blocker_id from public.blocks where blocked_id = (select auth.uid());
$$;

revoke all on function public.owns_business(uuid) from public, anon;
revoke all on function public.owns_room_business(uuid) from public, anon;
revoke all on function public.is_banned_from_room(uuid, uuid) from public, anon;
revoke all on function public.is_muted_in_room(uuid, uuid) from public, anon;
revoke all on function public.my_block_relations() from public, anon;
grant execute on function public.owns_business(uuid) to authenticated;
grant execute on function public.owns_room_business(uuid) to authenticated;
grant execute on function public.is_banned_from_room(uuid, uuid) to authenticated;
grant execute on function public.is_muted_in_room(uuid, uuid) to authenticated;
grant execute on function public.my_block_relations() to authenticated;

-- bans: solo el dueño escribe; lee el dueño o el propio afectado
drop policy if exists bans_owner_write on public.bans;
drop policy if exists bans_read on public.bans;
create policy bans_owner_manage on public.bans for all to authenticated
  using ((room_id is not null and public.owns_room_business(room_id)) or (business_id is not null and public.owns_business(business_id)))
  with check (banned_by = (select auth.uid())
    and ((room_id is not null and public.owns_room_business(room_id)) or (business_id is not null and public.owns_business(business_id))));
create policy bans_read_self_or_owner on public.bans for select to authenticated
  using (user_id = (select auth.uid())
    or (room_id is not null and public.owns_room_business(room_id))
    or (business_id is not null and public.owns_business(business_id)));

-- room_mutes: igual
drop policy if exists room_mutes_owner_write on public.room_mutes;
drop policy if exists room_mutes_read on public.room_mutes;
create policy room_mutes_owner_manage on public.room_mutes for all to authenticated
  using (public.owns_room_business(room_id))
  with check (muted_by = (select auth.uid()) and public.owns_room_business(room_id));
create policy room_mutes_read_self_or_owner on public.room_mutes for select to authenticated
  using (user_id = (select auth.uid()) or public.owns_room_business(room_id));

-- moderation_logs: solo el dueño del negocio o de la sala escribe
drop policy if exists mod_logs_insert on public.moderation_logs;
create policy mod_logs_insert on public.moderation_logs for insert to authenticated
  with check (actor_id = (select auth.uid())
    and ((business_id is not null and public.owns_business(business_id))
         or (room_id is not null and public.owns_room_business(room_id))));

-- Acceso a la sala: un baneado no entra (el dueño siempre entra)
create or replace function public.can_access_room(_room_id uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (
    select 1 from public.rooms r where r.id = _room_id and (
      exists (select 1 from public.businesses b where b.id = r.business_id and b.owner_id = auth.uid())
      or (
        not public.is_banned_from_room(_room_id, auth.uid())
        and exists (
          select 1 from public.room_geo_presence g
          where g.room_id = _room_id and g.user_id = auth.uid() and g.expires_at > now()
        )
        and (
          r.is_password_protected = false
          or exists (
            select 1 from public.room_members m
            where m.room_id = _room_id and m.user_id = auth.uid() and m.expires_at > now()
          )
        )
      )
    )
  );
$$;

-- Enviar mensajes: un silenciado no puede escribir
drop policy if exists "messages: authenticated insert" on public.messages;
create policy "messages: authenticated insert" on public.messages for insert to authenticated
  with check ((select auth.uid()) = user_id
    and public.can_access_room(room_id)
    and not public.is_muted_in_room(room_id, (select auth.uid())));
