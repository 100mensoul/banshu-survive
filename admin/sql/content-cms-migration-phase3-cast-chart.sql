-- 相関図 CMS（グループ + 登場人物）
-- 実行場所: Supabase SQL Editor（phase2 済みの DB 向け）

create table if not exists public.cast_chart_groups (
  code text primary key,
  title text not null,
  theme text not null default '#4a7a9e',
  sort_order integer not null default 100,
  status text not null default 'draft' check (status in ('draft', 'published')),
  updated_at timestamptz not null default now()
);

create table if not exists public.cast_chart_members (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  group_code text not null references public.cast_chart_groups(code) on delete restrict,
  name text not null,
  reading text,
  role text,
  tagline text,
  photo_url text,
  bio text,
  featured boolean not null default false,
  profile_href text,
  sort_order integer not null default 100,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_cast_chart_groups_updated_at on public.cast_chart_groups;
create trigger trg_cast_chart_groups_updated_at
before update on public.cast_chart_groups
for each row execute function public.set_updated_at();

drop trigger if exists trg_cast_chart_members_updated_at on public.cast_chart_members;
create trigger trg_cast_chart_members_updated_at
before update on public.cast_chart_members
for each row execute function public.set_updated_at();

alter table public.cast_chart_groups enable row level security;
alter table public.cast_chart_members enable row level security;

drop policy if exists "cast groups published read" on public.cast_chart_groups;
drop policy if exists "cast groups auth all" on public.cast_chart_groups;
drop policy if exists "cast members published read" on public.cast_chart_members;
drop policy if exists "cast members auth all" on public.cast_chart_members;

create policy "cast groups published read"
on public.cast_chart_groups
for select
to anon, authenticated
using (status = 'published');

create policy "cast members published read"
on public.cast_chart_members
for select
to anon, authenticated
using (status = 'published');

create policy "cast groups auth all"
on public.cast_chart_groups
for all
to authenticated
using (true)
with check (true);

create policy "cast members auth all"
on public.cast_chart_members
for all
to authenticated
using (true)
with check (true);

-- 初期グループ（色味・区分は 2026-05 調整版）
insert into public.cast_chart_groups (code, title, theme, sort_order, status) values
  ('narrator-core', '語り手と主役', '#c23b2a', 10, 'published'),
  ('r-family', 'Rの家族', '#2f6b4f', 20, 'published'),
  ('himeji-light', '姫路の灯り', '#c47a28', 30, 'published'),
  ('brew-sound', '醸す・鳴らす仲間', '#5b4d8a', 40, 'published'),
  ('town-edge', 'まちの縁側', '#2a6d8f', 50, 'published')
on conflict (code) do update set
  title = excluded.title,
  theme = excluded.theme,
  sort_order = excluded.sort_order,
  status = excluded.status;

insert into public.cast_chart_members (
  slug, group_code, name, reading, role, tagline, photo_url, bio, featured, profile_href, sort_order, status
) values
  ('hirao', 'narrator-core', '平尾', 'ひらお', '語り手／外部観察者', 'Rを見守る', '../images/hirao_face.png',
   'Rの夫。東京ネイティブ。メモ魔にして、播州の地で妻が紡ぐ夢を語りつぐ見届け人。ヒメログ通信の広報部長。', true, '../cast/hirao.html', 10, 'published'),
  ('r', 'narrator-core', 'R', 'アール', '主人公／土地を継ぐ者', '姫路をひらく', '../images/R_face.png',
   'フォークノード計画、ヒメモリの地を推進する女性。姫路に拠点を構えようとしている。枠にとらわれない自由な発想で、ワクワクすることを起こす。収束より拡散が得意。湧き出るアイデアの泉を持ち、全国を飛び回ってネタを発掘し、可能性を持ってくる。原動力はふるさとの自然への愛。', true, '../cast/r.html', 20, 'published'),
  ('masaki', 'r-family', '昌己', 'まさき', 'Rの父', '毎日、畑へ', '../images/masami_face.png',
   'Rの父。播州の畑と向き合い、土地のリズムを体で覚えている。', false, '../cast/masami.html', 10, 'published'),
  ('jun', 'r-family', '純', 'じゅん', 'Rの母', '花が大好き', '../images/jun_face.png',
   'Rの母。花と暮らしの美しさを大切にする、温かな存在。', false, '../cast/jun.html', 20, 'published'),
  ('yuuka', 'himeji-light', '優夏', 'ゆうか', '姫路の太陽', '老舗の駄菓子屋の娘', '../images/yuuka_face.png',
   '柳楽の妻。姫路の太陽のような明るさで、まちを照らす。', false, '../cast/yuka.html', 10, 'published'),
  ('yagira', 'himeji-light', '柳楽', 'やぎら', '夢見る建築士', '酒場で文化談義', '../images/yagira_face.png',
   '優夏の夫。建築と夢を語り、姫路に新しい風を吹き込む。', false, '../cast/yanagira.html', 20, 'published'),
  ('atsushi', 'brew-sound', '淳士', 'あつし', '醸造家DJ', '淡路を開拓中', '../images/atsushi_face.png',
   '瑛美の夫。醸造と音で、場の空気をつくる。', false, '../cast/atsushi.html', 10, 'published'),
  ('emi', 'brew-sound', '瑛美', 'えみ', '醸造家DJ', 'Rと運命を感じる', '../images/eimi_face.png',
   '淳士の妻。ビビッとくる縁と、醸造の感性を持つ。', false, '../cast/eimi.html', 20, 'published'),
  ('niikura', 'town-edge', '新倉一', 'にいくら はじめ', '多動の教師', 'プラハから帰還', '../images/niikura_face.png',
   'エネルギッシュな教師。海外経験を胸に、まちに戻ってきた。', false, '../cast/niikura.html', 10, 'published'),
  ('akino', 'town-edge', 'アキーノ', 'あきーの', '愛の楽団長', '春から自由の身へ', '../images/akiino_face.png',
   '新倉一のご近所さん。愛の楽団を率い、自由へ向かう。', false, '../cast/akiino.html', 20, 'published')
on conflict (slug) do update set
  group_code = excluded.group_code,
  name = excluded.name,
  reading = excluded.reading,
  role = excluded.role,
  tagline = excluded.tagline,
  photo_url = excluded.photo_url,
  bio = excluded.bio,
  featured = excluded.featured,
  profile_href = excluded.profile_href,
  sort_order = excluded.sort_order,
  status = excluded.status;
