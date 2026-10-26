-- Reversión de 243_venue_present_users.sql. Se ejecuta a mano en el SQL Editor SOLO si hay que deshacer la 243. Es seguro ejecutarla dos veces.
-- La 243 no toca tablas ni columnas: deshacerla es quitar la función. La app se degrada sola: si la llamada falla, la lista de la
-- cabecera queda como antes de la 243 (el cliente trata cualquier error como "sin filtro").

drop function if exists public.venue_present_users(uuid, uuid[]);
