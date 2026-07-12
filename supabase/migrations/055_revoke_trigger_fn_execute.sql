-- 055: revoke REST-callable EXECUTE from two internal SECURITY DEFINER functions
-- (security audit 2026-07-12, FIX #4).
-- public.handle_new_auth_user() is a TRIGGER function and public.derive_username() is
-- its helper. Both were EXECUTE-able by anon/authenticated → invocable directly via
-- /rest/v1/rpc/. A trigger must never be callable over REST.
--
-- SAFE: a trigger fires with the privileges of the auth.users INSERT path regardless of
-- EXECUTE grants on the function, so on_auth_user_created keeps creating public.users
-- rows for both email and OAuth sign-ups. Only direct REST invocation is removed.
--
-- Scope: ONLY these two. The ~28 other SECURITY DEFINER functions (start_dm,
-- request_or_follow, join_room_via_qr, is_platform_admin, …) are the app's RPCs and
-- MUST stay executable.
revoke execute on function public.handle_new_auth_user() from anon, authenticated, public;
revoke execute on function public.derive_username(text, jsonb) from anon, authenticated, public;
