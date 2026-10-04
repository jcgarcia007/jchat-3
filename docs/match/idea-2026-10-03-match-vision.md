# Idea completa — JChat Match
Fecha: 2026-10-03
Archivo: idea-2026-10-03-match-vision.md

## 1. La idea en una frase
Match es un juego de descubrimiento dentro de la sección Games de JChat: las personas que están físicamente dentro de un negocio pueden descubrirse con tarjetas estilo Tinder, hacer match y chatear, y todo se borra automáticamente al salir del local, salvo que se sigan mutuamente.

## 2. Contexto y por qué existe
JChat es una app social y de comercio, bilingüe (ES/EN). Los negocios tienen su propio chat dentro de la app. La gente va a locales y quiere conocer a otras personas que están ahí mismo, con intereses afines. Hoy no hay forma de hacerlo dentro de la app. Match resuelve eso de forma efímera, segura y divertida: solo funciona dentro del local, y al salir no queda rastro.

## 3. El recorrido completo del usuario
1. El usuario entra al chat del negocio. Antes de entrar ve un aviso claro: al salir del local se borra toda su información de Match (likes, matches, chats, historial), a menos que le dé follow a alguien y esa persona acepte. Acepta y entra.
2. Al entrar al chat, Match se activa automáticamente. En los settings de su perfil hay un toggle "Visible en Match" por si quiere desactivarlo.
3. Abre la sección Games y pulsa el botón Match. Si es su primera vez, responde un quiz de intereses (elige mínimo 3 de una lista de las categorías más usadas: viajes, música, gym, cine, café, deportes, libros, mascotas, etc.). Si lo omite, se usan los intereses de su perfil de JChat.
4. Ve el deck de tarjetas: solo personas con check-in activo dentro del mismo negocio. Sin distancia visible, es obvio que están ahí.
5. Hace swipe: derecha = me gusta, izquierda = pasar, arriba = super like (5 por sesión por día). Puede usar los botones bajo el deck o deshacer el último swipe.
6. Toca una tarjeta y ve el perfil: bio, detalles, intereses en común, mini galería de fotos (tap agranda, tap fuera cierra) y un link "Ver perfil completo en JChat" que abre el perfil de la app, donde puede darle follow.
7. Si alguien le da like, recibe una notificación discreta (en la pantalla bloqueada solo dice algo neutro como "Tienes una novedad en JChat"). El super like se muestra resaltado en azul dentro de la app.
8. Si el like es mutuo: pantalla "¡Es un match!" con botón de enviar mensaje, sugerencias para romper el hielo, botón prominente de SEGUIR y opción de seguir explorando.
9. El chat 1:1 muestra un banner permanente: "Este chat se borra al salir del local", con el botón de seguir en el header.
10. Cuando el deck se acaba: "Ya viste a todos dentro de este negocio" + botón opt-in "Avisarme cuando entre gente nueva".
11. En "Mi perfil del deck" ve su tarjeta tal como la ven los demás, con botón de editar y acceso a "Mi actividad": tres pestañas (Mis likes / Matches / Les gusté), con link al perfil de cada persona y borrado individual o total de sus likes.
12. Al salir del local (geofence confirmado + 15 minutos de gracia, o botón manual "Salir del local" que JChat ya tiene): se borra todo lo suyo del venue — presencia, swipes, likes, matches, chats 1:1 e historial — en el servidor y en el caché del teléfono. Silencioso para la otra parte, como si nada hubiera pasado.
13. Excepción: si hubo follow mutuo (uno pide, el otro acepta; las cuentas privadas requieren aceptación), la conversación se convierte en DM permanente de JChat y HEREDA el historial del local. Un follow pendiente sobrevive al borrado.

