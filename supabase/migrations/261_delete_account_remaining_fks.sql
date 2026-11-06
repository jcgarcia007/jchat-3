-- 261: que ninguna cuenta se quede sin poder borrarse por las claves foráneas que faltaban. NO APLICADA (la aplica Juan Carlos por MCP, tras aprobar la propuesta).
-- Reversión: supabase/rollbacks/261_delete_account_remaining_fks_rollback.sql · Comprobación: supabase/scripts/261_check.sql · Prueba local: supabase/scripts/test_261_local.sh
--
-- Problema (continuación de la 255, B2-1): delete-account llama a auth.admin.deleteUser(); si la cuenta aparece en una columna con clave foránea
-- NO ACTION hacia users, Postgres aborta TODO el borrado ("Database error deleting user"). Quedaban 8 columnas así (consulta de solo lectura a
-- producción, 2026-11-06). La función ya limpia radius_increase_requests antes de borrar; las demás bloquean a quien tenga filas ahí
-- (administradores que crearon afiliados o pagos, personal que registró cobros o movimientos de stock, quien verificó un local).
--
-- Propuesta (tabla por tabla; todas ON DELETE SET NULL, ninguna CASCADE: son datos con dinero o de auditoría que se conservan SIN identidad):
--   affiliate_commissions.user_id   NOT NULL → NULL permitido · SET NULL   (dinero de comisiones: se conserva sin identidad)
--   affiliate_payouts.created_by    NOT NULL → NULL permitido · SET NULL   (pago a un afiliado: dinero, se conserva; se pierde quién lo creó)
--   affiliates.created_by           NOT NULL → NULL permitido · SET NULL   (el afiliado sigue; se pierde qué administrador lo dio de alta)
--   stock_movements.created_by      ya NULL permitido · SET NULL           (historial de inventario: se conserva con created_by NULL)
--   radius_increase_requests.requested_by / reviewed_by  ya NULL permitido · SET NULL (solicitud de radio: se conserva para auditoría)
--  EXTRAS fuera de la lista pedida, mismo defecto (el personal de caja con cobros no puede borrar su cuenta hoy; 40 de 120 pos_payments tienen paid_by):
--   pos_payments.paid_by            ya NULL permitido · SET NULL           (cobro: dinero, se conserva sin identidad)
--   businesses.verified_by          ya NULL permitido · SET NULL           (quién verificó el local)
--
-- Idempotente y no destructivo para los datos: por cada columna (a) "drop not null" (no hace nada si ya admite NULL) y (b) la clave se vuelve a crear
-- con ON DELETE SET NULL solo si hoy NO es SET NULL; se conserva el nombre de la clave y la tabla a la que apunta (users o auth.users).
-- Efecto sobre las filas existentes: ninguno. Bloqueo breve de cada tabla mientras se recrea su clave (tablas pequeñas: 0 a 120 filas).
-- Dónde habrá que mostrar "sin identidad" cuando created_by / user_id vengan NULL: solo el panel super-admin de afiliados (web/app/super-admin/afiliados)
-- puede leer affiliates.created_by / affiliate_payouts.created_by; hay que tratar NULL como "Administrador eliminado" (anotado, sin corregir aquí).

do $$
declare
  t record;
  c record;
begin
  for t in
    select * from (values
      ('public.affiliate_commissions',     'user_id'),
      ('public.affiliate_payouts',         'created_by'),
      ('public.affiliates',                'created_by'),
      ('public.stock_movements',           'created_by'),
      ('public.radius_increase_requests',  'requested_by'),
      ('public.radius_increase_requests',  'reviewed_by'),
      ('public.pos_payments',              'paid_by'),
      ('public.businesses',                'verified_by')
    ) as v(tbl, col)
  loop
    execute format('alter table %s alter column %I drop not null', t.tbl, t.col);
    for c in
      select k.conname, k.confrelid::regclass::text as ref, ra.attname as refcol, k.confdeltype
      from pg_constraint k
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
      join pg_attribute ra on ra.attrelid = k.confrelid and ra.attnum = k.confkey[1]
      where k.contype = 'f' and k.conrelid = t.tbl::regclass and a.attname = t.col
        and k.confrelid in ('public.users'::regclass, 'auth.users'::regclass)
    loop
      if c.confdeltype <> 'n' then
        execute format('alter table %s drop constraint %I', t.tbl, c.conname);
        execute format('alter table %s add constraint %I foreign key (%I) references %s(%I) on delete set null', t.tbl, c.conname, t.col, c.ref, c.refcol);
      end if;
    end loop;
  end loop;
end $$;

comment on column public.affiliate_commissions.user_id is 'Cuenta asociada a la comisión. NULL si esa cuenta se borró (el registro de dinero se conserva sin identidad).';
comment on column public.affiliate_payouts.created_by is 'Administrador que registró el pago. NULL si esa cuenta se borró (el pago se conserva).';
comment on column public.affiliates.created_by is 'Administrador que dio de alta al afiliado. NULL si esa cuenta se borró.';
