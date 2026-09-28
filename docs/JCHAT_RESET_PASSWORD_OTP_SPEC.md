# JCHAT — Recuperar contraseña con CÓDIGO de 6 dígitos (reemplaza el enlace)

**Versión:** 1.0 · **Fecha:** 2026-09-28 · **Autor:** Planning
**Repo:** `jcgarcia007/jchat-3` · carpeta `/Users/jcgarcia/Projects/JchatVer3.0`
**Rama nueva:** `feat/reset-otp`, creada desde `origin/feat/auth-emails` (commit `a1dca0f`) y luego `git merge origin/main` para traer `AGENTS.md` (no debe haber conflictos: `main` solo agregó `AGENTS.md`).
**Checkpoint:** NO (Paso 0 corto, reportar y continuar). **Sin migraciones.** Solo `mobile/` + `supabase/templates/recovery.html` + `supabase/config.toml`.

---

## 1. Por qué

Hoy "Olvidé mi contraseña" envía un **enlace** que abre la app con `jchat://reset`. Problemas verificados en producción (logs de Supabase, 2026-09-28):

1. **El enlace abre sesión por sí solo** (Supabase crea la sesión al validar el enlace). Si la app no muestra la pantalla de nueva contraseña, o el usuario la cierra, queda **logueado sin haber cambiado la contraseña**. Juan lo reprodujo: tocó el enlace y entró directo.
2. **No funciona si el correo se abre en la computadora** (el enlace `jchat://` solo abre la app en el teléfono).
3. **Un solo uso:** un segundo toque (o un filtro de seguridad del correo que "revisa" enlaces) lo gasta → "Email link is invalid or has expired" (visto en logs).
4. Depende de enlaces profundos, que ya dieron varios fallos.

**Mejor práctica para apps móviles:** código de un solo uso (OTP) que el usuario escribe dentro de la app. Supabase lo soporta nativamente: la plantilla de recuperación puede mostrar `{{ .Token }}` y la app lo valida con `supabase.auth.verifyOtp({ email, token, type: 'recovery' })`.

---

## 2. Flujo nuevo (lo que ve el usuario)

1. **Login → "Olvidé mi contraseña"** → pantalla `ForgotPasswordScreen`: escribe su correo → botón "Enviar código".
2. Se envía `resetPasswordForEmail(email, { captchaToken })` (**sin** `redirectTo`). Pase lo que pase (salvo error de captcha o de límite de envíos), la app muestra el mismo mensaje: *"Si existe una cuenta con ese correo, te enviamos un código de 6 dígitos."* — **nunca revelar si la cuenta existe**.
3. La misma pantalla pasa al **paso "Escribe el código"**: campo de 6 dígitos, teclado numérico, autocompletado de código (`textContentType="oneTimeCode"` en iOS, `autoComplete="one-time-code"` / `sms-otp` en Android), botón "Verificar", botón **"Reenviar código"** deshabilitado con cuenta regresiva de **60 s** (coincide con el intervalo mínimo configurado en Supabase), y "Cambiar correo" para volver al paso 1.
4. Al verificar: `verifyOtp({ email, token, type: 'recovery' })`.
   - Código incorrecto o caducado → error claro, se queda en la pantalla.
   - Correcto → **`ResetPasswordScreen`** (nueva contraseña + confirmar, mínimo 8 caracteres).
5. Al guardar: `supabase.auth.updateUser({ password })` → éxito → **`supabase.auth.signOut({ scope: 'others' })`** (cierra todas las demás sesiones de esa cuenta) → mensaje "Contraseña actualizada" → entra a la app con sesión.
6. **Si abandona** en `ResetPasswordScreen` (botón Cancelar/atrás, o cierra la app) **sin guardar** → la app **cierra esa sesión** (`signOut({ scope: 'local' })`) y vuelve al Login. El código nunca deja al usuario "logueado por correo".

---

## 3. Paso 0 (reportar y continuar)

1. Estado actual de: `mobile/screens/auth/ForgotPasswordScreen.tsx`, `mobile/screens/auth/ResetPasswordScreen.tsx`, `mobile/context/AuthContext.tsx` (`isRecovering`, `clearRecovery`, rama `://reset` de `handleAuthUrl`), `mobile/navigation/AppNavigator.tsx` (`RecoveryStack`) y cómo se navega hoy de Forgot → Reset.
2. Versión de `@supabase/supabase-js` en `mobile/package.json` y confirmar en su documentación: firma de `verifyOtp` con `type: 'recovery'`, si acepta `options.captchaToken`, y **qué evento emite** en `onAuthStateChange` (`SIGNED_IN` o `PASSWORD_RECOVERY`).
3. Si el endpoint de verificación exige captcha con la protección activa (probarlo en el emulador o revisar la doc); si lo exige, pasar el token.
4. Confirmar que `signOut({ scope: 'others' })` existe en esa versión.

---

## 4. Cambios en la app (`/Users/jcgarcia/Projects/JchatVer3.0/mobile`)

