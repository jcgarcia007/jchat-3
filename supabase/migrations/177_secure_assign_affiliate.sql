-- 177: cerrar assign_affiliate_to_user (antes: cualquiera, incluso sin sesión, podía reasignar el afiliado de cualquier usuario)

create or replace function public.assign_affiliate_to_user(p_user_id uuid, p_affiliate_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), '');
  v_uid uuid := auth.uid();
begin
  -- Llamadas del servidor (Edge Functions con service_role) o conexión directa a la base: permitidas
  if v_role = 'service_role' or v_role = '' then
    update public.users set referred_by_affiliate_id = p_affiliate_id where id = p_user_id;
    return;
  end if;

  -- Usuario con sesión: solo sobre sí mismo, solo la primera vez, y solo con un afiliado existente
  if v_uid is null or v_uid <> p_user_id then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.affiliates a where a.id = p_affiliate_id) then
    raise exception 'affiliate_not_found' using errcode = 'P0002';
  end if;

  update public.users
  set referred_by_affiliate_id = p_affiliate_id
  where id = v_uid and referred_by_affiliate_id is null;
end;
$$;

revoke all on function public.assign_affiliate_to_user(uuid, uuid) from public, anon;
grant execute on function public.assign_affiliate_to_user(uuid, uuid) to authenticated, service_role;
