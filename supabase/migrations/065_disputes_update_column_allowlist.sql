-- 065: allow-list de columnas en disputes (patrón de migr 060/064)
-- CIERRA UN BYPASS REAL: refund_id era escribible por el cliente → el dueño podía
-- ponerlo a null y re-disparar el reembolso (la idempotencyKey de Stripe expira a las 24h).
-- Tras esta migración, el cliente solo puede RECHAZAR (status, resolution).
-- El APROBAR pasa por la EF stripe-refund (service_role), que bypassa grants y RLS.

begin;

revoke update on table public.disputes from authenticated;
revoke update on table public.disputes from anon;
revoke delete, truncate, references, trigger on table public.disputes from anon;
revoke delete, truncate, references, trigger on table public.disputes from authenticated;

-- El dueño solo necesita RECHAZAR desde el cliente.
grant update (status, resolution) on table public.disputes to authenticated;

commit;
