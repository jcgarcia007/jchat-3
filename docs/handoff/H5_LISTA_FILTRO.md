# H5 — Lista del filtro de texto v2 (migración 259) para decisión de Juan

Fuente: `supabase/migrations/259_text_filter_v2.sql` (md5 al final del informe). Nada aplicado. ⚠️ = era dudoso para un bar/restaurante; **decisión de Juan 2026-11-08: todos los ⚠️ se quedan (aprobado por Juan 2026-11-08), salvo asshole, dickhead, douchebag, scumbag y dumbass, que SALEN de la lista** (shithead y fuckface se quedan).
El filtro busca **palabras completas** tras normalizar (minúsculas, sin acentos/ñ, `0→o 1→i 3→e 4→a 5→s 7→t @→a $→s`, letras repetidas 3+ → una, signos → espacio, letras sueltas unidas: "f a g g o t"). Por eso "Scunthorpe", "Essex" o "cocktail" pasan.

## 1. Palabras sueltas (bloquean por sí solas, con sus plurales)

| Grupo | Inglés | Español |
|---|---|---|
| Slurs raciales / étnicos | nigger(s), nigga(s), chink(s) ⚠️, gook(s), spic(s), wetback(s), beaner(s) ⚠️, towelhead(s), raghead(s), zipperhead(s), paki(s) ⚠️ | sudaca(s) |
| Slurs homófobos / transfóbicos / capacitistas | faggot(s), fag(s) ⚠️, tranny/trannies, retard(s)/retarded | maricón/maricones, joto(s), marimacha(s)/marimacho(s), mariposón/mariposones, sidoso/a(s), mongólico/a, subnormal(es) |
| Insultos sexuales / graves | cunt(s), motherfucker(s), cocksucker(s), whore(s) ⚠️, slut(s) ⚠️, skank(s), twat(s) ⚠️, fuckface | malparido/a(s), comemierda(s), chupapollas, chupapijas, chupaverga(s), mamaguevo(s), mamaverga(s), hijueputa(s), hijoeputa(s), hijodeputa, hijosdeputa, hijoputa(s), hdp ⚠️ |
| Insultos comunes (tono bar) | shithead(s), wanker(s) ⚠️ | — |
| Incitación al suicidio / daño | kys | mátate, suicídate, ahorcate |

## 2. Frases (solo bloquean la frase completa)

| Grupo | Inglés | Español |
|---|---|---|
| Amenazas de muerte / daño | kill yourself/yourselves, kill urself, go kill yourself, hang yourself, off yourself, go die in a fire; i will / i'll / ill / i am going to / i'm going to / i am gonna / i'm gonna kill you; i will / i'll murder you, shoot you, stab you, rape you; i hope you die / get raped / get cancer; i will find you and kill/hurt/rape; shoot up the school/bar/club/place; **i know where you live ⚠️** | te voy a matar (salvo "de risa", "a risas", "de la risa"), te voy a violar/destripar/degollar/apuñalar/asesinar/disparar/quemar vivo(a), voy a matarte, te vamos a matar, te van a matar, ojalá te mueras/mueran/se mueran/te mate/te revientes/te violen, sé dónde vives/vivís/trabajas ⚠️, córtate las venas |
| Odio por grupo | kill all (the) blacks/jews/gays/mexicans/whites/muslims/immigrants/latinos/asians; death to (all) blacks/jews/gays/mexicans/muslims/immigrants/latinos; dirty/filthy/stupid/fucking kike(s); kike scum | negro/a, moro, indio/a, judío/a, gay, sudaca, latino, mexicano, maricón (+s) **de mierda**; inmigrantes de mierda; maldito negro / maldita negra; matar a todos los negros/judíos/gays/maricones/mexicanos/inmigrantes/musulmanes; muerte a los negros/judíos/gays/maricones/mexicanos/inmigrantes/musulmanes |
| Insulto a la madre | — | hijo(s)/hija(s) de puta, hijo(s) de la gran puta, la puta que te parió, la puta madre que te parió, retrasado/a(s) mental(es) |

"kike" **no** es palabra suelta (es el apodo de Enrique): solo bloquea en las frases ofensivas en inglés de arriba.

## 3. Dudosos que NO entraron (por si Juan los quiere): cabrón, pendejo, puta/puto, marica, bitch, shit, fuck, damn, coño, mierda, gilipollas, culero, "puta madre" (pasa a propósito: "puta madre qué rico").

