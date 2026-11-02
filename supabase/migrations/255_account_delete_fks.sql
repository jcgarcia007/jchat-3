-- 255: poder borrar la cuenta. NO APLICADA (la aplica Juan Carlos por MCP, tras auditoría).
-- Reversión: supabase/rollbacks/255_account_delete_fks_rollback.sql · Comprobación: supabase/scripts/255_check.sql
--
-- Problema (prueba de tiendas, B2-1, P0): la función delete-account hace auth.admin.deleteUser(), que borra auth.users y, en cascada,
-- public.users. Cinco claves foráneas a public.users(id) eran ON DELETE SET NULL sobre columnas NOT NULL, así que Postgres no podía
-- poner NULL y abortaba TODO el borrado ("Database error deleting user"). Cualquier persona que hubiera escrito un mensaje en un chat
-- (o fijado un mensaje, o abierto una disputa) no podía borrar su cuenta (Apple 5.1.1(v), Google Play).
--
-- Decisión de Juan Carlos:
--  * messages.user_id, pinned_messages.pinned_by, disputes.opened_by  → ON DELETE CASCADE (siguen NOT NULL). Los mensajes de chat, los
--    anclajes y las disputas abiertas por la cuenta se borran con ella.
--  * gifts.from_user, gifts.to_user → se quita el NOT NULL y se deja ON DELETE SET NULL: hay dinero y el registro se conserva; la otra
--    parte ve "Usuario eliminado" donde antes veía a la persona (ver lista de pantallas en el informe de la rama).
--
-- Dónde habrá que mostrar "Usuario eliminado" cuando gifts.from_user / gifts.to_user vengan NULL (anotado, SIN corregir en esta rama):
--  * mobile/services/gifts.ts: el tipo Gift (from_user / to_user: string) pasa a string | null; getReceivedGifts() hace join con el perfil de
--    from_user y getSentGifts() lee to_user → el sender / destinatario puede venir null.
--  * mobile/screens/profile/GiftsReceivedScreen.tsx (único consumidor de getReceivedGifts; la pantalla no tiene ruta hoy): la tarjeta de cada regalo
--    debe mostrar "Usuario eliminado" cuando el remitente es null.
--  * getSentGifts() y sendGift() no tienen consumidores hoy (los regalos nuevos usan gift_offers, que no cambia).
--  * mobile/services/database.types.ts y web/lib/database.types.ts: regenerar los tipos (from_user / to_user: string | null).
--  * Dashboard web: ninguna página lee gifts.from_user / gifts.to_user. RLS: "gifts: sender or recipient read" sigue válida (NULL nunca coincide con auth.uid()).
--
-- Otros bloqueos que esta migración NO toca (siguen siendo NO ACTION): affiliate_commissions.user_id, affiliate_payouts.created_by, affiliates.created_by,
-- businesses.verified_by, pos_payments.paid_by, stock_movements.created_by. Una cuenta con filas ahí (personal de caja, administradores, afiliados) seguirá sin
-- poder borrarse. Consulta (d) de supabase/scripts/255_check.sql.
--
-- Idempotente y no destructivo para los datos (solo cambia la acción de borrado de 3 claves y relaja un NOT NULL):
--  * cada clave se vuelve a crear solo si NO es ya CASCADE (se consulta pg_constraint) y, si falta del todo, se crea;
--  * "drop not null" sobre una columna que ya admite NULL no hace nada.
-- Efecto sobre filas existentes: ninguno (la clave nueva valida los mismos valores que la anterior). Bloqueo breve de las tablas
-- mientras se recrea cada clave.
--
-- Reversión descrita (detalle en el archivo de rollback): volver las tres claves a SET NULL reproduce el defecto (el borrado de cuentas con
-- mensajes vuelve a fallar); volver gifts.* a NOT NULL solo es posible si no hay filas con NULL (si las hay, el rollback se detiene).

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'messages_user_id_fkey' and conrelid = 'public.messages'::regclass and confdeltype <> 'c') then
    alter table public.messages drop constraint messages_user_id_fkey;
    alter table public.messages add constraint messages_user_id_fkey foreign key (user_id) references public.users(id) on delete cascade;
  elsif not exists (select 1 from pg_constraint where conname = 'messages_user_id_fkey' and conrelid = 'public.messages'::regclass) then
    alter table public.messages add constraint messages_user_id_fkey foreign key (user_id) references public.users(id) on delete cascade;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'pinned_messages_pinned_by_fkey' and conrelid = 'public.pinned_messages'::regclass and confdeltype <> 'c') then
    alter table public.pinned_messages drop constraint pinned_messages_pinned_by_fkey;
    alter table public.pinned_messages add constraint pinned_messages_pinned_by_fkey foreign key (pinned_by) references public.users(id) on delete cascade;
  elsif not exists (select 1 from pg_constraint where conname = 'pinned_messages_pinned_by_fkey' and conrelid = 'public.pinned_messages'::regclass) then
    alter table public.pinned_messages add constraint pinned_messages_pinned_by_fkey foreign key (pinned_by) references public.users(id) on delete cascade;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'disputes_opened_by_fkey' and conrelid = 'public.disputes'::regclass and confdeltype <> 'c') then
    alter table public.disputes drop constraint disputes_opened_by_fkey;
    alter table public.disputes add constraint disputes_opened_by_fkey foreign key (opened_by) references public.users(id) on delete cascade;
  elsif not exists (select 1 from pg_constraint where conname = 'disputes_opened_by_fkey' and conrelid = 'public.disputes'::regclass) then
    alter table public.disputes add constraint disputes_opened_by_fkey foreign key (opened_by) references public.users(id) on delete cascade;
  end if;
end $$;

-- Dinero: el registro se conserva cuando se borra a una de las dos personas (la clave sigue siendo ON DELETE SET NULL).
alter table public.gifts alter column from_user drop not null;
alter table public.gifts alter column to_user drop not null;

comment on column public.gifts.from_user is 'Quien envía. NULL si esa cuenta se borró (el registro se conserva por el dinero); la UI muestra "Usuario eliminado".';
comment on column public.gifts.to_user is 'Quien recibe. NULL si esa cuenta se borró (el registro se conserva por el dinero); la UI muestra "Usuario eliminado".';
