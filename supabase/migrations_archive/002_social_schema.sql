-- ============================================================
-- JChat 3.0 — Social schema (Stage 1 addition)
-- Tables required by Tasks 1.9–1.12 that were not in 001 (Task 0.6's list):
-- posts, post_likes, comments, stories, story_views, dm_conversations,
-- dm_messages. Mirrors the conventions of 001 (RLS, indexes, realtime).
-- ============================================================

-- ---------- POSTS ----------
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  caption     text,
  media_urls  text[] not null default '{}',
  geotag      text,                       -- MANUAL text only — never GPS (privacy rule)
  created_at  timestamptz not null default now()
);
create index if not exists idx_posts_user_id on public.posts(user_id);
create index if not exists idx_posts_created_at on public.posts(created_at desc);

create table if not exists public.post_likes (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);
create index if not exists idx_post_likes_post_id on public.post_likes(post_id);
create index if not exists idx_post_likes_user_id on public.post_likes(user_id);

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_comments_post_id on public.comments(post_id);
create index if not exists idx_comments_user_id on public.comments(user_id);

-- ---------- STORIES ----------
create table if not exists public.stories (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  media_url    text not null,
  text_overlay text,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '24 hours')
);
create index if not exists idx_stories_user_id on public.stories(user_id);
create index if not exists idx_stories_expires_at on public.stories(expires_at);

create table if not exists public.story_views (
  id         uuid primary key default gen_random_uuid(),
  story_id   uuid not null references public.stories(id) on delete cascade,
  viewer_id  uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (story_id, viewer_id)
);
create index if not exists idx_story_views_story_id on public.story_views(story_id);

-- ---------- DIRECT MESSAGES ----------
create table if not exists public.dm_conversations (
  id              uuid primary key default gen_random_uuid(),
  user_a          uuid not null references public.users(id) on delete cascade,
  user_b          uuid not null references public.users(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (user_a, user_b)
);
create index if not exists idx_dm_conversations_user_a on public.dm_conversations(user_a);
create index if not exists idx_dm_conversations_user_b on public.dm_conversations(user_b);

create table if not exists public.dm_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  sender_id       uuid not null references public.users(id) on delete cascade,
  body            text,
  media_url       text,
  voice_url       text,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists idx_dm_messages_conversation_id on public.dm_messages(conversation_id);
create index if not exists idx_dm_messages_created_at on public.dm_messages(created_at);

-- ---------- RLS ----------
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.comments enable row level security;
alter table public.stories enable row level security;
alter table public.story_views enable row level security;
alter table public.dm_conversations enable row level security;
alter table public.dm_messages enable row level security;

-- Posts: readable by authenticated users (follow filtering done in queries);
-- writable only by the author.
create policy "posts_read" on public.posts for select to authenticated using (true);
create policy "posts_insert_own" on public.posts for insert to authenticated with check (user_id = auth.uid());
create policy "posts_update_own" on public.posts for update to authenticated using (user_id = auth.uid());
create policy "posts_delete_own" on public.posts for delete to authenticated using (user_id = auth.uid());

create policy "post_likes_read" on public.post_likes for select to authenticated using (true);
create policy "post_likes_write_own" on public.post_likes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "comments_read" on public.comments for select to authenticated using (true);
create policy "comments_write_own" on public.comments for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "stories_read" on public.stories for select to authenticated using (true);
create policy "stories_write_own" on public.stories for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "story_views_read_own_story" on public.story_views for select to authenticated using (true);
create policy "story_views_insert_own" on public.story_views for insert to authenticated with check (viewer_id = auth.uid());

-- DMs: only the two participants may read/write.
create policy "dm_conv_participants" on public.dm_conversations for all to authenticated
  using (user_a = auth.uid() or user_b = auth.uid())
  with check (user_a = auth.uid() or user_b = auth.uid());

create policy "dm_msg_participants_read" on public.dm_messages for select to authenticated
  using (exists (select 1 from public.dm_conversations c
                 where c.id = conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())));
create policy "dm_msg_send" on public.dm_messages for insert to authenticated
  with check (sender_id = auth.uid()
    and exists (select 1 from public.dm_conversations c
                where c.id = conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())));

-- ---------- Realtime ----------
alter publication supabase_realtime add table public.posts;
alter publication supabase_realtime add table public.post_likes;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.stories;
alter publication supabase_realtime add table public.dm_messages;
