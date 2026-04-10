/**
 * 公開エピソードページ用: data-episode-slug と episodes テーブル（status=published）を照合し、
 * #episode-content を Markdown レンダリング結果で置き換えます。
 * 行がない／未公開のときは HTML の静的ブロックをそのまま表示します。
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { marked } from 'https://esm.sh/marked@14';

marked.setOptions({ breaks: true, gfm: true });

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

const slug = document.documentElement.getAttribute('data-episode-slug');
const url = window.__SB_URL;
const key = window.__SB_ANON_KEY;
const root = document.getElementById('episode-content');
const seasonSlot = document.getElementById('episode-season-slot');

const keyOk = key && String(key).trim().length > 0;
const urlOk = url && String(url).trim().length > 0 && !String(url).includes('あなたのプロジェクトID');

if (!slug || !root || !urlOk || !keyOk) {
  /* 設定なしは静的的表示のまま */
} else {
  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from('episodes')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();

  if (!error && data) {
    document.title = `${data.title}｜播州サバイブ`;

    if (seasonSlot) {
      if (data.season != null) {
        seasonSlot.textContent = 'SEASON ' + String(data.season);
      } else {
        seasonSlot.textContent = '';
      }
    }

    const sub = data.subtitle ? `<div class="sub-title">${esc(data.subtitle)}</div>` : '';
    const dateLine = data.updated_at
      ? `<div class="date">${formatDate(data.updated_at)}</div>`
      : '';

    root.innerHTML = `
      <h1>${esc(data.title)}</h1>
      ${sub}
      ${dateLine}
      <div class="episode-md">${marked.parse(data.body || '')}</div>
    `;
  }
}
