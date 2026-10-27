-- ============================================================
-- JChat 3.0 — Social Fase D: gate de DM + bloqueo soft-hide + bucket dm-media
-- Ref: docs/PLAN_MAESTRO_SOCIAL.md (Módulo D). Depende de 040 (helpers
-- is_blocked / can_view_profile). Decisiones D-13: "followers" = mis seguidores
-- pueden escribirme; bloqueo = soft-hide (no borra, reaparece al desbloquear);
-- bucket dm-media PRIVADO (separado de profile-media).
--
-- Diseño clave: dm_conversations NO tiene policy de INSERT → deny-by-default.
-- La ÚNICA vía para crear una conversación es la RPC start_dm (SECURITY DEFINER),
-- que aplica el gate (bloqueo + whoCanDMMe) antes de insertar. Defensa en profundidad.
-- ============================================================

-- ---------- 1. Bucket dm-media (privado) ----------
-- Path pattern: {conversation_id}/{sender_uid}/{filename}
insert into storage.buckets (id, name, public)
  values ('dm-media', 'dm-media', false)
  on conflict (id) do nothing;

-- Upload: el sender es auth.uid() (2º segmento) Y participante de la conversación (1º segmento).
create policy "dm_media_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'dm-media'
    and (storage.foldername(name))[2] = auth.uid()::text
    and exists (
      select 1 from public.dm_conversations c
      where c.id::text = (storage.foldername(name))[1]
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

-- Read: participante de la conversación (1º segmento).
create policy "dm_media_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'dm-media'
    and exists (
      select 1 from public.dm_conversations c
      where c.id::text = (storage.foldername(name))[1]
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

-- Delete: solo quien subió (2º segmento = auth.uid()).
create policy "dm_media_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'dm-media'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- ---------- 2. RPC start_dm (gate + get-or-create) ----------
create or replace function public.start_dm(p_target_id uuid)
returns public.dm_conversations
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_caller uuid := auth.uid();
  v_user_a uuid;
  v_user_b uuid;
  v_setting text;
  v_conv   public.dm_conversations;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_caller = p_target_id then
    raise exception 'Cannot DM yourself' using errcode = 'P0001';
  end if;
  if is_blocked(v_caller, p_target_id) then
    raise exception 'Blocked' using errcode = 'P0002';
  end if;

  -- Orden canónico (user_a = menor)
  if v_caller < p_target_id then
    v_user_a := v_caller;  v_user_b := p_target_id;
  else
    v_user_a := p_target_id;  v_user_b := v_caller;
  end if;

  -- ¿Conversación existente?
  select * into v_conv from dm_conversations
  where user_a = v_user_a and user_b = v_user_b;

  -- Setting del target
  select coalesce(privacy_settings->>'whoCanDMMe', 'everyone')
  into v_setting
  from users where id = p_target_id;

  -- Gate
  if v_setting = 'nobody' then
    if v_conv is null then
      raise exception 'This user does not accept direct messages' using errcode = 'P0003';
    end if;
    return v_conv;  -- conversación previa → OK
  elsif v_setting = 'followers' then
    if not exists (
      select 1 from follows
      where follower_id = v_caller and following_id = p_target_id
    ) then
      raise exception 'You must follow this user to send a direct message' using errcode = 'P0004';
    end if;
  end if;
  -- 'everyone' (o null/vacío) → permitido

  if v_conv is not null then
    return v_conv;
  end if;

  insert into dm_conversations (user_a, user_b)
  values (v_user_a, v_user_b)
  returning * into v_conv;

  return v_conv;
end;
$$;

grant execute on function public.start_dm(uuid) to authenticated;

-- ---------- 3. RLS de dm_conversations ----------
drop policy if exists "dm_conv_participants" on dm_conversations;

-- SELECT: participante + soft-hide bloqueados.
create policy "dm_conv_read" on dm_conversations
  for select to authenticated
  using (
    (user_a = auth.uid() or user_b = auth.uid())
    and not is_blocked(
      auth.uid(),
      case when user_a = auth.uid() then user_b else user_a end
    )
  );

-- INSERT: SIN policy → denegado por defecto. Solo start_dm (SECURITY DEFINER) inserta.

-- UPDATE: participante (bumps de last_message_at).
create policy "dm_conv_update" on dm_conversations
  for update to authenticated
  using (user_a = auth.uid() or user_b = auth.uid())
  with check (user_a = auth.uid() or user_b = auth.uid());

-- DELETE: sin policy (no hard deletes).

-- ---------- 4. RLS de dm_messages ----------
drop policy if exists "dm_msg_participants_read" on dm_messages;
drop policy if exists "dm_msg_send" on dm_messages;

-- SELECT: participante + soft-hide bloqueados.
create policy "dm_msg_read" on dm_messages
  for select to authenticated
  using (
    exists (
      select 1 from dm_conversations c
      where c.id = dm_messages.conversation_id
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
        and not is_blocked(
          auth.uid(),
          case when c.user_a = auth.uid() then c.user_b else c.user_a end
        )
    )
  );

-- INSERT: sender + participante + no bloqueo.
create policy "dm_msg_send" on dm_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from dm_conversations c
      where c.id = dm_messages.conversation_id
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
        and not is_blocked(
          auth.uid(),
          case when c.user_a = auth.uid() then c.user_b else c.user_a end
        )
    )
  );

-- UPDATE (markRead): solo el RECEPTOR actualiza read_at (mensajes que NO envió él).
create policy "dm_msg_update_read" on dm_messages
  for update to authenticated
  using (
    sender_id <> auth.uid()
    and exists (
      select 1 from dm_conversations c
      where c.id = dm_messages.conversation_id
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  )
  with check (
    sender_id <> auth.uid()
    and exists (
      select 1 from dm_conversations c
      where c.id = dm_messages.conversation_id
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );
