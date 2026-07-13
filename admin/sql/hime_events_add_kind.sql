-- 歳時記：暦イベント（夏至・祭日など上部帯用）
-- Supabase SQL Editor で実行してください

alter table hime_events
  add column if not exists event_kind text not null default 'standard';

alter table hime_events
  drop constraint if exists hime_events_event_kind_check;

alter table hime_events
  add constraint hime_events_event_kind_check
  check (event_kind in ('standard', 'almanac'));

comment on column hime_events.event_kind is
  'standard=通常出来事、almanac=暦イベント（カレンダー上部帯）';
