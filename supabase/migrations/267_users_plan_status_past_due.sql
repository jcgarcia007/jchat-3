-- 267: users.plan_status admite 'past_due'.
--
-- Por qué: la Edge Function `subscriptions` escribe plan_status = 'past_due' (mapStripeStatus, customer.subscription.updated e
-- invoice.payment_failed; index.ts) y el dashboard/billing lo espera, pero users_plan_status_check (baseline 245) solo permitía
-- 'active' | 'trialing' | 'expired' | 'canceled'. Esos UPDATE fallaban con violación de CHECK y, como la EF no miraba el error, el
-- cliente con pago rechazado conservaba el acceso sin que nada lo avisara. (Verificado en producción 2026-11-07: 62 active, 1 trialing,
-- ninguno afectado todavía.)
--
-- Idempotente: solo reemplaza el constraint si existe y su definición NO incluye 'past_due'; si ya lo incluye, no hace nada. Ninguna fila
-- queda inválida (el nuevo conjunto es superconjunto del viejo), así que el add constraint valida sin rechazar datos.
-- Nota: cambiar un CHECK exige quitar el viejo; es la única operación de este tipo y va dentro del bloque protegido (orden expresa de Juan).
--
-- Rollback (solo si hiciera falta; fallaría si ya hay filas past_due):
--   alter table public.users drop constraint users_plan_status_check;
--   alter table public.users add constraint users_plan_status_check check (plan_status in ('active','trialing','expired','canceled'));
--
-- Verificación:
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'users_plan_status_check';
--   → CHECK ((plan_status = ANY (ARRAY['active'::text, 'trialing'::text, 'past_due'::text, 'expired'::text, 'canceled'::text])))

do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conrelid = 'public.users'::regclass
     and conname = 'users_plan_status_check';

  if v_def is not null and v_def not like '%past_due%' then
    alter table public.users drop constraint users_plan_status_check;
    alter table public.users add constraint users_plan_status_check
      check (plan_status in ('active', 'trialing', 'past_due', 'expired', 'canceled'));
  elsif v_def is null then
    alter table public.users add constraint users_plan_status_check
      check (plan_status in ('active', 'trialing', 'past_due', 'expired', 'canceled'));
  end if;
end $$;
