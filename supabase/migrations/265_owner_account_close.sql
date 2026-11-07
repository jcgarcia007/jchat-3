-- 265_owner_account_close.sql — D4: borrado de la cuenta de un dueño = CERRAR sus locales (no borrarlos).
--
-- Decisiones de Juan (2026-11-06): al borrar la cuenta de un dueño sus locales se CIERRAN (ocultos e inactivos, no se borran); pedidos, pagos y recibos
-- se conservan 7 años sin datos personales; reseñas, publicaciones y chat se OCULTAN y se conservan; un local cerrado NO se reabre; los empleados
-- pierden el acceso y reciben aviso; las reservas futuras se cancelan y se avisa al cliente (push + bandeja + correo).
--
-- Qué hace esta migración (todo idempotente y no destructivo; NO aplicada a producción por el asistente: la aplica Juan):
--   1. businesses.owner_id pasa a NULLABLE (un local cerrado ya no tiene dueño). La FK sigue ON DELETE CASCADE: por eso el cierre pone owner_id en NULL
--      ANTES de borrar al usuario (si no, el borrado arrastraría el local y sus pedidos).
--   2. Un trigger impide reabrir: status 'closed' no vuelve a ningún otro valor (ni desde la app, ni desde el dashboard, ni admin_set_business_status).
--   3. business_visible_to(): un local cerrado solo lo ve el super-admin (la política RLS "businesses: public read" ya la usa; "reviews: public read" pasa a usarla).
--   4. public.outbound_emails: cola de correos (RLS sin políticas, solo service_role). La llena owner_close_business en la MISMA transacción;
--      delete-account los entrega con Resend justo después (best effort; lo que falle queda 'pending'/'failed' y se puede reintentar).
--   5. owner_open_orders(p_owner): qué bloquea el borrado (pedidos sin terminar y mesas abiertas), para la pantalla y para delete-account.
--   6. owner_close_business(p_business_id, p_owner): el cierre. Solo service_role.
--   7. Push: el trigger de notifications acepta los tipos nuevos 'business_closed' y 'reservation_cancelled' (send-push los renderiza).
--
-- Rollback (manual, solo si se abandona la función; NO ejecutar con locales ya cerrados). En el SQL Editor:
--   -- drop trigger if exists trg_businesses_no_reopen on public.businesses; drop function if exists public.businesses_no_reopen();
--   -- drop function if exists public.owner_close_business(uuid, uuid); drop function if exists public.owner_open_orders(uuid);
--   -- drop table if exists public.outbound_emails;
--   -- (volver a la versión de 262 de business_visible_to; "reviews: public read" using (true); owner_id NOT NULL solo si no hay locales sin dueño)
--   -- recrear trg_push_on_notification_insert sin los dos tipos nuevos.

-- ───────── 1. owner_id nullable ─────────
alter table public.businesses alter column owner_id drop not null;

-- ───────── 2. Un local cerrado no se reabre ─────────
create or replace function public.businesses_no_reopen() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.status = 'closed' and new.status is distinct from 'closed' then
    raise exception 'closed_business_cannot_reopen' using errcode = 'P0001';
  end if;
  if new.status = 'closed' then
    new.is_active := false;
  end if;
  return new;
end;
$$;

create or replace trigger trg_businesses_no_reopen
  before update on public.businesses
  for each row execute function public.businesses_no_reopen();

-- ───────── 3. Visibilidad: un local cerrado no lo ve nadie salvo el super-admin ─────────
-- Misma función de 262 + la condición del cierre. Seguirá siendo la que usa la política "businesses: public read".
create or replace function public.business_visible_to(p_business_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select (
      not exists (select 1 from public.businesses c where c.id = p_business_id and c.status = 'closed')
      or public.is_platform_admin()
    )
    and (
      not public.review_is_group_business(p_business_id)
      or public.review_member_sees(p_business_id)
      or exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = auth.uid())
      or public.is_platform_admin()
    )
$$;

-- Las reseñas de un local cerrado quedan ocultas para todos (se conservan en la tabla). Antes la política era "using (true)".
alter policy "reviews: public read" on public.reviews using (public.business_visible_to(business_id));

