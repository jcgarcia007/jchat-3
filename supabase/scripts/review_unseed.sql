-- JChat — revierte supabase/scripts/review_seed.sql (Fase D2). Lo ejecuta Juan. Borra SOLO lo sembrado: filas con ids d4000000-0000-4000-8000-… y los flags de
-- juegos del local de demo. NO borra: las cuentas reales (@jchatreview, @jchatreview2, @test…), su pertenencia al grupo (se gestiona en /super-admin/review-mode),
-- ni el local, ni el interruptor. Las 4 fotos de Storage (match-photos/demo/review-seed/*) se borran a mano desde el panel de Storage (nunca con SQL).
do $unseed$
declare
  v_biz uuid;
  v_ids constant uuid[] := array[
    'd4000000-0000-4000-8000-000000000301', 'd4000000-0000-4000-8000-000000000302',
    'd4000000-0000-4000-8000-000000000303', 'd4000000-0000-4000-8000-000000000304'];
begin
  select id into v_biz from public.businesses where slug = 'jchat-demo-lounge-y7of';

  delete from public.offers where id::text like 'd4000000-0000-4000-8000-%';
  delete from public.messages where id::text like 'd4000000-0000-4000-8000-%' or user_id = any (v_ids);
  delete from public.menu_items where id::text like 'd4000000-0000-4000-8000-%';
  delete from public.menu_categories where id = 'd4000000-0000-4000-8000-0000000000c1';
  delete from public.match_photos where id::text like 'd4000000-0000-4000-8000-%';
  delete from public.match_presence where user_id = any (v_ids);
  delete from public.game_optins where user_id = any (v_ids);
  delete from public.room_geo_presence where user_id = any (v_ids);
  delete from public.user_interests where user_id = any (v_ids);
  delete from public.match_profiles where user_id = any (v_ids);
  delete from public.review_group_members where user_id = any (v_ids);
  delete from public.users where id = any (v_ids);
  delete from auth.users where id = any (v_ids);
  if v_biz is not null then
    delete from public.business_games where business_id = v_biz and game_key in ('match', 'truth_or_dare');
  end if;
end
$unseed$;
