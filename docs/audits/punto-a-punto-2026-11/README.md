# Revisión punto a punto — 2026-11 (noche 1)

Base: `origin/main` @ `46477515` · rama `audit/punto-a-punto-2026-11` · solo lectura (nada se guarda en producción).

## Estructura
- `HALLAZGOS.md`: tabla única de hallazgos (ID, recorrido, plataforma, paso, esperado, obtenido, captura, severidad propuesta, archivo:línea).
- `SEGURIDAD_CODIGO.md`: seguridad estática (Tarea C).
- `capturas/<plataforma>/<idioma>/<tema>/<viewport>-<pantalla>.png`.

Severidad: P0 bloquea el envío a tiendas o es de seguridad · P1 rompe un recorrido · P2 molesta · P3 pulido.

## Cómo se hizo cada captura
### Web (hecho, 120 capturas, solo páginas públicas)
Playwright sobre `https://jchat.cloud` (producción, solo `goto` + captura). Por cada combinación:
- Idioma: contexto con `locale` y cabecera `Accept-Language` (`es-ES` / `en-US`); la web decide por cookie o por esa cabecera (`web/i18n/request.ts`).
- Tema: tras cargar, `document.documentElement.setAttribute('data-theme', 'dark'|'light')` (la web arranca en oscuro, `web/app/layout.tsx:75`). Aviso (H-015): varias páginas públicas no obedecen ese atributo (`/terms`, `/safety`, `/nearby`, `/account/delete` salen idénticas en «claro» y «oscuro»; `/pricing` siempre claro), así que en esas el «tema» de la carpeta no es fiable.
- Viewport: `m390` = 390×844, `d1280` = 1280×800. Captura de la ventana (no página completa).
- Pantallas: `home /`, `login /auth/login`, `register /auth/register`, `forgot /forgot-password`, `nearby /nearby`, `pricing /pricing`, `pricingbiz /pricing/business`, `download /download`, `privacy /privacy`, `terms /terms`, `support /support`, `contact /contact`, `safety /safety`, `deleteaccount /account/delete`, `bizregister /business/register`.
- Cada carga registra errores de consola, desbordamiento horizontal y página en blanco (resumidos en HALLAZGOS.md).

### Web autenticada (dashboard D1–D8) y recorridos del cliente en web: NO capturados
Requieren escribir la contraseña de las cuentas `REVIEW_*` / `REVIEW2_*` en el formulario de login de producción. Introducir contraseñas en un sitio de producción lo hace una persona, no la automatización de esta sesión. Hace falta una sesión ya iniciada por Juan en el navegador de pruebas (o un entorno de staging) para continuar.

### App iOS / Android: BLOQUEO (ver informe)
El dev client instalado es anterior a los cambios nativos de `main`. No se construyó nada. Comando de referencia cuando haya build de desarrollo nuevo (flujos Maestro existentes en `mobile/.maestro`):
```bash
cd mobile
npx expo start --dev-client
maestro --device <udid|emulator-5558> test .maestro --format junit --output ../e2e/artifacts/maestro/<plataforma>/report.xml --test-output-dir ../e2e/artifacts/maestro/<plataforma>
```

## Dispositivos disponibles (Paso 0)
- iOS: iPhone 17 Pro (676D1B50…), iPhone 17 (054BA238…), iPad Pro 13" (7AE1C280…), todos con iOS 26.5, arrancados.
- Android: `emulator-5558`.
