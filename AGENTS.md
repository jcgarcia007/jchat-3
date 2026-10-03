# JChat 3.0 — reglas para agentes

Este archivo es la guía operativa común para cualquier agente que trabaje en este repositorio. `CLAUDE.md` y `CLAUDE_CODE_INSTRUCTIONS.md` se conservan como documentación heredada; cuando contengan estado histórico o instrucciones específicas de Claude Code, prevalecen este archivo, la solicitud actual del usuario y los documentos vigentes de `docs/`.

## Alcance y rutas

- Raíz única de trabajo: `/Users/jcgarcia/Projects/JchatVer3.0`.
- No leer, crear ni modificar archivos fuera de esa carpeta sin avisar primero al usuario.
- `mobile/`: aplicación React Native con Expo SDK 56 y React Navigation; no usa Expo Router.
- `web/`: aplicación web y dashboards con Next.js App Router.
- `supabase/`: migraciones y Edge Functions del backend compartido.
- `docs/`: especificación, sistema de diseño, arquitectura, backlog, decisiones y runbook de despliegue.
- Respetar cualquier `AGENTS.md` más específico que exista dentro de un subdirectorio. En particular, antes de cambiar Mobile, leer también `mobile/AGENTS.md`.

## Fuentes de verdad

Antes de implementar una tarea, leer solo el contexto necesario, empezando por:

1. `docs/SPEC.md`: producto, flujos y reglas de negocio.
2. `docs/DESIGN_SYSTEM.md`: tokens, temas y componentes visuales.
3. `docs/ARCHITECTURE.md`: patrones técnicos y decisiones reutilizables.
4. `docs/BACKLOG.md`: alcance y prioridad de trabajo.
5. `docs/DECISIONS.md`: decisiones técnicas y de producto.
6. `docs/DEPLOYMENT_CHECKLIST.md`: runbook de lanzamiento.

Los `.docx` y archivos de `docs/archive/` son históricos salvo indicación expresa. No ejecutar automáticamente el antiguo “workflow de inicio” de `CLAUDE.md` ni asumir que el proyecto sigue en estado greenfield.

Las carpetas de capacidades propias de una herramienta, como `.claude/`, no son instrucciones universales ni una dependencia del proyecto. Cada agente debe usar las herramientas o skills que tenga disponibles, pero siempre respetando este `AGENTS.md`, los `AGENTS.md` anidados y las fuentes de verdad anteriores. No borrar ni reescribir `CLAUDE.md`, `CLAUDE_CODE_INSTRUCTIONS.md` o `.claude/` salvo solicitud explícita.

## Flujo Git obligatorio

- Una rama por tarea, creada desde la rama base que indique el usuario o Planning. Si la base no está clara y afecta el resultado, confirmarla antes de empezar.
- Nunca hacer commits directamente en `main`.
- Antes de editar, revisar `git status` y preservar cambios ajenos o preexistentes.
- Tocar únicamente los archivos necesarios para la tarea. No mezclar arreglos o mejoras no solicitados.
- Usar `git add` únicamente con rutas explícitas; nunca `git add .`, `git add -A` ni equivalentes amplios.
- No reescribir historia, descartar cambios ajenos ni usar operaciones destructivas sin autorización explícita.
- Antes de entregar, hacer commit y push de la rama cuando la tarea lo solicite.
- Toda entrega debe incluir el SHA completo del commit y la salida de `git diff --stat origin/main..HEAD`.

## Producción y servicios externos

- Nunca aplicar migraciones ni ejecutar cambios de configuración directamente en producción.
- Esta prohibición incluye Supabase, Stripe y Vercel: no hacer `supabase db push` contra producción, no desplegar Edge Functions, no cambiar webhooks/productos/secretos de Stripe y no alterar variables, dominios o configuración de Vercel.
- Los cambios de base de datos, Edge Functions e infraestructura se versionan en el repositorio; Planning los revisa y aplica.
- Nunca exponer API keys, secretos, tokens o credenciales en frontend, logs, commits o respuestas.
- Los pagos se crean siempre server-side mediante Edge Functions de Stripe; nunca crear un `PaymentIntent` desde el cliente.
- Toda tabla y acceso de Supabase debe contar con RLS apropiado. Nunca modificar `pinned_messages` directamente desde el cliente.
- En Supabase Realtime, suscribirse al montar y cancelar la suscripción al desmontar.

## Dependencias y comandos

