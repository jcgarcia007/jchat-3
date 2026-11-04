-- 259: filtro de texto v2 (opción B). NO APLICADA (la aplica Juan Carlos por MCP, cuando diga "aplica 259", después de revisar la lista).
-- Reversión: supabase/rollbacks/259_text_filter_v2_rollback.sql · Comprobación: supabase/scripts/259_check.sql · Pruebas: supabase/tests/13_text_filter.sql
--
-- Problema (prueba de tiendas, C-4; Apple 1.2 pide un método de filtrado de contenido ofensivo): la base ya tiene un filtro de palabras
-- (message_is_objectionable + trigger trg_message_filter) pero solo en messages, comments y dm_messages, y su lista es corta. No cubre
-- publicaciones, cartas de Truth or Dare, salas ni el perfil. Además la lista tiene "kike", que es el apodo de Enrique.
--
-- ESTADO ANTERIOR (producción, leído el 2026-11-03; es el punto de partida y lo que restaura el rollback):
--   message_is_objectionable(text) IMMUTABLE, search_path public. Normaliza: minúsculas; quita acentos y ñ; 0→o 1→i 3→e 4→a 5→s 7→t @→a $→s;
--   colapsa 3 o más letras iguales seguidas en una; todo lo que no es letra pasa a espacio; une letras sueltas separadas por espacios
--   ("k y s", "f a g g o t"); y busca PALABRAS COMPLETAS (por eso "Scunthorpe" no choca).
--   Palabras: nigger(s) faggot(s) kike(s) spic(s) chink(s) gook(s) wetback(s) tranny/trannies retard(s)/retarded cunt(s) motherfucker(s)
--   cocksucker(s) whore(s) slut(s) kys hdp hijueputa hijoeputa hijodeputa maricon(es) mongolico/a subnormal(es) sudaca(s) matate suicidate
--   Frases: kill yourself · kill urself · go kill yourself · i will kill you · i am going to kill you · i will rape you · i hope you die ·
--   hijo(s) de puta · hija de puta · la puta que te pario · retrasado mental · te voy a matar · te voy a violar · ojala te mueras ·
--   negro de mierda · moro de mierda · maldito negro
--   message_filter_trigger(): BEFORE INSERT OR UPDATE OF body en messages (solo texto, no sistema), comments y dm_messages.
--
-- QUÉ CAMBIA:
--   1. message_is_objectionable: misma normalización y mismo método; lista ampliada es/en (insultos graves, slurs y amenazas con sus plurales),
--      SIN palabras de uso cotidiano. "kike" SALE de las palabras y solo bloquea en la frase ofensiva completa en inglés ("dirty kike", "kike scum"…):
--      Kike/Enrique pasan. Las amenazas en español no bloquean "te voy a matar de risa". Los candidatos DUDOSOS (cabrón, pendejo, puta/puto,
--      marica, bitch…) NO entran: están en el informe para que Juan decida.
--   2. content_filter_trigger(): función de trigger genérica. Lee la columna que le dice TG_ARGV[0] y aplica message_is_objectionable; si no pasa
--      lanza `message_not_allowed` (22023), el mismo error que ya usa el chat. En un UPDATE que NO cambia el valor no hace nada: así una fila
--      antigua con un texto que hoy no pasaría no se bloquea al guardar el perfil entero.
--   3. Triggers nuevos: posts.caption, tod_cards.body, rooms.name, rooms.description (INSERT y UPDATE OF); users.bio, users.display_name y
--      users.username SOLO en UPDATE OF esas columnas (nunca en INSERT: el alta de cuenta y los nombres que llegan de Apple/Google no se tocan).
--      Los triggers de messages, comments y dm_messages se mantienen igual.
--   4. Para la respuesta escrita de Truth or Dare (migración 253, reservada; el archivo aún no existe): debe pasar por este filtro con un
--      `create or replace trigger … before insert or update of <columna> … execute function public.content_filter_trigger('<columna>')`.
--      Anotado, con el ejemplo, en supabase/RESERVED_253.md.
--
-- Idempotente y no destructivo: "create or replace" de funciones y de triggers (PostgreSQL 14+); no toca datos ni borra nada.

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
    -- slurs (inglés)
    'nigger|niggers|nigga|niggas|faggot|faggots|fag|fags|spic|spics|chink|chinks|gook|gooks|wetback|wetbacks|beaner|beaners|towelhead|towelheads|'
    'raghead|ragheads|zipperhead|zipperheads|paki|pakis|tranny|trannies|retard|retards|retarded|'
    -- insultos graves (inglés)
    'cunt|cunts|motherfucker|motherfuckers|cocksucker|cocksuckers|whore|whores|slut|sluts|skank|skanks|asshole|assholes|dickhead|dickheads|'
    'douchebag|douchebags|scumbag|scumbags|shithead|shitheads|dumbass|dumbasses|fuckface|wanker|wankers|twat|twats|kys|'
    -- slurs e insultos graves (español)
    'hdp|hijueputa|hijueputas|hijoeputa|hijoeputas|hijodeputa|hijosdeputa|hijoputa|hijoputas|maricon|maricones|joto|jotos|marimacha|marimachas|marimacho|marimachos|'
    'mariposon|mariposones|sidoso|sidosa|sidosos|sidosas|malparido|malparida|malparidos|malparidas|comemierda|comemierdas|chupapollas|chupapijas|'
    'chupaverga|chupavergas|mamaguevo|mamaguevos|mamaverga|mamavergas|mongolico|mongolica|subnormal|subnormales|sudaca|sudacas|'
    -- incitación a hacerse daño (español)
    'matate|suicidate|ahorcate';
  phrases constant text :=
    -- amenazas e incitación al daño (inglés)
    'kill yourse(lf|lves)|kill urself|go kill yourself|hang yourself|off yourself|go die in a fire|'
    'i will kill you|i ll kill you|ill kill you|i am going to kill you|i m going to kill you|i am gonna kill you|i m gonna kill you|'
    'i will murder you|i ll murder you|i will shoot you|i ll shoot you|i will stab you|i ll stab you|i will rape you|i ll rape you|'
    'i hope you die|i hope you get raped|i hope you get cancer|i know where you live|i will find you and (kill|hurt|rape)|'
    'shoot up (the|this) (school|bar|club|place)|'
    'kill all (the )?(blacks?|jews?|gays?|mexicans?|whites?|muslims?|immigrants?|latinos?|asians?)|'
    'death to (all )?(blacks?|jews?|gays?|mexicans?|muslims?|immigrants?|latinos?)|'
    -- "kike" solo en la frase ofensiva completa (Kike = apodo de Enrique)
    '(dirty|filthy|stupid|fucking) kikes?|kike scum|'
    -- insultos y amenazas (español)
    'hijos? de puta|hijas? de puta|hijos? de la gran puta|la puta que te pario|la puta madre que te pario|retrasad[oa]s? mental(es)?|'
    'te voy a matar(?! de risa| a risas| de la risa)|te voy a (violar|destripar|degollar|apunalar|asesinar|disparar|quemar vivo|quemar viva)|'
    'voy a matarte|te vamos a matar|te van a matar|ojala (te mueras|te mueran|se mueran|te mate|te revientes|te violen)|'
    'se donde (vives|vivis|trabajas)|cortate las venas|'
    '(negr[oa]|moro|indi[oa]|judi[oa]|gay|sudaca|latino|mexicano|maricon)s? de mierda|inmigrantes de mierda|maldito negro|maldita negra|'
    'matar a todos los (negros|judios|gays|maricones|mexicanos|inmigrantes|musulmanes)|'
    'muerte a los (negros|judios|gays|maricones|mexicanos|inmigrantes|musulmanes)';
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

