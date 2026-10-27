-- 094_billing_revoke_authenticated_writes
-- D-54 Batch 2 (billing). Verificado por MCP: ninguna de las dos tiene política de UPDATE para
-- authenticated, así que revocar es no-breaking (los escribe service_role vía webhook/EF).
-- subscriptions: solo políticas SELECT (owner + admin) → authenticated sin ruta de escritura.
revoke insert, update, delete on public.subscriptions from authenticated;

-- trials: owner-insert + owner-read; sin UPDATE/DELETE policy. Conservar INSERT (lo usa el dueño).
revoke update, delete on public.trials from authenticated;
