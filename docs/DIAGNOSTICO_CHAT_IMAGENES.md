# Investigación de imágenes en chat (dimensiones para el fix de scroll)

**Objetivo:** para el fix de scroll en web (reservar la altura de las imágenes de
mensajes para que el layout no salte al cargar), determinar si podemos guardar las
dimensiones reales de la imagen.

Archivo investigado: `web/app/c/[token]/room/ChatRoom.tsx`.
Schema: `supabase/migrations/*.sql`.

---

## 1. Cómo se suben y qué se guarda hoy (web ChatRoom)

Flujo en `handlePhotoSelected` (L470-519):

1. Toma `file` del `<input type="file">`, valida que sea imagen y el tamaño
   (`MAX_PHOTO_BYTES` = 10 MB).
2. Sube al bucket **`post-media`** con path
   `${userId}/${timestamp}-${rand}.${ext}` (el `userId` como primer segmento es
   requerido por la RLS del storage: `(storage.foldername(name))[1] = auth.uid()`).
3. Obtiene `getPublicUrl(path)`.
4. Inserta el mensaje:

```js
await supabase.from("messages").insert({
  room_id: roomId,
  user_id: userId,
  body: "",
  type: "photo",
  media_url: urlData.publicUrl,
});
```

**No se guarda nada más:** `metadata` no se toca (queda en su default `{}`), y
**no hay ancho/alto**. El mensaje aparece luego vía la suscripción realtime, que sí
incluye `metadata` en `MSG_SELECT` (L54).

Render actual de la imagen (L918-926):

```jsx
<img
  src={msg.media_url!}
  alt="Imagen enviada"
  style={{ display: "block", maxWidth: 220, width: "100%", height: "auto" }}
/>
```

`height: auto` → altura natural, sin reservar → crece al cargar (causa del salto).

---

## 2. ¿`metadata` (Json) está libre para `{width, height}`? → **SÍ**

Schema de `messages`:

- Base (`001_initial_schema.sql:240`): `id, room_id, user_id, body, is_deleted, reply_to, created_at`.
- Añadido en `006_message_types.sql:6-9`:
  - `type text not null default 'text'`  (text|photo|voice|gif|system|offer)
  - `media_url text`
  - **`metadata jsonb not null default '{}'::jsonb`**  — comentario del schema: *"offer_id, gif url, voice duration, system kind, etc."*
  - `is_system boolean not null default false`
- **No existen columnas width/height.**

En el cliente `metadata` está tipado como `Record<string, unknown>` (L45).

**Uso actual de `metadata`:** solo se **lee** para `metadata.incognito` (L57) y
`metadata.nickname` (L62). En el insert de foto **no se escribe**.

→ Podemos guardar `{ width, height }` (o anidado `{ media: { width, height } }`) en
`metadata` al subir la imagen **sin migración nueva** y sin colisionar con nada.

---

## 3. ¿Se pueden capturar las dimensiones antes de insertar? → **SÍ, trivial en web**

En `handlePhotoSelected` ya tenemos el objeto `File`. Antes del `.insert`:

```js
const dims = await new Promise((res) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { res({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
  img.onerror = () => { res(null); URL.revokeObjectURL(url); };
  img.src = url;
});
// …insert con metadata: dims ? { width: dims.width, height: dims.height } : {}
```

Sin librerías y sin red extra (lee del `File` en memoria). Se puede correr en
paralelo al upload para no añadir latencia.

---

## Consideraciones para la decisión

- **Mensajes legacy:** las fotos ya enviadas tienen `metadata = {}` (sin dims). El
  fix necesita un **fallback** para ellas de todos modos → o `aspect-ratio` por
  defecto, o re-scroll en `img.onLoad`.
- **Recomendación mixta (más robusta):**
  1. Guardar dims reales en `metadata` a partir de ahora → con `aspect-ratio: W/H`
     se reserva el hueco exacto **antes** de que la imagen cargue, el layout nunca
     salta para fotos nuevas.
  2. Dejar el **re-scroll en `img.onLoad`** como red de seguridad para las fotos
     legacy y por si faltara metadata.
- **`dm_messages` es otra tabla** (`002_social_schema.sql:73`) con su propio
  `media_url`; este flujo (mensajes de sala) no la toca. Si el fix se replica a DMs,
  es trabajo aparte.
- **CSS actual** (L918-926): `maxWidth:220; width:100%; height:auto`. Con dims
  conocidas se le puede añadir `aspectRatio: \`${w}/${h}\`` para reservar la altura
  exacta.

---

## Resumen

- Subida hoy: bucket `post-media`, se guarda solo `media_url` + `type:"photo"`; sin dims.
- `metadata` jsonb **está libre** para guardar `{width, height}` — **sin migración**.
- Capturar dimensiones antes del insert es **fácil en web** (`new Image()` +
  `naturalWidth/Height`).
- Como habrá fotos legacy sin dims, conviene **combinar** dims guardadas +
  `aspect-ratio` + re-scroll en `onLoad` de respaldo.
