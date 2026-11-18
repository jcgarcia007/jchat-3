# Seguridad estática del código — noche 1 (solo lectura)

Base `origin/main` @ `46477515`. Solo nombres y ubicaciones; ningún valor de secreto. Los hallazgos están numerados en `HALLAZGOS.md`.

## 1. Secretos y llaves
- Archivos de entorno o credenciales versionados: ninguno (`git ls-files` sin `.env*`, `google-services.json`, `GoogleService-Info.plist`, `.p8/.pem/.key/.jks`). Están en `.gitignore` (`.gitignore:3-9`, `web/.gitignore:34`, `mobile/.gitignore:35`).
- Búsqueda de patrones (`sk_live_`, `sk_test_`, `whsec_`, JWT, `AIza…`, claves privadas, tokens de GitHub/Slack): todas las coincidencias son menciones del prefijo en documentación/comentarios (`docs/DEPLOYMENT_CHECKLIST.md:107,110`, `supabase/functions/*/README.md`, `release-evidence/3.0.0/EVIDENCE.md`), validaciones de prefijo en las funciones (`stripe-connect/index.ts:17`, `stripe-webhook/index.ts:38-40`, `subscriptions/index.ts:28-29`, `terminal/index.ts:37`) o datos falsos de prueba (`mobile/scripts/wallet-diagnostic.test.mjs:24,45,46`, `mobile/scripts/web-w4-gifts.test.mjs:44`; `supabase/functions/_shared/appleRevoke_test.ts:13` genera una clave P-256 al vuelo). Sin secretos reales.
- `mobile/eas.json`: solo variable `SENTRY_DISABLE_AUTO_UPLOAD` en los 5 perfiles de build. Sin secretos.
- `mobile/app.config.ts`: `config.googleMaps.apiKey` sale de `process.env.GOOGLE_MAPS_KEY` (`:182`). Esa llave va dentro del binario por diseño de Google Maps; debe estar restringida por plataforma/bundle en la consola de Google (no verificable desde el código → comprobar en Google Cloud).
- Variables públicas en la app (`EXPO_PUBLIC_*`): `E2E` (`App.tsx:38,40`), `HCAPTCHA_SITEKEY` (`app.config.ts:295`, `services/captcha*.tsx`), `MENU_BASE_URL` (`constants/appLinks.ts:28,31`), `SENTRY_DSN` (`services/monitoring.ts:4,24,26`, `App.tsx:70`), `STRIPE_PK` (`components/StripeRoot.native.tsx:5,20`), `SUPABASE_ANON_KEY` y `SUPABASE_URL` (`services/supabase.ts:5,21,24,28,29`). Todas son públicas por naturaleza (clave anónima, clave publicable de Stripe, sitekey, DSN). `EXPO_PUBLIC_E2E` activa un modo de pruebas (`App.tsx:38-40`): en `eas.json` no está definida (bien); confirmar que tampoco lo está en las variables de EAS del proyecto.
- Variables públicas en la web (`NEXT_PUBLIC_*`): `APP_STORES_LIVE` (`lib/appLinks.ts:6`), `GOOGLE_MAPS_KEY` (`app/business/register/page.tsx:1734`, `components/dashboard/LocationEditor.tsx:19,45`; restringir por referente en Google Cloud), `HCAPTCHA_SITEKEY` (`components/InvisibleCaptcha.tsx:23,38`), `SUPABASE_ANON_KEY` (`lib/supabase.ts`, `lib/supabase/server.ts`, `lib/account.ts`, `lib/guestTabSession.ts`, `middleware.ts:16`), `SUPABASE_URL` (varios). `lib/supabaseAdmin.ts:20,27` combina `NEXT_PUBLIC_SUPABASE_URL` con la llave de servicio, solo en servidor.
- Textos que nombran variables (`web/messages/*.json:641…`, `mobile/i18n/locales/*/auth.json:113`): son mensajes de error de configuración, no valores.

## 2. `npm audit --omit=dev`
| Paquete | Alcance | Altas/críticas | Llega al usuario |
|---|---|---|---|
| `web/` | producción | 0 (total 0) | n/a |
| `mobile/` | producción | 0 altas; 3 moderadas: `minimatch` (DoS por `globparts`), `glob` (cancelación `AbortSignal`), `@expo/fingerprint` (arrastra a las dos) | No: son dependencias de herramientas de build (`@expo/fingerprint`), no del código que corre en el teléfono |

No se ejecutó ningún `fix`.

