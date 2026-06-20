-- ヒメログ用写真（手書きメモなど）Storage バケット
-- 実行場所: Supabase SQL Editor
-- 公開サイトは anon で SELECT、追加・更新・削除は Auth ログインユーザーのみ。

insert into storage.buckets (id, name, public)
values ('himelog-photos', 'himelog-photos', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public read himelog-photos" on storage.objects;
create policy "Public read himelog-photos"
  on storage.objects for select
  using (bucket_id = 'himelog-photos');

drop policy if exists "Auth insert himelog-photos" on storage.objects;
create policy "Auth insert himelog-photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'himelog-photos');

drop policy if exists "Auth update himelog-photos" on storage.objects;
create policy "Auth update himelog-photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'himelog-photos')
  with check (bucket_id = 'himelog-photos');

drop policy if exists "Auth delete himelog-photos" on storage.objects;
create policy "Auth delete himelog-photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'himelog-photos');
