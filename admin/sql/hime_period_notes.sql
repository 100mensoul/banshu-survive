-- 歳時記：期間メモ（複数日の概要・週次レポート風）
-- Supabase SQL Editor で実行してください

create table if not exists hime_period_notes (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  title text not null,
  body text,
  status text not null default 'draft'
    check (status in ('draft','published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hime_period_notes_range_ok check (period_end >= period_start)
);

create index if not exists hime_period_notes_start_idx
  on hime_period_notes (period_start);
create index if not exists hime_period_notes_status_idx
  on hime_period_notes (status);

drop trigger if exists trg_hime_period_notes_updated_at on hime_period_notes;
create trigger trg_hime_period_notes_updated_at
  before update on hime_period_notes
  for each row execute function public.set_updated_at();

alter table hime_period_notes enable row level security;

drop policy if exists hime_period_notes_anon_select on hime_period_notes;
create policy hime_period_notes_anon_select on hime_period_notes
  for select
  to anon
  using (status = 'published');

drop policy if exists hime_period_notes_auth_all on hime_period_notes;
create policy hime_period_notes_auth_all on hime_period_notes
  for all
  to authenticated
  using (true)
  with check (true);

comment on table hime_period_notes is
  '歳時記の期間メモ（複数日をまとめた概要）';
