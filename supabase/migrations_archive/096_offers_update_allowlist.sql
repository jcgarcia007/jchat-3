-- 096_offers_update_allowlist
-- D-54 Batch 2: offers tenía UPDATE de tabla completa a authenticated (19 cols). El dashboard
-- (web/app/dashboard/offers/page.tsx) solo hace UPDATE { status } (pausar/reanudar); crear es INSERT.
-- Los contadores redemption_count/views/taps se incrementan server-side (RPC definer/service_role),
-- nunca por authenticated (la RLS de offers es solo-dueño). Restringir UPDATE a (status); bloquear el
-- resto, en especial los contadores y las columnas de identidad/auditoría.
revoke update on public.offers from authenticated;
grant update (status) on public.offers to authenticated;
