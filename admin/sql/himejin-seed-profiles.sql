-- ひめじん初期データ（倉林・橋本・稲田）
-- 実行場所: Supabase SQL Editor（content-cms.sql または phase2 済みの DB 向け）
--
-- html/himejin.html の静的フォールバックと同内容を himejin_profiles に登録します。
-- 再実行しても slug が同じなら上書き更新されます（ON CONFLICT）。

insert into public.himejin_profiles (
  slug,
  name,
  tribe_code,
  tribe_label,
  clan_code,
  tagline,
  intro,
  photo_url,
  sort_order,
  status
) values
  (
    'kurabayashi',
    '倉林',
    'nbt',
    'NEOバンシュウ族',
    null,
    '想いを形にする建築家',
    '姫路在住の建築家。ツインコモンズから車で5分、奇跡的なご近所さん。静かな佇まいの奥に情熱を秘めている。Rの自由すぎる構想を「嵐」と呼びながらも、寛大に受け入れ、理念の根底を理解した上で形にしていく。Rと同年代。',
    null,
    10,
    'published'
  ),
  (
    'hashimoto',
    '橋本',
    'unknown',
    '未判明',
    null,
    '内と外をつなぐ道先案内人',
    '「ウント」という社名が象徴するように、人と人、内と外をつなぐ仕事をしている。学生にも教え、姫路の中枢ネットワークに精通する。外からやってきたRにとっての良きアドバイザーにしてメンター。40代なかば、Rのお兄さん的存在。',
    null,
    20,
    'published'
  ),
  (
    'inada',
    '稲田',
    'banshujin',
    '播州族',
    null,
    '仏の笑顔で夢を聴く人',
    '代々の会社を営みながら、土地を活かした社会貢献に取り組む。姫路の再開発事業の立役者の一人。商工会議所の要職にあり、普通なら届かないところへの橋を架けてくれる。農業、食、教育——Rと目指す方向が重なるキーパーソン。物腰は柔らかく、いつも笑ってRの夢を聞いてくれる。美術館の仕事も手がける。',
    null,
    30,
    'published'
  )
on conflict (slug) do update set
  name = excluded.name,
  tribe_code = excluded.tribe_code,
  tribe_label = excluded.tribe_label,
  clan_code = excluded.clan_code,
  tagline = excluded.tagline,
  intro = excluded.intro,
  photo_url = excluded.photo_url,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = now();
