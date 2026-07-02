-- 歳時記：時刻カラム追加（任意。両方 null なら「終日」扱い）
alter table hime_events
  add column if not exists start_time time,
  add column if not exists end_time time;
