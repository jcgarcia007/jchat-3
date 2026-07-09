# JChat 3.0 — Auditoría Senior · Parte 3 (Móvil: iOS + Android)

> Fecha: 2026-07-09 · Método: lectura de `app.config.ts`, `package.json`,
> `eas.json`, `LoginScreen.tsx` reales vía GitHub MCP. Comparado con requisitos de
> App Store / Play Store 2026 y best practices Expo SDK 56.

---

## Resumen

Stack móvil moderno y bien elegido (Expo SDK 56, RN 0.85, React 19, expo-updates,
expo-local-authentication, i18next YA instalados y en uso). Pero hay **3 flujos que
parecen funcionar y no lo hacen** (biometría, OAuth, Maps iOS) y **varios requisitos
de tienda pendientes** que bloquean la aprobación. Nada es reescritura; son cierres.

| # | Hallazgo | Sev | Bloquea |
|---|----------|-----|---------|
| M1 | **OAuth Google/Apple no completa** — falta deep-link handler; abre browser y no vuelve | 🔴 | Login social + review Apple |
| M2 | **Biometría es teatro** — autentica pero NO resume sesión (TODO explícito) | 🔴 | UX login (promesa incumplida) |
| M3 | **Maps iOS**: config actual usa Apple Maps; contradice D-02 (Google en iOS para estilo) | 🟡 | Estilo mapa iOS |
| M4 | Sign in with Apple: requisito **obligatorio** de Apple si hay login social | 🔴 | Review Apple |
| M5 | Push server-side senders sin implementar (solo cliente local) | 🟡 | Notificaciones reales |
| M6 | Cuenta: **borrado de cuenta in-app** obligatorio (Apple + Google) | 🔴 | Review ambas tiendas |
| M7 | UGC: Apple exige EULA + reporte + bloqueo + filtrado + acción 24h | 🟡 | Review Apple (1.2) |
| M8 | Permisos de ubicación "Always": justificar o quitar background | 🟡 | Review Apple |
| M9 | expo-updates instalado pero canal/runtime no verificado | 🟡 | OTA a testers |
| M10 | `enableGooglePay: false` en Stripe pero spec promete Google Pay | 🟢 | Feature parity |

---

## 🔴 M1 — OAuth no completa el ciclo

En `LoginScreen.handleOAuth`:
```js
if (data.url) {
  // TODO(deep-link): handle OAuth redirect back into the app.
  await WebBrowser.openBrowserAsync(data.url);
}
```
`openBrowserAsync` abre el navegador, pero **no hay handler que capture el redirect
`jchat://auth/callback`** para devolver la sesión a la app. Resultado: el usuario
hace login en Google/Apple y **nunca regresa autenticado**. El botón existe, se ve
bien, y no funciona.

**Fix:** usar `WebBrowser.openAuthSessionAsync(url, redirectUrl)` +
`Linking`/`makeRedirectUri`, configurar el scheme `jchat://` en `app.config.ts`
(hoy no hay `scheme` declarado — hay que añadirlo), y en Supabase Auth registrar la
redirect URL. Al volver, `supabase.auth.setSession` con los tokens del fragment.

## 🔴 M2 — Biometría no resume sesión

```js
if (result.success) {
  // TODO: resume an existing Supabase session here.
  Alert.alert('biometricVerifiedMessage');  // ← solo muestra un alert
}
```
Face ID/Touch ID valida al usuario pero luego **solo muestra un Alert** — no hay
sesión, no entra a la app. Es la funcionalidad estrella del spec ("Face ID first")
y hoy es decorativa.

**Fix:** al primer login exitoso con email, guardar un flag "biometric enabled" +
mantener la sesión de Supabase persistida (AsyncStorage, ya configurado). En
`handleBiometric` tras `result.success`: `supabase.auth.getSession()` → si existe
sesión válida, dejar que el AuthContext la tome; si no, pedir login con email una
vez para "armar" la biometría. Patrón estándar: la biometría desbloquea la sesión
persistida, no reemplaza el login inicial.

## 🟡 M3 — Contradicción Maps iOS (código vs D-02)

`DECISIONS.md` D-02 dice: usar la forma array con `iosGoogleMapsApiKey` para tener
**Google Maps en iOS** (necesario para el estilo pastel/dark custom, que Apple Maps
no soporta). Pero el `app.config.ts` actual:
```js
['react-native-maps', { androidGoogleMapsApiKey: … }]  // ← solo Android
// + comentario "iOS uses Apple Maps (no key needed)"
```
No hay `iosGoogleMapsApiKey`. O bien (a) se revirtió la decisión D-02 y el estilo
custom en iOS ya no aplica (entonces actualizar D-02), o (b) es una regresión y el
mapa iOS perdió el estilo de marca. **Acción:** decidir cuál es el intent real. Si
quieres el estilo custom en iOS (recomendado por consistencia de marca), volver a la
forma array con `iosGoogleMapsApiKey`. Si Apple Maps está bien para iOS, actualizar
D-02 y el DESIGN_SYSTEM para reflejarlo.