- En `mobile/`, nunca ejecutar `npm install` suelto.
- Para añadir o alinear paquetes de Expo, usar `npx expo install <paquete>`.
- Para instalación reproducible desde el lockfile, usar `npm ci`.
- Antes de escribir código dependiente de Expo, consultar la documentación exacta de SDK 56: `https://docs.expo.dev/versions/v56.0.0/`.
- No actualizar dependencias, lockfiles o versiones fuera del alcance explícito de la tarea.

## Builds (EAS)

- Antes de `eas build`, limpiar las dependencias con `cd mobile && rm -rf node_modules && npm ci`. Un `node_modules` modificado por builds locales cambia la huella y provoca que EAS falle en “Configure expo-updates”.
- Para builds de iOS, usar `EXPO_NO_CAPABILITY_SYNC=1 eas build -p ios …`.
- El mínimo de iOS de los pods se fija con el config plugin `mobile/config-plugins/withMinPodsDeploymentTarget.js`, no con `expo-build-properties`. El `minSdkVersion` de Android se fija con `mobile/config-plugins/withAndroidMinSdkVersion.js`.
- Un paquete nativo sin `app.plugin.js` va únicamente en `package.json` mediante autolinking; nunca añadirlo al array `plugins` de `app.config.ts`.
- Probar en dispositivos físicos. El emulador no sirve para Bluetooth ni para el lector M2, y Expo Go no sirve para este proyecto.

## Verificación antes de entregar

- Mobile, siempre: `cd mobile && npx tsc --noEmit`. Debe terminar con 0 errores.
- Si se toca `web/`: `cd web && npm run build`. Un `tsc` aislado no sustituye el build de Next.js.
- Ejecutar además las pruebas o verificaciones específicas de la funcionalidad modificada.
- Si una verificación falla por una causa preexistente, documentar el comando, la salida relevante y por qué no proviene del cambio; no ocultar el fallo.
- Revisar el diff final, confirmar que solo contiene archivos de la tarea y mostrar `git diff --stat origin/main..HEAD`.

## Arquitectura del proyecto

- Mobile usa React Navigation y mantiene navegación en `mobile/navigation/`, pantallas en `mobile/screens/`, componentes en `mobile/components/` y acceso a datos/lógica de dominio en `mobile/services/`.
- Cuando una implementación difiera por plataforma, usar extensiones de archivo (`.web.tsx` y `.native.tsx`), no branching de plataforma en runtime.
- Web usa Next.js App Router, con rutas en `web/app/` y componentes compartidos en `web/components/`.
- No implementar Event Tickets ni Delivery Module: permanecen fuera de alcance/Future salvo aprobación explícita.

## Diseño e interfaz

- Nunca hardcodear colores en componentes; usar los tokens del Design System.
- Excepción obligatoria: las páginas web públicas sin sesión (recibo `/r/[code]`, `/privacy`, `/terms`, `/support`, menú público) y las pantallas móviles con fondo oscuro fijo (Welcome, Onboarding) usan colores hex fijos y `colorScheme: 'light'` en web; nunca `var(--*)` ni tokens de tema que puedan resolver a un color ilegible. Los colores fijos van en constantes locales de la pantalla (por ejemplo, `WELCOME_COLORS`), no sueltos en los componentes.
- Implementar y verificar dark mode y light mode en toda UI nueva o modificada.
- No alterar los valores definidos de los 10 dashboard themes, 15 chat themes o 15 profile themes sin aprobación explícita.
- Valores base vigentes: brand `#5C7CFA`, brand dark `#4A6AE8`, brand purple `#7C3AED`, success `#1D9E75`, warning `#f59e0b`, danger `#ef4444` y gold `#D97706`. Warning y gold no son intercambiables.
- En dashboard usar `data-db-theme` y variables `var(--db-*)`; en chat usar `getChatTheme(room.chat_theme_id)`; en perfiles usar `PROFILE_THEMES[user.profileThemeId]`.
- Usar exclusivamente Tabler Icons (`@tabler/icons-react-native` en Mobile y `@tabler/icons-react` en Web).
- Mantener spacing, radios y demás valores visuales mediante tokens del Design System.

## Internacionalización

- Todo texto visible debe usar el sistema de traducciones; no introducir strings de interfaz hardcodeados.
- Mantener siempre paridad EN/ES: toda clave agregada o modificada debe existir y conservar el mismo significado en ambos idiomas.
- Incluir estados vacíos, errores, validaciones, accesibilidad y metadatos visibles en la revisión de paridad.

## Privacidad y seguridad

