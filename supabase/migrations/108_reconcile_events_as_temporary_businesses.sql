-- 108_reconcile_events_as_temporary_businesses
-- Drift: modelo "evento = business temporal", aplicado en prod por "events_become_temporary_businesses"
-- (v20260704034353), sin archivo. NET en prod (verificado): businesses tiene is_temporary/event_starts_at/
-- event_ends_at + idx; la tabla public.events NO existe (004_stage2_schema la crea y ningún archivo la dropeaba).
-- La FUNCIÓN enforce_business_limit la posee 068 (versión combinada actual) → NO se redefine aquí.
-- enforce_event_limit no existe en prod ni en archivos → nada que dropear.
alter table public.businesses
  add column if not exists is_temporary boolean not null default false,
  add column if not exists event_starts_at timestamptz,
  add column if not exists event_ends_at timestamptz;

create index if not exists idx_businesses_is_temporary
  on public.businesses (owner_id, is_temporary);

drop table if exists public.events cascade;
