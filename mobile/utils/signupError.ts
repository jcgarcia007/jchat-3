/**
 * JChat 3.0 — D6: recognises the error a blocked sign-up produces.
 *
 * The database trigger on auth.users raises `signup_blocked` for an e-mail whose fingerprint is on the ban list; Supabase Auth answers that as
 * `unexpected_failure` / "Database error saving new user". The screens show a generic text that does not reveal the block
 * ("We couldn't create an account with this e-mail…").
 */
export function isSignupBlocked(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === 'unexpected_failure' || /database error saving new user/i.test(err.message ?? '');
}
