-- ============================================================
-- JChat 3.0 — Drop service-call owner-notification trigger (migration 025)
--
-- The Sidebar now counts pending service_calls directly via a realtime
-- subscription (no notification rows needed). Removing the AFTER INSERT
-- trigger keeps the notifications table clean and avoids write amplification
-- on every waiter call.
--
-- NOT touched:
--   - trg_service_call_cooldown  (BEFORE INSERT cooldown — must stay)
--   - enforce_service_call_cooldown()
--   - table notifications  (used by other features)
-- ============================================================

drop trigger if exists trg_notify_owner_on_service_call on public.service_calls;
drop function if exists public.notify_owner_on_service_call();
