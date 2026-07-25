-- 089_revoke_anon_write_grants
-- Batch 1 del audit D-54: anon no debe tener grants de escritura en ninguna tabla public.
-- Verificado (Supabase MCP, 2026-07-25): ninguna política RLS permite a anon escribir,
-- por lo que estos grants son peso muerto y su revocación es no-breaking. SELECT no se toca.
do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('revoke insert, update, delete on public.%I from anon', t.relname);
  end loop;
end $$;
