-- ひめじん: AI生成用の非公開属性（gen_*）
-- 実行場所: Supabase SQL Editor
--
-- 公開ページ・anon API からは読めない（列単位 GRANT で除外）

alter table public.himejin_profiles
  add column if not exists gen_gender text;

alter table public.himejin_profiles
  add column if not exists gen_age_range text;

alter table public.himejin_profiles
  add column if not exists gen_appearance_notes text;

alter table public.himejin_profiles
  drop constraint if exists himejin_profiles_gen_gender_check;

alter table public.himejin_profiles
  add constraint himejin_profiles_gen_gender_check
  check (gen_gender is null or gen_gender in ('男性', '女性', '指定なし'));

comment on column public.himejin_profiles.gen_gender is
  'AI肖像生成用の性別（非公開）。男性 / 女性 / 指定なし。';

comment on column public.himejin_profiles.gen_age_range is
  'AI肖像生成用の年齢層（非公開）。例: 20代後半。';

comment on column public.himejin_profiles.gen_appearance_notes is
  'AI肖像生成用の外見メモ（非公開）。髪型・体格・雰囲気など短文。';

-- 非公開列（real_name / image_* / gen_*）は anon から除外
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
