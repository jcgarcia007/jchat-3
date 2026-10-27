-- 086 — Códigos promocionales por usuario (Tanda 1).
-- Un código = un usuario = un solo uso. Al canjear, OTORGA el plan (business|pro)
-- en modo prueba por trial_days. La misma tabla es el registro de seguimiento
-- (redeemed_by / redeemed_at). Códigos de 12 caracteres, generados server-side.

create table if not exists public.promo_codes (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  plan         text not null check (plan in ('business','pro')),
  trial_days   int  not null check (trial_days > 0),
  expires_at   timestamptz,                 -- null = nunca vence (para canjear)
  active       boolean not null default true,
  redeemed_by  uuid references public.users(id) on delete set null,
  redeemed_at  timestamptz,
  created_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_promo_codes_redeemed_by on public.promo_codes(redeemed_by);

alter table public.promo_codes enable row level security;

-- Solo super_admin gestiona/ve los códigos. El canje va por RPC SECURITY DEFINER,
-- así que el usuario normal NO necesita acceso directo a la tabla.
create policy promo_codes_admin_all on public.promo_codes
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ── Crear código (SOLO super_admin). Genera un código único de 12 chars, evitando
--    caracteres confusos (O/0/I/1). Reintenta si hay colisión. Devuelve la fila. ──
create or replace function public.create_promo_code(
  p_plan text, p_trial_days int, p_expires_at timestamptz default null
) returns public.promo_codes
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text; v_i int; v_attempts int := 0; v_row public.promo_codes;
begin
  if not public.is_platform_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_plan not in ('business','pro') then
    raise exception 'INVALID_PLAN' using errcode = 'P0001';
  end if;
  if p_trial_days is null or p_trial_days <= 0 then
    raise exception 'INVALID_TRIAL_DAYS' using errcode = 'P0001';
  end if;

  loop
    v_attempts := v_attempts + 1;
    v_code := '';
    for v_i in 1..12 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random()*length(v_alphabet))::int, 1);
    end loop;
    begin
      insert into public.promo_codes (code, plan, trial_days, expires_at, created_by)
      values (v_code, p_plan, p_trial_days, p_expires_at, auth.uid())
      returning * into v_row;
      return v_row;
    exception when unique_violation then
      if v_attempts >= 10 then raise; end if;
    end;
  end loop;
end;
$$;

-- ── Canjear código (usuario autenticado). Otorga el plan de prueba y amarra el
--    código al usuario. Solo usuarios 'regular' pueden canjear. ──
create or replace function public.redeem_promo_code(p_code text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_promo public.promo_codes%rowtype;
  v_plan text; v_trial_end timestamptz;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001'; end if;

  select * into v_promo from public.promo_codes
    where code = upper(btrim(p_code)) for update;
  if not found then raise exception 'CODE_NOT_FOUND' using errcode = 'P0001'; end if;
  if not v_promo.active then raise exception 'CODE_INACTIVE' using errcode = 'P0001'; end if;
  if v_promo.redeemed_by is not null then raise exception 'CODE_ALREADY_USED' using errcode = 'P0001'; end if;
  if v_promo.expires_at is not null and v_promo.expires_at <= now() then
    raise exception 'CODE_EXPIRED' using errcode = 'P0001';
  end if;

  select plan into v_plan from public.users where id = v_uid for update;
  if coalesce(v_plan,'regular') <> 'regular' then
    raise exception 'ALREADY_ON_PLAN' using errcode = 'P0001';
  end if;

  v_trial_end := now() + make_interval(days => v_promo.trial_days);

  update public.users
     set plan = v_promo.plan, plan_status = 'trialing', plan_trial_end = v_trial_end
   where id = v_uid;

  update public.promo_codes
     set redeemed_by = v_uid, redeemed_at = now()
   where id = v_promo.id;

  return jsonb_build_object('ok', true, 'plan', v_promo.plan,
    'trial_days', v_promo.trial_days, 'plan_trial_end', v_trial_end);
end;
$$;

revoke all on function public.create_promo_code(text,int,timestamptz) from public;
revoke all on function public.redeem_promo_code(text) from public;
grant execute on function public.create_promo_code(text,int,timestamptz) to authenticated;
grant execute on function public.redeem_promo_code(text) to authenticated;
