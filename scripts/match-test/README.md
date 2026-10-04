# Match — perfiles de prueba

Scripts para sembrar y borrar 20 usuarios de prueba (`seed01@jchat.test` … `seed20@jchat.test`) en Bar XZX.

**Nunca pongas la llave en el código ni en git.** Los scripts leen `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` del entorno.

## Uso

```bash
cd scripts/match-test
npm install
export SUPABASE_URL="https://klfsgcfoahdtkojyqspd.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service role key>"   # solo en tu terminal
node seed.mjs      # crea los usuarios (idempotente: salta los que ya existen)
node cleanup.mjs   # borra TODO lo de los @jchat.test
```

## Qué crea `seed.mjs`

- Usuarios con email confirmado, contraseña aleatoria (no se imprime), perfil completo, edad y términos aceptados.
- 3–6 intereses y 1–2 fotos ilustradas (DiceBear, no personas reales) ya aprobadas.
- Presencia activa en Bar XZX durante 12 horas (opt-in de Match incluido).
- 5 likes a `test` y 5 a `test1` (1 super like a cada uno), con su notificación.

## Qué borra `cleanup.mjs`

Los usuarios `@jchat.test` (cascada), sus objetos en `match-photos/{user_id}/` y las notificaciones de Match que provocaron.
