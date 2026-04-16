import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const url = window.__SB_URL;
const key = window.__SB_ANON_KEY;
const keyOk = key && String(key).trim().length > 0;
const urlOk =
  url &&
  String(url).trim().length > 0 &&
  !String(url).includes('あなたのプロジェクトID');

const tribesRoot = document.getElementById('glossary-tribes-root');
const clansRoot = document.getElementById('glossary-clans-root');

function renderSection(root, rows, emptyMsg) {
  if (!root) return;
  if (!rows || !rows.length) {
    root.textContent = emptyMsg;
    root.classList.remove('glossary-wait');
    return;
  }
  root.classList.remove('glossary-wait');
  root.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const row of rows) {
    const art = document.createElement('article');
    art.className = 'glossary-entry';
    art.innerHTML =
      '<h3>' + esc(row.title || row.code) + '</h3>' +
      '<p>' + esc(row.description || '') + '</p>';
    frag.appendChild(art);
  }
  root.appendChild(frag);
}

if (!keyOk || !urlOk) {
  if (tribesRoot) tribesRoot.textContent = 'Supabase 設定（js/supabase-public-config.js）を確認してください。';
  if (clansRoot) clansRoot.textContent = '';
} else {
  const supabase = createClient(url, key);

  const { data: tribes, error: te } = await supabase
    .from('tribe_descriptions')
    .select('code,title,description')
    .order('sort_order', { ascending: true })
    .order('code', { ascending: true });

  if (te && tribesRoot) {
    tribesRoot.textContent = '種族の読み込みエラー: ' + te.message;
    tribesRoot.classList.remove('glossary-wait');
  } else {
    renderSection(tribesRoot, tribes, '種族データがありません。');
  }

  const { data: clans, error: ce } = await supabase
    .from('clan_descriptions')
    .select('code,title,description')
    .order('sort_order', { ascending: true })
    .order('code', { ascending: true });

  if (ce && clansRoot) {
    clansRoot.textContent = 'クランの読み込みエラー: ' + ce.message;
    clansRoot.classList.remove('glossary-wait');
  } else {
    renderSection(clansRoot, clans, '姫路クランデータがありません。');
  }
}
