-- @apply 259_text_filter_v2.sql
-- Text filter v2 (259): false positives that must PASS, texts that must be BLOCKED (with the usual evasions), and the triggers.
-- The draft migration is applied inside this rolled-back transaction by the line above, so the test also runs before 259 is applied for real.
do $t$
declare
  biz constant uuid := pg_temp.seed_venue();
  u2 uuid := pg_temp.seed_user(2);
  r record;
  n int := 0;
  msg text;
  state text;
begin
  -- ── A. Must PASS (names, nicknames, colloquial Spanish, innocent English, words that merely CONTAIN a listed one) ──────────────────────────
  for r in select * from (values
    ('Kike'), ('kike'), ('KIKE'), ('Enrique'), ('Kike Hernandez'), ('Dolores'), ('Concha'), ('Chucho'), ('Nacho'), ('Pepe'), ('Paco y Lola'), ('Jesus'),
    ('me muero de risa'), ('matar a risas'), ('está de muerte'), ('qué peligro'), ('Scunthorpe'), ('te voy a matar de risa'), ('te voy a matar a risas'),
    ('me matas de risa'), ('estoy muerto de cansancio'), ('que no te maten las ganas'), ('qué bueno estuvo el concierto'), ('el puñal del escenario'),
    ('I will kill it at karaoke tonight'), ('this place is the bomb'), ('killer playlist'), ('a dyke is a dam'), ('Dick'), ('Cockburn'), ('Penistone'),
    ('class of 2024'), ('assassin''s creed'), ('Essex'), ('grass'), ('cocktail hour'), ('Mississippi'), ('analytics'), ('bassline'), ('Dickinson'),
    ('mesa 5 para 4'), ('2 for 1 until 10'), ('hasta las 5'), ('te espero en la puerta'), ('nos vemos a las 7'),
    ('Hello! How are you?'), ('hola, ¿cómo estás?'), ('thanks a lot'), ('gracias por todo'), ('I love this bar'), ('esta canción me mata'),
    ('pastel de choclo'), ('mi hijo es de puerto rico'), ('hijo de la vecina'), ('puta madre qué rico'),
    ('you asshole'), ('dickheads'), ('what a douchebag'), ('scumbags'), ('dumbass'), ('assholes'), ('dickhead'), ('douchebags'), ('scumbag'), ('dumbasses')
  ) as v(txt) loop
    n := n + 1;
    perform pg_temp.t_ok(not public.message_is_objectionable(r.txt), 'passes: ' || r.txt);
  end loop;

  -- ── B. Must be BLOCKED (plain, uppercase, 0→o / 4→a / @→a / 1→i / 3→e, separated letters, repeated letters, accents) ───────────────────────
  for r in select * from (values
    ('you are a faggot'), ('F4GG0T'), ('f@ggot'), ('f a g g o t'), ('faaaaggot'), ('N1GGER'), ('niiiigger'), ('n i g g e r'), ('niggas'),
    ('sluts'), ('wh0re'), ('what a cunt'), ('K Y S'), ('kys'), ('shitheads'), ('fuckface'),
    ('hijo de puta'), ('h1j0 d3 put4'), ('HIJOS DE PUTA'), ('hdp'), ('hijueputa'), ('maricón'), ('MARICONES'), ('m4r1c0n'), ('sudaca'), ('negro de mierda'),
    ('negras de mierda'), ('malparido'), ('sidoso'), ('chupapollas'), ('comemierda'), ('suicídate'), ('mátate'), ('matate'),
    ('te voy a matar'), ('te v0y a m4t4r'), ('te voy a violar'), ('te voy a degollar'), ('ojalá te mueras'), ('sé dónde vives'), ('se donde vives'),
    ('I will kill you'), ('i w1ll k1ll y0u'), ('I''ll kill you'), ('i am going to kill you'), ('I hope you die'), ('i know where you live'),
    ('go kill yourself'), ('kill yourself'), ('hang yourself'), ('kill all the jews'), ('death to all gays'), ('muerte a los gays'), ('matar a todos los negros'),
    ('dirty kike'), ('filthy kikes'), ('kike scum'), ('retrasado mental'), ('te voy a matar y no de risa')
  ) as v(txt) loop
    n := n + 1;
    perform pg_temp.t_ok(public.message_is_objectionable(r.txt), 'blocked: ' || r.txt);
  end loop;
  perform pg_temp.t_ok(not public.message_is_objectionable(null) and not public.message_is_objectionable(''), 'null and empty text pass');
  perform pg_temp.t_ok(n >= 100, 'the battery runs at least 100 cases', n::text);

  -- ── C. Triggers ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  -- users: UPDATE OF bio / display_name / username is checked; an INSERT never is; an UPDATE that does not change the value never is
  perform pg_temp.t_raises(format('update public.users set bio = %L where id = %L', 'f a g g o t', u2), 'message_not_allowed', 'users.bio: a bad text on UPDATE is refused');
  perform pg_temp.t_raises(format('update public.users set display_name = %L where id = %L', 'te voy a matar', u2), 'message_not_allowed', 'users.display_name: a bad text on UPDATE is refused');
  perform pg_temp.t_raises(format('update public.users set username = %L where id = %L', 'hijueputa', u2), 'message_not_allowed', 'users.username: a bad name on UPDATE is refused');
  begin
    update public.users set bio = 'Kike from Madrid, Enrique para los amigos', display_name = 'Kike' where id = u2;
    perform pg_temp.t_ok(true, 'users: Kike / Enrique are saved');
  exception when others then
    perform pg_temp.t_ok(false, 'users: Kike / Enrique are saved', sqlerrm);
  end;
  begin
    -- the sign-up trigger (handle_new_user) inserts the public.users row from the auth metadata: a bad name there is NOT filtered
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
      values (pg_temp.uid(9), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sqltest9@example.invalid', '{"full_name":"f a g g o t"}'::jsonb);
    perform pg_temp.t_ok(exists (select 1 from public.users where id = pg_temp.uid(9)), 'users: an INSERT is never filtered (sign-up and Apple/Google names are not touched)');
  exception when others then
    perform pg_temp.t_ok(false, 'users: an INSERT is never filtered', sqlerrm);
  end;
  -- an old row that would not pass today is not blocked when saved again WITHOUT changing that column
  set local session_replication_role = replica;
  update public.users set bio = 'nigger' where id = pg_temp.uid(9);
  set local session_replication_role = origin;
  begin
    update public.users set bio = 'nigger', display_name = 'Nine' where id = pg_temp.uid(9);
    perform pg_temp.t_ok(true, 'users: saving a row again without changing the old text is not blocked');
  exception when others then
    perform pg_temp.t_ok(false, 'users: saving a row again without changing the old text is not blocked', sqlerrm);
  end;
  perform pg_temp.t_raises(format('update public.users set bio = %L where id = %L', 'still a nigger', pg_temp.uid(9)), 'message_not_allowed', 'users.bio: changing it to another bad text is refused');

  -- rooms: name and description, INSERT and UPDATE
  perform pg_temp.t_raises(format('insert into public.rooms (business_id, name) values (%L, %L)', biz, 'f4gg0t room'), 'message_not_allowed', 'rooms.name: INSERT with a bad name is refused');
  perform pg_temp.t_raises(format('update public.rooms set name = %L where business_id = %L', 'cunt zone', biz), 'message_not_allowed', 'rooms.name: UPDATE with a bad name is refused');
  perform pg_temp.t_raises(format('update public.rooms set description = %L where business_id = %L', 'I will kill you', biz), 'message_not_allowed', 'rooms.description: UPDATE with a bad text is refused');
  begin
    insert into public.rooms (business_id, name, description) values (biz, 'Sala Kike', 'Para Enrique y sus amigos');
    perform pg_temp.t_ok(true, 'rooms: a normal name and description are saved');
  exception when others then
    perform pg_temp.t_ok(false, 'rooms: a normal name and description are saved', sqlerrm);
  end;

  -- posts.caption
  perform pg_temp.t_raises(format('insert into public.posts (user_id, caption) values (%L, %L)', u2, 'hijo de puta'), 'message_not_allowed', 'posts.caption: INSERT with a bad caption is refused');
  begin
    insert into public.posts (user_id, caption) values (u2, 'Noche de risas con Kike y Pepe') returning id into strict state;
    perform pg_temp.t_ok(true, 'posts: a normal caption is saved');
  exception when others then
    perform pg_temp.t_ok(false, 'posts: a normal caption is saved', sqlerrm);
  end;
  perform pg_temp.t_raises(format('update public.posts set caption = %L where user_id = %L', 'kill yourself', u2), 'message_not_allowed', 'posts.caption: UPDATE with a bad caption is refused');
  begin
    insert into public.posts (user_id, caption) values (u2, null);
    perform pg_temp.t_ok(true, 'posts: a post without caption is saved');
  exception when others then
    perform pg_temp.t_ok(false, 'posts: a post without caption is saved', sqlerrm);
  end;

  -- tod_cards.body
  perform pg_temp.t_raises(
    format('insert into public.tod_cards (concept_id, category, kind, locale, body) values (%L, %L, %L, %L, %L)', 'sqltest-c1', 'classic', 'truth', 'es', 'te voy a violar'),
    'message_not_allowed', 'tod_cards.body: INSERT with a bad text is refused');
  begin
    insert into public.tod_cards (concept_id, category, kind, locale, body) values ('sqltest-c2', 'classic', 'truth', 'es', '¿Cuál es tu mayor miedo al volar?');
    perform pg_temp.t_ok(true, 'tod_cards: a normal card is saved');
  exception when others then
    perform pg_temp.t_ok(false, 'tod_cards: a normal card is saved', sqlerrm);
  end;

  -- the old triggers are still there: messages, comments and dm_messages
  perform pg_temp.t_ok((select count(*) from pg_trigger where tgname = 'trg_message_filter' and not tgisinternal) = 3, 'the three old trg_message_filter triggers are still there');
end
$t$;
