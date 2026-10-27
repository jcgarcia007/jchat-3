-- 206: start_dm no reconocía conversaciones existentes. "v_conv is not null" sobre un registro completo solo es
-- verdadero si TODAS sus columnas tienen valor; con columnas nuevas vacías (ephemeral_business_id, hidden_at_*, etc.)
-- daba falso, intentaba insertar y chocaba con el índice único (409). Se compara por id.
-- APLICADA EN PRODUCCIÓN POR PLANNING (2026-10-06). Este archivo solo la versiona.
create or replace function public.start_dm(p_target_id uuid)
returns dm_conversations language plpgsql security definer set search_path to 'public' as $function$
declare v_caller uuid := auth.uid(); v_user_a uuid; v_user_b uuid; v_setting text; v_conv public.dm_conversations;
begin
  if v_caller is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if v_caller = p_target_id then raise exception 'Cannot DM yourself' using errcode = 'P0001'; end if;
  if is_blocked(v_caller, p_target_id) then raise exception 'Blocked' using errcode = 'P0002'; end if;
  if v_caller < p_target_id then v_user_a := v_caller; v_user_b := p_target_id; else v_user_a := p_target_id; v_user_b := v_caller; end if;
  select * into v_conv from dm_conversations where user_a = v_user_a and user_b = v_user_b;
  select coalesce(privacy_settings->>'whoCanDMMe', 'everyone') into v_setting from users where id = p_target_id;
  if v_setting = 'nobody' then
    if v_conv.id is null then raise exception 'This user does not accept direct messages' using errcode = 'P0003'; end if;
    return v_conv;
  elsif v_setting = 'followers' then
    if not exists (select 1 from follows where follower_id = v_caller and following_id = p_target_id) then
      raise exception 'You must follow this user to send a direct message' using errcode = 'P0004';
    end if;
  end if;
  if v_conv.id is not null then return v_conv; end if;
  insert into dm_conversations (user_a, user_b) values (v_user_a, v_user_b)
  on conflict (user_a, user_b) do update set user_a = excluded.user_a
  returning * into v_conv;
  return v_conv;
end;
$function$;
