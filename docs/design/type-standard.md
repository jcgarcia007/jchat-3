# Estándar de tipografía y espacios (B7)

Fuente de verdad en código: `mobile/theme/typography.ts` (roles) y `mobile/theme/spacing.ts` (espacios).
Componentes: `components/common/AppText.tsx` y `components/common/FormField.tsx`.
Test que lo hace cumplir: `mobile/scripts/type-standard.test.mjs` (lista de archivos migrados en `scripts/type-standard-targets.json`).

## Roles de texto

| Rol | Tamaño | Interlineado (× tamaño) | Tope de letra grande | Uso |
|---|---|---|---|---|
| `display` | 32 | 1.15 | 1.3 | Titular de portada / bienvenida (una frase corta) |
| `title` | 24 | 1.2 | 1.3 | Título de pantalla o de tarjeta |
| `headline` | 18 | 1.3 | 1.4 | Subtítulo, encabezado de sección |
| `body` | 16 | 1.4 | 1.6 | Texto corrido, descripciones, mensajes |
| `field` | 16 | 1.3 | 1.6 | Lo que escribe la persona en un campo |
| `label` | 13 | 1.3 | 1.6 | Etiqueta de campo (mayúsculas, con tracking) |
| `button` | 16 | 1.2 | 1.3 | Texto de botones |
| `caption` | 12 | 1.35 | 1.4 | Errores, ayudas, notas, reglas de contraseña |

Reglas:

- **El interlineado es siempre una proporción del tamaño**, calculada en `typeStyle(role)`. Nunca `lineHeight: 22` en un estilo: un px fijo se ve demasiado abierto cuando el tope frena el texto.
- **`letterSpacing` solo en `label`** (y en decoración marcada como tal en el código). Nada más lleva tracking.
- **Etiqueta y campo comparten tope (1.6)**: la etiqueta no puede quedar diminuta junto al valor que sí crece.
- Los topes protegen contenedores de forma fija (botones 1.3, titulares 1.3); el texto de contenido crece hasta 1.6. Nunca `allowFontScaling={false}`.
- Las fuentes de marca (serif del título, mono de las etiquetas, Plus Jakarta del texto de login) se mantienen: el estándar define tamaños y ritmos, no cambia la marca. Se aplican con `family` en `AppText`/`FormField`.

## Espacios

Rejilla de 4: `space.xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32 · xxxl 40`.

| Token | Valor | Uso |
|---|---|---|
| `fieldLabelGap` | 6 | Etiqueta → campo, y campo → error/ayuda |
| `fieldGap` | 16 | Campo → siguiente campo |
| `sectionGap` | 24 | Grupo de campos → siguiente grupo |
| `controlMinHeight` | 48 | Alto mínimo de campos y botones (`minHeight`, nunca `height`) |

Margin, padding y gap en pantallas migradas: múltiplos de 4 (más el 6 de `fieldLabelGap`). Alturas de controles de texto: `minHeight`.

## Cómo usarlo

```tsx
<AppText variant="display" family="title">…</AppText>
<AppText variant="body" color={muted}>…</AppText>
<FormField label="Correo" value={email} onChangeText={setEmail} first palette={ticketPalette} />
```

En un `StyleSheet`: `...typeStyle('body')` en lugar de `fontSize`/`lineHeight`. Botones: `typeStyle('button')` con `minHeight: controlMinHeight`.

## Qué falta (segunda tanda)

Chat, Mapa, Match y POS siguen con sus tamaños actuales (con los topes de DT-1: contenido 1.6, etiquetas cortas 1.3). Se migran después de que Juan apruebe Registro y Login.
