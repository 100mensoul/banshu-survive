-- 世界地図（地形レイヤー + スポット）
-- world_id 例: new-harima（播州全体）, hime-memory（姫路）, konui-michi（コヌイの路）
-- 実行場所: Supabase SQL Editor
-- 公開サイトは anon で SELECT、編集は Auth ログインユーザーのみ。

-- 1) 地形レイヤー（レイヤー単位で1行）
create table if not exists public.map_world_layers (
  world_id text not null,
  layer_id text not null,
  seg integer not null,
  heights jsonb not null,
  water jsonb not null,
  area_defs jsonb not null default '[]'::jsonb,
  area_grid jsonb,
  updated_at timestamptz not null default now(),
  primary key (world_id, layer_id)
);

-- 既存テーブルへエリア列を追加（すでに作成済みの場合）
alter table public.map_world_layers
  add column if not exists area_defs jsonb not null default '[]'::jsonb;

alter table public.map_world_layers
  add column if not exists area_grid jsonb;

-- 2) スポット（種）
create table if not exists public.map_spots (
  id uuid primary key default gen_random_uuid(),
  world_id text not null default 'banshu-main',
  layer text not null default 'hirao',
  slug text not null,
  name text not null,
  category text not null default 'unknown',
  x double precision not null check (x >= 0 and x <= 1),
  z double precision not null check (z >= 0 and z <= 1),
  link_type text not null default 'none',
  link_ref text,
  created_at timestamptz not null default now(),
  constraint map_spots_world_layer_slug_key unique (world_id, layer, slug)
);

create index if not exists map_spots_world_layer_idx
  on public.map_spots (world_id, layer);

-- updated_at 自動更新（地形レイヤー）
create or replace function public.map_world_layers_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists map_world_layers_set_updated_at on public.map_world_layers;
create trigger map_world_layers_set_updated_at
  before update on public.map_world_layers
  for each row execute function public.map_world_layers_set_updated_at();

-- 3) RLS
alter table public.map_world_layers enable row level security;
alter table public.map_spots enable row level security;

drop policy if exists "Public read map_world_layers" on public.map_world_layers;
create policy "Public read map_world_layers"
  on public.map_world_layers for select
  to anon, authenticated
  using (true);

drop policy if exists "Auth write map_world_layers" on public.map_world_layers;
create policy "Auth write map_world_layers"
  on public.map_world_layers for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Public read map_spots" on public.map_spots;
create policy "Public read map_spots"
  on public.map_spots for select
  to anon, authenticated
  using (true);

drop policy if exists "Auth write map_spots" on public.map_spots;
create policy "Auth write map_spots"
  on public.map_spots for all
  to authenticated
  using (true)
  with check (true);
