-- 播州サバイブ エピソードの「参照（リンク）」と「メモ」用
-- 実行場所: Supabase SQL Editor
--
-- episodes テーブルに2つのカラムを追加します。
--   edit_links : [{ "label": "...", "url": "..." }, ...] 形式の JSON 配列。
--                Obsidian のノートやスプレッドシートなど、編集中に参照するリンク。
--   memo       : 自由記述メモ（マークダウン）。
-- いずれも IF NOT EXISTS のため再実行可能です。

alter table public.episodes
  add column if not exists edit_links jsonb not null default '[]'::jsonb;

alter table public.episodes
  add column if not exists memo text;