## 4. Reglas del producto (decididas, no cambiar sin proponer)
- Círculo cerrado: solo miembros del chat del negocio. Nadie de fuera puede entrar ni ver.
- 18+ garantizado por la creación de cuenta de JChat. Sin puerta de edad adicional.
- El perfil es visible en el deck por defecto al entrar al chat, aunque el usuario nunca haya abierto Match. Recibir likes lo lleva a entrar vía notificación.
- Mínimo 1 foto aprobada para aparecer en el deck. Se reutilizan las fotos del perfil de JChat con su moderación existente.
- Super likes: 5 por sesión por día, contados en el servidor. Quien te dio super like aparece primero en tu deck con borde azul.
- Filtros: rango de edad y ordenar por intereses en común.
- Borrado: reportes y bloqueos NO se borran (moderación); los mensajes propios en el chat grupal del local quedan para los demás; todo lo demás del venue se esfuma.
- Borrar un like que había generado un match elimina el match también, en silencio.
- Reportar/bloquear: sheet con motivos (acoso, contenido explícito, sospecha de menor, estafa, otro). El bloqueado desaparece del deck, matches y chats. Debe funcionar desde el primer build (las tiendas lo exigen).
- Backups: el borrado es inmediato en la base activa y expira en backups según la retención configurada; el aviso de privacidad debe decirlo con honestidad.
- Bilingüe ES/EN en cada texto visible.
- Botón de pánico discreto: FASE 2. Dejar el espacio previsto en navegación y diseño, no implementar ahora.
- Descartado a propósito: verificación de foto con checkmark (innecesaria: en el local cualquiera verifica en persona si la foto eres tú) y compartir ubicación con un amigo (innecesario).

## 5. Las 13 pantallas (detalle visual aprobado)
Existe una referencia visual de 13 ejemplos aprobada por el dueño (widget del chat del 2026-10-03): deck principal; sello LIKE/NOPE/SUPER LIKE durante el arrastre; super like; perfil con galería y lightbox + link al perfil JChat; pantalla de match con rompehielos; fin del deck; quiz de intereses; botones accesibles con etiquetas; reportar/bloquear; notificaciones (super like resaltado); mi perfil del deck completo; mi actividad con 3 tabs. Botones modernos con gradiente y brillo; super like con contador.

## 6. Recomendaciones técnicas (EVALÚA ANTES DE IMPLEMENTAR — no son mandatos)
- Librería de swipe recomendada: @react-native-motion-kit/swipe-deck. Es moderna, mantenida y corre sobre Reanimated + Gesture Handler, con API tipada, undo y control programático. ANTES de instalarla: verifica compatibilidad con las versiones de reanimated/gesture-handler/worklets del proyecto y lee su documentación oficial (https://react-native-swipe-deck.pages.dev/llms-full.txt). Alternativas si no encaja: react-native-deck-swiper (la clásica) o react-native-swipeable-card-stack (soporta las 4 direcciones).
- Detección de match: se recomienda un trigger AFTER INSERT en la base de datos (atómico, no burlable por el cliente) en vez de detectarlo en la app. Evalúa contra el esquema actual.
- Feed del deck: se recomienda un RPC que combine presencia activa + anti-join de ya-vistos + filtros en una sola consulta, con RLS estricto (cada usuario solo lee sus propios swipes). Evalúa contra los patrones RLS existentes de JChat.
- Mensajes del match: evalúa si reutilizar las tablas de chat de JChat con scope de venue o crear tablas dedicadas. Justifica tu decisión.
- Geofence y salida: JChat ya tiene geofence y botón manual de salida; reutilízalos. Ten en cuenta latencia de detección (3-5 min en iOS) y que la gracia de 15 min cuenta desde la salida confirmada.
- Push: reutilizar la infraestructura existente; contenido neutro en lock screen.
- Gestos: umbral 40% del ancho (like/pass), 30% del alto (super like); el flick rápido cuenta aunque el arrastre sea corto; histéresis ~10px para distinguir tap de arrastre; rotación ~14° anclada abajo; haptic al cruzar el umbral.
- Performance: ningún setState durante el gesto (todo en UI thread con shared values); expo-image con WebP pre-transformadas (~800px tarjetas, ~1600px lightbox); prefetch de próximas 2-3 tarjetas; máximo 3 tarjetas montadas; animar solo transform/opacity.
- Accesibilidad: cada gesto con botón etiquetado de mínimo 44px; respetar Reduce Motion.

## 7. Instrucción para Claude Code
Lee esta idea completa. Haz un reconocimiento del proyecto JChat (tablas Supabase, navegación, componentes existentes, versiones de librerías) ANTES de escribir código. Luego entrega un plan de integración: qué se reutiliza de JChat, qué se crea nuevo, qué decisiones técnicas tomas y por qué, y qué riesgos ves. No cambies ninguna regla de producto de la sección 4 sin proponerlo primero. Guarda tu evaluación como reporte-2026-10-03-match-vision.md en ~/muse-handoff. No implementes nada en esta pasada: solo evaluación y plan.
