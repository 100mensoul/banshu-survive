/**
 * トップ等の「エピソード」ドロップダウンを Supabase の published 一覧で埋めます。
 * DB に無い slug は NAV_EPISODE_FALLBACK で補完（シーズン1の旧ページなど、未登録でもリンクを残す）。
 * 直前に js/supabase-public-config.js で window.__SB_URL / __SB_ANON_KEY を読み込んでください。
 * マウント先: #episode-dropdown-root（失敗時は既存の静的HTMLのまま）
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** サイト掲載済みの既定エピソード。Supabase に同一 slug がある場合はそちら（タイトル等）を優先 */
const NAV_EPISODE_FALLBACK = [
  { slug: 'ep-box', title: '原風景を求めて', season: 1, episode_number: 1 },
  { slug: 'ep-3', title: '東京ネイティブ', season: 1, episode_number: 3 },
  { slug: 'ep-4', title: 'タネはまかれた', season: 2, episode_number: 4 },
  { slug: 'ep-5', title: '嵐のはじまり', season: 2, episode_number: 5 },
];

function mergePublishedWithFallback(published, fallback) {
  const bySlug = new Map();
  for (const row of published) {
    const s = String(row.slug || '').trim();
    if (s) bySlug.set(s, { ...row, slug: s });
  }
  for (const row of fallback) {
    const s = String(row.slug || '').trim();
    if (!s || bySlug.has(s)) continue;
    bySlug.set(s, {
      slug: s,
      title: row.title,
      season: row.season,
      episode_number: row.episode_number,
    });
  }
  return [...bySlug.values()];
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildLabel(row) {
  const t = (row.title || '').trim();
  const n = row.episode_number;
  if (n != null && Number.isFinite(Number(n))) {
    return `EP${n} ${t}`;
  }
  return t || row.slug || '';
}

const root = document.getElementById('episode-dropdown-root');
const url = window.__SB_URL;
const key = window.__SB_ANON_KEY;
const keyOk = key && String(key).trim().length > 0;
const urlOk =
  url &&
  String(url).trim().length > 0 &&
  !String(url).includes('あなたのプロジェクトID');

if (root && urlOk && keyOk) {
  const base = root.dataset.episodeLinkBase ?? '';
  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from('episodes')
    .select('slug,title,season,episode_number')
    .eq('status', 'published');

  const published = !error && Array.isArray(data) ? data : [];
  const rows = mergePublishedWithFallback(published, NAV_EPISODE_FALLBACK);

  if (rows.length) {
    rows.sort((a, b) => {
      const sa = a.season != null ? Number(a.season) : 9999;
      const sb = b.season != null ? Number(b.season) : 9999;
      if (sa !== sb) return sa - sb;
      const na = a.episode_number != null ? Number(a.episode_number) : 9999;
      const nb = b.episode_number != null ? Number(b.episode_number) : 9999;
      if (na !== nb) return na - nb;
      return String(a.slug || '').localeCompare(String(b.slug || ''));
    });

    const bySeason = new Map();
    for (const row of rows) {
      const keySeason = row.season != null ? Number(row.season) : 'other';
      if (!bySeason.has(keySeason)) bySeason.set(keySeason, []);
      bySeason.get(keySeason).push(row);
    }

    const seasonKeys = [...bySeason.keys()].sort((a, b) => {
      if (a === 'other') return 1;
      if (b === 'other') return -1;
      return Number(a) - Number(b);
    });

    let html = '';
    for (const sk of seasonKeys) {
      const heading =
        sk === 'other' ? 'その他' : `SEASON ${esc(String(sk))}`;
      html += `<div class="dropdown-season"><div class="dropdown-heading">${heading}</div><div class="dropdown-links">`;
      for (const row of bySeason.get(sk)) {
        const slug = String(row.slug || '').trim();
        if (!slug) continue;
        const href = esc(
          base + 'episode.html?slug=' + encodeURIComponent(slug)
        );
        const label = esc(buildLabel(row));
        html += `<a href="${href}">${label}</a>`;
      }
      html += '</div></div>';
    }
    root.innerHTML = html;
  }
}
