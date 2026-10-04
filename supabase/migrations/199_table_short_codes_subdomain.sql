-- 199: REGLA DE ORO (3/3) — código corto de mesa (barxzx.jchat.cloud/5-k3f9) y subdominio del negocio.
-- APLICADA EN PRODUCCIÓN POR PLANNING (2026-10-04). Este archivo solo la versiona.

alter table public.businesses add column if not exists subdomain text;
create unique index if not exists businesses_subdomain_key on public.businesses (subdomain) where subdomain is not null;
create or replace function public.validate_business_subdomain()
returns trigger language plpgsql as $$
begin
  if new.subdomain is null then return new; end if;
  new.subdomain := lower(new.subdomain);
  if new.subdomain !~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$' then raise exception 'subdomain_invalid' using errcode = '22023'; end if;
  if new.subdomain in ('www','app','api','admin','dashboard','mail','soporte','support','help','ayuda','static','cdn','assets','m','c','t','auth','login','pos','kds','superadmin','status','docs','blog','jchat','otunity') then
    raise exception 'subdomain_reserved' using errcode = '22023';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_validate_business_subdomain on public.businesses;
create trigger trg_validate_business_subdomain before insert or update of subdomain on public.businesses for each row execute function public.validate_business_subdomain();

create or replace function public.gen_short_code(p_len int default 4)
returns text language sql volatile as $$
  select string_agg(substr('23456789abcdefghjkmnpqrstuvwxyz', 1 + floor(random()*31)::int, 1), '') from generate_series(1, p_len);
$$;
alter table public.tables add column if not exists short_code text;
create unique index if not exists tables_short_code_key on public.tables (business_id, short_code) where short_code is not null;
do $$ declare r record; v text; begin
  for r in select id, business_id from public.tables where short_code is null loop
    loop
      v := public.gen_short_code(4);
      exit when not exists (select 1 from public.tables t where t.business_id = r.business_id and t.short_code = v);
    end loop;
    update public.tables set short_code = v where id = r.id;
  end loop;
end $$;
create or replace function public.tables_set_short_code()
returns trigger language plpgsql as $$
declare v text;
begin
  if new.short_code is not null then return new; end if;
  loop
    v := public.gen_short_code(4);
    exit when not exists (select 1 from public.tables t where t.business_id = new.business_id and t.short_code = v);
  end loop;
  new.short_code := v;
  return new;
end;
$$;
drop trigger if exists trg_tables_short_code on public.tables;
create trigger trg_tables_short_code before insert on public.tables for each row execute function public.tables_set_short_code();

create or replace function public.resolve_table_short(p_business text, p_label text, p_code text)
returns table (table_label text, business_slug text, room_qr_token text, table_qr_token text)
language sql stable security definer set search_path = public as $$
  select t.label, b.slug, r.qr_token, t.qr_token
  from public.tables t
  join public.businesses b on b.id = t.business_id
  left join public.rooms r on r.id = t.room_id and r.is_active
  where (b.subdomain = lower(p_business) or b.slug = lower(p_business))
    and lower(t.label) in (lower(p_label), 't' || lower(p_label), 'mesa ' || lower(p_label))
    and t.short_code = lower(p_code) and t.is_active;
$$;
grant execute on function public.resolve_table_short(text, text, text) to anon, authenticated;

create or replace function public.regenerate_table_code(p_table_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_biz uuid; v text;
begin
  select business_id into v_biz from public.tables where id = p_table_id;
  if v_biz is null or not exists (select 1 from public.businesses b where b.id = v_biz and b.owner_id = auth.uid()) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  loop
    v := public.gen_short_code(4);
    exit when not exists (select 1 from public.tables t where t.business_id = v_biz and t.short_code = v);
  end loop;
  update public.tables set short_code = v where id = p_table_id;
  return v;
end;
$$;
revoke all on function public.regenerate_table_code(uuid) from public, anon;
grant execute on function public.regenerate_table_code(uuid) to authenticated;
