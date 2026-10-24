-- Reversión de 240_guest_service_by_label.sql. Se ejecuta a mano en el SQL Editor SOLO si hay que deshacer la 240.
-- Quita la función nueva; guest_request_service (198) y todo lo demás quedan como estaban. Es seguro ejecutarla dos veces.
-- Si la Edge Function guest-tab ya se desplegó con la rama por número de mesa, esa rama empezará a devolver error al no
-- existir la función: despliega antes la versión anterior de guest-tab (o deja de ofrecer "Pedir asistencia" sin mesa).
-- Los intentos 'invalid_table' que se hayan guardado en guest_service_attempts, y los bloqueos 'service_invalid_table' en
-- guest_device_blocks, son datos: no se borran aquí (los bloqueos caducan solos a las 24 h).

drop function if exists public.guest_request_service_by_label(uuid, text, float8, float8, text, text);
