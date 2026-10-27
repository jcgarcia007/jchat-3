-- 101_social_b3_update_allowlists
-- posts/messages/comments: política permite UPDATE pero CERO update/upsert en el repo → grant muerto, revoke.
revoke update on public.posts from authenticated;
revoke update on public.messages from authenticated;
revoke update on public.comments from authenticated;

-- reservations: solo el dueño hace .update({status}); no existe edición de usuario → allow-list (status).
revoke update on public.reservations from authenticated;
grant update (status) on public.reservations to authenticated;

-- public_locations: editor super-admin, .update plano (no upsert), todo menos id/created_by/created_at.
revoke update on public.public_locations from authenticated;
grant update (name, type, lat, lng, radius_m, description, active_from, active_to, is_active, room_id)
  on public.public_locations to authenticated;

-- radius_increase_requests: revisión admin (is_platform_admin) → status, reviewed_by, reviewed_at.
revoke update on public.radius_increase_requests from authenticated;
grant update (status, reviewed_by, reviewed_at) on public.radius_increase_requests to authenticated;
