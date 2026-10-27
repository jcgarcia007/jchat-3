-- 207: gift_offers no está en la publicación supabase_realtime, así que la suscripción postgres_changes de la
-- tarjeta de regalo (GiftCard, filtro id=eq.<oferta>) nunca recibe eventos: ni quien regala ni quien recibe ven el
-- cambio de estado (aceptado / no aceptado / vencido / pagado) sin reabrir el chat.
-- La RLS ya limita la lectura a los participantes (gift_offers_participants_read), que es lo que Realtime aplica.
-- NO APLICADA: pendiente de que Planning la aplique (la app ya refresca la tarjeta cada 5 s como red de seguridad).
alter publication supabase_realtime add table public.gift_offers;
