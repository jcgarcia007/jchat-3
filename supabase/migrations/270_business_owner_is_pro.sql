-- 270: public.business_owner_is_pro(p_business_id) — "¿este local tiene las funciones Pro pagadas por su DUEÑO?". NO APLICADA (la aplica Juan Carlos por MCP).
--
-- Las funciones Pro (Analíticas, asistente IA del menú, traducción de descripciones, detalles del plato) las paga el dueño con SU plan. Hoy la web
-- decide con el plan de quien inicia sesión (isBusinessPro()), así que un gerente o empleado de un local Pro no las vería. Esta función responde por
-- el LOCAL: verdadero solo si
--   (a) auth.uid() es el dueño del local, o un empleado ACEPTADO de ESE local (misma regla de pertenencia que is_employee_of_business: employees.status
--       = 'accepted'; no exige un rol concreto), Y
--   (b) el dueño tiene users.plan = 'pro' con plan_status en ('active', 'trialing').
-- En cualquier otro caso (sin sesión, ajeno, empleado pendiente o rechazado, local inexistente, dueño Business/Regular/past_due) devuelve false, sin
-- distinguir entre "no existe" y "no tienes acceso": no revela nada sobre locales ajenos.
--
-- Seguridad: security definer con search_path = public (lee users y employees, que la RLS cerraría); stable; solo `authenticated` puede ejecutarla
-- (revoke a public y a anon). Devuelve un booleano; no expone el plan ni el dueño.
--
-- Nota: replica la regla de plan de la EF menu-assistant (plan = 'pro' y estado active/trialing). No mira plan_trial_end (el layout del dashboard
-- además niega una prueba vencida que sigue en 'trialing'); alinearlo es otra decisión.
--
-- Idempotente y no destructivo: "create or replace"; no toca datos.
--
-- Rollback (solo si hiciera falta; ninguna otra función depende de esta):
--   drop function if exists public.business_owner_is_pro(uuid);
--
-- Verificación:
--   select p.proname, p.prosecdef, p.provolatile, p.proconfig from pg_proc p where p.proname = 'business_owner_is_pro';  -- prosecdef t, provolatile s, search_path=public
--   select has_function_privilege('anon', 'public.business_owner_is_pro(uuid)', 'execute') as anon_exec,
--          has_function_privilege('authenticated', 'public.business_owner_is_pro(uuid)', 'execute') as auth_exec;  -- false / true
--   Prueba por rol (SQL Editor): begin; set local role authenticated; set local request.jwt.claim.sub = '<uuid del usuario>';
--     select public.business_owner_is_pro('<uuid del local>'); rollback;

create or replace function public.business_owner_is_pro(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select u.plan = 'pro' and u.plan_status in ('active', 'trialing')
        from public.businesses b
        join public.users u on u.id = b.owner_id
       where b.id = p_business_id
         and auth.uid() is not null
         and (
           b.owner_id = auth.uid()
           or exists (
             select 1 from public.employees e
              where e.business_id = b.id
                and e.user_id = auth.uid()
                and e.status = 'accepted'
           )
         )
    ),
    false
  );
$$;

revoke all on function public.business_owner_is_pro(uuid) from public;
revoke all on function public.business_owner_is_pro(uuid) from anon;
grant execute on function public.business_owner_is_pro(uuid) to authenticated;
