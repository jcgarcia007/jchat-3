# Asistente de Menús con IA — Programación completa (MVP F1–F5)

Documento para Claude Code. Se envía **una fase por sesión/mensaje**, en orden. Cada fase termina con: verificación limpia (`tsc`/`deno`/`build`), commit + push, y **entregar el SHA** para auditoría antes de seguir.

---

## CONTEXTO (pegar al inicio de cada fase)

Proyecto JChat 3.0, repo `jcgarcia007/jchat-3` (main = prod; Vercel auto-deploy del web).
- **Web:** Next.js en `web/` (dashboard de dueños). i18n en `web/messages/{en,es}.json`.
- **Backend:** Supabase (project `klfsgcfoahdtkojyqspd`). Edge Functions en `supabase/functions/` (Deno). Patrón de referencia: `supabase/functions/terminal/index.ts` (auth por token del usuario + admin client service-role).
- **Tablas relevantes:** `businesses` (plan 'free'|'pro', kds_settings jsonb), `menu_categories` (id, business_id, name, sort), `menu_items` (id, business_id, category_id, name, description, description_alt, price_cents, photo_url, dietary_tags, station 'kitchen'|'bar', sla jsonb, options jsonb, is_available, is_published, stock_count, low_stock_threshold, staff_details, staff_details_alt, sort). El editor manual vive en `web/app/dashboard/menu/page.tsx` (ItemEditorModal, handleSaveItem) — **NO se modifica su comportamiento**, el asistente convive con él.
- **REGLAS:** (1) El asistente es **solo Pro** — validar `businesses.plan='pro'` **en el servidor** (EF), no solo en UI. (2) Todo lo generado se inserta **sin publicar** (`is_published=false`). (3) En toda lista de sugerencias, la UI incluye **"+" para agregar lo propio**. (4) No tocar: POS móvil, EF `terminal`, cobro, KDS, editor manual (salvo lo explícitamente indicado). (5) Al terminar cada fase: verificación limpia, commit + push, dar SHA. NO desplegar EFs (las despliega Juan con `supabase functions deploy menu-assistant`).

---

## FASE 0 — Prerrequisitos (manual, la hace Juan — NO es código)

1. Crear API key en console.anthropic.com (cuenta de Otunity Labs).
2. Guardarla como secret: `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`
3. Confirmar que Bar XZX está en plan 'pro' para probar.

---

## FASE 1 — Modelo de datos (la aplica Planning Claude por MCP — referencia, NO ejecutar)

```sql
-- Galería multi-imagen por artículo. photo_url se mantiene = PORTADA (compatibilidad
-- con menú del cliente y POS). images = arreglo ordenado de URLs; la portada es
-- la que esté en photo_url (marcada ★ en la UI).
alter table public.menu_items add column if not exists images jsonb not null default '[]'::jsonb;
```

Regla de consistencia (la aplica la UI): si el artículo tiene imágenes, `photo_url` debe ser una de ellas (la portada). Si el dueño quita la portada, la primera de `images` pasa a `photo_url`.

---

## FASE 2 — Edge Function `menu-assistant` (el corazón)

**Nuevo archivo:** `supabase/functions/menu-assistant/index.ts` (Deno). **Antes de codear:** leer `supabase/functions/terminal/index.ts` y reusar su patrón exacto de: CORS headers, extracción del JWT del usuario, admin client (service role), y estructura `switch (action)`.

### 2.1 Esqueleto

```ts
// Deno / Supabase Edge Function
// Acciones: suggest_categories | suggest_items | refine_item | polish_item
// Todas requieren: usuario autenticado + dueño del negocio + businesses.plan='pro'
```

1. **CORS** igual que `terminal`.
2. **Auth:** leer el JWT del header `Authorization`, resolver `user` con el client anon+token (patrón de `terminal`). Sin usuario → 401.
3. **Gate Pro (server-side, SIEMPRE):** con el admin client, cargar `businesses` por `business_id` del body; verificar `owner_id === user.id` (o el patrón de acceso de dueño que use `terminal`/el dashboard) **y** `plan === 'pro'`. Si no → `403 { error: 'pro_required' }`.
4. **Llamada a Anthropic:** helper único:

