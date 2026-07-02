-- ひめじん肖像 Storage バケット（フェーズA: 手動アップロード）
-- 実行場所: Supabase SQL Editor
--
-- 固定パス: portraits/{profile_id}/current.webp
-- real_name はパスに含めない（profile_id で名前空間を切る）

insert into storage.buckets (id, name, public)
values ('himejin-portraits', 'himejin-portraits', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public read himejin-portraits" on storage.objects;
create policy "Public read himejin-portraits"
  on storage.objects for select
  using (bucket_id = 'himejin-portraits');

drop policy if exists "Auth insert himejin-portraits" on storage.objects;
create policy "Auth insert himejin-portraits"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'himejin-portraits');

drop policy if exists "Auth update himejin-portraits" on storage.objects;
create policy "Auth update himejin-portraits"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'himejin-portraits')
  with check (bucket_id = 'himejin-portraits');

drop policy if exists "Auth delete himejin-portraits" on storage.objects;
create policy "Auth delete himejin-portraits"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'himejin-portraits');
