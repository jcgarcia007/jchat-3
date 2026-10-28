# Encargo de noche — resumen (2026-10-28)

Nada se aplicó ni se desplegó. Ninguna llamada a producción, a Stripe ni a Edge Functions; sin `pod install`, `expo run`, Gradle ni `eas build`. Todo lo de base de datos se probó en Supabase **local**. Ningún merge a main, ningún force push.

## Qué se hizo y qué no

| Parte | Resultado |
|---|---|
| 1. Teclado en la página de pago web | **Hecho** (rama `fix/web-pay-keyboard`). El resumen se pliega a la línea del total y la página se desplaza para que se vean el campo de la tarjeta y el botón Pagar; la línea de diagnóstico del monedero solo sale con `?stripe_diag=1` y clave de prueba. Specs verdes. |
| 2. Tiendas | **Hecho**, solo lectura: `tiendas.md`. Apple leído de las guías oficiales de hoy; Google citado por nombre de política (su texto no pude abrirlo: releer en Play Console). |
| 3. Seguridad | **Hecho**: `seguridad.md`; 28 ataques locales; borrador de migración 248 con rollback, check y prueba SQL antes/después (rama `fix/security-audit`). Sin aplicar. |
| 4. Rendimiento | **Hecho**: `rendimiento.md`; solo 2 índices valían la pena (borrador 249, rama `fix/perf-indexes`). k6 100 usuarios: p95 ≈ 6–8 ms, 0 % fallos, antes y después. Sin aplicar. |
| No hecho a propósito | Desplegar/aplicar nada; fusionar ramas; `feat/payment-domains-sync` (espera tu resultado con Apple Pay real en el iPhone). |

Ramas (`git log --oneline main..<rama>`):

- `fix/web-pay-keyboard`: `c7d86b08` (teclado: pliegue y scroll), `7ab1846f` (diagnóstico solo con `?stripe_diag=1`).
- `fix/security-audit`: `5d28e3eb` (migración 248 borrador + 28 ataques SQL + extensión `-- @apply` de `loadtest/run-sql-tests.sh`). Suite SQL completa: 112 pruebas, 0 fallos.
- `fix/perf-indexes`: `c7d1ec54` (migración 249 borrador + escenario k6 `read-hot`).
- `audit/launch-readiness`: solo estos documentos de `docs/audits/2026-10-28/`.

La base local queda parada al final (`loadtest/local-up.sh --down`).

## Los 10 puntos más importantes antes del lanzamiento

1. **Cuenta de revisor y local demo** (tiendas, ❌): sin ellos el revisor no puede abrir ningún chat (hace falta estar en el local) → rechazo casi seguro. Crear "JChat Demo", una cuenta dueña del local (entra sin GPS) y personas de demostración; nota propuesta en `tiendas.md` §10.
2. **Alcohol** (tiendas, ❌): aviso 21+ / DNI antes de pagar en productos con alcohol, clasificación 18+, texto "se sirve en el local".
3. **Aplicar la migración 248** (seguridad, ALTA): cierra el oráculo de presencia, las stories de cuentas privadas/bloqueadores y el historial de locales por reacciones de mapa. Revisar, aplicar por MCP, correr `248_check.sql`, probar a mano stories privadas, reacciones de mapa y respuesta de reseñas.
4. **Reportar en Verdad o Reto y en stories** y decir en la nota al revisor cómo se modera (Apple 1.2).
5. **Texto del permiso de ubicación**: decir que se usa para confirmar que estás en el local (Apple 5.1.5). Una línea en `app.config.ts`.
6. **`NSPrivacyCollectedDataTypes` vacío** en el privacy manifest y Data safety de Google: rellenar con los tipos reales y que coincida con las etiquetas de privacidad.
7. **Comparar `x-push-secret` en tiempo constante** en `send-push`, `gift-worker`, `moderate-dm-photo`, `moderate-match-photo`, `safety-alert` (BAJA, pero fácil); a medio plazo, secreto distinto por función.
8. **Pagos**: mantener `PricingScreen`/Verified sin acceso desde la app (Apple 3.1.1); las suscripciones de negocio, solo en la web.
9. **Borrado de cuenta**: confirmar que revoca el token de Apple y que la página web `/account` sirve de URL de borrado en Play Console.
10. **Autovacuum y vigilancia de rendimiento**: el esquema aguanta 100 usuarios simultáneos con p95 ≈ 7 ms y tablas de millones de filas; confirmar que autovacuum está activo en producción. La 249 (2 índices) es opcional.

## Cosas que necesito de ti

- Decidir cuándo aplicar 248 (y, si quieres, 249) por MCP.
- Tu resultado con Apple Pay real en el iPhone para seguir con `feat/payment-domains-sync`.
- Si apruebas el plan de cuenta de revisor, crear el local demo y las personas ficticias en producción (lo haces tú o me autorizas).
