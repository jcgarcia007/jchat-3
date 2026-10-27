-- 174: RPC para actualizar users.settings SIN pisar las otras preferencias

create or replace function public.update_my_settings(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_val jsonb;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'invalid_patch' using errcode = '22023';
  end if;

  -- Validar clave por clave (lista permitida + tipo/valor)
  for v_key, v_val in select * from jsonb_each(p_patch) loop
    case v_key
      when 'notifWork', 'notifSocial' then
        if jsonb_typeof(v_val) <> 'boolean' then
          raise exception 'invalid_value_for_%', v_key using errcode = '22023';
        end if;
      when 'proximityMode' then
        if jsonb_typeof(v_val) <> 'string'
           or (v_val #>> '{}') not in ('all', 'favorites', 'visited', 'off') then
          raise exception 'invalid_value_for_%', v_key using errcode = '22023';
        end if;
      when 'appearance' then
        if jsonb_typeof(v_val) <> 'string'
           or (v_val #>> '{}') not in ('dark', 'light', 'system') then
          raise exception 'invalid_value_for_%', v_key using errcode = '22023';
        end if;
      else
        raise exception 'unknown_setting_%', v_key using errcode = '22023';
    end case;
  end loop;

  update public.users
  set settings = coalesce(settings, '{}'::jsonb) || p_patch
  where id = v_uid
  returning settings into v_result;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.update_my_settings(jsonb) from public, anon;
grant execute on function public.update_my_settings(jsonb) to authenticated;