## 3. App: sesión, deep links, logs, WebViews
- Tokens y sesión: Supabase Auth usa `AsyncStorage` (`mobile/services/supabase.ts:53`), con PKCE (`:60`) y `autoRefreshToken`. No se usa `SecureStore` en ningún archivo de la app → H-005. Otros usos de AsyncStorage (preferencias): `context/AuthContext.tsx`, `services/{ageRejection,biometric,btPrinter,geofence,languageChoice,match,onboarding,proximityNotifications,tod,venueEntry}.ts`, `theme/appearance.ts`, etc.
- Esquema `jchat://`: React Navigation solo acepta `room/:id` y `post/:postId` (`navigation/AppNavigator.tsx:207-217`, con `filter: shouldLinkingHandle`); las URLs de entrada a local (`jchat://v/…`, `jchat://c/…`) las captura `hooks/useEntryLinkCapture.ts`; los retornos de autenticación pasan por `utils/authUrl.ts` (`classifyAuthUrl`, `readAuthCode`, `carriesSessionTokens`; el host `confirm` se exige exacto, `utils/authUrl.ts:20`). `AuthContext.tsx:163,179` escucha `getInitialURL` y el evento `url`.
- Universal links: iOS `applinks:jchat.cloud` y `applinks:*.jchat.cloud` (`app.config.ts:92`); Android con dos filtros (`*.jchat.cloud`, y `jchat.cloud` con prefijos `/c/` y `/t/`; `app.config.ts:139-151`). En Android el comodín abre la app también para subdominios reservados (`www`, `app`, `support`…); la app los ignora (`entryUrl.ts`), comentado en `app.config.ts:137-138`.
- `console.*`: 131 llamadas fuera de `__DEV__`/scripts. Muestreo de las que mencionan sesión/usuario/token: mensajes de error (`error.message`) sin imprimir tokens ni correos (`context/AuthContext.tsx:137,225,314,318`, `screens/auth/*`). No se encontró un `console.log` con correo, token o teléfono.
- WebViews y URLs externas: un WebView para la vista previa del menú (`screens/menu/MenuWebPreviewScreen.tsx`): navegación de primer nivel limitada a `*.jchat.cloud` (`:30`), el resto va al navegador del sistema; `originWhitelist` abierto a propósito para los iframes de Stripe (`:36`); los datos que llegan desde la web se tratan como no confiables y se validan. `openAuthSessionAsync`/`openBrowserAsync` solo con URL del proveedor OAuth y `TERMS_URL`/`PRIVACY_URL` (`screens/auth/*`).
- `Linking.openURL(menuTarget.url)` (`screens/chat/ChatRoomScreen.tsx:1113`): la URL es `businesses.external_menu_url`, texto libre del dueño; `utils/venueMenuTarget.ts:37-38` solo hace `trim()`, sin comprobar `https:`, y no se halló restricción en la base (`supabase/migrations/245_baseline.sql:8216`, `GRANT UPDATE` en `:14887`). Un dueño puede poner `tel:`, `sms:` o un esquema de otra app → H-009.

