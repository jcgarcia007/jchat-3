-- 211 (PROPUESTA — NO APLICADA): filtro de insultos graves ES/EN también en el servidor (Lote D).
-- El cliente (mobile/utils/messageFilter.ts, web/lib/messageFilter.ts) ya bloquea antes de enviar; este SQL
-- impide saltárselo con un cliente modificado o llamando a la API directamente.
--
-- Qué hace
--   1. public.message_is_objectionable(text) → boolean: misma lógica que el módulo del cliente
--      (minúsculas, sin acentos, leetspeak deshecho, letras repetidas colapsadas, letras sueltas pegadas,
--       palabra completa; NO bloquea groserías comunes ni palabras cotidianas).
--   2. Triggers BEFORE INSERT OR UPDATE OF body en messages (solo texto, no del sistema), dm_messages y comments:
--      si la función da true → error 'message_not_allowed' (errcode 22023).
--   Las listas de términos DEBEN mantenerse iguales a las del cliente (cámbialas en los dos sitios).
--
-- Como probarlo (después de aplicar, con un usuario de prueba y una conversación/post propios):
--   select public.message_is_objectionable('hijo de puta');            -- true
--   select public.message_is_objectionable('n i g g e r');             -- true
--   select public.message_is_objectionable('hola, ¿qué tal?');         -- false
--   select public.message_is_objectionable('la puta madre qué rico');  -- false
--   select public.message_is_objectionable('This class is great');     -- false
--   insert into public.comments (post_id, user_id, body) values ('<post>', '<usuario>', 'kill yourself'); -- ERROR message_not_allowed
--   insert into public.comments (post_id, user_id, body) values ('<post>', '<usuario>', 'buen post');      -- OK (borrar después)
-- Rollback: drop trigger trg_message_filter on public.messages; drop trigger trg_message_filter on public.dm_messages;
--           drop trigger trg_message_filter on public.comments; drop function public.message_filter_trigger();
--           drop function public.message_is_objectionable(text);
-- Riesgo conocido: si el servidor rechaza, el cliente muestra su error genérico; el filtro del cliente evita que un
-- usuario normal llegue a verlo.

create or replace function public.message_is_objectionable(p_text text)
returns boolean language plpgsql immutable set search_path = public as $$
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
  t := translate(t, '013457@$', 'oieastas');  -- 0→o 1→i 3→e 4→a 5→s 7→t @→a $→s (igual que el cliente)
  t := regexp_replace(t, '(.)\1{2,}', '\1', 'g');
  t := trim(regexp_replace(t, '[^a-z]+', ' ', 'g'));
  -- "n i g g e r": añade la versión pegada de cada racha de 3+ letras sueltas
  for m in select regexp_matches(t, '(?:^| )((?:[a-z] ){2,}[a-z])(?= |$)', 'g') loop
    t := t || ' ' || replace(m[1], ' ', '');
  end loop;
  t := ' ' || t || ' ';
  return t ~ (' (' || words || ') ') or t ~ (' (' || phrases || ') ');
end;
$$;

create or replace function public.message_filter_trigger()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'messages' then
    -- nested on purpose: dm_messages / comments have no is_system / type column
    if coalesce(new.is_system, false) or coalesce(new.type, 'text') <> 'text' then
      return new;
    end if;
  end if;
  if public.message_is_objectionable(new.body) then
    raise exception 'message_not_allowed' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_message_filter on public.messages;
create trigger trg_message_filter before insert or update of body on public.messages
  for each row execute function public.message_filter_trigger();
drop trigger if exists trg_message_filter on public.dm_messages;
create trigger trg_message_filter before insert or update of body on public.dm_messages
  for each row execute function public.message_filter_trigger();
drop trigger if exists trg_message_filter on public.comments;
create trigger trg_message_filter before insert or update of body on public.comments
  for each row execute function public.message_filter_trigger();
