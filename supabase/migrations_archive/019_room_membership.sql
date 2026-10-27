-- ============================================================
-- JChat 3.0 — P0-1: private rooms are actually private
--
-- Problema: las policies "messages: authenticated read/insert" y
--   "rooms: authenticated read" usaban using(true) → cualquier autenticado
--   podía leer (y escribir) mensajes de CUALQUIER sala, incluidas las
--   is_password_protected. El "unlock" del cliente era cosmético.
--
-- Solución (sistema completo de salas privadas):
--   1. Tabla room_members (membresía temporal de 24h, solo creada por servidor).
--   2. RPC set_room_password  — owner del negocio fija/limpia la contraseña.
--   3. RPC verify_room_password — valida hash server-side y crea membresía.
--   4. RLS de messages: gate por can_access_room() en SELECT e INSERT.
--   5. rooms SELECT se deja legible (para mostrar el candado y pedir password).
--
-- Decisiones de diseño:
--   - Sala SIN contraseña → cualquier authenticated lee.
--   - Sala CON contraseña → solo miembros con expires_at vigente (o el owner).
--   - Membresía TEMPORAL: 24h desde que se pasa la contraseña.
--   - La membresía SOLO la crea el servidor (RPC SECURITY DEFINER).
--   - bcrypt vía extensions.crypt/gen_salt (pgcrypto vive en schema extensions).
--
-- NO aplicada a la BD todavía.
-- ============================================================

-- 1 — Membresía temporal de sala ------------------------------------------------
create table if not exists public.room_members (
  room_id    uuid        not null references public.rooms(id) on delete cascade,
  user_id    uuid        not null references public.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists idx_room_members_expires_at
  on public.room_members (expires_at);

alter table public.room_members enable row level security;

-- El usuario lee SOLO su propia membresía. No hay policy de insert/update/delete
-- para `authenticated`: las RPC SECURITY DEFINER son la única vía de escritura.
drop policy if exists "room_members: select own" on public.room_members;
create policy "room_members: select own"
  on public.room_members for select to authenticated
  using (user_id = auth.uid());

-- 2 — set_room_password: el owner del negocio fija/limpia la contraseña ----------
create or replace function public.set_room_password(room_id uuid, password text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  _business_id uuid;
  _owner_id    uuid;
begin
  -- Resolver el negocio de la sala y su owner.
  select r.business_id into _business_id
  from public.rooms r where r.id = room_id;

  if _business_id is null then
    raise exception 'Room not found';
  end if;

  select b.owner_id into _owner_id
  from public.businesses b where b.id = _business_id;

  if _owner_id is distinct from auth.uid() then
    raise exception 'Not authorized: only the business owner can set a room password';
  end if;

  if password is null or length(trim(password)) = 0 then
    -- Limpiar protección.
    update public.rooms
      set password_hash = null,
          is_password_protected = false
      where id = room_id;
    return true;
  end if;

  -- Hashear con bcrypt (pgcrypto está en el schema extensions).
  update public.rooms
    set password_hash = extensions.crypt(password, extensions.gen_salt('bf')),
        is_password_protected = true
    where id = room_id;

  return true;
end;
$$;

grant execute on function public.set_room_password(uuid, text) to authenticated;

-- 3 — verify_room_password: lockout server-side + valida hash + membresía 24h ---
-- El lockout vive DENTRO de la RPC (no solo en el cliente): por llamada directa
-- a la RPC no se puede hacer fuerza bruta — 5 fallos → bloqueo 30 min.
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
      values (room_id, auth.uid(), now() + interval '24 hours')
    on conflict (room_id, user_id)
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
  on conflict (room_id, user_id) do update set
    fail_count = public.room_access_attempts.fail_count + 1,
    locked_until = case
      when public.room_access_attempts.fail_count + 1 >= 5
      then now() + interval '30 minutes' else null end,
    updated_at = now();
  return false;
end;
$$;

grant execute on function public.verify_room_password(uuid, text) to authenticated;

-- 4 — RLS de messages: gate por membresía --------------------------------------
-- Helper SECURITY DEFINER para legibilidad y para que las RPC internas (lectura
-- de rooms/room_members/businesses) no choquen con la RLS de esas tablas.
create or replace function public.can_access_room(_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.rooms r where r.id = _room_id and (
      r.is_password_protected = false
      or exists (
        select 1 from public.room_members m
        where m.room_id = _room_id and m.user_id = auth.uid()
          and m.expires_at > now()
      )
      or exists (
        select 1 from public.businesses b
        where b.id = r.business_id and b.owner_id = auth.uid()
      )
    )
  );
$$;

grant execute on function public.can_access_room(uuid) to authenticated;

-- Reemplaza el using(true) de SELECT.
drop policy if exists "messages: authenticated read" on public.messages;
create policy "messages: authenticated read"
  on public.messages for select to authenticated
  using (public.can_access_room(room_id));

-- Reemplaza el with check de INSERT (autor propio + acceso a la sala).
drop policy if exists "messages: authenticated insert" on public.messages;
create policy "messages: authenticated insert"
  on public.messages for insert to authenticated
  with check (auth.uid() = user_id and public.can_access_room(room_id));

-- 5 — rooms SELECT: SIN cambios — se deja legible a cualquier authenticated para
--     poder mostrar la sala con candado y pedir la contraseña.
