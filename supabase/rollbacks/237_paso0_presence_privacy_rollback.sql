-- 237 ROLLBACK — deshace supabase/migrations_archive/237_paso0_presence_privacy.sql.
-- BORRADOR: NO se ha ejecutado. Lo ejecuta Juan en el SQL Editor solo si hay que volver atrás. NO está en migrations/ a
-- propósito (el CLI aplicaría cualquier archivo de esa carpeta, incluso uno de reversión).
-- Es destructivo por naturaleza (borra funciones, una tabla y una columna): leer cada paso antes de ejecutarlo.
-- Si ya se aplicó 238, ejecutar ANTES 238_destructive_rollback.sql.
-- Orden: de lo último creado a lo primero.

-- ── BLOQUE 3 — reservas ──────────────────────────────────────────────────────────────────────────────────────────
drop function if exists public.reservation_slot_load(uuid, timestamptz);
drop trigger if exists reservations_customer_guard on public.reservations;
drop function if exists public.reservations_customer_guard();
drop policy if exists reservations_customer_update on public.reservations;
drop policy if exists reservations_customer_insert on public.reservations;
drop policy if exists reservations_customer_select on public.reservations;
drop policy if exists reservations_owner_all on public.reservations;
-- La política original reservations_customer NO se recrea aquí: es el rollback de la 238 (238_destructive_rollback.sql).
-- La capacidad: se quita el permiso, la regla y la columna (SE PIERDEN los valores que los dueños hayan puesto).
revoke update (reservation_capacity) on public.businesses from authenticated;
alter table public.businesses drop constraint if exists businesses_reservation_capacity_chk;
alter table public.businesses drop column if exists reservation_capacity;

-- ── BLOQUE 2 — salida confirmada ─────────────────────────────────────────────────────────────────────────────────
select cron.unschedule('venue-exits-purge') where exists (select 1 from cron.job where jobname = 'venue-exits-purge');
-- Las ocultaciones por salida viven en columnas propias: al quitarlas, nadie queda oculto (hidden_at manual intacto).
alter table public.dm_conversations drop column if exists exit_hidden_at_a;
alter table public.dm_conversations drop column if exists exit_hidden_at_b;
drop function if exists public.venue_exits_purge();
drop function if exists public.venue_session_resume(uuid);
drop function if exists public.venue_session_end(uuid, text);
drop function if exists public.match_wipe_user_venue_keep_dms(uuid, uuid);
drop table if exists public.venue_exits;
-- Lo que venue_exits_purge ya BORRÓ (DMs efímeros, datos de Match) no se puede recuperar: no hay copia.

-- ── BLOQUE 1 — conteo ────────────────────────────────────────────────────────────────────────────────────────────
drop function if exists public.venue_people_counts(uuid[]);

notify pgrst, 'reload schema';
