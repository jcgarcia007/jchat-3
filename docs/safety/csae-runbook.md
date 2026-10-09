# Runbook CSAE — material de abuso y explotación sexual infantil (JChat)

> ## ⚠️ BORRADOR — REQUIERE REVISIÓN LEGAL
> Este documento lo redactó un asistente técnico para que **Juan y su asesor legal** lo revisen. **No es asesoría legal.** Los pasos de
> NCMEC, los plazos de conservación y las obligaciones de Otunity Labs LLC como proveedor de servicios electrónicos (ESP) **deben ser
> confirmados por un abogado** antes de adoptarlo. Donde el borrador duda, lo dice (marcado **[CONFIRMAR]**).
> Fecha del borrador: 2026-10-09 · Versión 0.1 · Aprobado por: _(pendiente)_ · Última revisión legal: _(pendiente)_

## 1. Propósito y alcance
Define qué hace JChat cuando recibe o detecta contenido que pueda constituir material de abuso sexual infantil (CSAM) o conducta que ponga en
peligro a un menor. Aplica a cualquier contenido de la app y la web: mensajes del chat del local, mensajes directos, fotos, publicaciones,
comentarios, historias, perfiles y fotos de Match.

JChat es solo para mayores de 18 años. Un menor en la plataforma ya es un incidente por sí mismo.

## 2. Responsables
| Rol | Persona | Contacto | Suplente |
|---|---|---|---|
| Responsable de seguridad infantil (revisa y decide) | _(por definir)_ | safety@jchat.cloud | _(por definir)_ |
| Asesor legal | _(por definir)_ | | |
| Persona que presenta el reporte a NCMEC | _(por definir; debe ser quien tenga la cuenta de la CyberTipline)_ | | |
| Acceso técnico (hide / suspender / exportar evidencia) | _(super-admin)_ | | |

Regla: **como mínimo dos personas** con acceso al panel y a este runbook, para que nunca dependa de una sola.

## 3. Principios no negociables
1. **No ver más de lo necesario.** El panel oculta por defecto los medios de los reportes `child_safety` y `sexual_content` ("Contenido sensible oculto" → "Mostrar" por elemento). Solo se muestra lo imprescindible para decidir, y solo lo hace el responsable.
2. **No descargar, copiar, capturar, reenviar ni compartir el material** — ni por correo, chat, nube personal o captura de pantalla. El correo de `safety-alert` nunca lleva el contenido (solo id, motivo, prioridad, tipo, fecha y enlace).
3. **No borrar nada.** Se oculta (`admin_hide_content`) y se conserva como evidencia. Borrar contenido o cuentas destruye pruebas que la ley obliga a preservar.
4. **No investigar por cuenta propia ni contactar al sospechoso.**
5. **Un menor en peligro inmediato → llamar al 911** (o a la policía local) primero; después seguir este runbook.

## 4. Flujo de respuesta
### 4.1 Entrada
- Reporte de un usuario con motivo **`child_safety`** (app o web) → prioridad `urgent` (trigger de la migración 212) → correo de aviso a safety@jchat.cloud (Edge Function `safety-alert`).
- Reporte automático del sistema por foto de DM `rejected` (migración 214, motivo `sexual_content`, urgente).
- Aviso externo (correo a safety@, autoridades, NCMEC, Apple/Google, un usuario).
- Cualquier miembro del equipo que vea algo sospechoso: avisar de inmediato al responsable; **no** reenviar el contenido.

### 4.2 Plazos (propuesta — [CONFIRMAR] con el asesor)
| Paso | Objetivo |
|---|---|
| Acuse y primera revisión de un reporte `child_safety` | **lo antes posible; máximo 24 h** (compromiso público en /safety) |
| Contención (ocultar contenido + suspender cuenta) | en la misma revisión, sin esperar a decidir si se reporta |
| Reporte a NCMEC | **"tan pronto como sea razonablemente posible"** tras tener conocimiento real (18 U.S.C. § 2258A) |

### 4.3 Pasos
1. **Abrir** `https://jchat.cloud/super-admin/alerts` → pestaña **Urgentes**. Leer motivo, detalle, tipo, reportado y local. No pulsar "Mostrar" salvo necesidad.
2. **Contener (siempre, primero):**
   - *Ocultar contenido* (`admin_hide_content`): queda oculto para todos menos autor y admins; **se conserva** como evidencia.
   - *Suspender permanente* (`admin_suspend_user`, `days = null`): marca la cuenta como suspendida y cierra las sesiones. **No eliminar la cuenta.**
