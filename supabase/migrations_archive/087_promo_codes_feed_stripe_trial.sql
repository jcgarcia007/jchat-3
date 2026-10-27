-- 087 — Los códigos promocionales pasan a ALIMENTAR la prueba de Stripe.
--
-- ANTES (086): redeem_promo_code() otorgaba el plan directamente — sin tarjeta y sin
-- suscripción de Stripe detrás. Dos problemas:
--   (a) SEGURIDAD: cualquier usuario autenticado con un código válido se daba Pro gratis,
--       y nada lo caducaba salvo el gate (ver D-69).
--   (b) INCOHERENCIA: escribía users.plan_trial_end, y el Checkout de Stripe usa
--       justo ese campo para decidir si hay prueba ("solo si nunca tuvo una").
--       Resultado: el código le QUITABA al usuario la prueba real de Stripe.
--
-- AHORA: aquí SOLO se valida (sin consumir, sin otorgar nada). La Edge Function
-- `subscriptions` vuelve a validar server-side al crear el Checkout, usa trial_days
-- como trial_period_days, y marca el código como canjeado cuando el checkout se
-- COMPLETA (no antes: un checkout abandonado no debe quemar el código).

drop function if exists public.redeem_promo_code(text);

create or replace function public.validate_promo_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_promo public.promo_codes%rowtype;
begin
  -- Devuelve {valid:false, reason:...} en vez de lanzar excepción: la UI necesita
  -- mostrar un mensaje claro, no un error técnico.
  if auth.uid() is null then
    return jsonb_build_object('valid', false, 'reason', 'NOT_AUTHENTICATED');
  end if;

  select * into v_promo from public.promo_codes
   where code = upper(btrim(p_code));

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'CODE_NOT_FOUND');
  end if;
  if not v_promo.active then
    return jsonb_build_object('valid', false, 'reason', 'CODE_INACTIVE');
  end if;
  if v_promo.redeemed_by is not null then
    return jsonb_build_object('valid', false, 'reason', 'CODE_ALREADY_USED');
  end if;
  if v_promo.expires_at is not null and v_promo.expires_at <= now() then
    return jsonb_build_object('valid', false, 'reason', 'CODE_EXPIRED');
  end if;

  -- NO consume el código. Solo informa para que la UI muestre qué otorgaría.
  return jsonb_build_object(
    'valid', true,
    'plan', v_promo.plan,
    'trial_days', v_promo.trial_days
  );
end;
$$;

revoke all on function public.validate_promo_code(text) from public;
grant execute on function public.validate_promo_code(text) to authenticated;
