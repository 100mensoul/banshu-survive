-- 播州サバイブ コンテンツCMS用（フルセット）
-- 実行場所: Supabase SQL Editor
--
-- 既に「旧 content-cms.sql（tribe の CHECK 付き）」だけ実行済みの DB では、
-- このファイルを丸ごと再実行してもテーブルは IF NOT EXISTS のため更新されません。
-- その場合は content-cms-migration-phase2-clans-glossary.sql を実行してください。

-- 1) 高札場ニュース
create table if not exists public.news_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  link_url text,
  happened_on date,
  sort_order integer not null default 100,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) 姫路クラン辞典（1クラン1行。人物は clan_code で1つだけ紐づけ）
create table if not exists public.clan_descriptions (
  code text primary key,
  title text not null,
  description text not null,
  sort_order integer not null default 100,
  updated_at timestamptz not null default now()
);

-- 3) 種族説明（code は自由追加可。ひめじんファイル上部は banshujin / nbt / himejin の3枠のみ表示）
create table if not exists public.tribe_descriptions (
  code text primary key,
  title text not null,
  description text not null,
  sort_order integer not null default 100,
  updated_at timestamptz not null default now()
);

-- 4) ひめじん（キャスト）— 種族コードは text（正本は tribe_descriptions と運用で突合）
create table if not exists public.himejin_profiles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  tribe_code text not null default 'unknown',
  tribe_label text not null,
  clan_code text references public.clan_descriptions(code) on delete set null,
  tagline text,
  intro text,
  photo_url text,
  sort_order integer not null default 100,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 既存DBで上の CREATE がスキップされた場合の救済（列・制約だけ足す）
alter table public.tribe_descriptions
  add column if not exists sort_order integer not null default 100;

alter table public.tribe_descriptions
  drop constraint if exists tribe_descriptions_code_check;

alter table public.himejin_profiles
  drop constraint if exists himejin_profiles_tribe_code_check;

alter table public.himejin_profiles
  add column if not exists clan_code text;

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.himejin_profiles'::regclass
      and c.contype = 'f'
      and c.conname = 'himejin_profiles_clan_code_fkey'
  ) then
    alter table public.himejin_profiles
      add constraint himejin_profiles_clan_code_fkey
      foreign key (clan_code) references public.clan_descriptions(code) on delete set null;
  end if;
end $$;

insert into public.tribe_descriptions (code, title, description, sort_order)
values
  ('banshujin', '■ 播州人（Banshūjin）', '播磨の地に古くから根を下ろす人々。気が強く、郷土愛が深い。上下関係や性別の役割が明確で、意固地とも見える芯の強さがある。だがそれは、自分の中にあるものを信じているから。浜手（海の近く）の播州人は言葉も荒いが、年齢が高くても柔軟な人はいる。一概には語れない。ただ、キャラは濃い。', 10),
  ('nbt', '■ NEOバンシュウ族（NBT: Neo-Banshū-Tribe）', '播磨を一度離れ、外の世界で感性とスキルを磨いた帰還者。播州の文化を受け継ぎながらも、未来志向。ルーツに立ち返ることで再び火がつき、水を得た魚のように動き出す。', 20),
  ('himejin', '■ ひめじん（Himejin）', '播州人もNEOバンシュウ族も、分け隔てなくつながる存在――それが「ひめじん」。ボーダレスに、地平はつづく。', 30)
on conflict (code) do nothing;

insert into public.clan_descriptions (code, title, description, sort_order) values
  ('west', 'ウエスト（姫路クラン）', '（説明文を管理画面で編集してください）', 10),
  ('azuma', 'アズマ（姫路クラン）', '（説明文を管理画面で編集してください）', 20),
  ('first', 'ファースト（姫路クラン）', '（説明文を管理画面で編集してください）', 30),
  ('maria', 'マリア（姫路クラン）', '（説明文を管理画面で編集してください）', 40),
  ('heart', 'ハート（姫路クラン）', '（説明文を管理画面で編集してください）', 50),
  ('palette', 'パレット（姫路クラン）', '（説明文を管理画面で編集してください）', 60),
  ('castle-hills', 'キャッスルヒルズ（姫路クラン）', '（説明文を管理画面で編集してください）', 70),
  ('white', 'ホワイト（姫路クラン）', '（説明文を管理画面で編集してください）', 80)
