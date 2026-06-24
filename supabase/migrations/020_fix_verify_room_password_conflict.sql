-- ============================================================
-- JChat 3.0 — Fix: ambigüedad de room_id en verify_room_password (019)
--
-- La migración 019 definió verify_room_password con
--   on conflict (room_id, user_id)
-- en los dos INSERT (room_members y room_access_attempts). El identificador
-- `room_id` del conflict target es AMBIGUO: choca con el parámetro de la función
-- (también llamado room_id), y Postgres aborta con:
--   ERROR 42702: column reference "room_id" is ambiguous
--
-- No se puede renombrar el parámetro: el cliente invoca la RPC por nombre de
-- argumento (`verify_room_password({ room_id, password })`), así que cambiarlo
-- rompería el contrato PostgREST.
--
-- Fix: referenciar el conflict target por NOMBRE DE CONSTRAINT (no por columnas),
-- lo que elimina la ambigüedad sin tocar la firma:
--   - room_members            → on conflict on constraint room_members_pkey
--   - room_access_attempts     → on conflict on constraint room_access_attempts_room_id_user_id_key
--
-- Idempotente: solo un create or replace de la función (sin DDL de tablas).
-- La 019 queda inmutable como registro de lo aplicado; esta 020 la corrige.
-- ============================================================

create or replace function public.verify_room_password(room_id uuid, password text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  _hash text;
  _attempt public.room_access_attempts%rowtype;
begin
  -- 1 — Chequeo de lockout server-side
  select * into _attempt from public.room_access_attempts
    where room_access_attempts.room_id = verify_room_password.room_id
      and user_id = auth.uid();

  if _attempt.locked_until is not null and _attempt.locked_until > now() then
    raise exception 'locked_out' using detail = _attempt.locked_until::text;
  end if;

  -- 2 — Leer hash
  select r.password_hash into _hash from public.rooms r where r.id = room_id;
  if _hash is null then return false; end if;

  -- 3 — Comparar (bcrypt server-side; el cliente nunca ve el hash)
  if extensions.crypt(password, _hash) = _hash then
    -- éxito: crear/renovar membresía 24h y limpiar intentos
    insert into public.room_members (room_id, user_id, expires_at)
      values (verify_room_password.room_id, auth.uid(), now() + interval '24 hours')
    on conflict on constraint room_members_pkey
      do update set expires_at = now() + interval '24 hours';

    delete from public.room_access_attempts
      where room_access_attempts.room_id = verify_room_password.room_id
        and user_id = auth.uid();
    return true;
  end if;

  -- 4 — fallo: incrementar contador, bloquear a los 5
  insert into public.room_access_attempts (room_id, user_id, fail_count, locked_until, updated_at)
    values (
      verify_room_password.room_id, auth.uid(), 1,
      null, now()
    )
  on conflict on constraint room_access_attempts_room_id_user_id_key do update set
    fail_count = public.room_access_attempts.fail_count + 1,
    locked_until = case
      when public.room_access_attempts.fail_count + 1 >= 5
      then now() + interval '30 minutes' else null end,
    updated_at = now();
  return false;
end;
$$;

grant execute on function public.verify_room_password(uuid, text) to authenticated;