## 4. Qué campos filtra y cuándo

| Tabla.columna | Alta (INSERT) | Edición (UPDATE) |
|---|---|---|
| messages.body, comments.body, dm_messages.body (ya existían, lista nueva) | sí | sí |
| posts.caption | sí | sí |
| tod_cards.body | sí | sí |
| rooms.name, rooms.description | sí | sí |
| users.bio, users.display_name, users.username | **nunca** (ni el alta de cuenta ni nombres de Apple/Google al registrarse) | sí |

Regla extra: un UPDATE que **no cambia** el valor de esa columna no se revisa (guardar el perfil entero no se bloquea por un texto antiguo). Los textos ya guardados no se tocan. En producción (lectura 2026-11-08, con la lista VIEJA) hay 0 filas que no pasarían en posts (51), tod_cards (2000), users (64) y rooms (18); con la lista nueva se ve con `259_check.sql` (f) tras aplicar.
Limitación a conocer: el nombre de Apple se guarda con un UPDATE posterior al alta (`mobile/services/appleSignIn.ios.ts`, mejor esfuerzo, error ignorado): si ese nombre fuese objetable, no se guarda y el perfil queda sin nombre; no rompe el inicio de sesión.

## 5. Falsos positivos conocidos que la batería (135 casos) confirma que PASAN
Kike, Enrique, Kike Hernández, Dolores, Concha, Chucho, Nacho, Pepe, Paco, Jesús; "me muero de risa", "matar a risas", "está de muerte", "te voy a matar de risa / a risas", "me matas de risa", "esta canción me mata"; Scunthorpe, Essex, grass, cocktail hour, Mississippi, analytics, bassline, Dickinson, Dick, Cockburn, Penistone, class of 2024, assassin's creed; "I will kill it at karaoke tonight", "killer playlist", "this place is the bomb", "a dyke is a dam"; "mesa 5 para 4", "2 for 1 until 10", "hasta las 5", "nos vemos a las 7"; "pastel de choclo", "hijo de la vecina", "mi hijo es de Puerto Rico", "puta madre qué rico".
Ninguna bebida o plato de la batería choca. Riesgos que la batería NO cubre (marcados ⚠️; **aprobados por Juan 2026-11-08**, se quedan):
- **paki**: apodo español de Paco/Francisco ("Paki") — se bloquearía como nombre de usuario o en un mensaje.
- **chink**: modismo inglés "a chink in the armor"; **beaner**: nombre de cafeterías/apodo ("Beaner's coffee"); **fag**: "fag" = cigarrillo en inglés británico; **hdp**: sigla que puede aparecer en otros usos; **joto**: sin otro uso común.
- **whore / slut / twat / wanker / skank**: aparecen en nombres de chupitos y cócteles ("Slippery slut" etc.) y en la jerga del bar; si un local los pone en `rooms.name` se bloqueará.
- ~~asshole, dickhead, douchebag, scumbag, dumbass~~: **quitados de la lista por Juan 2026-11-08** (insultos corrientes entre amigos en un bar); la batería los comprueba ahora como textos que PASAN (con sus plurales). shithead(s) y fuckface se quedan.
- **nigga(s)** (aprobado por Juan 2026-11-08): uso intragrupo frecuente en letras de canciones citadas en el chat; decisión de política.
- **i know where you live / sé dónde vives** (aprobado por Juan 2026-11-08): puede ser broma amistosa.
- Números y símbolos se traducen a letras: "5pic" → "spic", "$lut" → "slut" (intencional contra evasión); un texto con símbolos pegados a una palabra de la lista puede bloquearse.

## 6. Qué ve el usuario cuando se bloquea
El servidor responde `message_not_allowed` (22023). La app lo traduce (`toUserMessage`, `errors:app.message_not_allowed`) en: editar perfil, nueva publicación y perfil del registro; la web, en la creación de salas del dashboard (`chatRoomsTextNotAllowed`). Texto:
- **es:** «Ese texto no está permitido. Revísalo e inténtalo de nuevo.»
- **en:** "That text isn't allowed. Please review it and try again."
No dice qué palabra falló. Dónde se traduce: perfil, publicación, registro (app); creación de salas y chat de mesa en `dashboard/tables` (web). No existe pantalla de edición de nombre/descripción de salas ni de creación de cartas de Truth or Dare en la app ni en la web: esas columnas solo las escriben el servidor y los scripts de siembra.
