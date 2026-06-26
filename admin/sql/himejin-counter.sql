-- ひめじん来訪カウンター（トップページ）
-- 実行場所: Supabase SQL Editor で1回だけ実行する。
--
-- 仕様:
--  - 1行だけの「数え箱」。count = これまでに訪れた人数。
--  - 初期値 1 ＝ サイト主（あなた＝1人目）。最初の訪問者は 2人目から。
--  - 総数の読み取りは公開（anon SELECT）。
--  - 増加は anon に直接させず、関数 next_himejin() 経由でのみ +1 する。

-- 1) 数え箱（1行のみ。id は常に 1）
create table if not exists public.himejin_counter (
  id int primary key default 1 check (id = 1),
  count bigint not null default 1
);

-- 初期行（1人目＝サイト主）。既にあれば何もしない。
insert into public.himejin_counter (id, count)
values (1, 1)
on conflict (id) do nothing;

-- 2) RLS
alter table public.himejin_counter enable row level security;

-- 総数の読み取りは公開
drop policy if exists "Public read himejin_counter" on public.himejin_counter;
create policy "Public read himejin_counter"
  on public.himejin_counter for select using (true);

-- 直接の書き込みポリシーは作らない（増加は関数経由のみ）

-- 3) 安全に +1 して新しい番号（＝その人の「○人目」）を返す関数
--    security definer で所有者権限実行 → RLS を介さず確実に更新できる。
create or replace function public.next_himejin()
returns bigint
language sql
security definer
set search_path = public
as $$
  update public.himejin_counter
     set count = count + 1
   where id = 1
  returning count;
$$;

-- anon（公開サイト）に実行を許可
grant execute on function public.next_himejin() to anon;
grant execute on function public.next_himejin() to authenticated;
