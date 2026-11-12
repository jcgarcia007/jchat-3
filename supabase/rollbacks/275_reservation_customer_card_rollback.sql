-- ROLLBACK de 275_reservation_customer_card (destructivo: borra la función). Juan lo aplica a mano en el SQL Editor.
drop function if exists public.reservation_customer_card(uuid);
