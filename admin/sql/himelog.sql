-- ヒメログ（平尾の取材ノート・思考メモ）用テーブル
-- 実行場所: Supabase SQL Editor
-- 公開サイトは anon で status='published' のみ SELECT、
-- 下書き(draft)・非公開(private)の閲覧と全編集は Auth ログインユーザーのみ。

-- 1) ヒメログ本体（1メモ1行）
create table if not exists public.himelog_entries (
  id uuid primary key default gen_random_uuid(),
  title text,                          -- 見出し（短いメモは空でも可）
  body text not null default '',       -- 本文（Markdown・断片OK）
  tags text[] not null default '{}',   -- タグ（#ツインコモンズ 等）
  memo_type text not null default 'note', -- note=取材メモ / thought=所感 / raw=未整理 / seed=エピソード候補
  status text not null default 'draft'    -- draft=下書き / private=非公開 / published=公開
    check (status in ('draft', 'private', 'published')),
  related_episode_slug text,           -- 任意。関連するエピソードの slug
  obsidian_ref text,                   -- 任意・非公開。由来の Obsidian ノート（管理画面のみ表示）
  source text not null default 'web',  -- 'web' | 'firebase'（旧ヒメログ移行データ判別用）
  firebase_id text,                    -- 旧ヒメログ(Firestore diaryEntries)のドキュメントID。移行の重複防止用
  written_at timestamptz,              -- 平尾が書いた日（任意。空なら created_at を使う）
  published_at timestamptz,            -- 公開にした日時
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists himelog_entries_status_idx on public.himelog_entries(status);
create index if not exists himelog_entries_created_idx on public.himelog_entries(created_at desc);
-- firebase_id は NULL を許容しつつ、値が入っているものは一意（移行の重複防止）
create unique index if not exists himelog_entries_firebase_id_key
  on public.himelog_entries(firebase_id) where firebase_id is not null;

-- すでに himelog_entries を作成済みの場合は、上の create table ではなく
-- 次の1行だけを実行して firebase_id 列を追加してください:
-- alter table public.himelog_entries add column if not exists firebase_id text;

-- updated_at 自動更新トリガー
create or replace function public.himelog_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists himelog_entries_set_updated_at on public.himelog_entries;
create trigger himelog_entries_set_updated_at
  before update on public.himelog_entries
  for each row execute function public.himelog_set_updated_at();

-- 2) RLS
alter table public.himelog_entries enable row level security;

-- 公開（published）だけ誰でも読める
drop policy if exists "Public read published himelog" on public.himelog_entries;
create policy "Public read published himelog"
  on public.himelog_entries for select
  using (status = 'published');

-- ログインユーザーは全件読める（下書き・非公開の確認用）
drop policy if exists "Auth read all himelog" on public.himelog_entries;
create policy "Auth read all himelog"
  on public.himelog_entries for select
  to authenticated using (true);

-- 追加・更新・削除はログインユーザーのみ
drop policy if exists "Auth write himelog" on public.himelog_entries;
create policy "Auth write himelog"
  on public.himelog_entries for all
  to authenticated using (true) with check (true);

-- 3) 旧ヒメログ（Firebase / diaryEntries）の移行用メモ
-- Firebase Firestore の diaryEntries を JSON で取り出したあと、下記の形で INSERT する。
-- テスト投稿（テスト260618）は移行しない。「地域のくくり」は status='published' で移行する例:
--
-- insert into public.himelog_entries (title, body, tags, status, source, written_at, published_at)
-- values (
--   '地域のくくり',
--   '神河のお茶や赤穂の塩など、一地域で限定できない。ストーリーを見せるためには播磨という地域で語る必要がある',
--   '{}',
--   'published',
--   'firebase',
--   '2025-04-30T12:24:03+09:00',
--   '2025-04-30T12:24:03+09:00'
-- );
