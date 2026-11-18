# SPEC H-001 — Escapar el JSON-LD de la página pública del local (P0, seguridad)

Origen: `HALLAZGOS.md` H-001 (noche 1, base `46477515`). Esta spec no está implementada; el arreglo lo hace una sesión de código aparte.

## Problema
`web/app/b/[slug]/page.tsx:215` inyecta `JSON.stringify(structuredData)` con `dangerouslySetInnerHTML` dentro de `<script type="application/ld+json">`. `JSON.stringify` no escapa `<`, `>` ni `&`, así que un `name`, `description` o `address` con `</script>` cierra la etiqueta y lo que siga se interpreta como HTML. Los tres campos los edita el dueño del local (`businesses`), y la CSP actual permite scripts en línea (H-002), por lo que el contenido se ejecuta. Comprobado: `JSON.stringify({name:"</script><img src=x onerror=alert(1)>"})` conserva `</script>`.

## Cambio pedido
1. Crear una función pequeña (p. ej. `web/lib/jsonLd.ts`, `safeJsonLd(obj)`) que serialice y sustituya, escritas literalmente como texto ASCII: `<` → `\u003c`, `>` → `\u003e`, `&` → `\u0026`, U+2028 → `\u2028`, U+2029 → `\u2029`; el resultado sigue siendo JSON válido y equivalente.
2. Usarla en `app/b/[slug]/page.tsx:215`. Revisar si otras páginas (`/m/[slug]`, `/c/[token]`) emiten JSON-LD con el mismo patrón (en la noche 1 solo se encontró este uso).
3. Corregir de paso el TODO de H-006: `url` debe usar el dominio real (`jchat.cloud`) en lugar de `https://jchat.app`.

## Pruebas (web/)
- Test unitario: para entradas con `</script>`, `<!--`, `&`, comillas, saltos de línea y los caracteres U+2028 y U+2029, la salida no contiene `<`, `>` ni `&` literales (aparecen como `\u003c`, `\u003e`, `\u0026`) ni los caracteres U+2028/U+2029 (aparecen como `\u2028`/`\u2029`), y `JSON.parse(salida)` devuelve el objeto original.
- Test de la página: un local de prueba con nombre `</script><img src=x onerror=1>` produce un único `<script type="application/ld+json">` y ningún `<img>` en el HTML renderizado.
- `npx tsc --noEmit`, tests y `npm run build` de la web sin errores nuevos; el lint no sube del nivel de `origin/main`.

## Fuera de alcance
- Quitar `unsafe-inline`/`unsafe-eval` de la CSP (H-002): spec aparte (requiere nonces en Next.js).
- Saneado de los campos al guardarlos: no hace falta, el escape va en la salida.

## Aceptación
- El HTML de `/b/[slug]` con un nombre malicioso no contiene `</script>` dentro del bloque JSON-LD.
- Un validador de datos estructurados sigue leyendo el mismo LocalBusiness (mismos campos y valores).
- Sin migraciones ni cambios nativos: entra en el siguiente despliegue web.
- Esta spec no contiene los caracteres invisibles U+2028/U+2029 (solo sus secuencias escritas): `grep -P '[\x{2028}\x{2029}]' SPEC_H001_jsonld_escape.md` no devuelve nada.
