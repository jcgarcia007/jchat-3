-- 203: el disparador de push deja pasar los tipos de Match (faltaban), pedido en curso y regalo.
--      El push del DM se silencia cuando el mensaje es una tarjeta de regalo (ya avisa gift_offer).
-- APLICADA EN PRODUCCIÓN POR PLANNING (2026-10-04). Este archivo solo la versiona.
drop trigger if exists trg_push_on_notification_insert on public.notifications;
create trigger trg_push_on_notification_insert after insert on public.notifications for each row
  when (new.type = any (array['follower','like','comment','work_alert','match_like','match_super','match_match','match_new_people','order_status','gift_offer','gift_response']))
  execute function public.push_on_notification_insert();

drop trigger if exists trg_push_on_dm_insert on public.dm_messages;
create trigger trg_push_on_dm_insert after insert on public.dm_messages for each row
  when (new.gift_offer_id is null)
  execute function public.push_on_dm_insert();