## 🔴 M4 — Sign in with Apple obligatorio

Apple App Store Review Guideline 4.8: si ofreces login social de terceros (Google),
**debes** ofrecer también Sign in with Apple (o un login equivalente que cumpla
privacidad). El botón Apple ya está en la UI ✅, pero (por M1) no completa. Además la
capability "Sign in with Apple" debe estar en el provisioning de EAS. **Fix:**
cerrar M1 para Apple + habilitar la capability en App Store Connect.

## 🟡 M5 — Push server-side sin implementar

`expo-notifications` está instalado y el token se guarda en `users.push_token`, pero
los **senders server-side** (orden lista, nuevo DM/follower/like, alertas de staff,
regalo, reserva) están en TODO (ver DEPLOYMENT_CHECKLIST §5/§10). Hoy solo funciona
la notificación local de proximidad. **Fix:** Edge Function o DB trigger que llame
la Expo Push API en los eventos clave. Sin esto, la app "no notifica nada" en la
práctica — mala primera impresión.

## 🔴 M6 — Borrado de cuenta in-app

Apple (5.1.1v) y Google exigen que una app que permite crear cuenta permita
**borrarla desde dentro de la app** (no solo desactivar). No veo pantalla de "eliminar
cuenta". **Fix:** pantalla en Settings → Delete account que llame un RPC/Edge
Function que borre/anonimice al usuario (auth.users + public.users + cascada). Es
rechazo seguro en review si falta.

## 🟡 M7 — Requisitos UGC de Apple (Guideline 1.2)

Una app con contenido generado por usuarios (chat, posts, DMs) debe tener, para
pasar review: (1) EULA/ToS con cláusula de "cero tolerancia a contenido abusivo",
(2) filtrado de contenido objetable, (3) mecanismo de **reportar** (tienes tabla
`reports` ✅), (4) **bloquear** usuarios (tienes `blocks` ✅), (5) capacidad de
**actuar y remover** contenido + expulsar usuarios en **24h**. Tienes la
infraestructura de datos; falta confirmar el **flujo end-to-end en la app** (botón
reportar visible, bloqueo efectivo, y un proceso tuyo de moderación con SLA 24h).
**Fix:** verificar que reportar/bloquear estén cableados en la UI de chat/DM/perfil
y documentar tu proceso de moderación (aunque seas tú solo al inicio).

## 🟡 M8 — Permisos de ubicación "Always"

`expo-location` pide `locationAlwaysAndWhenInUsePermission`. Apple es estricto: si
pides "Always" (background) debes justificar el uso en background y mostrarlo en
review, o te rechazan. Tu proximidad hoy es client-local en foreground. **Fix:** si
no usas background location aún, pedir solo "When in use" y dejar "Always" para
cuando implementes la proximidad en background (con justificación clara). Reduce
fricción de review.

## 🟡 M9 — expo-updates (OTA) sin verificar

`expo-updates` está instalado y `eas.json` usa `appVersionSource: remote` ✅, pero no
veo `runtimeVersion` ni `updates.url`/canal configurado en `app.config.ts`. Sin eso,
OTA no funciona para testers. **Fix:** configurar `runtimeVersion` (policy
`sdkVersion` o `appVersion`) + canales (preview/production) para poder empujar
correcciones sin rebuild.

## 🟢 M10 — Google Pay desactivado

`@stripe/stripe-react-native` tiene `enableGooglePay: false`, pero el spec (§9.1)
promete Google Pay en Android. **Fix:** activarlo cuando configures Stripe live +
merchant. Menor, pero es feature prometida.

---

## Best practices que YA cumples (bien hecho)

- Expo SDK 56 / RN 0.85 / React 19 — stack al día.
- `expo-local-authentication`, `expo-updates`, `i18next` instalados y (i18n) en uso.
- Permisos con textos descriptivos (Apple exige purpose strings) ✅.
- `ITSAppUsesNonExemptEncryption: false` declarado (evita fricción de export
  compliance en cada build) ✅.
- Accesibilidad: `accessibilityRole`/`accessibilityLabel` en el login ✅ (raro y
  bueno de ver).
- Adaptive icon Android completo (foreground/background/monochrome) ✅.
- `legacy:true` en image picker Android + try/catch (fix documentado en ARCHITECTURE).

---

## Orden recomendado (móvil, camino a stores)

**Bloqueantes de review (hacer sí o sí):**
1. M1 — deep-link OAuth (scheme jchat:// + openAuthSessionAsync + setSession).
2. M4 — Sign in with Apple capability + completar flujo.
3. M6 — borrado de cuenta in-app.
4. M2 — biometría resume sesión (o quitarla del UI si se difiere, para no prometer
   lo que no cumple).

**Antes de abrir al público:**
5. M5 — push server-side senders.
6. M7 — verificar flujo reportar/bloquear + proceso de moderación 24h.
7. M8 — permiso de ubicación "When in use" hasta tener background real.

**Config/infra:**
8. M3 — resolver contradicción Maps iOS.
9. M9 — configurar OTA (runtimeVersion + canales).
10. M10 — Google Pay al ir live.
