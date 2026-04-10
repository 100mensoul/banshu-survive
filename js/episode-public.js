/**
 * 公開エピソード: URL の ?slug= を優先し、なければ data-episode-slug を使用。
 * episodes テーブル（status=published）と照合し #episode-content を Markdown で置き換え。
 * #episode-series-nav-top / bottom があれば同一シーズン内の前後話リンクを生成。
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

const params = new URLSearchParams(window.location.search);
let slug = (params.get('slug') || '').trim();
if (!slug) {
  slug = (document.documentElement.getAttribute('data-episode-slug') || '').trim();
}

const url = window.__SB_URL;
const key = window.__SB_ANON_KEY;
const root = document.getElementById('episode-content');
const seasonSlot = document.getElementById('episode-season-slot');

const keyOk = key && String(key).trim().length > 0;
const urlOk =
  url &&
  String(url).trim().length > 0 &&
  !String(url).includes('あなたのプロジェクトID');

function navRowHtml(prev, next) {
  if (!prev && !next) return '';
  const left = prev
    ? `<a href="episode.html?slug=${encodeURIComponent(prev.slug)}">← 第${prev.episode_number != null ? esc(String(prev.episode_number)) : '?'}話</a>`
    : '<span></span>';
  const right = next
    ? `<a href="episode.html?slug=${encodeURIComponent(next.slug)}">第${next.episode_number != null ? esc(String(next.episode_number)) : '?'}話 →</a>`
    : '<span></span>';
  return left + right;
}

async function fillSeriesNav(supabase, current) {
  const top = document.getElementById('episode-series-nav-top');
  const bottom = document.getElementById('episode-series-nav-bottom');
  if (!top && !bottom) return;

  const { data: rows, error } = await supabase
    .from('episodes')
    .select('slug, episode_number, season')
    .eq('status', 'published');

  if (error || !rows?.length) return;

  const group = rows.filter((r) => {
    if (current.season == null) return r.season == null;
    return r.season === current.season;
  });
  group.sort((a, b) => {
    const na = a.episode_number != null ? Number(a.episode_number) : 9999;
    const nb = b.episode_number != null ? Number(b.episode_number) : 9999;
    if (na !== nb) return na - nb;
    return String(a.slug || '').localeCompare(String(b.slug || ''));
  });

  const ix = group.findIndex((r) => r.slug === current.slug);
  const prev = ix > 0 ? group[ix - 1] : null;
  const next = ix >= 0 && ix < group.length - 1 ? group[ix + 1] : null;
  const inner = navRowHtml(prev, next);
  if (top) top.innerHTML = inner;
  if (bottom) bottom.innerHTML = inner;
}

if (!slug || !root || !urlOk || !keyOk) {
  /* slug なし／設定なしは静的HTMLのまま */
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

    await fillSeriesNav(supabase, data);
  } else if (!error && !data) {
    document.title = 'エピソード｜播州サバイブ';
    if (seasonSlot) seasonSlot.textContent = '';
    root.innerHTML =
      '<p>このエピソードは見つからないか、まだ<strong>公開</strong>されていません（下書きの可能性があります）。</p>';
  } else if (error) {
    document.title = 'エピソード｜播州サバイブ';
    if (seasonSlot) seasonSlot.textContent = '';
    root.innerHTML = `<p>読み込みエラー: ${esc(error.message)}</p>`;
  }
}
