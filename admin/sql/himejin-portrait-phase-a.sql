-- ひめじん肖像: フェーズA（手動アップロード用スキーマ拡張）
-- 実行場所: Supabase SQL Editor
--
-- 1) このファイルを実行
-- 2) admin/sql/himejin-portraits-storage.sql を実行（未実行の場合）

alter table public.himejin_profiles
  add column if not exists image_prompt text;

alter table public.himejin_profiles
  add column if not exists image_generated_at timestamptz;

alter table public.himejin_profiles
  add column if not exists image_source text;

alter table public.himejin_profiles
  drop constraint if exists himejin_profiles_image_source_check;

alter table public.himejin_profiles
  add constraint himejin_profiles_image_source_check
  check (image_source is null or image_source in ('upload', 'ai'));

comment on column public.himejin_profiles.image_prompt is
  '採用時に使ったプロンプト（監査・再生成用）。手動アップロード時は null。';

comment on column public.himejin_profiles.image_generated_at is
  '肖像画像が確定した日時。';

comment on column public.himejin_profiles.image_source is
  '肖像の由来: upload（手動）または ai（将来）。';

-- 管理用列（real_name / image_*）は anon から除外
revoke select on public.himejin_profiles from anon;

grant select (
  id,
  slug,
  name,
  tribe_code,
  tribe_label,
  clan_code,
  tagline,
  intro,
  photo_url,
  sort_order,
  status,
  created_at,
  updated_at
) on public.himejin_profiles to anon;
