-- ============================================================
-- JChat 3.0 — Tighten service_calls INSERT (advisor: rls_policy_always_true)
-- Was WITH CHECK (true); now require the row to belong to the caller.
-- ============================================================

drop policy if exists "service_calls: authenticated insert" on public.service_calls;
create policy "service_calls: authenticated insert"
  on public.service_calls for insert to authenticated
  with check (user_id = auth.uid());