```ts
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

async function askClaude(system: string, user: string, maxTokens = 2000): Promise<unknown> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',   // VERIFICAR string de modelo vigente en https://docs.claude.com/en/api/overview
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic_error_${res.status}`);
  const data = await res.json();
  const text = (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean); // si falla el parse → error 'bad_ai_response' (el cliente puede reintentar)
}
```

5. **Contexto del menú existente** (para acciones suggest_*): con el admin client, cargar hasta 30 `menu_items` del negocio (name, price_cents, description, station) y las `menu_categories`. Si existen, incluir en el prompt: "El negocio YA tiene estos artículos (estilo y precios de referencia; NO los repitas): …".

### 2.2 Acciones y prompts (system prompts en español; SIEMPRE exigir SOLO JSON)

**Regla común del system prompt:** "Eres un experto en menús de restaurantes/hospitalidad. Responde ÚNICAMENTE con JSON válido según el esquema indicado, sin texto adicional, sin markdown."

**A) `suggest_categories`** — body: `{ business_id, business_type, sells: string[], country, currency, price_range }` (`sells` p.ej. ["menu_cocina","room_service","amenidades","minibar"]).
Prompt de usuario: tipo de negocio + país + rango + qué vende + contexto existente. Pedir 6–12 categorías apropiadas al rubro (hotel → incluir amenidades/room service si las marcó).
Respuesta: `{ "categories": [{ "name": string, "emoji"?: string, "rationale": string }] }`

**B) `suggest_items`** — body: `{ business_id, business_type, country, currency, price_range, category_name, count? (default 8) }`.
Pedir artículos típicos de esa categoría para ese rubro/país: nombre, descripción apetitosa CORTA en español, descripción en inglés, precio sugerido en centavos acorde al rango y al país, estación ('kitchen'|'bar' — bebidas → 'bar'), tags dietéticos de esta lista fija: ["spicy","vegetarian","vegan","gluten_free","contains_nuts","contains_dairy","alcohol"] (solo los que apliquen). Incluir marcas locales frecuentes cuando aplique (aguas/cervezas/licores del país).
Respuesta: `{ "items": [{ "name", "description_es", "description_en", "price_cents": number, "station": "kitchen"|"bar", "tags": string[] }] }`

**C) `refine_item`** — body: `{ business_id, item_name, category_name, business_type, country }`.
Pedir 2–4 grupos de preguntas/variaciones inteligentes PARA ESE artículo específico (p.ej. botella de agua → Marca / Tamaño / Envase / Acompañar con; almohada → Tamaño / Firmeza / Relleno / Entrega; margarita → Tequila / Tamaño / Sal / Picante). Cada grupo: etiqueta, tipo ('single' = elegir una | 'multi' = varias), y 2–6 opciones con `price_delta_cents` (0 si no cambia el precio).
Respuesta: `{ "groups": [{ "label": string, "type": "single"|"multi", "options": [{ "label": string, "price_delta_cents": number }] }] }`
(El wizard convierte esto al formato de `menu_items.options` que ya usa el editor manual — **antes de codear, mirar cómo estructura `options` el ItemEditorModal** y producir el mismo formato.)

**D) `polish_item`** — body: `{ business_id, name, description? , direction?: 'es_to_en'|'en_to_es' }`.
Dos usos: (1) sin `direction`: generar `{ "description_es", "description_en", "tags": string[] }` para un nombre de plato; (2) con `direction`: traducir la descripción dada → `{ "translated": string }`. (Este endpoint lo usará también el botón Traducir del editor manual en F7.)

### 2.3 Errores y límites

- Toda acción responde `{ ok: true, ...payload }` o `{ ok: false, error }` con códigos: `unauthorized`, `pro_required`, `bad_request`, `bad_ai_response`, `anthropic_error_<status>`.
- `deno check` limpio. Commit + push, dar SHA. **NO desplegar** (lo hace Juan).

---

## FASE 3 — Wizard pasos 1–3 (web)

**Nueva página:** `web/app/dashboard/menu/assistant/page.tsx` + entrada/botón "Asistente IA" en `dashboard/menu` (badge "Pro"). Si `plan !== 'pro'`: la página muestra candado + invitación a Pro (no llama la EF). Cliente supabase + `supabase.functions.invoke('menu-assistant', { body })` con el token del usuario (patrón con que el dashboard llama EFs; si no existe, usar fetch a la URL de la función con el access_token del session — mirar cómo llama el móvil a `terminal` y replicar en web).

Estado del wizard en un solo objeto local (useState/useReducer): `{ step, businessType, sells[], country, currency, priceRange, categories[] (con selected), itemsByCategory{}, refinedOptions{} }`.

- **Paso 1 — Negocio:** tarjetas de tipo (Restaurante / Bar / Café / Hotel / Food truck / **+ Otro** con input libre), chips multi "¿Qué vas a vender?" (Menú de cocina / Room service / Amenidades / Minibar — visibles según tipo), país+moneda (default del negocio si existe), rango $ / $$ / $$$. Botón "Generar sugerencias con IA" → `suggest_categories` → paso 2. Spinner con texto amable mientras responde.
- **Paso 2 — Categorías:** lista con checkboxes (marcadas por defecto), **"+ Agregar categoría propia"** (input). Siguiente → paso 3.
- **Paso 3 — Artículos:** por cada categoría seleccionada (cargar bajo demanda, una a la vez con `suggest_items`; cache en estado): lista con checkbox por artículo mostrando nombre, descripción ES, precio **editable** (input), estación (chip Cocina/Barra editable), tags. **"+ Agregar artículo propio"** (nombre + precio; puede pedir `polish_item` para autogenerar descripción/tags). Contador "N artículos seleccionados". Botón "Siguiente" → Fase 4.
- i18n EN/ES de todos los textos. `build` limpio. Commit + push, SHA.

---

## FASE 4 — Paso 4: Refinamiento por artículo (web)

En la lista del paso 3 (o un paso 4 dedicado con la lista de seleccionados): cada artículo tiene botón "Detallar" → panel/modal que llama `refine_item` y muestra los **grupos como chips**: single = radio-chips, multi = check-chips, cada opción con su `+$X` si `price_delta_cents > 0`. **En CADA grupo, chip punteado "+ Otro"** (label + delta opcional). También **"+ Agregar grupo"** (label + tipo + opciones). Guardar → convierte los grupos al **formato `options` del editor manual** (verificado en F2/antes de codear) y lo adjunta al artículo en el estado del wizard. Refinar es **opcional** por artículo. `build` limpio, commit + push, SHA.

---

## FASE 5 — Paso 5: Revisar + crear (web)

- **Vista previa "como la ve el cliente":** render estilo del menú público `/m/[slug]` (mirar `MenuPageClient` para el look): categorías → artículos con nombre, descripción, precio, tags. Banner claro: "Aún no publicado".
- Botón **"Crear menú"**:
  1. Insertar `menu_categories` nuevas (las que no existan por nombre en el negocio; respetar `sort` al final).
  2. Insertar `menu_items` seleccionados: category_id, name, description (ES), description_alt (EN), price_cents, station, dietary_tags (tags), options (si se refinó), `is_published=false`, `is_available=true`, sort incremental.
  3. Inserciones **client-side con el client supabase normal** (RLS del dueño ya permite escribir su menú — verificar cómo inserta el editor manual y usar el mismo camino).
- Al éxito: pantalla "¡Menú creado! N artículos en borrador" + botones "Ir a mi editor de menú" (link a `dashboard/menu`) y "Agregar fotos" (placeholder → F6; por ahora lleva también al editor).
- `build` limpio, commit + push, SHA.

---

## ENTREGA POR FASES (recordatorio para cada sesión)

1. Leer los archivos existentes indicados ANTES de codear (terminal EF, ItemEditorModal/options, MenuPageClient).
2. Una fase por vez; verificación limpia (`deno check` para EF, `npx tsc --noEmit`/`next build` para web).
3. Commit + push; entregar SHA y resumen de archivos tocados.
4. No desplegar EFs; no tocar dinero/POS/KDS/editor manual salvo lo indicado.

---

## FUTURO (NO construir aún — referencia)

- **F6 Fotos:** galería (subir varias a Storage → `images` + portada ★ en `photo_url`); "Generar con IA" 5 opciones con estilo consistente + "Generar más" + "Generar fotos faltantes" (requiere decidir proveedor de imágenes: OpenAI/Stability/Replicate + secret aparte); búsqueda solo en fuentes libres de derechos.
- **F7 Recurrente:** botón Traducir ES↔EN en el campo descripción del **editor manual** (usa `polish_item` con `direction`); "Refrescar mi menú" (temporada, huecos, inventario con stock_count).
- **Aparte (independiente):** mostrar la **descripción** del plato en el menú del mesero (POS móvil).
