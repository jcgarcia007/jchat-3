-- 264_apple_tokens.sql — D3: Sign in with Apple refresh token, kept so the account deletion can revoke it (App Review 5.1.1(v)).
--
-- The `apple-token` Edge Function (service_role) stores the refresh_token AES-256-GCM encrypted (key in the secret APPLE_TOKEN_KEY, never in the
-- database: see supabase/functions/_shared/appleRevoke.ts); `delete-account` reads it and revokes it with Apple before deleting auth.users.
-- RLS is enabled WITHOUT policies and every client role is revoked: only service_role touches this table.
-- Idempotent and non-destructive. NOT applied to production by the assistant: Juan applies it.
--
-- Rollback (manual, destructive: do NOT put it in a normal migration; run in the SQL Editor only if the feature is abandoned):
--   -- drop table public.apple_tokens;

create table if not exists public.apple_tokens (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  refresh_token_enc bytea not null,
  client_id         text not null default 'com.otunitylabs.jchat',
  created_at        timestamptz not null default now()
);

-- iv (12) + GCM tag (16) at least; rejects an empty or plaintext-looking value.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.apple_tokens'::regclass and conname = 'apple_tokens_enc_min_len'
  ) then
    alter table public.apple_tokens
      add constraint apple_tokens_enc_min_len check (octet_length(refresh_token_enc) >= 28);
  end if;
end $$;

alter table public.apple_tokens enable row level security;

revoke all on public.apple_tokens from anon, authenticated;
grant select, insert, update, delete on public.apple_tokens to service_role;

comment on table public.apple_tokens is
  'Sign in with Apple refresh token (AES-GCM encrypted by the apple-token function) to revoke it on account deletion. service_role only.';
