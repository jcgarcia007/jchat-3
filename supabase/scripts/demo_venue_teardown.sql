-- JChat Demo — REVERSIÓN de supabase/scripts/demo_venue_seed.sql. NO ES UNA MIGRACIÓN: la ejecuta Juan Carlos por MCP.
-- Borra SOLO lo que creó el seed (ids fijos d3000000-…) y puede ejecutarse varias veces sin error. No toca la cuenta del revisor
-- (ni su plan ni su perfil): si quieres devolverle el plan, hazlo a mano (update public.users set plan = 'regular' where id = '<su id>').
-- Borra, por este orden: pedidos/regalos/reportes que cuelguen del local de demo (por si el revisor probó), mensajes, mesas, productos, categorías,
-- sala, local y las 4 personas ficticias.

do $teardown$
declare
  v_biz constant uuid := 'd3000000-0000-4000-8000-000000000001';
begin
  -- what a reviewer may have created while testing, tied to the demo venue
  delete from public.order_items where order_id in (select id from public.orders where business_id = v_biz);
  delete from public.orders where business_id = v_biz;
  delete from public.gift_offers where business_id = v_biz;
  delete from public.reports where business_id = v_biz;
  delete from public.messages where room_id in (select id from public.rooms where business_id = v_biz);
  delete from public.room_geo_presence where room_id in (select id from public.rooms where business_id = v_biz);
  delete from public.room_members where room_id in (select id from public.rooms where business_id = v_biz);

  delete from public.match_presence where business_id = v_biz;
  delete from public.game_optins where business_id = v_biz;
  delete from public.business_games where business_id = v_biz;
  delete from public.tables where business_id = v_biz;
  delete from public.menu_items where business_id = v_biz;
  delete from public.menu_categories where business_id = v_biz;
  delete from public.rooms where business_id = v_biz;
  delete from public.businesses where id = v_biz;

  -- the four fictional people (only the ones the seed made: fixed ids AND is_test)
  delete from public.users where id in (
    'd3000000-0000-4000-8000-000000000301', 'd3000000-0000-4000-8000-000000000302',
    'd3000000-0000-4000-8000-000000000303', 'd3000000-0000-4000-8000-000000000304') and is_test;
  delete from auth.users where id in (
    'd3000000-0000-4000-8000-000000000301', 'd3000000-0000-4000-8000-000000000302',
    'd3000000-0000-4000-8000-000000000303', 'd3000000-0000-4000-8000-000000000304');
end
$teardown$;
