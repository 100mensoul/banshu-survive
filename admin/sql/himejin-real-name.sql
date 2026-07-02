-- ひめじん: 管理用「実名」列（公開ページには出さない）
-- 実行場所: Supabase SQL Editor

alter table public.himejin_profiles
  add column if not exists real_name text;

comment on column public.himejin_profiles.real_name is
  '管理用の実名。公開サイト・anon API からは読めない。';

-- anon には公開列のみ SELECT 可（real_name / image_* を除外）
-- 肖像列追加後は himejin-portrait-phase-a.sql の GRANT も参照
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