### 4.1 `screens/auth/ForgotPasswordScreen.tsx`
- Dos pasos en la misma pantalla: `email` → `code`.
- Paso `email`: mantener el patrón de captcha actual (`useCaptcha`, `{CaptchaGate}`, `captchaErrorI18nKeys`). Llamar `resetPasswordForEmail(email.trim().toLowerCase(), { captchaToken })` **sin `redirectTo`**. Tratar como éxito cualquier respuesta salvo errores de captcha o de límite de envíos (`over_email_send_rate_limit` → "Espera un momento antes de pedir otro código"). Pasar al paso `code`.
- Paso `code`: input de 6 dígitos (solo números, pegar desde el portapapeles debe funcionar), `verifyOtp` con captcha si el Paso 0 lo exige. **Antes** de llamar a `verifyOtp`, activar la bandera de recuperación (ver 4.3) para que, cuando llegue la sesión, el navegador muestre `ResetPasswordScreen` y no la app. Si `verifyOtp` falla, desactivar la bandera y mostrar el error.
- "Reenviar código": vuelve a llamar `resetPasswordForEmail` (con captcha nuevo), cuenta regresiva de 60 s.
- Mensajes siempre genéricos respecto a si la cuenta existe.

### 4.2 `screens/auth/ResetPasswordScreen.tsx`
- Mantener nueva contraseña + confirmar (mín. 8, iguales). No pedir la contraseña actual.
- Al guardar con éxito: `updateUser({ password })` → `signOut({ scope: 'others' })` (si falla este paso, registrarlo con `console.warn` pero no bloquear al usuario) → `clearRecovery()` → mensaje de éxito.
- Botón **Cancelar** visible: `signOut({ scope: 'local' })` + `clearRecovery()` → Login.
- Bloquear el gesto/botón atrás de Android para que no salga a la app sin pasar por Cancelar.

### 4.3 `context/AuthContext.tsx`
- `isRecovering` pasa a controlarse por la app: exponer `beginRecovery()` (lo llama Forgot antes de `verifyOtp`) y `clearRecovery()`.
- Persistir la bandera en AsyncStorage (`jchat.recovery_pending = '1'`) al iniciar y borrarla en `clearRecovery()`.
- **Arranque en frío:** si al restaurar la sesión existe `jchat.recovery_pending`, significa que la app se cerró a mitad de la recuperación → `signOut({ scope: 'local' })`, borrar la bandera, y dejar al usuario en Login.
- Mantener el listener de `PASSWORD_RECOVERY` sin efectos extra (o quitarlo si ya no aplica; reportarlo).
- **Quitar la rama `://reset` de `handleAuthUrl`** (el flujo ya no usa enlaces). Mantener intacta la rama `://confirm` (registro).

### 4.4 `navigation/AppNavigator.tsx`
- `RecoveryStack` sigue teniendo prioridad sobre la app cuando `isRecovering` es `true`. Verificar que no haya parpadeo hacia la app entre que llega la sesión y se muestra `ResetPasswordScreen`.

### 4.5 i18n (`i18n/locales/en/auth.json` y `es/auth.json`, paridad obligatoria)
Claves nuevas (sugeridas, bajo `auth.forgotPassword.*` y `auth.resetPassword.*`): título/subtítulo del paso código, `codeLabel`, `codePlaceholder`, `verify`, `resend`, `resendIn` ("Reenviar en {{seconds}} s"), `changeEmail`, `sentGeneric` ("Si existe una cuenta con ese correo, te enviamos un código de 6 dígitos"), `codeInvalid` ("El código es incorrecto o caducó"), `rateLimited`, `cancel`, `success`. Quitar las claves que queden sin uso (`expiredLink*` del flujo de enlace) si ya no se usan.

---

## 5. Plantilla del correo (`/Users/jcgarcia/Projects/JchatVer3.0/supabase/templates/recovery.html`)

Reemplazar el contenido por esta versión (código grande, sin enlace, bilingüe). En `supabase/config.toml` actualizar el `subject` de `[auth.email.template.recovery]` a:
`JChat — Tu código para restablecer la contraseña · Your password reset code`

