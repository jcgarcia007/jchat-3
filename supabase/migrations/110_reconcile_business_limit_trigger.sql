-- 110_reconcile_business_limit_trigger
-- Drift: el trigger trg_enforce_business_limit lo creó "enforce_plan_limits_businesses_events" (v20260703182246,
-- sin archivo). 068 redefine la FUNCIÓN pero NO recrea el trigger, y ningún otro archivo lo crea → sin esto un
-- rebuild tendría la función sin trigger (límites de plan NO se aplicarían). Verificado en prod:
-- trg_enforce_business_limit BEFORE INSERT ON businesses EXECUTE enforce_business_limit(). Va tras 068 (función).
drop trigger if exists trg_enforce_business_limit on public.businesses;
create trigger trg_enforce_business_limit
  before insert on public.businesses
  for each row execute function public.enforce_business_limit();
