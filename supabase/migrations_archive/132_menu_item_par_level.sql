-- 132_menu_item_par_level.sql
-- Fase B2: nivel objetivo de stock ("par level") por producto. Opt-in (nullable).
-- YA APLICADO A PRODUCCIÓN por Planning Claude (MCP, 2026-08-19). Idempotente. NO re-aplicar.
alter table public.menu_items add column if not exists par_level integer;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'menu_items_par_level_check') then
    alter table public.menu_items
      add constraint menu_items_par_level_check check (par_level is null or par_level >= 0);
  end if;
end $$;
grant update(par_level) on public.menu_items to authenticated;