-- ───────── 4. Cola de correos ─────────
create table if not exists public.outbound_emails (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,
  user_id     uuid references auth.users (id) on delete set null,
  payload     jsonb not null default '{}'::jsonb,
  status      text not null default 'pending',
  attempts    integer not null default 0,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.outbound_emails'::regclass and conname = 'outbound_emails_status_chk') then
    alter table public.outbound_emails
      add constraint outbound_emails_status_chk check (status in ('pending', 'sent', 'failed', 'skipped'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.outbound_emails'::regclass and conname = 'outbound_emails_kind_chk') then
    alter table public.outbound_emails
      add constraint outbound_emails_kind_chk check (kind in ('reservation_cancelled_business_closed'));
  end if;
end $$;

create index if not exists outbound_emails_pending_idx on public.outbound_emails (created_at) where status = 'pending';

alter table public.outbound_emails enable row level security;
revoke all on public.outbound_emails from anon, authenticated;
grant select, insert, update, delete on public.outbound_emails to service_role;

-- ───────── 5. Qué bloquea el borrado ─────────
-- Pedidos sin terminar (pending/confirmed/preparing/ready) y mesas abiertas, por local, de los locales que el usuario TODAVÍA posee.
-- Un usuario normal solo puede preguntar por sí mismo; service_role (delete-account) por cualquiera.
create or replace function public.owner_open_orders(p_owner uuid)
returns table (business_id uuid, business_name text, kind text, n bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and auth.uid() is distinct from p_owner then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select b.id, b.name, 'orders'::text, count(*)::bigint
      from public.businesses b
      join public.orders o on o.business_id = b.id
     where b.owner_id = p_owner and b.status <> 'closed'
       and o.status in ('pending', 'confirmed', 'preparing', 'ready')
     group by b.id, b.name
    union all
    select b.id, b.name, 'tabs'::text, count(*)::bigint
      from public.businesses b
      join public.table_tabs t on t.business_id = b.id
     where b.owner_id = p_owner and b.status <> 'closed'
       and t.status = 'open'
     group by b.id, b.name;
end;
$$;

revoke all on function public.owner_open_orders(uuid) from public, anon;
grant execute on function public.owner_open_orders(uuid) to authenticated, service_role;

-- ───────── 6. El cierre de UN local ─────────
-- Idempotente: si el local ya está cerrado y sin dueño devuelve {already:true} sin tocar nada (reintento tras un fallo a mitad).
-- Conserva orders, order_items, pos_payments, recibos y todo el historial. No borra nada salvo las presencias y opt-ins de juegos.
create or replace function public.owner_close_business(p_business_id uuid, p_owner uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  b           public.businesses%rowtype;
  v_emp       int := 0;
  v_res       int := 0;
  v_email_ids uuid[] := '{}';
  r           record;
  v_email_id  uuid;
begin
  select * into b from public.businesses where id = p_business_id for update;
  if not found then
    raise exception 'business_not_found' using errcode = 'P0002';
  end if;
  if b.status = 'closed' and b.owner_id is null then
    return jsonb_build_object('already', true, 'business_id', p_business_id, 'email_ids', '[]'::jsonb);
  end if;
  if b.owner_id is distinct from p_owner then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  if exists (select 1 from public.orders o where o.business_id = p_business_id and o.status in ('pending', 'confirmed', 'preparing', 'ready'))
     or exists (select 1 from public.table_tabs t where t.business_id = p_business_id and t.status = 'open') then
    raise exception 'owner_open_orders' using errcode = 'P0001';
  end if;

  -- El local: cerrado, inactivo, sin dueño, sin cobros. (El trigger fuerza is_active=false y prohíbe reabrir.)
  update public.businesses
     set status = 'closed', is_active = false, owner_id = null,
         menu_enabled = false, tips_enabled = false, pickup_enabled = false,
         stripe_charges_enabled = false, stripe_payouts_enabled = false, stripe_details_submitted = false,
         updated_at = now()
   where id = p_business_id;

  -- Menú, mesas, salas y ofertas desactivados (no borrados).
  update public.rooms set is_active = false where business_id = p_business_id and is_active;
  update public.tables set is_active = false where business_id = p_business_id and is_active;
  update public.menu_items set is_available = false where business_id = p_business_id and is_available;
  update public.offers set is_active = false where business_id = p_business_id and is_active;

  -- Reseñas, publicaciones, comentarios y chat: OCULTOS y conservados.
  update public.reviews set status = 'hidden' where business_id = p_business_id and status = 'visible';
  update public.posts set hidden_at = now() where business_id = p_business_id and hidden_at is null;
  update public.comments set hidden_at = now()
   where hidden_at is null and post_id in (select p.id from public.posts p where p.business_id = p_business_id);
  update public.messages set hidden_at = now()
   where hidden_at is null and room_id in (select ro.id from public.rooms ro where ro.business_id = p_business_id);

  -- Presencias y opt-ins de juegos del local (Match, Verdad o Reto): fuera.
  delete from public.match_presence where business_id = p_business_id;
  delete from public.game_optins where business_id = p_business_id;

  -- Empleados: pierden el acceso (sus cuentas no se tocan) y reciben el aviso.
  for r in
    select e.id, e.user_id, e.status from public.employees e
     where e.business_id = p_business_id and e.status <> 'removed' and e.user_id is distinct from p_owner
  loop
    update public.employees set status = 'removed' where id = r.id;
    if r.status in ('accepted', 'active') then
      insert into public.notifications (user_id, type, payload)
      values (r.user_id, 'business_closed', jsonb_build_object('business_id', p_business_id, 'business_name', b.name));
      v_emp := v_emp + 1;
    end if;
  end loop;

  -- Reservas futuras: canceladas; el cliente (si tiene cuenta) recibe notificación y se encola su correo. Sin datos del dueño.
  for r in
    select rs.id, rs.user_id, rs.reserved_at from public.reservations rs
     where rs.business_id = p_business_id and rs.reserved_at > now()
       and rs.status not in ('cancelled', 'no_show', 'arrived', 'completed')
  loop
    update public.reservations set status = 'cancelled' where id = r.id;
    v_res := v_res + 1;
    if r.user_id is not null then
      insert into public.notifications (user_id, type, payload)
      values (r.user_id, 'reservation_cancelled',
              jsonb_build_object('business_id', p_business_id, 'business_name', b.name, 'reservation_id', r.id, 'reserved_at', r.reserved_at));
      insert into public.outbound_emails (kind, user_id, payload)
      values ('reservation_cancelled_business_closed', r.user_id,
              jsonb_build_object('business_name', b.name, 'reserved_at', r.reserved_at, 'reservation_id', r.id))
      returning id into v_email_id;
      v_email_ids := v_email_ids || v_email_id;
    end if;
  end loop;

  insert into public.security_logs (actor_id, action, target_type, target_id, detail)
  values (null, 'owner_closed_business', 'business', p_business_id,
          format('Owner account deletion: venue closed (employees notified: %s, reservations cancelled: %s)', v_emp, v_res));

  return jsonb_build_object('already', false, 'business_id', p_business_id, 'business_name', b.name,
                            'employees_notified', v_emp, 'reservations_cancelled', v_res, 'email_ids', to_jsonb(v_email_ids));
end;
$$;

revoke all on function public.owner_close_business(uuid, uuid) from public, anon, authenticated;
grant execute on function public.owner_close_business(uuid, uuid) to service_role;

-- ───────── 7. Push de los tipos nuevos ─────────
-- Mismo trigger de 245 con los dos tipos nuevos al final de la lista (CREATE OR REPLACE: idempotente). send-push los renderiza.
create or replace trigger trg_push_on_notification_insert
  after insert on public.notifications
  for each row
  when (new.type = any (array['follower', 'like', 'comment', 'work_alert', 'match_like', 'match_super', 'match_match', 'match_new_people',
                               'order_status', 'gift_offer', 'gift_response', 'business_closed', 'reservation_cancelled']))
  execute function public.push_on_notification_insert();

comment on function public.owner_close_business(uuid, uuid) is
  'D4: closes one venue when its owner deletes the account (hidden, inactive, ownerless; orders/payments kept). service_role only.';