```html
<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>JChat — Tu código para restablecer la contraseña</title>
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .bg-outer { background-color: #0b0d14 !important; } .bg-card { background-color: #161a26 !important; }
    .t-title { color: #f5f5f7 !important; } .t-body { color: #d1d5db !important; } .t-muted { color: #9ca3af !important; }
    .t-brand { color: #8fa4ff !important; } .code-box { background-color: #1f2740 !important; color: #ffffff !important; } .hr { border-color: #2a3042 !important; }
  }
  @media only screen and (max-width: 600px) { .container { width: 100% !important; } .pad { padding: 24px 20px !important; } }
</style>
</head>
<body class="bg-outer" style="margin:0;padding:0;background-color:#f5f5f7;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Tu código de JChat: {{ .Token }}. Caduca en 15 minutos. · Your JChat code: {{ .Token }}. Expires in 15 minutes.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="bg-outer" style="background-color:#f5f5f7;">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" class="container bg-card" style="width:560px;max-width:100%;background-color:#ffffff;border-radius:16px;">
  <tr><td class="pad" style="padding:32px 36px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

    <p class="t-brand" style="margin:0 0 20px;font-size:22px;font-weight:700;color:#5C7CFA;letter-spacing:-0.3px;">JChat</p>

    <h1 class="t-title" style="margin:0 0 12px;font-size:22px;line-height:28px;font-weight:700;color:#1d1d1f;">Tu código para restablecer la contraseña</h1>
    <p class="t-body" style="margin:0 0 16px;font-size:16px;line-height:24px;color:#3a3a3c;">Escribe este código en la app de JChat para elegir una nueva contraseña. Caduca en <strong>15 minutos</strong> y solo se puede usar una vez.</p>

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 24px;"><tr>
      <td class="code-box" align="center" style="background-color:#eef2ff;border-radius:12px;padding:16px 28px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#1d1d1f;">{{ .Token }}</td>
    </tr></table>

    <p class="t-muted" style="margin:0 0 24px;font-size:13px;line-height:20px;color:#6e6e73;">Nunca compartas este código. Nadie de JChat te lo pedirá. Si no pediste cambiar tu contraseña, ignora este correo: tu contraseña seguirá igual.</p>

    <hr class="hr" style="border:none;border-top:1px solid #e5e5ea;margin:0 0 24px;">

    <h2 class="t-title" style="margin:0 0 8px;font-size:17px;line-height:24px;font-weight:700;color:#1d1d1f;">Your password reset code</h2>
    <p class="t-body" style="margin:0 0 12px;font-size:15px;line-height:22px;color:#3a3a3c;">Enter the code above in the JChat app to choose a new password. It expires in <strong>15 minutes</strong> and can be used once.</p>
    <p class="t-muted" style="margin:0 0 24px;font-size:13px;line-height:20px;color:#6e6e73;">Never share this code. JChat will never ask you for it. If you didn't request a password reset, ignore this email — your password stays the same.</p>

    <hr class="hr" style="border:none;border-top:1px solid #e5e5ea;margin:0 0 16px;">
    <p class="t-muted" style="margin:0;font-size:12px;line-height:18px;color:#8e8e93;">Otunity Labs LLC · <a href="https://jchat.cloud/privacy" style="color:#8e8e93;">Privacidad / Privacy</a> · <a href="https://jchat.cloud/support" style="color:#8e8e93;">Ayuda / Support</a></p>

  </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>
```

---

## 6. Ajustes en Supabase (los hace Juan; Codex NO toca producción)

Proyecto **otunity-platform** (`klfsgcfoahdtkojyqspd`):
1. **Duración del código:** Authentication → Sign In / Providers → **Email** → **Email OTP Expiration** → `900` segundos (15 min). *Afecta a todos los códigos/enlaces de correo, incluido el de confirmación de registro — 15 min es la práctica recomendada.*
2. **Largo del código:** mismo lugar → **Email OTP Length** → `6`.
3. **Plantilla:** Authentication → Emails → Templates → **Reset Password** → pegar Subject y HTML de la sección 5. **Hacerlo cuando el build nuevo esté instalado** (la versión vieja de la app espera el enlace).
4. Ya configurado y sin cambios: captcha, intervalo mínimo de 60 s entre correos, SMTP con Resend.

---

## 7. Prohibido
- Cambiar configuración de Supabase en producción (lo hace Juan).
- Revelar en la UI si una cuenta existe.
- Tocar la rama `://confirm` (registro) salvo lo estrictamente necesario.
- `git add .` — rutas explícitas.

---

## 8. Aceptación (pruebas de Juan en dispositivo)
- [ ] "Olvidé mi contraseña" → llega correo con **código de 6 dígitos**, asunto nuevo, remitente JChat.
- [ ] Código correcto → pantalla de nueva contraseña → guardar → entra a la app. Iniciar sesión con la contraseña nueva funciona; la vieja no.
- [ ] Código incorrecto → error, no avanza. Código usado dos veces → error.
- [ ] Cancelar en la pantalla de nueva contraseña → vuelve a Login **sin sesión**.
- [ ] Cerrar la app a mitad (en la pantalla de nueva contraseña) y abrirla de nuevo → está en Login, **no** dentro de la cuenta.
- [ ] Con sesión abierta en otro dispositivo, después del cambio esa otra sesión queda cerrada.
- [ ] Correo que no existe → mismo mensaje genérico, sin error visible.
- [ ] "Reenviar código" respeta los 60 s.
- [ ] Textos en EN y ES correctos.

**Calidad:** `cd /Users/jcgarcia/Projects/JchatVer3.0/mobile && npx tsc --noEmit` → 0 errores. Entregar SHA + `git diff --stat origin/main..HEAD`.

---

## 9. Pendiente para después (no en esta tarea)
- Mismo patrón de código para **confirmar el registro** cuando se active la confirmación de correo.
- "Olvidé mi contraseña" en la **web** (hoy no existe) con el mismo código.
- Activar **protección contra contraseñas filtradas** de Supabase (requiere plan Pro).
- Correo de aviso "Tu contraseña fue cambiada".
