-- Phase2: 姫路クラン辞典・種族コード柔軟化（既に content-cms.sql を実行済みのプロジェクト向け）
-- Supabase SQL Editor で実行

-- 1) 種族: code の CHECK を外し、将来の追加に対応
alter table public.tribe_descriptions
  drop constraint if exists tribe_descriptions_code_check;

alter table public.tribe_descriptions
  add column if not exists sort_order integer not null default 100;

update public.tribe_descriptions set sort_order = 10 where code = 'banshujin';
update public.tribe_descriptions set sort_order = 20 where code = 'nbt';
update public.tribe_descriptions set sort_order = 30 where code = 'himejin';

-- 2) ひめじん: 種族コードの CHECK を外す（DB上の正本は tribe_descriptions と突合）
alter table public.himejin_profiles
  drop constraint if exists himejin_profiles_tribe_code_check;

-- 3) 姫路クラン（辞典の正本）
create table if not exists public.clan_descriptions (
  code text primary key,
  title text not null,
  description text not null,
  sort_order integer not null default 100,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_clan_descriptions_updated_at on public.clan_descriptions;
create trigger trg_clan_descriptions_updated_at
before update on public.clan_descriptions
for each row execute function public.set_updated_at();

alter table public.clan_descriptions enable row level security;

drop policy if exists "clans public read" on public.clan_descriptions;
drop policy if exists "clans auth all" on public.clan_descriptions;

create policy "clans public read"
on public.clan_descriptions
for select
to anon, authenticated
using (true);

create policy "clans auth all"
on public.clan_descriptions
for all
to authenticated
using (true)
with check (true);

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

-- 4) ひめじんプロフィール: クランは1人1コード（任意）
alter table public.himejin_profiles
  add column if not exists clan_code text references public.clan_descriptions(code) on delete set null;
