-- エピソード編集履歴（保存のたびに直前の版を退避）
-- 実行場所: Supabase SQL Editor
--
-- 管理画面 episodes-editor.html が保存前に episode_revisions へスナップショットを INSERT します。
-- 15日より古い履歴は保存時にクライアントから削除します（こまめな保存向け）。

create table if not exists public.episode_revisions (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  slug text not null,
  title text not null default '',
  body text not null default '',
  status text not null default 'draft',
  season integer,
  episode_number integer,
  edit_links jsonb not null default '[]'::jsonb,
  memo text,
  saved_at timestamptz not null default now(),
  saved_by uuid references auth.users(id) on delete set null
);

create index if not exists episode_revisions_episode_saved_idx
  on public.episode_revisions (episode_id, saved_at desc);

alter table public.episode_revisions enable row level security;

drop policy if exists "episode revisions auth all" on public.episode_revisions;
create policy "episode revisions auth all"
on public.episode_revisions
for all
to authenticated
using (true)
with check (true);
