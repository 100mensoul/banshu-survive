-- 歳時記（姫事記）＝出来事を時系列で束ねるハブテーブル
create table if not exists hime_events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  event_date_end date,
  title text not null,
  note text,
  weight text not null default 'normal'
    check (weight in ('major','normal','minor')),
  status text not null default 'draft'
    check (status in ('draft','published')),
  related_episode_slug text,
  digest_slug text,
  himelog_entry_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 並び替え・絞り込み用インデックス
create index if not exists hime_events_event_date_idx on hime_events (event_date);
create index if not exists hime_events_status_idx on hime_events (status);

-- updated_at 自動更新トリガー（既存 public.set_updated_at() を流用）
drop trigger if exists trg_hime_events_updated_at on hime_events;
create trigger trg_hime_events_updated_at
  before update on hime_events
  for each row execute function public.set_updated_at();

-- RLS
alter table hime_events enable row level security;

-- anon（公開）：published のみ読める
create policy hime_events_anon_select on hime_events
  for select
  to anon
  using (status = 'published');

-- authenticated（管理者）：全操作可
create policy hime_events_auth_all on hime_events
  for all
  to authenticated
  using (true)
  with check (true);