3. **Evaluar** (solo el responsable): ¿hay indicios razonables de CSAM o de explotación/captación de un menor?
   - **Sí o duda razonable → ir a 5 (NCMEC).**
   - **No** → resolver el reporte con la resolución que corresponda (`no_action`, `content_removed`, `user_suspended`) y una nota. Si el reportante actuó de buena fe, no se le sanciona.
4. **Preservar evidencia** (ver 6) — antes de cualquier otra acción.
5. **Reportar a NCMEC** (ver 7) y registrar el número de reporte.
6. **Resolver el reporte** en el panel con `escalated_ncmec` y una nota que contenga **solo** el número de reporte de la CyberTipline, la fecha y quién lo presentó. **Nunca** pegar contenido en la nota.
7. **Bitácora** (ver 9) y **notificar al asesor legal**.
8. **Autoridades:** atender las solicitudes legales válidas solo a través del asesor legal.

## 5. Suspensión y cierre de cuentas
- Usar `admin_suspend_user` (permanente) en cuanto haya indicios. Deja registro en `security_logs` (`user_suspended`).
- **No** ofrecer ni ejecutar el borrado de la cuenta de un usuario bajo investigación.
- **Brecha técnica a resolver [CONFIRMAR con ingeniería y legal]:** hoy un usuario puede eliminar su propia cuenta (app y `/account/delete`) y el borrado en cascada elimina su contenido y los reportes sobre él (`on delete cascade`). Para cuentas con **retención legal** hace falta un bloqueo (legal hold) que impida el autoborrado y conserve la evidencia. Hasta que exista, la suspensión inmediata es la mitigación, y el responsable debe **exportar la evidencia permitida a un almacenamiento seguro del asesor** antes de que el usuario pueda borrar.

## 6. Preservación de evidencia
Qué se conserva y dónde:
- `reports.snapshot` (copia **solo de texto** que toma el servidor al reportar; no incluye URLs de medios), `reports.details`, `reports.reason`, `reports.created_at`, quién reportó.
- El contenido oculto (`hidden_at` / `hidden_by`) en `posts`, `comments`, `messages`, `dm_messages` — **no se borra**.
- Los objetos de Storage (buckets `dm-media`, `match-photos`, fotos de publicaciones): **no eliminar**. Identificar su ruta en la base; no descargarlos.
- `security_logs` (acciones de admin con fecha y actor) y los datos de la cuenta (id, correo de registro, fechas, IP si existe en logs de Auth).
- **Plazo de conservación:** el borrador de Juan indica **90 días** (18 U.S.C. § 2258A(h), redacción anterior). **[CONFIRMAR]**: la ley **REPORT Act (2024)** amplió el plazo de preservación a **1 año**; la recomendación de este borrador es **preservar 1 año** salvo que el asesor indique otra cosa. Preservar también con la solicitud de las autoridades.
- **Acceso restringido** a esa evidencia: solo responsable y asesor; registrar cada acceso.
- Las copias de seguridad de Supabase pueden contener datos más allá de este plazo: pedir al asesor cómo tratarlas.

## 7. Reporte a la CyberTipline de NCMEC
> **[CONFIRMAR] todo este apartado con el asesor legal y con la guía vigente de NCMEC.** Los portales y formularios cambian.
**Quién debe reportar:** los proveedores de servicios electrónicos con sede en EE. UU. deben reportar a NCMEC el CSAM aparente del que tengan conocimiento real (18 U.S.C. § 2258A). Otunity Labs LLC debe tratarse como ESP.

**Registro previo (hacerlo ANTES de necesitarlo):**
1. Con el asesor, preparar los datos de la empresa: razón social (Otunity Labs LLC), dirección, persona de contacto 24 h, correo safety@jchat.cloud.
2. Solicitar a NCMEC el **registro como ESP** para obtener acceso a la CyberTipline (desde el sitio de NCMEC / CyberTipline, sección para proveedores de servicios electrónicos). Anotar fecha, usuario y quién administra la cuenta.
3. Guardar credenciales en el gestor de secretos de la empresa (nunca en el repo ni en chats).
4. Hacer una **prueba de procedimiento** con el contacto de NCMEC (sin material real).

