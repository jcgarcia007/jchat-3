# migrations_archive — historial, no se ejecuta

Estas son las 241 migraciones con las que se construyó JChat, de `001` a `244`, **con los nombres intactos** (incluidos los repetidos `033`×2 y `034`×2 y los sufijos `173a`, `173b`, `198c`).

- **Es historial.** Sirve para leer por qué existe algo (`git log`, `git blame`, los comentarios de cada archivo) y como referencia de los tests estáticos que citan una migración concreta.
- **El CLI de Supabase no lo lee.** `supabase start`, `supabase db reset` y las ramas de Supabase solo leen `supabase/migrations/`. Por eso los números repetidos ya no estorban.
- **No se puede reproducir desde cero** (15 de estas migraciones dependen de objetos que se crearon a mano en producción). Una base nueva se crea con `supabase/migrations/245_baseline.sql` + `246_baseline_extras.sql`, que contienen el estado de producción a fecha 2026-10-27.
- **Producción no se toca.** Allí ya existe todo y su historial de migraciones es otro (versiones por fecha aplicadas por MCP). Estos archivos nunca se ejecutan contra producción.
- **No se añaden archivos aquí.** Las migraciones nuevas van en `supabase/migrations/` desde la `247`.

Ver `docs/MIGRATIONS_BASELINE_PLAN.md`.
