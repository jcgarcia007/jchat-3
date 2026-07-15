# Dashboard 4A — estado
**Estado:** DISEÑO APROBADO, implementación DIFERIDA (2026-07-14).
No implementar hasta terminar la cadena de monetización.
Es un REDISEÑO DE NAVEGACIÓN completo, no un template de una pantalla:
- Reemplaza el riel actual (Sidebar.tsx, 48px) por uno de 100px con chips de color.
- AÑADE una columna de subnavegación contextual (230px) que hoy NO existe.
- Elimina el TopBar actual.
## Decisión pendiente ANTES de implementar (bloqueante)
Mapear las 15+ páginas reales del dashboard a los 6 módulos del diseño
(Resumen, Pedidos, Menú, Datos, Chat, Pagos) + sus subsecciones. El handoff muestra
6 módulos; el dashboard real tiene Orders, Menu, Inventory, Employees, Roles,
Reservations, Loyalty, Offers, Service, Payments, Reports, KDS, Reviews, Events,
Configuration, chat-rooms. ¿KDS→Pedidos? ¿Reviews→Datos? etc. Sin ese mapeo no se
empieza.
## Ojo con los datos de la pantalla Resumen
Las métricas del mockup (ventas del día, "personas dentro" en vivo, termómetro de
actividad, hora pico, estancia promedio, % recurrentes) son de EJEMPLO y el backend
NO las calcula hoy. Implementar la pantalla tal cual = otra pantalla que muestra
números falsos. Cada métrica necesita su fuente real antes de mostrarse.
