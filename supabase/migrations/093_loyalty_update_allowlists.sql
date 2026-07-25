-- 093_loyalty_update_allowlists
-- D-54 Batch 2 (tablas 3-6, subsistema loyalty). Verificado por MCP + lectura de
-- web/app/dashboard/loyalty/page.tsx y web/lib/loyalty.ts.

-- loyalty_points: server-only (RLS = solo service_role). Sin ruta de escritura de authenticated.
revoke insert, update, delete on public.loyalty_points from authenticated;

-- loyalty_rules: upsertRules solo hace UPDATE {is_active} (+ INSERT de la nueva regla).
revoke update on public.loyalty_rules from authenticated;
grant update (is_active) on public.loyalty_rules to authenticated;

-- loyalty_rewards: deleteReward es soft-delete UPDATE {is_active} (createReward es INSERT).
revoke update on public.loyalty_rewards from authenticated;
grant update (is_active) on public.loyalty_rewards to authenticated;

-- loyalty_tiers: upsertTiers = DELETE + INSERT; nunca UPDATE.
revoke update on public.loyalty_tiers from authenticated;