on conflict (code) do nothing;

-- updated_at 自動更新
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_news_posts_updated_at on public.news_posts;
create trigger trg_news_posts_updated_at
before update on public.news_posts
for each row execute function public.set_updated_at();

drop trigger if exists trg_himejin_profiles_updated_at on public.himejin_profiles;
create trigger trg_himejin_profiles_updated_at
before update on public.himejin_profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_tribe_descriptions_updated_at on public.tribe_descriptions;
create trigger trg_tribe_descriptions_updated_at
before update on public.tribe_descriptions
for each row execute function public.set_updated_at();

drop trigger if exists trg_clan_descriptions_updated_at on public.clan_descriptions;
create trigger trg_clan_descriptions_updated_at
before update on public.clan_descriptions
for each row execute function public.set_updated_at();

-- RLS
alter table public.news_posts enable row level security;
alter table public.himejin_profiles enable row level security;
alter table public.tribe_descriptions enable row level security;
alter table public.clan_descriptions enable row level security;

drop policy if exists "news published read" on public.news_posts;
drop policy if exists "news auth all" on public.news_posts;
drop policy if exists "himejin published read" on public.himejin_profiles;
drop policy if exists "himejin auth all" on public.himejin_profiles;
drop policy if exists "tribes public read" on public.tribe_descriptions;
drop policy if exists "tribes auth all" on public.tribe_descriptions;
drop policy if exists "clans public read" on public.clan_descriptions;
drop policy if exists "clans auth all" on public.clan_descriptions;

create policy "news published read"
on public.news_posts
for select
to anon, authenticated
using (status = 'published');

create policy "himejin published read"
on public.himejin_profiles
for select
to anon, authenticated
using (status = 'published');

create policy "tribes public read"
on public.tribe_descriptions
for select
to anon, authenticated
using (true);

create policy "clans public read"
on public.clan_descriptions
for select
to anon, authenticated
using (true);

create policy "news auth all"
on public.news_posts
for all
to authenticated
using (true)
with check (true);

create policy "himejin auth all"
on public.himejin_profiles
for all
to authenticated
using (true)
with check (true);

create policy "tribes auth all"
on public.tribe_descriptions
for all
to authenticated
using (true)
with check (true);

create policy "clans auth all"
on public.clan_descriptions
for all
to authenticated
using (true)
with check (true);

-- 5) 相関図（グループ + 登場人物）— 詳細マイグレーションは content-cms-migration-phase3-cast-chart.sql
create table if not exists public.cast_chart_groups (
  code text primary key,
  title text not null,
  theme text not null default '#4a7a9e',
  sort_order integer not null default 100,
  status text not null default 'draft' check (status in ('draft', 'published')),
  updated_at timestamptz not null default now()
);

create table if not exists public.cast_chart_members (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  group_code text not null references public.cast_chart_groups(code) on delete restrict,
  name text not null,
  reading text,
  role text,
  tagline text,
  photo_url text,
  bio text,
  featured boolean not null default false,
  profile_href text,
  sort_order integer not null default 100,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_cast_chart_groups_updated_at on public.cast_chart_groups;
create trigger trg_cast_chart_groups_updated_at
before update on public.cast_chart_groups
for each row execute function public.set_updated_at();

drop trigger if exists trg_cast_chart_members_updated_at on public.cast_chart_members;
create trigger trg_cast_chart_members_updated_at
before update on public.cast_chart_members
for each row execute function public.set_updated_at();

alter table public.cast_chart_groups enable row level security;
alter table public.cast_chart_members enable row level security;

drop policy if exists "cast groups published read" on public.cast_chart_groups;
drop policy if exists "cast groups auth all" on public.cast_chart_groups;
drop policy if exists "cast members published read" on public.cast_chart_members;
drop policy if exists "cast members auth all" on public.cast_chart_members;

create policy "cast groups published read"
on public.cast_chart_groups for select to anon, authenticated
using (status = 'published');

create policy "cast members published read"
on public.cast_chart_members for select to anon, authenticated
using (status = 'published');

create policy "cast groups auth all"
on public.cast_chart_groups for all to authenticated
using (true) with check (true);

create policy "cast members auth all"
on public.cast_chart_members for all to authenticated
using (true) with check (true);
