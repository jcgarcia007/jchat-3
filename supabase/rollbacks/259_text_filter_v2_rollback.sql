-- Reversión de 259_text_filter_v2.sql: quita los siete triggers nuevos y content_filter_trigger(), y deja message_is_objectionable con la lista
-- ANTERIOR (la de producción el 2026-11-03: con "kike" como palabra y sin las ampliaciones). No toca datos. Los triggers de messages, comments y
-- dm_messages no se tocaron, así que siguen igual.

drop trigger if exists trg_content_filter_caption on public.posts;
drop trigger if exists trg_content_filter_body on public.tod_cards;
drop trigger if exists trg_content_filter_name on public.rooms;
drop trigger if exists trg_content_filter_description on public.rooms;
drop trigger if exists trg_content_filter_bio on public.users;
drop trigger if exists trg_content_filter_display_name on public.users;
drop trigger if exists trg_content_filter_username on public.users;
drop function if exists public.content_filter_trigger();

create or replace function public.message_is_objectionable(p_text text)
returns boolean
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  t text;
  m text[];
  words constant text :=
    'nigger|niggers|faggot|faggots|kike|kikes|spic|spics|chink|chinks|gook|gooks|wetback|wetbacks|tranny|trannies|'
    'retard|retards|retarded|cunt|cunts|motherfucker|motherfuckers|cocksucker|cocksuckers|whore|whores|slut|sluts|kys|'
    'hdp|hijueputa|hijoeputa|hijodeputa|maricon|maricones|mongolico|mongolica|subnormal|subnormales|sudaca|sudacas|matate|suicidate';
  phrases constant text :=
    'kill yourself|kill urself|go kill yourself|i will kill you|i am going to kill you|i will rape you|i hope you die|'
    'hijo de puta|hijos de puta|hija de puta|la puta que te pario|retrasado mental|te voy a matar|te voy a violar|'
    'ojala te mueras|negro de mierda|moro de mierda|maldito negro';
begin
  if p_text is null or p_text = '' then return false; end if;
  t := lower(p_text);
  t := translate(t, 'áàäâéèëêíìïîóòöôúùüûñ', 'aaaaeeeeiiiioooouuuun');
  t := translate(t, '013457@$', 'oieastas');
  t := regexp_replace(t, '(.)\1{2,}', '\1', 'g');
  t := trim(regexp_replace(t, '[^a-z]+', ' ', 'g'));
  for m in select regexp_matches(t, '(?:^| )((?:[a-z] ){2,}[a-z])(?= |$)', 'g') loop
    t := t || ' ' || replace(m[1], ' ', '');
  end loop;
  t := ' ' || t || ' ';
  return t ~ (' (' || words || ') ') or t ~ (' (' || phrases || ') ');
end;
$$;

comment on function public.message_is_objectionable(text) is null;
