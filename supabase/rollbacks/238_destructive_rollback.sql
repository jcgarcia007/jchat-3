-- 238 ROLLBACK — recrea la política original de 007_stage3_schema.sql:139-143 (texto del respaldo del repo; la política en
-- vivo no se consultó). NO ejecutada. Si se ejecuta, conviene ejecutar también el rollback de 237 (si no, el cliente vuelve
-- a poder cambiar su estado mientras las políticas nuevas siguen conviviendo).
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reservations' and policyname = 'reservations_customer') then
    create policy reservations_customer on public.reservations for all to authenticated
      using (user_id = auth.uid()
        or exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))
      with check (user_id = auth.uid()
        or exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));
  end if;
end $$;
