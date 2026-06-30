-- 世界地図エディタ：川の「水位(water_y)」と「地表素材(ground_mat)」を
-- Supabase に保存できるようにするためのカラム追加。
-- ローカル(localStorage)保存だけなら実行不要。クラウド保存に反映したい時だけ実行する。
-- 実行しなくてもエディタは動作する（その場合これらはローカルにのみ保存される）。

alter table public.map_world_layers
  add column if not exists water_y    jsonb,  -- セル毎の水面の高さ（ワールド単位の配列）
  add column if not exists ground_mat jsonb;  -- セル毎の地表素材（0=自動 1=土 2=草 3=コンクリ 4=道路 5=幹線道路）
