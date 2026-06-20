-- はりまノはれま（天気カレンダー）用テーブル＋Storage
-- 実行場所: Supabase SQL Editor
-- 公開サイトは anon で SELECT、編集は Auth ログインユーザーのみ。

-- 1) 日ごとのデータ（1日1行・主キー＝日付）
create table if not exists public.harema_days (
  day_date date primary key,
  weather text,                 -- 'sunny' / 'cloudy' / 'rain' / 'heavy-rain'（マスの色・手動選択が優先）
  weather_label text,           -- モーダル表示用（例「雨のち晴れ」。マスの色には使わない）
  harema_level integer not null default 0 check (harema_level between 0 and 5), -- ハレマ度（★0〜5）
  journal text,                 -- ハレアメ手記（自由記述）
  temp_min numeric,             -- 最低気温（API）
  temp_max numeric,             -- 最高気温（API）
  precip_mm numeric,            -- 降水量(mm)（API）
  updated_at timestamptz not null default now()
);

-- 2) 写真（1日に複数枚・並び順あり）
create table if not exists public.harema_day_photos (
  id uuid primary key default gen_random_uuid(),
  day_date date not null references public.harema_days(day_date) on delete cascade,
  url text not null,
  caption text,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);
create index if not exists harema_day_photos_day_idx on public.harema_day_photos(day_date);

-- 3) RLS
alter table public.harema_days enable row level security;
alter table public.harema_day_photos enable row level security;

drop policy if exists "Public read harema_days" on public.harema_days;
create policy "Public read harema_days"
  on public.harema_days for select using (true);

drop policy if exists "Auth write harema_days" on public.harema_days;
create policy "Auth write harema_days"
  on public.harema_days for all
  to authenticated using (true) with check (true);

drop policy if exists "Public read harema_day_photos" on public.harema_day_photos;
create policy "Public read harema_day_photos"
  on public.harema_day_photos for select using (true);

drop policy if exists "Auth write harema_day_photos" on public.harema_day_photos;
create policy "Auth write harema_day_photos"
  on public.harema_day_photos for all
  to authenticated using (true) with check (true);

-- 4) Storage バケット（写真）
insert into storage.buckets (id, name, public)
values ('harema-photos', 'harema-photos', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public read harema-photos" on storage.objects;
create policy "Public read harema-photos"
  on storage.objects for select
  using (bucket_id = 'harema-photos');

drop policy if exists "Auth insert harema-photos" on storage.objects;
create policy "Auth insert harema-photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'harema-photos');

drop policy if exists "Auth update harema-photos" on storage.objects;
create policy "Auth update harema-photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'harema-photos')
  with check (bucket_id = 'harema-photos');

drop policy if exists "Auth delete harema-photos" on storage.objects;
create policy "Auth delete harema-photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'harema-photos');
