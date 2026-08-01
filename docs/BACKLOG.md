# BACKLOG PRIORIZADO — JChat 3.0
Última actualización: 2026-07-31 · Fuente: sesión Planning Claude (Fable 5)

## REGLA DE ORO (no negociable)
Nada de este backlog entra a la cola de trabajo antes que los BLOQUEANTES DE
LANZAMIENTO (ver ESTADO.md): SMTP propio (Resend) + verificación de correo,
decisión SMS/Twilio, Stripe TEST de Verified (Juan), validación CSP,
Supabase Pro, Stripe live (último paso, Juan). Dashboard 2.0 (F1-F8) es el
compromiso activo; estas ideas se sacan de UNA en una cuando haya hueco.

## A. QUICK WINS DE RETENCIÓN (activan features ya construidas, tablas hoy en 0 filas)
- A1. Prompt de reseña post-pago (móvil): pedir reseña tras pedido pagado.
      Sin esto, reviews queda en 0 y el tab "Reviews por plato" nunca tendrá datos.
- A2. Ofertas → anuncio automático al chat del venue: al publicar una oferta,
      postearla en el chat del lugar (tablas offers + announcements existentes).
      Diferenciador único de JChat frente a cualquier POS.
- A3. Check-ins + reconocimiento de habituales: rachas de visitas; el dashboard
      muestra al dueño quiénes son sus clientes frecuentes (tabla check_ins).

## B. INTEGRADO EN FASES DASHBOARD 2.0 (no son tareas nuevas, van dentro de su fase)
- B1. Tiempo de rotación de mesa (table turn time) desde table_tabs → F3/F6.
- B2. Waitlist visible en tab Reservas (reservations.is_waitlist ya existe) → F8.
- B3. Presets inteligentes en comparativo ("vs mismo día semana pasada") → F6.
- B4. Sonido opcional en llamadas de mesero → F4.
- B5. Reporte de propinas por mesero (orders.tip_cents + taken_by) → F5.

## C. POST-LANZAMIENTO (requieren construcción o dependencia previa)
- C1. Lealtad activada al público — REQUIERE cerrar Stage-3 (D-76, award
      server-side) primero; activar antes = puntos falsificables.
- C2. Costo por plato (columna cost_cents en menu_items) + menu engineering
      (margen vs popularidad). Alto valor de venta para planes Business/Pro.
- C3. Cierre del día automático: email diario al dueño con ventas/top/propinas.
      DEPENDE de SMTP propio.
- C4. Referidos con recompensa ("invita a un amigo al chat del venue").
- C5. Cumpleaños: recompensa automática (verificar si users guarda fecha de
      nacimiento; si no, columna opcional + notificación).
- C6. Vista multi-negocio consolidada (roll-up de KPIs para plan Pro) — post tab Mapa.
- C7. Pitch de retención para material de ventas B2B: "45% de los comensales
      cambió su restaurante favorito el último año; JChat te da el canal directo".

## D. DEUDA TÉCNICA / OBSERVABILIDAD
- D1. Crash reporting móvil (Sentry free): hoy los crashes de la app RN en
      dispositivos reales son invisibles. Prioridad alta post-lanzamiento.
- D2. Analítica de producto (PostHog free): medir qué features se usan para
      priorizar este backlog con datos y no por intuición.
- D3. PITR al activar Supabase Pro (backup punto-en-el-tiempo). Con dinero
      real, obligatorio.
- D4. Smoke tests Playwright contra preview (login carga, menú público
      renderiza, dashboard responde) — 3-4 tests, corren por deploy.
- D5. Limpieza de env vars duplicadas de la integración Supabase↔Vercel.
- D6. Rama feat/pricing-user-mobile: al mergear, decidir si el commit del
      rail teñido ba8eaaa entra o queda fuera (pendiente decisión de Juan).
- D7. Bug preexistente: categoría "Café" con tilde no matchea .includes('cafe')
      en el mapa móvil (roto hoy, no urgente).