comment on function public.message_is_objectionable(text) is
  'true si el texto contiene un insulto grave, un slur o una amenaza de la lista (es/en), tras normalizar acentos, 0→o 4→a @→a…, letras repetidas y letras separadas. Palabras completas: "Scunthorpe" no choca. Lista v2 (migración 259).';

-- Trigger genérico: la columna a revisar viene en TG_ARGV[0] ("bio", "caption", …).
create or replace function public.content_filter_trigger()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_col text := tg_argv[0];
  v_new text;
begin
  if v_col is null or v_col = '' then
    raise exception 'content_filter_trigger needs the column name in TG_ARGV[0]' using errcode = 'XX000';
  end if;
  v_new := to_jsonb(new) ->> v_col;
  -- Un UPDATE que no cambia el valor no se revisa: un perfil guardado entero no se bloquea por un texto antiguo que no se tocó.
  if tg_op = 'UPDATE' and v_new is not distinct from (to_jsonb(old) ->> v_col) then
    return new;
  end if;
  if public.message_is_objectionable(v_new) then
    raise exception 'message_not_allowed' using errcode = '22023';
  end if;
  return new;
end;
$$;

comment on function public.content_filter_trigger() is
  'Trigger BEFORE INSERT/UPDATE genérico del filtro de texto: lee la columna indicada en TG_ARGV[0] y lanza message_not_allowed (22023) si message_is_objectionable. Un UPDATE que no cambia el valor no se revisa. Migración 259.';

-- Publicaciones, cartas de Truth or Dare y salas: INSERT y UPDATE OF la columna.
create or replace trigger trg_content_filter_caption
  before insert or update of caption on public.posts
  for each row execute function public.content_filter_trigger('caption');

create or replace trigger trg_content_filter_body
  before insert or update of body on public.tod_cards
  for each row execute function public.content_filter_trigger('body');

create or replace trigger trg_content_filter_name
  before insert or update of name on public.rooms
  for each row execute function public.content_filter_trigger('name');

create or replace trigger trg_content_filter_description
  before insert or update of description on public.rooms
  for each row execute function public.content_filter_trigger('description');

-- Perfil: SOLO UPDATE OF (nunca en el alta de cuenta).
create or replace trigger trg_content_filter_bio
  before update of bio on public.users
  for each row execute function public.content_filter_trigger('bio');

create or replace trigger trg_content_filter_display_name
  before update of display_name on public.users
  for each row execute function public.content_filter_trigger('display_name');

create or replace trigger trg_content_filter_username
  before update of username on public.users
  for each row execute function public.content_filter_trigger('username');
