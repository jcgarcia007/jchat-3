-- Reversión de 261_delete_account_remaining_fks.sql. NO la apliques salvo que haga falta: volver las claves a NO ACTION REPRODUCE el defecto
-- (una cuenta con filas en esas tablas no se puede borrar). Las filas con NULL que ya existan no se tocan; por eso los tres NOT NULL solo se
-- restauran si no hay NULL (si los hay, ese paso se omite y se avisa).

do $$
declare
  t record;
  c record;
begin
  for t in
    select * from (values
      ('public.affiliate_commissions',     'user_id',      true),
      ('public.affiliate_payouts',         'created_by',   true),
      ('public.affiliates',                'created_by',   true),
      ('public.stock_movements',           'created_by',   false),
      ('public.radius_increase_requests',  'requested_by', false),
      ('public.radius_increase_requests',  'reviewed_by',  false),
      ('public.pos_payments',              'paid_by',      false),
      ('public.businesses',                'verified_by',  false)
    ) as v(tbl, col, was_not_null)
  loop
    for c in
      select k.conname, k.confrelid::regclass::text as ref, ra.attname as refcol, k.confdeltype
      from pg_constraint k
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
      join pg_attribute ra on ra.attrelid = k.confrelid and ra.attnum = k.confkey[1]
      where k.contype = 'f' and k.conrelid = t.tbl::regclass and a.attname = t.col
        and k.confrelid in ('public.users'::regclass, 'auth.users'::regclass)
    loop
      if c.confdeltype = 'n' then
        execute format('alter table %s drop constraint %I', t.tbl, c.conname);
        execute format('alter table %s add constraint %I foreign key (%I) references %s(%I)', t.tbl, c.conname, t.col, c.ref, c.refcol);
      end if;
    end loop;
    if t.was_not_null then
      begin
        execute format('alter table %s alter column %I set not null', t.tbl, t.col);
      exception when not_null_violation then
        raise notice '% .% has NULL rows: NOT NULL not restored', t.tbl, t.col;
      end;
    end if;
  end loop;
end $$;
