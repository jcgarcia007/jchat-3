-- 238_destructive: elimina la política FOR ALL antigua de reservas (007_stage3_schema.sql:139-143).
-- DESTRUCTIVA POR REGLA (CLAUDE.md): la aplica Juan a mano en el SQL Editor, DESPUÉS de 237_paso0_presence_privacy.sql.
-- NO está aplicada. No se pierde ningún dato: 237 ya creó las políticas que la sustituyen (dueño: todo; cliente: ver,
-- crear 'pending' y actualizar, con el trigger guard que solo le deja cancelar).
-- Reversión: supabase/rollbacks/238_destructive_rollback.sql (recrea la política con el texto original).
drop policy if exists reservations_customer on public.reservations;
