-- 097_revoke_update_no_policy_tables
-- D-54 Batch 2 (Grupo A): 15 tablas con grant UPDATE full a authenticated pero SIN política de UPDATE
-- para authenticated (o política deny_all). Revocar es no-breaking; las escritas reales van por
-- service_role/RPC definer. Verificado por Supabase MCP (mapa de políticas de escritura).
revoke update on public.admin_roles from authenticated;
revoke update on public.announcements from authenticated;
revoke update on public.business_verifications from authenticated;
revoke update on public.check_ins from authenticated;
revoke update on public.employees from authenticated;
revoke update on public.follows from authenticated;
revoke update on public.gifts from authenticated;
revoke update on public.map_reactions from authenticated;
revoke update on public.moderation_logs from authenticated;
revoke update on public.reports from authenticated;
revoke update on public.room_members from authenticated;
revoke update on public.security_logs from authenticated;
revoke update on public.story_views from authenticated;
revoke update on public.pending_order_carts from authenticated;
revoke update on public.processed_stripe_events from authenticated;
