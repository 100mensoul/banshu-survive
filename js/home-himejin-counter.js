/**
 * トップ「ようこそ」カウンター。
 *  - 初回訪問: next_himejin() を呼んで自分の番号（○人目）をもらい localStorage に保存。
 *  - 2回目以降: 自分の番号は localStorage から（固定）。総数だけ DB から読み直す。
 *  - 「同じ人」はブラウザ単位（localStorage）で判定。
 *  - Supabase 未接続・失敗時は何も表示しない（壊れた表示を避ける）。
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STORAGE_KEY = 'banshuHimejinNo';

function buildMessage(root, myNo, total) {
  root.innerHTML = '';

  const main = document.createElement('p');
  main.className = 'himejin-welcome__main';
  main.innerHTML =
    'あなたは <strong>' +
    myNo +
    '</strong> 人目のひめじんです！';

  const sub = document.createElement('p');
  sub.className = 'himejin-welcome__sub';
  sub.textContent = 'ようこそ、ニューハリマワールドへ';

  const totalEl = document.createElement('p');
  // 「うるさい」と感じたら CSS の .himejin-welcome__total を display:none にするだけで消せる。
  totalEl.className = 'himejin-welcome__total';
  totalEl.textContent = 'これまでに ' + total + ' 人のひめじんが訪れました';

  root.appendChild(main);
  root.appendChild(sub);
  root.appendChild(totalEl);
  root.hidden = false;
}

(async function () {
  const root = document.getElementById('himejin-welcome');
  if (!root) return;

  const url = window.__SB_URL;
  const key = window.__SB_ANON_KEY;
  const urlOk =
    url &&
    String(url).trim().length > 0 &&
    !String(url).includes('あなたのプロジェクトID');
  const keyOk = key && String(key).trim().length > 0;
  if (!urlOk || !keyOk) return;

  let supabase;
  try {
    supabase = createClient(url, key);
  } catch (e) {
    return;
  }

  let myNo = null;
  try {
    myNo = window.localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    myNo = null;
  }

  try {
    if (myNo) {
      // 再訪: 自分の番号は固定。総数だけ取り直す。
      const { data, error } = await supabase
        .from('himejin_counter')
        .select('count')
        .eq('id', 1)
        .single();
      if (error || !data) return;
      buildMessage(root, myNo, data.count);
    } else {
      // 初回: +1 して自分の番号を確定。
      const { data, error } = await supabase.rpc('next_himejin');
      if (error || data == null) return;
      const assigned = data;
      try {
        window.localStorage.setItem(STORAGE_KEY, String(assigned));
      } catch (e) {}
      // 初回は「自分の番号＝その時点の総数」。
      buildMessage(root, assigned, assigned);
    }
  } catch (e) {
    // ネットワーク等の失敗時は何も出さない。
  }
})();
