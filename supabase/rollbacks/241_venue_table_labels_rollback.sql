-- Reversión de 241_venue_table_labels.sql. Se ejecuta a mano en el SQL Editor SOLO si hay que deshacer la 241.
-- Quita la función nueva; public.tables, venue_presence_ok y todo lo demás quedan como estaban. Es seguro ejecutarla dos veces.
-- Si el cliente (GiftCard) ya se publicó con la lista de mesas, la hoja de aceptar recibirá un error al llamar a la función y
-- caerá al campo de número de mesa de siempre: no se pierde ningún dato (la función solo lee).

drop function if exists public.venue_table_labels(uuid);
