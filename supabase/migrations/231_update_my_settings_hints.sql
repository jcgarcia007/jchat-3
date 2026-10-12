-- 231 — update_my_settings: one-time UI hints (users.settings.hints.*)
-- Adds the 'hints' key to the allow-list. Value: an object whose keys are known hint names with boolean values.
-- 'hints' is deep-merged (other hints are kept), every other key keeps the shallow merge as before.
-- Everything else in the function is unchanged. CREATE OR REPLACE keeps the existing grants.

create or replace function public.update_my_settings(p_patch jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_val jsonb;
  v_hint_key text;
  v_hint_val jsonb;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'invalid_patch' using errcode = '22023'; end if;

  for v_key, v_val in select * from jsonb_each(p_patch) loop
    case v_key
      when 'notifWork', 'notifSocial', 'gamesEnabled', 'matchNotifyNewPeople' then
        if jsonb_typeof(v_val) <> 'boolean' then raise exception 'invalid_value_for_%', v_key using errcode = '22023'; end if;
      when 'proximityMode' then
        if jsonb_typeof(v_val) <> 'string' or (v_val #>> '{}') not in ('all','favorites','visited','off') then raise exception 'invalid_value_for_%', v_key using errcode = '22023'; end if;
      when 'appearance' then
        if jsonb_typeof(v_val) <> 'string' or (v_val #>> '{}') not in ('dark','light','system') then raise exception 'invalid_value_for_%', v_key using errcode = '22023'; end if;
      when 'feedRadiusMiles' then
        if jsonb_typeof(v_val) <> 'number' or (v_val #>> '{}') not in ('5','10','25','50','100') then raise exception 'invalid_value_for_%', v_key using errcode = '22023'; end if;
      when 'pushPreviewDm', 'pushPreviewMatch' then
        if jsonb_typeof(v_val) <> 'string' or (v_val #>> '{}') not in ('full','name','discreet') then raise exception 'invalid_value_for_%', v_key using errcode = '22023'; end if;
      when 'matchAgeMin', 'matchAgeMax' then
        if jsonb_typeof(v_val) <> 'number' or (v_val #>> '{}')::numeric < 18 or (v_val #>> '{}')::numeric > 99 then raise exception 'invalid_value_for_%', v_key using errcode = '22023'; end if;
      when 'hints' then
        if jsonb_typeof(v_val) <> 'object' then raise exception 'invalid_value_for_%', v_key using errcode = '22023'; end if;
        for v_hint_key, v_hint_val in select * from jsonb_each(v_val) loop
          if v_hint_key not in ('profileMenuSeen') then raise exception 'unknown_hint_%', v_hint_key using errcode = '22023'; end if;
          if jsonb_typeof(v_hint_val) <> 'boolean' then raise exception 'invalid_value_for_hints.%', v_hint_key using errcode = '22023'; end if;
        end loop;
      else
        raise exception 'unknown_setting_%', v_key using errcode = '22023';
    end case;
  end loop;

  update public.users u
     set settings = (coalesce(u.settings, '{}'::jsonb) || (p_patch - 'hints'))
                    || case when p_patch ? 'hints' then
                         jsonb_build_object('hints',
                           (case when jsonb_typeof(u.settings -> 'hints') = 'object' then u.settings -> 'hints' else '{}'::jsonb end)
                           || (p_patch -> 'hints'))
                       else '{}'::jsonb end
   where u.id = v_uid
  returning u.settings into v_result;
  return coalesce(v_result, '{}'::jsonb);
end;
$function$;
