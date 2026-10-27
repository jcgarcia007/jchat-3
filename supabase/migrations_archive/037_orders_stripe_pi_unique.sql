-- 037 — FIX #8 (Tanda 3): endurece la idempotencia del webhook de órdenes con un
-- UNIQUE a nivel BD sobre orders.stripe_pi_id. Es PARCIAL (WHERE stripe_pi_id IS NOT
-- NULL) porque hay órdenes legítimas sin PI (demo/gratis/POS efectivo) y no deben
-- colisionar entre sí. Tabla vacía hoy → creación instantánea, sin CONCURRENTLY.
create unique index if not exists orders_stripe_pi_id_uniq
  on public.orders (stripe_pi_id)
  where stripe_pi_id is not null;
