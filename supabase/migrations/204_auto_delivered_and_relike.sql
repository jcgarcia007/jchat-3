-- 204: (A) Un pedido pasa a 'delivered' SOLO cuando TODOS sus artículos (todas las estaciones) están 'done'.
--      (B) Repasar descartados en Match: lista de "pass" aún presentes y convertir pass → like (límites).
-- APLICADA EN PRODUCCIÓN POR PLANNING (2026-10-05). Este archivo solo la versiona.

create or replace function public.order_auto_delivered()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.item_status = 'done' and old.item_status is distinct from 'done' then
    if not exists (select 1 from public.order_items i where i.order_id = new.order_id and i.item_status <> 'done') then
      update public.orders set status = 'delivered' where id = new.order_id and status in ('pending','confirmed','preparing','ready');
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_order_auto_delivered on public.order_items;
create trigger trg_order_auto_delivered after update of item_status on public.order_items for each row execute function public.order_auto_delivered();

create table if not exists public.match_relikes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  target_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists match_relikes_idx on public.match_relikes (user_id, business_id, created_at desc);
alter table public.match_relikes enable row level security;

create or replace function public.match_get_passed(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(c order by s.created_at desc) from public.match_swipes s
    cross join lateral (select public.match_card(v_uid, s.target_id, p_business_id) as c) x
    where s.business_id = p_business_id and s.swiper_id = v_uid and s.action = 'pass' and s.undone_at is null
      and public.match_common_business(v_uid, s.target_id) = p_business_id
      and x.c is not null
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.match_get_passed(uuid) from public, anon;
grant execute on function public.match_get_passed(uuid) to authenticated;

create or replace function public.match_relike(p_business_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_res jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.match_swipes s where s.business_id = p_business_id and s.swiper_id = v_uid and s.target_id = p_user_id and s.action = 'pass' and s.undone_at is null) then
    raise exception 'not_passed' using errcode = '22023';
  end if;
  if (select count(*) from public.match_relikes r where r.user_id = v_uid and r.business_id = p_business_id and r.created_at > now() - interval '12 hours') >= 20 then
    raise exception 'relike_limit' using errcode = '42501';
  end if;
  if exists (select 1 from public.match_relikes r where r.user_id = v_uid and r.business_id = p_business_id and r.created_at > now() - interval '30 seconds') then
    raise exception 'relike_cooldown' using errcode = '42501';
  end if;
  update public.match_swipes set undone_at = now() where business_id = p_business_id and swiper_id = v_uid and target_id = p_user_id;
  v_res := public.match_swipe(p_business_id, p_user_id, 'like');
  insert into public.match_relikes (business_id, user_id, target_id) values (p_business_id, v_uid, p_user_id);
  return v_res;
end;
$$;
revoke all on function public.match_relike(uuid, uuid) from public, anon;
grant execute on function public.match_relike(uuid, uuid) to authenticated;

create or replace function public.match_relikes_wipe_on_leave()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.match_relikes where user_id = old.user_id and business_id = old.business_id;
  return old;
end;
$$;
drop trigger if exists trg_match_relikes_wipe on public.match_presence;
create trigger trg_match_relikes_wipe after delete on public.match_presence for each row execute function public.match_relikes_wipe_on_leave();
