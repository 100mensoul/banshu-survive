-- 相関図レイアウト（ノード座標・関係線・注釈）
-- 実行場所: Supabase SQL Editor（phase3 cast-chart 済みの DB 向け）
-- 公開サイトは published のみ anon SELECT。編集は Auth ログインユーザーのみ。

create table if not exists public.cast_chart_layout (
  layout_id text primary key default 'main',
  canvas_json jsonb not null default '{"version":1,"nodes":[],"edges":[],"annotations":[]}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published')),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_cast_chart_layout_updated_at on public.cast_chart_layout;
create trigger trg_cast_chart_layout_updated_at
before update on public.cast_chart_layout
for each row execute function public.set_updated_at();

alter table public.cast_chart_layout enable row level security;

drop policy if exists "cast layout published read" on public.cast_chart_layout;
drop policy if exists "cast layout auth all" on public.cast_chart_layout;

create policy "cast layout published read"
on public.cast_chart_layout
for select
to anon, authenticated
using (status = 'published');

create policy "cast layout auth all"
on public.cast_chart_layout
for all
to authenticated
using (true)
with check (true);

-- 初期行（空レイアウト・下書き）。エディタで保存すると published に更新されます。
insert into public.cast_chart_layout (layout_id, canvas_json, status)
values (
  'main',
  '{"version":1,"nodes":[],"edges":[],"annotations":[]}'::jsonb,
  'draft'
)
on conflict (layout_id) do nothing;
