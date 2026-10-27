-- 226_tod_owner_panel_support.sql
-- Truth or Dare · soporte para el panel web del dueño (fase 3).
-- 1) El staff del local puede leer los resultados PUBLICADOS de su local (antes solo el autor).
-- 2) Los reportes sobre mensajes tod_round / tod_draw reciben reports.business_id desde el salón,
--    para que entren en la política reports_read_owner (192) igual que los reportes de Match.
-- Sin DROP; idempotente.

-- 1) Lectura de draws publicados por staff
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tod_draws' and policyname='tod_draws_staff_published') then
    create policy tod_draws_staff_published on public.tod_draws for select to authenticated
      using (status = 'published' and public.is_venue_staff(business_id, (select auth.uid())));
  end if;
end $$;

-- 2) business_id en reportes de mensajes ToD
create or replace function public.reports_set_business_from_tod_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_biz uuid;
begin
  if new.business_id is null and new.content_type = 'message' and new.content_id is not null then
    select r.business_id into v_biz
      from public.messages m join public.rooms r on r.id = m.room_id
     where m.id = new.content_id and m.type in ('tod_round','tod_draw');
    if v_biz is not null then new.business_id := v_biz; end if;
  end if;
  return new;
end $$;

create or replace trigger trg_reports_set_business_from_tod_message
before insert on public.reports
for each row execute function public.reports_set_business_from_tod_message();

-- Backfill de reportes ToD ya existentes sin business_id
update public.reports rp
   set business_id = r.business_id
  from public.messages m join public.rooms r on r.id = m.room_id
 where rp.business_id is null and rp.content_type = 'message' and rp.content_id = m.id
   and m.type in ('tod_round','tod_draw');