**Cuando hay un caso:**
1. El responsable inicia sesión en la CyberTipline como ESP.
2. Completar el formulario con los datos permitidos: identificadores de cuenta (id de usuario, nombre de usuario, correo, fechas de creación y actividad), fecha/hora y descripción del incidente, y el contenido solo si el formulario lo exige y el asesor lo autoriza.
3. **Subir el material únicamente por el canal de NCMEC**, nunca por correo ni otro medio. Si NCMEC pide archivos, el responsable los obtiene según las instrucciones del asesor.
4. Guardar el **número de reporte** (y el acuse) y anotarlo en el panel (nota del reporte) y en la bitácora.
5. Si el menor corre peligro inmediato, además llamar al 911.

## 8. Comunicación
- **Al reportante:** mensaje breve de agradecimiento; no se revelan detalles del caso ni el resultado.
- **Al usuario sospechoso:** no avisar de la investigación; si pregunta por la suspensión, usar el texto estándar y derivar a safety@jchat.cloud tras consultar al asesor.
- **A Apple/Google:** si la tienda pregunta, responder con este proceso (resumen) a través del responsable.
- **Prensa/terceros:** solo el responsable legal.

## 9. Bitácora de incidentes (plantilla)
Guardar **fuera del repo** (almacenamiento seguro del asesor). Una fila por incidente; **sin contenido, solo referencias**.

| # | Fecha/hora (recepción) | Origen (reporte id / aviso) | Tipo (contenido, usuario) | Revisado por | Hora de primera revisión | Contención (oculto / suspendido, fecha) | ¿Reporte a NCMEC? (sí/no) | N.º de reporte CyberTipline | Fecha del reporte | Evidencia preservada (dónde, hasta cuándo) | Notificado al asesor | Cierre / notas |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | | | | |

Además, el panel deja registro en `security_logs` de `content_hidden`, `user_suspended` y `report_resolved` (con actor y fecha); la bitácora lo complementa con la decisión y los plazos.

## 10. Bienestar del personal
Revisar este material es duro. Limitar la exposición (solo el responsable), permitir pausas y ofrecer apoyo profesional. Nadie debe revisar contenido sensible a solas durante largos periodos sin descanso.

## 11. Capacitación y revisión
- Todo el personal con acceso lee este runbook antes de recibir permisos de admin.
- Simulacro anual (reporte de prueba de otro motivo, sin material real) para comprobar correo de aviso, panel, contención y bitácora.
- Revisar el runbook cada 6 meses o cuando cambie la ley, NCMEC, la plataforma o el proveedor de moderación.

## 12. Estado técnico (para la revisión)
| Capacidad | Estado |
|---|---|
| Reportar `child_safety` en app y web (prioridad urgente automática) | Implementado (migración 212 + app/web), **pendiente de aplicar** |
| Aviso por correo a safety@jchat.cloud (solo notificación) | Función `safety-alert` escrita, **pendiente de desplegar** y de crear `RESEND_API_KEY` |
| Ocultar contenido / suspender / resolver con `escalated_ncmec` | Migración 213, **pendiente de aplicar** |
| Cola de revisión con medios sensibles ocultos | Implementada |
| Foto de DM explícita → rechazada + reporte urgente | Migración 214 y `moderate-dm-photo` escritas, **pendientes** |
| Detección por hash de CSAM conocido (PhotoDNA / Content Safety API) | **No existe.** SafeSearch no detecta CSAM. Evaluar con el asesor |
| Bloqueo legal (legal hold) contra el autoborrado de cuenta | **No existe** (ver 5) |
| Registro de Otunity Labs como ESP en NCMEC | **Pendiente** |

## 13. Pendientes para Juan y el asesor
1. Nombrar responsable y suplente; completar la tabla del apartado 2.
2. Confirmar con el asesor: obligación y plazos de reporte, plazo de preservación (90 días vs 1 año), tratamiento de copias de seguridad, texto público de /safety.
3. Registrar a Otunity Labs LLC como ESP en la CyberTipline y probar el procedimiento.
4. Crear el buzón safety@jchat.cloud y el secreto `RESEND_API_KEY`.
5. Decidir sobre la detección por hash de CSAM y sobre el bloqueo legal contra el autoborrado.