## 4. Web
### Cabeceras de `https://jchat.cloud` y `/dashboard` (`curl -sI`)
| Cabecera | Valor |
|---|---|
| Content-Security-Policy | presente: `default-src 'self'`; `script-src 'self' 'unsafe-inline' 'unsafe-eval'` + Stripe, Google Maps, hCaptcha; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`; `report-uri /api/csp-report` (`web/next.config.ts:45-72`) |
| Strict-Transport-Security | `max-age=63072000; includeSubDomains; preload` |
| X-Frame-Options | `DENY` |
| X-Content-Type-Options | `nosniff` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | `camera=(), microphone=(), geolocation=(self), payment=(self)` |
| Cookies | ninguna en respuestas anónimas (`/`, `/dashboard`). Atributos de las cookies de sesión de Supabase: no verificados (se crean al iniciar sesión; no se inició sesión) |

`unsafe-inline` y `unsafe-eval` en `script-src` → H-002.

### Protección en servidor
- `middleware.ts`: solo refresca la sesión (`getUser()`, `:39`); la protección está en los layouts: `app/dashboard/layout.tsx:37-39` (sin usuario → `/auth/login?next=/dashboard`; admins siempre entran vía `is_platform_admin`, `:47`; plan comprobado `:86`) y `app/super-admin/layout.tsx:66-73` (sin usuario → login; no admin → `/dashboard`). En vivo: `/dashboard` y `/super-admin` responden 307 a `/auth/login?next=…`. La protección por layout no cubre `/api/*`; cada ruta se protege sola:
  - `/api/verify`: usa service role; comprueba al llamante con el cliente SSR (`getUser()`) y exige ser dueño del local (`route.ts:31-37,54-88`); todas las acciones responden 410 (verificación retirada).
  - `/api/super-admin/match-photos/remove`: `getUser()` + `is_platform_admin()` con el JWT del usuario antes de usar service role (`route.ts:20-47`).
  - `/api/business-plan-request`: pública; hCaptcha en servidor; si falta `HCAPTCHA_SECRET` la captcha queda apagada (fail-open, `route.ts:31`); la RPC limita 3/hora por correo/IP.
  - `/api/csp-report`: pública, sin autenticación, recorta a 8000 caracteres y solo escribe en el log (`route.ts:6-13`).
  - En producción, un GET a las cuatro rutas responde 405.
- `dangerouslySetInnerHTML`: 3 usos: JSON-LD (`app/b/[slug]/page.tsx:215`, no escapa `<` → H-001), CSS de impresión constante (`app/m/[slug]/CheckoutStep.tsx:334`, seguro) y SVG del QR (`components/dashboard/TableQrModal.tsx:136`, generado localmente; la ventana de impresión escribe la etiqueta sin escapar, `:98` → H-007).
- Redirecciones abiertas: `?next=`/`?redirect=` se validan con `isSafeRedirectPath` en `app/auth/login/page.tsx:37-38` y `app/auth/callback/route.ts:19-20` (rechaza `//host`, `/\`, esquemas; comentario W2). No se encontraron otros lectores de parámetros de redirección.

## 5. Funciones edge (`supabase/functions/*`, `config.toml`)
| Función | Cómo autentica | ¿Valida que el usuario es dueño del recurso? | CORS | service_role con datos del cliente |
|---|---|---|---|---|
| `apple-token` | JWT del usuario (`getUser`, `:58-59`) | Usa el `user.id` verificado | `*` | Sí, para guardar el token cifrado del propio usuario |
| `delete-account` | JWT (`:206-222`) | Solo borra al usuario del JWT; cierra sus locales (`:103,233`) | `*` | Sí, acotado a `uid` |
| `evidence-purge`, `outbound-emails` | `x-push-secret` con `safeEqual` en `handler.ts` (`evidence-purge/handler.ts:47`, `outbound-emails/handler.ts:42`), `verify_jwt=false` | n/a (tarea de servidor) | — | Sí (servidor) |
| `gift-worker`, `send-push`, `moderate-dm-photo`, `moderate-match-photo`, `safety-alert` | `x-push-secret` con `safeEqual` (`_shared/safeEqual.ts`; `send-push/index.ts:445`) | n/a (disparadas por la base) | `*` | Sí (servidor) |
| `guest-pay`, `guest-tab`, `tab-pay` | Públicas (`verify_jwt=false`): hCaptcha (`guest-pay/index.ts:74`) y límite de intentos (`guest-pay/index.ts:171-183`) | Validan token de mesa/cuenta; las 1607 líneas de `guest-tab` quedan para una revisión a fondo | `*` | Sí; entrada anónima: la superficie más expuesta |
| `menu-assistant` | JWT (`:111-131`) | Sí: `businesses.owner_id === user.id` (`:158-173`) | `*` | No (cliente con el JWT del usuario) |
| `payments` | JWT (`:86-99`) | Sí, `owner_id` (`:747-750`) | `*` | Sí tras validar |
| `report-evidence` | JWT con verificación activa + `is_platform_admin()` (`:16-31`) | Solo admins | — | Sí tras validar |
| `stripe-connect` | JWT (`:76-89`) | Sí, `owner_id` (`:102-107`) | `*` | Sí tras validar |
| `stripe-refund` | JWT (`:64-77`) | Sí, `owner_id !== authUserId` rechaza (`:116-123`) | `*` | Sí tras validar |
| `stripe-webhook` | Firma de Stripe `constructEventAsync` con dos secretos (`:774-799`) | n/a | `*` | Sí (servidor) |
| `subscriptions` | Doble vía: firma de Stripe (`:580`) o JWT del usuario (`:142-155`) | Usa el `user.id` verificado | `*` | Sí tras validar |
| `terminal` | JWT (`:122-138`) | Sí, `owner_id` (`:205-214`) | `*` | Sí tras validar |

CORS `*` en las que autentican por cabecera → H-008.

## 6. Llamadas del cliente que dependen de RLS (para que Planning las cruce con las políticas)
### `.rpc()` — app móvil (91 funciones)
`accept_follow_request, block_user, can_view_profile, check_geofence_and_join_room, check_in, claim_embedded_order, confirm_age, gift_available, gift_offer_cancel, gift_offer_create, gift_offer_respond, gift_offer_view, get_public_receipt, hide_dm_conversation, is_banned_from_room, is_muted_in_room, match_clear_likes, match_delete_like, match_delete_match, match_enabled_for_business, match_get_activity, match_get_deck, match_get_passed, match_get_profile, match_leave_venue, match_relike, match_report, match_request_help, match_swipe, match_undo_last, megaphone_feed, my_active_orders, my_block_relations, order_notify_staff, pos_apply_external_payment, pos_apply_stock_movement, pos_approve_order, pos_awaiting_orders, pos_business_settings, pos_claim_comanda_print, pos_close_table_session, pos_combine_tables, pos_create_check, pos_create_order, pos_create_split, pos_kds_settings, pos_link_barcode, pos_list_blocked_devices, pos_mark_comanda_printed, pos_my_businesses, pos_open_table_session, pos_payment_voucher, pos_pending_comandas, pos_pickup_board, pos_receipts_today, pos_reject_order, pos_release_comanda_print, pos_session_split_method, pos_set_party_size, pos_set_pin, pos_table_balance, pos_table_items, pos_table_session, pos_tables_overview, pos_uncombine_table, pos_unblock_device, pos_verify_pin, pos_void_order, profile_counts, reject_follow_request, remove_follower, report_content, request_or_follow, reservation_slots, resolve_table_qr, resolve_venue_entry, review_bypass_businesses, review_join_room, set_item_status, start_dm, tod_accept_terms, tod_enabled_for_business, unblock_user, update_my_settings, username_available, venue_order_access, venue_people_counts, venue_present_users, venue_session_end, venue_session_resume, venue_table_labels, verify_room_password`.
- `review_bypass_businesses` (`mobile/services/reviewMode.ts:21`): modo de revisión de la tienda; confirmar en producción que devuelve vacío para usuarios reales.
### `.rpc()` — web (56)
`admin_hide_content, admin_list_match_photos_for_review, admin_report_content_exists, admin_resolve_report, admin_review_match_photo, admin_set_business_status, admin_suspend_user, admin_unban_email, affiliate_summary, affiliate_yearly_payouts, assign_affiliate_to_user, attach_order_to_tab, business_owner_is_pro, catalog_lookup, confirm_age, create_promo_code, create_reservation, get_public_receipt, get_room_qr_token, get_table_order_status, guest_order_notify_staff, guest_order_view, inventory_archive_location, inventory_create_location, inventory_kpis, inventory_rename_location, inventory_report, inventory_set_location_qty, inventory_set_sales_location, inventory_transfer, is_platform_admin, match_kick, match_resolve_report, match_unkick, open_tab_on_table, pos_kds_metrics_v2, purchase_suggestion, record_affiliate_payout, regenerate_room_qr_token, regenerate_table_code, reject_reservation, reservation_customer_card, resolve_room_qr, resolve_table_qr, set_reservation_status, set_table_reserved, set_table_subchat, staff_set_order_status, submit_business_plan_request, tod_accept_terms, tod_business_stats, update_reservation, username_available, validate_promo_code, venue_order_access`.
### `.from()` — app móvil (tabla, nº de usos)
`users(23) businesses(17) public_profiles(12) messages(10) employees(8) notifications(7) reviews(6) posts(6) pinned_messages(6) orders(6) dm_messages(6) rooms(5) follows(5) dm_conversations(5) bans(5) reservations(4) post_likes(4) pos_printers(4) menu_items(4) match_profiles(4) match_photos(4) loyalty_points(4) user_interests(3) story_views(3) stories(3) room_mutes(3) gifts(3) follow_requests(3) blocks(3) tod_cards(2) service_calls(2) order_items(2) comments(2) check_ins(2) tod_terms(1) tod_settings(1) tod_rounds(1) tables(1) room_access_attempts(1) offers(1) moderation_logs(1) menu_item_modifier_groups(1) menu_categories(1) map_reactions(1) loyalty_tiers(1) loyalty_rewards(1) interests(1) games(1) events(1) custom_roles(1)`.
- `pinned_messages`: la app escribe directamente (insert en `components/chat/CreateOfferSheet.tsx:309` y `PinMessageSheet.tsx:282`, update en `PinMessageSheet.tsx:271-272`, delete en `PinnedBanner.tsx:455,477-478`), mientras `CLAUDE.md` dice «nunca modificar `pinned_messages` directamente desde el cliente» → H-010. Planning debe comprobar las políticas RLS de esa tabla.
### `.from()` — web (tablas)
`admin_roles, affiliate_commissions, affiliates, announcements, business_games, business_verifications, businesses, check_ins, covers, custom_roles, disputes, employees, inventory_locations, loyalty_points, loyalty_rewards, loyalty_rules, loyalty_tiers, match_kicks, match_photos, menu_categories, menu_item_costs, menu_item_modifier_groups, menu_item_photos, menu_items, messages, modifier_groups, notifications, offers, order_items, orders, platform_config, pos_printers, public_locations, public_profiles, purchase_order_settings, radius_increase_requests, reports, reservations, review_group_businesses, reviews, rooms, security_logs, service_calls, stock_by_location, stock_movements, subscriptions, suppliers, table_tabs, table_waiters, tables, tod_cards, tod_draws, tod_kicks, tod_moderation_log, tod_rounds, tod_settings, users`.
- Tablas tocadas desde la web que conviene cruzar primero con RLS: `admin_roles`, `platform_config`, `security_logs`, `subscriptions`, `affiliate_commissions`, `reports`, `users`.
