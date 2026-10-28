-- Security attacks against the LOCAL database, as real roles (anon / authenticated with a JWT subject), through the same RLS + grants PostgREST applies.
-- Each attack is run twice: BEFORE the draft migration 248 (where a known flaw must still be there — the test says so — and everything else must
-- already be blocked) and AFTER it (`-- @apply`, inside this rolled-back transaction: nothing is applied for real; everything must be blocked).
-- When 248 is applied in production and merged, delete the BEFORE phase (it asserts the flaws still exist).
--
-- users: u1 owner of the venue · u2 customer (private account) · u3 friend (blocked by u2) · u4 attacker, NOT in the venue, follows nobody.
-- The detail column of every result shows what the database answered, so a refusal for the wrong reason (a typo) is visible.
do $setup$
declare
  biz constant uuid := pg_temp.seed_venue();
  u1 uuid := pg_temp.uid(1); u2 uuid := pg_temp.seed_user(2); u3 uuid := pg_temp.seed_user(3); u4 uuid := pg_temp.seed_user(4);
  conv uuid; ord uuid; offer uuid; msg uuid; story uuid; tbl uuid;
begin
  create temp table t_ids (k text primary key, v text) on commit drop;
  grant all on t_ids to public;
  perform pg_temp.present(u2); perform pg_temp.present(u3);
  update public.businesses set stripe_account_id = 'acct_SECURITY_TEST' where id = biz;
  update public.users set is_private = true where id = u2;
  insert into public.blocks (blocker_id, blocked_id) values (u2, u3);
  insert into public.dm_conversations (user_a, user_b) values (u2, u3) returning id into conv;
  insert into public.dm_messages (conversation_id, sender_id, body) values (conv, u2, 'private words');
  insert into public.orders (business_id, user_id, order_number, total_cents) values (biz, u2, 91001, 500) returning id into ord;
  insert into public.order_items (order_id, menu_item_id, price_cents) values (ord, '10000000-0000-4000-8000-0000000000b1', 500);
  insert into public.gift_offers (business_id, from_user_id, to_user_id, items, status, stripe_pi_id, held_at, expires_at) values (biz, u2, u3, '[]', 'held', 'pi_sec_1', now(), now() + interval '15 minutes') returning id into offer;
  insert into public.reviews (user_id, business_id, rating) values (u2, biz, 5);
  insert into public.stories (user_id, media_url) values (u2, 'x.jpg') returning id into story;
  insert into public.story_views (story_id, viewer_id) values (story, u3);
  insert into public.map_reactions (business_id, room_id, user_id, emoji) values (biz, '10000000-0000-4000-8000-0000000000a1', u2, 'beer');
  insert into public.business_verifications (business_id, daily_code) values (biz, '654321');
  insert into public.notifications (user_id, type) values (u2, 'test');
  insert into public.tables (business_id, label, qr_token, access_code) values (biz, '1', 'sec-tok-1', '482193') returning id into tbl;
  insert into public.messages (room_id, user_id, body) values ('10000000-0000-4000-8000-0000000000a1', u2, 'pinned text') returning id into msg;
  insert into public.pinned_messages (room_id, message_id, pinned_by) values ('10000000-0000-4000-8000-0000000000a1', msg, u1);
  insert into storage.objects (bucket_id, name, owner) values ('dm-media', conv::text || '/' || u2::text || '/photo.jpg', u2);
  insert into t_ids values ('biz', biz), ('conv', conv), ('ord', ord), ('offer', offer), ('tbl', tbl), ('u1', u1), ('u2', u2), ('u3', u3), ('u4', u4);
end
$setup$;

create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
end $$;

