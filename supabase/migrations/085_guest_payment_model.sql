-- 085: pago de invitado (G1) — modelo de datos y redes de seguridad.
-- Ver docs/MESAS_Y_TAPS.md (plan C) y D-39 (por qué EF pública + hCaptcha, no sesión anónima).
--
-- Tres minas del reconocimiento se desactivan aquí:
--   (a) pending_order_carts.user_id era NOT NULL → un invitado no tiene fila en users.
--   (b) los carritos abandonados no se purgaban nunca.
--   (c) un pago que no se puede convertir en pedido se perdía en un log → tabla propia.

begin;

-- ── (a) el carrito admite invitado (user_id NULL) ───────────────────────────
-- La FK a users(id) se queda: con NULL no aplica. orders.user_id ya es nullable (080).
alter table public.pending_order_carts
  alter column user_id drop not null;

-- ── (b) purga de carritos abandonados ───────────────────────────────────────
-- El webhook borra el carrito al crear el pedido, así que a las 24h solo quedan los
-- de pagos ABANDONADOS (el cliente cerró la página sin pagar). 24h es holgado: no hay
-- flujo legítimo que tarde tanto entre crear el PaymentIntent y pagarlo — el pago es
-- una sola sesión de checkout de minutos.
create or replace function public.purge_stale_pending_carts()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_deleted int;
begin
  delete from public.pending_order_carts
  where created_at < now() - interval '24 hours';
  get diagnostics v_deleted = row_count;
  raise log '[purge_stale_pending_carts] deleted % stale carts', v_deleted;
  return v_deleted;
end $$;

revoke execute on function public.purge_stale_pending_carts() from public, anon, authenticated;

-- Diaria a las 04:30 UTC (baja carga). Idempotente: desprograma antes de programar.
do $$
begin
  perform cron.unschedule('purge-stale-pending-carts');
exception when others then
  null;
end $$;

select cron.schedule(
  'purge-stale-pending-carts',
  '30 4 * * *',
  $$select public.purge_stale_pending_carts()$$
);

-- ── (c) red de seguridad: pagos huérfanos ───────────────────────────────────
-- Un pago que NO se puede convertir en pedido (sin negocio, o metadata inesperada)
-- queda REGISTRADO y recuperable en vez de perderse en un log. El dinero ya se cobró
-- en Stripe: esto es lo que permite reconciliarlo a mano.
create table if not exists public.orphan_payments (
  id           uuid primary key default gen_random_uuid(),
  stripe_pi_id text not null unique,
  business_id  uuid references public.businesses(id) on delete set null,
  amount_cents int,
  metadata     jsonb,
  reason       text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_orphan_payments_created on public.orphan_payments (created_at);

revoke all on table public.orphan_payments from anon, authenticated;
grant select on table public.orphan_payments to authenticated;  -- lectura vía RLS
-- Sin INSERT/UPDATE/DELETE: solo service_role (el webhook) escribe.

alter table public.orphan_payments enable row level security;

-- SELECT: solo el dueño del negocio (si se pudo atribuir) o un admin de plataforma.
create policy "orphan_payments: owner/admin read"
  on public.orphan_payments for select to authenticated
  using (
    public.is_platform_admin()
    or (business_id is not null and exists (
          select 1 from public.businesses b
          where b.id = orphan_payments.business_id and b.owner_id = auth.uid()))
  );

commit;
