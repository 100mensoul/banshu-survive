import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatWarekiKanjiFromDate(dateText) {
  if (!dateText) return '';
  const d = new Date(dateText + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('ja-JP-u-ca-japanese', {
      era: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(d);
  } catch {
    return dateText;
  }
}

const root = document.getElementById('scrollContent');
const url = window.__SB_URL;
const key = window.__SB_ANON_KEY;
const keyOk = key && String(key).trim().length > 0;
const urlOk =
  url &&
  String(url).trim().length > 0 &&
  !String(url).includes('あなたのプロジェクトID');

if (root && keyOk && urlOk) {
  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from('news_posts')
    .select('title, body, link_url, happened_on')
    .eq('status', 'published')
    .order('sort_order', { ascending: true })
    .order('happened_on', { ascending: true })
    .order('updated_at', { ascending: true });

  if (!error && data && data.length) {
    root.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const row of data) {
      const hasLink = row.link_url && String(row.link_url).trim() !== '';
      const item = document.createElement(hasLink ? 'a' : 'div');
      item.className = 'news-item news-item--vertical' + (hasLink ? ' news-item--link' : '');
      if (hasLink) {
        item.href = String(row.link_url);
        item.target = '_blank';
        item.rel = 'noopener noreferrer';
      }
      const bodyTail = row.body ? '｜' + row.body : '';
      item.innerHTML =
        '<div class="news-title">' +
        esc(row.title) +
        bodyTail +
        '</div>' +
        '<div class="news-date">' +
        esc(formatWarekiKanjiFromDate(row.happened_on)) +
        '</div>';
      frag.appendChild(item);
    }
    root.appendChild(frag);
  }
}
