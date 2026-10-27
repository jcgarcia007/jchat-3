-- 240 — comprobación DESPUÉS de aplicar supabase/migrations_archive/240_guest_service_by_label.sql.
-- NO ESCRIBE NADA: las llamadas a la función de abajo están elegidas para salir antes de cualquier insert (dispositivo
-- inválido, número vacío, y número inexistente con ubicación fuera del local). El camino de éxito (que crea una llamada
-- real al personal) NO se prueba aquí: se prueba a mano desde la web, dentro del local, con una mesa real.
-- No imprime ningún token de mesa. Cada sección dice qué resultado se espera.

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (a) Permisos.   Esperado: anon = false · authenticated = false · service_role = true
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
select
  has_function_privilege('anon',          'public.guest_request_service_by_label(uuid, text, double precision, double precision, text, text)', 'execute') as anon,
  has_function_privilege('authenticated', 'public.guest_request_service_by_label(uuid, text, double precision, double precision, text, text)', 'execute') as authenticated,
  has_function_privilege('service_role',  'public.guest_request_service_by_label(uuid, text, double precision, double precision, text, text)', 'execute') as service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (b) Qué mesa encuentra cada número que teclee el invitado (Bar XZX). Es la misma búsqueda de la función.
--     Se normaliza lo tecleado y la etiqueta (se quita el prefijo mesa / table / t, con o sin espacio).
--     Esperado con las mesas T1, T2, T10: '1' → T1 · 't1' → T1 · 'T1' → T1 · 't 1' → T1 · 'mesa 1' → T1 · 'Mesa1' → T1 ·
--     'table 1' → T1 · '10' → T10 · '2' → T2 · '99' → (vacío) · '' → (vacío).
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
select
  i.numero,
  (select t.label
     from public.tables t
     join public.businesses b on b.id = t.business_id
    where b.slug = 'bar-xzx-omd2'
      and t.is_active
      and regexp_replace(lower(btrim(t.label)), '^(mesa|table|t)\s*', '')
        = regexp_replace(lower(btrim(i.numero)), '^(mesa|table|t)\s*', '')
    order by (lower(btrim(t.label)) = regexp_replace(lower(btrim(i.numero)), '^(mesa|table|t)\s*', '')) desc, t.label
    limit 1) as mesa_encontrada
from (values ('1'), ('t1'), ('T1'), ('t 1'), ('mesa 1'), ('Mesa1'), ('table 1'), ('10'), ('2'), ('99'), ('')) as i(numero);

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (c) Llamadas a la función que NO escriben nada.
--     Esperado:
--       dispositivo_invalido          → {"ok": false, "error": "device_required"}
--       numero_vacio                  → {"ok": false, "error": "invalid_table"}
--       negocio_inexistente           → {"ok": false, "error": "invalid_table"}
--       inexistente_y_fuera_del_local → {"ok": false, "error": "outside_venue"}   (no revela si la mesa existe)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
select
  public.guest_request_service_by_label(b.id, '1',     0, 0, 'x',                null) as dispositivo_invalido,
  public.guest_request_service_by_label(b.id, '',      0, 0, 'check-240-device', null) as numero_vacio,
  public.guest_request_service_by_label('00000000-0000-0000-0000-000000000000', '1', 0, 0, 'check-240-device', null) as negocio_inexistente,
  public.guest_request_service_by_label(b.id, '99999', 0, 0, 'check-240-device', null) as inexistente_y_fuera_del_local
from public.businesses b
where b.slug = 'bar-xzx-omd2';

-- Prueba de que no se escribió nada con el dispositivo de la comprobación.   Esperado: intentos = 0 · bloqueos = 0.
select
  (select count(*) from public.guest_service_attempts a where a.device_id in ('x', 'check-240-device')) as intentos,
  (select count(*) from public.guest_device_blocks g where g.device_id in ('x', 'check-240-device'))    as bloqueos;
