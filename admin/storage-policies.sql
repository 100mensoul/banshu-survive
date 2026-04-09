-- === 手順 ===
-- 1) Supabase ダッシュボード → Storage → New bucket
--    名前: episode-images ／ Public bucket をオン
-- 2) このファイルの「ポリシー」部分を SQL Editor で実行（バケット作成は UI でも SQL でも可）

-- バケットを SQL で作る場合（UI で作ったならスキップ）
insert into storage.buckets (id, name, public)
values ('episode-images', 'episode-images', true)
on conflict (id) do update set public = excluded.public;

-- ポリシー（storage.objects）

drop policy if exists "Public read episode-images" on storage.objects;
create policy "Public read episode-images"
  on storage.objects for select
  using (bucket_id = 'episode-images');

drop policy if exists "Auth insert episode-images" on storage.objects;
create policy "Auth insert episode-images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'episode-images');

drop policy if exists "Auth update episode-images" on storage.objects;
create policy "Auth update episode-images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'episode-images')
  with check (bucket_id = 'episode-images');

drop policy if exists "Auth delete episode-images" on storage.objects;
create policy "Auth delete episode-images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'episode-images');
