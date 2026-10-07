-- 208: quien regala puede cancelar su oferta ANTES de que el otro la vea (draft / awaiting_payment),
--      p. ej. al cerrar la hoja de pago sin pagar. Libera el bloqueo de "ya tienes un regalo esperando".
--      Si ya había PaymentIntent, el trigger existente avisa a gift-worker para cancelarlo.
-- APLICADA EN PRODUCCIÓN POR PLANNING (2026-10-07). Este archivo solo la versiona.
create or replace function public.gift_offer_cancel(p_offer_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.gift_offers%rowtype;
begin
  select * into g from public.gift_offers where id = p_offer_id for update;
  if g.id is null or g.from_user_id <> auth.uid() then raise exception 'not_your_gift' using errcode = '42501'; end if;
  if g.status not in ('draft','awaiting_payment') then return jsonb_build_object('status', g.status, 'cancelled', false); end if;
  update public.gift_offers set status = 'cancelled' where id = g.id;
  return jsonb_build_object('status', 'cancelled', 'cancelled', true);
end;
$$;
revoke all on function public.gift_offer_cancel(uuid) from public, anon;
grant execute on function public.gift_offer_cancel(uuid) to authenticated;
