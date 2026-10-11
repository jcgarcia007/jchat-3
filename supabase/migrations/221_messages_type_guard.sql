-- Versionada tal cual está en producción (supabase_migrations.schema_migrations, versión 20261011002547). APLICADA 2026-10-11.
-- 221 (Truth or Dare, fase 0): un cliente no puede falsificar mensajes del sistema ni del juego.
-- Desde el cliente (auth.uid() no nulo) se rechaza: type 'system' o 'tod_*', is_system = true, y cambiar type/is_system en un UPDATE.
-- Las funciones de servidor del juego (security definer) marcan set_config('jchat.trusted_message','on', true) para insertar esos tipos.
-- service_role y cron (auth.uid() nulo) no se ven afectados. Hoy no hay ninguna función de BD que inserte en messages.
-- Rollback (SQL Editor): drop trigger trg_messages_type_guard on public.messages; drop function public.messages_type_guard();
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
  end if;
  return new;
end;
$$;
create or replace trigger trg_messages_type_guard before insert or update on public.messages
  for each row execute function public.messages_type_guard();