- Nunca revelar la ubicación en tiempo real de un usuario en perfiles, posts o stories.
- El geotag de posts es únicamente texto manual; nunca GPS automático.
- `Location` en Privacy Settings permanece bloqueado, sin toggle ni lógica que permita activarlo.
- La ubicación real solo se usa para geofencing dentro del radio de un negocio y para el mapa nativo de Stage 4.

## Disciplina de alcance y propuestas

- Seguir la especificación y los archivos expresamente incluidos en la tarea.
- Si una instrucción parece incorrecta, contradictoria, insegura o arriesgada, detener esa parte y proponer la alternativa antes de ejecutarla.
- No implementar mejoras fuera del spec sin aprobación explícita. Presentarlas con: contexto, problema, propuesta, impacto, alternativa dentro del spec y una pregunta clara de decisión.
- Al corregir un fallo, limitar el cambio a la causa y a los archivos de la tarea; verificar contra los criterios de aceptación correspondientes.

## Checklist adicional para tareas de UI

- Colores únicamente desde tokens o temas, salvo la excepción obligatoria para páginas públicas y pantallas de fondo oscuro fijo descrita arriba.
- Dark y light mode comprobados.
- Separación por plataforma mediante extensiones cuando aplique.
- Temas de dashboard/chat/perfil consumidos mediante sus APIs, no con valores directos.
- Tabler Icons únicamente.
- Suscripciones Realtime con cleanup.
- Textos EN/ES en paridad.
- Solo se modificaron archivos pertenecientes a la tarea.

## ECC — flujo de trabajo permanente (desde 2026-10-02)

- **Instalado:** ECC (`ecc@ecc`) versión **2.2.3**, el 2026-10-02, con `npx ecc-universal@2.2.3 setup --mode claude-plugin --scope project`. Fuente oficial: repo `github.com/affaan-m/ECC` y paquete npm `ecc-universal`.
- **Dónde:** scope `project`. Config en `.claude/settings.json` (`extraKnownMarketplaces.ecc` + `enabledPlugins."ecc@ecc": true`). Los archivos del plugin viven en la caché de plugins de Claude Code (`~/.claude/plugins/cache/ecc/ecc/2.2.3/`), no en el repo. Hooks en preferencia `standard`.
- **Backup previo:** `.backup-claude-2026-10-02/` (ignorado por git; contiene `~/.claude.json`, así que no se sube ni se comparte).
- **Flujo estándar, siempre y sin preguntar:** `plan → test → implement → review → verify → remember`.
  1. **Plan:** planificar antes de codificar (`/plan`, agente `planner`/`architect`).
  2. **Test:** escribir o verificar tests primero (`tdd-workflow`, agente `tdd-guide`).
  3. **Implement:** el cambio mínimo que cumple el spec.
  4. **Review:** revisar el propio trabajo desde un contexto fresco antes de entregar (`/code-review`, agentes `code-reviewer`, `typescript-reviewer`, `security-reviewer`, `database-reviewer`).
  5. **Verify:** `npx tsc --noEmit`, tests y comprobación real (`verification-loop`, `/quality-gate`).
  6. **Remember:** persistir las decisiones importantes del proyecto (memoria de Claude Code, `docs/DECISIONS.md`, `/save-session`).
- **Precedencia:** este flujo no anula las reglas de arriba. Siguen mandando el flujo Git obligatorio, las fuentes de verdad, "no mejoras fuera del spec sin aprobación" y el checklist de UI.
- **Disponible (v2.2.3):** 68 agentes, 293 skills y 94 comandos.
  - Agentes relevantes aquí: `planner`, `architect`, `tdd-guide`, `code-reviewer`, `typescript-reviewer`, `react-reviewer`, `react-build-resolver`, `security-reviewer`, `database-reviewer`, `e2e-runner`, `build-error-resolver`, `refactor-cleaner`, `performance-optimizer`, `doc-updater`, `silent-failure-hunter`, `swift-reviewer`. El resto cubre otros lenguajes (Go, Rust, Java, Python…).
  - Skills relevantes: `tdd-workflow`, `verification-loop`, `security-review`, `strategic-compact`, `continuous-learning-v2`, `unified-memory`, `plan-orchestrate`.
  - Comandos relevantes: `/plan`, `/prp-plan`, `/prp-implement`, `/code-review`, `/review-pr`, `/quality-gate`, `/build-fix`, `/test-coverage`, `/security-scan`, `/refactor-clean`, `/update-docs`, `/save-session`, `/resume-session`, `/learn`.