-- Runs ONE statement as a role in a sub-transaction. Returns its single value as text, or 'ERR:<sqlstate>:<message>' when the database refused it.
create function pg_temp.try_as(p_who uuid, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  if p_who is null then perform pg_temp.as_anon(); else perform pg_temp.as_user(p_who); end if;
  begin
    if p_sql ~* '^\s*(select|with)' then execute p_sql into v; else execute p_sql; v := 'ok'; end if;
    perform pg_temp.as_service();
    return coalesce(v, '');
  exception when others then
    perform pg_temp.as_service();
    return 'ERR:' || sqlstate || ':' || left(sqlerrm, 120);
  end;
end $$;

create function pg_temp.id(k text) returns uuid language sql as $$ select v::uuid from t_ids where t_ids.k = $1 $$;

-- What "secure" means:
--   zero      the statement was refused or returned 0 rows / 0 affected rows
--   err       it must be refused (any error: the detail column shows which)
--   denied    it must be refused with 42501 (permission denied / row-level security), not for another reason
--   unchanged the gift offer must still be 'held'      noprint the order must still have no comanda_printed_at
create function pg_temp.atk(phase text, atk_id text, title text, who uuid, stmt text, secure_if text, flaw_before boolean) returns void language plpgsql as $$
declare r text; secure boolean; ok boolean;
begin
  r := pg_temp.try_as(who, stmt);
  secure := case secure_if
    when 'zero' then r = '0' or r like 'ERR:%'
    when 'err' then r like 'ERR:%'
    when 'denied' then r like 'ERR:42501%'
    when 'noprint' then (select o.comanda_printed_at is null from public.orders o where o.id = pg_temp.id('ord'))
    when 'unchanged' then (select g.status from public.gift_offers g where g.id = pg_temp.id('offer')) = 'held'
    else false end;
  ok := case when phase = 'BEFORE' then secure = not flaw_before else secure end;
  perform pg_temp.t_ok(ok, phase || ' · ' || atk_id || ' ' || title || case when phase = 'BEFORE' and flaw_before then ' (flaw present today)' else '' end, left(r, 150));
end $$;

create function pg_temp.run_attacks(p text) returns void language plpgsql as $$
declare
  biz uuid := pg_temp.id('biz'); conv uuid := pg_temp.id('conv'); ord uuid := pg_temp.id('ord'); offer uuid := pg_temp.id('offer');
  u1 uuid := pg_temp.id('u1'); u2 uuid := pg_temp.id('u2'); u3 uuid := pg_temp.id('u3'); u4 uuid := pg_temp.id('u4');
  room constant uuid := '10000000-0000-4000-8000-0000000000a1';
begin
  -- A27 really truncates reviews while the flaw exists: every phase starts with the review in place
  delete from public.reviews where business_id = biz;
  insert into public.reviews (user_id, business_id, rating) values (u2, biz, 5);

  -- messages and money
  perform pg_temp.atk(p, 'A01', 'read another pair''s DMs', u4, format('select count(*)::text from public.dm_messages where conversation_id = %L', conv), 'zero', false);
  perform pg_temp.atk(p, 'A02', 'change the price of an order item you ordered', u2, format('with x as (update public.order_items set price_cents = 1 where order_id = %L returning 1) select count(*)::text from x', ord), 'zero', false);
  perform pg_temp.atk(p, 'A03', 'change the total of your own order', u2, format('with x as (update public.orders set total_cents = 1 where id = %L returning 1) select count(*)::text from x', ord), 'zero', false);
  perform pg_temp.atk(p, 'A04', 'mark your own order as paid', u2, format('with x as (update public.orders set paid_at = now(), status = ''paid'' where id = %L returning 1) select count(*)::text from x', ord), 'zero', false);
  perform pg_temp.atk(p, 'A05', 'accept a gift that is not yours', u4, format('select (public.gift_offer_respond(%L::uuid, true, ''1'', null))::text', offer), 'err', false);
  perform pg_temp.atk(p, 'A06', 'cancel a gift that is not yours', u4, format('select (public.gift_offer_cancel(%L::uuid))::text', offer), 'unchanged', false);
  perform pg_temp.atk(p, 'A07', 'list other people''s gift offers', u4, format('select count(*)::text from public.gift_offers where id = %L', offer), 'zero', false);
  perform pg_temp.atk(p, 'A08', 'mark an order''s comanda as printed without having claimed it (staff-only POS function)', u4, format('select (public.pos_mark_comanda_printed(%L::uuid, %L::uuid))::text', biz, ord), 'noprint', false);
  perform pg_temp.atk(p, 'A09', 'anon creates a gift (authenticated-only function)', null, format('select (public.gift_offer_create(%L::uuid, %L::uuid, ''[]''::jsonb))::text', biz, u2), 'denied', false);

  -- accounts and privileges
  perform pg_temp.atk(p, 'A10', 'make yourself super_admin', u2, format('with x as (update public.users set role = ''super_admin'' where id = %L returning 1) select count(*)::text from x', u2), 'denied', false);
  perform pg_temp.atk(p, 'A11', 'venue owner sets its own plan / verification / Stripe account', u1, format('with x as (update public.businesses set plan = ''pro'', is_verified = true, stripe_account_id = ''acct_evil'' where id = %L returning 1) select count(*)::text from x', biz), 'denied', false);
  perform pg_temp.atk(p, 'A12', 'read another user''s private fields (push token, birth year, Stripe customer)', u4, format('select count(*)::text from public.users where id = %L', u2), 'zero', false);
  perform pg_temp.atk(p, 'A13', 'read another user''s notifications', u4, format('select count(*)::text from public.notifications where user_id = %L', u2), 'zero', false);
  perform pg_temp.atk(p, 'A14', 'send a notification to someone else', u4, format('insert into public.notifications (user_id, type) values (%L, ''phish'')', u2), 'denied', false);
  perform pg_temp.atk(p, 'A15', 'follow as someone else', u4, format('insert into public.follows (follower_id, following_id) values (%L, %L)', u2, u3), 'denied', false);
  perform pg_temp.atk(p, 'A16', 'rewrite another person''s DM', u4, format('with x as (update public.dm_messages set body = ''hacked'' where conversation_id = %L returning 1) select count(*)::text from x', conv), 'denied', false);

  -- the room, the venue, staff-only data
  perform pg_temp.atk(p, 'A17', 'post in a room you are not present in', u4, format('insert into public.messages (room_id, user_id, body) values (%L, %L, ''hi'')', room, u4), 'denied', false);
  perform pg_temp.atk(p, 'A18', 'read the daily verification code of a venue that is not yours', u4, format('select count(*)::text from public.business_verifications where business_id = %L', biz), 'zero', false);
  perform pg_temp.atk(p, 'A19', 'read a venue''s table access codes and QR tokens', u4, format('select count(*)::text from public.tables where business_id = %L', biz), 'zero', false);
  perform pg_temp.atk(p, 'A20', 'read a DM photo from storage that is not yours', u4, format('select count(*)::text from storage.objects where bucket_id = ''dm-media'' and name like %L', conv::text || '/%'), 'zero', false);

  -- privacy: where people are, who they are with
  perform pg_temp.atk(p, 'A21', 'ask whether ANY user is at a venue right now (presence oracle)', u4, format('select public.venue_presence_ok(%L::uuid, %L::uuid)::text', biz, u2), 'denied', true);
  perform pg_temp.atk(p, 'A22', 'read the Stories of a PRIVATE account you do not follow', u4, format('select count(*)::text from public.stories where user_id = %L', u2), 'zero', true);
  perform pg_temp.atk(p, 'A23', 'read the Stories of a user who BLOCKED you', u3, format('select count(*)::text from public.stories where user_id = %L', u2), 'zero', true);
  perform pg_temp.atk(p, 'A24', 'see who viewed someone else''s Story', u4, format('select count(*)::text from public.story_views where viewer_id = %L', u3), 'zero', true);
  perform pg_temp.atk(p, 'A25', 'see which venue a user reacted from on the map (visit history)', u4, format('select count(*)::text from public.map_reactions where user_id = %L', u2), 'zero', true);
  perform pg_temp.atk(p, 'A26', 'forge the venue''s reply on your own review', u2, format('with x as (update public.reviews set response = ''Best bar in town, says the owner'' where user_id = %L returning 1) select count(*)::text from x', u2), 'zero', true);
  perform pg_temp.atk(p, 'A27', 'TRUNCATE a public table (a privilege RLS does not cover)', u2, 'truncate public.reviews', 'denied', true);
  perform pg_temp.atk(p, 'A28', 'CREATE TRIGGER on a public table (TRIGGER privilege)', u2, 'create trigger evil after update on public.gift_offers for each row execute function public.gift_offers_touch()', 'denied', true);

  -- the legitimate paths must keep working (the fix must not break the app); A27 may have emptied reviews in the BEFORE phase
  delete from public.reviews where business_id = biz;
  insert into public.reviews (user_id, business_id, rating) values (u2, biz, 5);
  perform pg_temp.t_ok(coalesce(pg_temp.try_as(u2, format('select count(*)::text from public.stories where user_id = %L', u2)), '') = '1', p || ' · OK1 you still see your own Stories');
  perform pg_temp.t_ok(coalesce(pg_temp.try_as(u2, format('select count(*)::text from public.story_views where story_id in (select id from public.stories where user_id = %L)', u2)), '') = '1', p || ' · OK2 the author still sees who viewed their Story');
  perform pg_temp.t_ok(coalesce(pg_temp.try_as(u3, format('select count(*)::text from public.story_views where viewer_id = %L', u3)), '') = '1', p || ' · OK3 a viewer still sees their own view');
  perform pg_temp.t_ok(coalesce(pg_temp.try_as(u2, format('select count(*)::text from public.map_reactions where business_id = %L', biz)), '') = '1', p || ' · OK4 a person present in the venue still sees its reactions');
  perform pg_temp.t_ok(coalesce(pg_temp.try_as(u1, format('select count(*)::text from public.map_reactions where business_id = %L', biz)), '') = '1', p || ' · OK5 the venue owner still sees its reactions');
  perform pg_temp.t_ok(coalesce(pg_temp.try_as(u2, format('select public.gift_available(%L::uuid, %L::uuid)::text', biz, u3)), '') like '%', p || ' · OK6 gift_available (which uses venue_presence_ok inside) still answers for a user', pg_temp.try_as(u2, format('select public.gift_available(%L::uuid, %L::uuid)::text', biz, u3)));
  perform pg_temp.t_ok(coalesce(pg_temp.try_as(u1, format('with x as (update public.reviews set response = ''Thanks!'', responded_at = now() where business_id = %L returning 1) select count(*)::text from x', biz)), '') = '1', p || ' · OK7 the venue owner can still reply to a review', pg_temp.try_as(u1, format('with x as (update public.reviews set response = ''Thanks!'', responded_at = now() where business_id = %L returning 1) select count(*)::text from x', biz)));

  -- informational (not flaws of the database; see the report)
  perform pg_temp.t_skip(p || ' · INFO', 'anon can read ' || (select count(*) from public.public_profiles) || ' public profiles through the view (username, name, bio, city): by design, listed in the report');
end $$;

select pg_temp.run_attacks('BEFORE');

-- @apply 248_security_hardening.sql

select pg_temp.run_attacks('AFTER');
