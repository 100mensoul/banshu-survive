-- 歳時記イベントの色分け（任意）
-- Supabase SQL Editor で実行してください

alter table hime_events
  add column if not exists color text;

comment on column hime_events.color is
  'イベント色（#rrggbb）。未設定時は関連エピソードに応じた自動色';
