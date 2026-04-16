/**
 * トップ「播州事変」: news_posts と episodes を順に取得し、1回で #scrollContent を組み立てる。
 * DBニュースがあるときは [エピソード（古→新）][ニュース（古→新）] とし、右端＝最新のニュース。
 * DBニュースがないときは静的HTMLを残し、エピソードだけ末尾に追加（従来どおり）。
 */
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

const KANJI = '〇一二三四五六七八九';

function reiwaYearToKanji(y) {
  if (y < 1) return String(y);
  if (y <= 10) return KANJI[y];
  if (y < 20) return '十' + (y % 10 ? KANJI[y % 10] : '');
  if (y === 20) return '二十';
  if (y < 30) return '二十' + (y % 10 ? KANJI[y % 10] : '');
  return String(y);
}

function monthToKanji(m) {
  const names = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
  return (names[m] || String(m)) + '月';
}

function dayToKanji(d) {
  if (d < 1 || d > 31) return String(d);
  if (d <= 10) {
    if (d === 10) return '十日';
    return KANJI[d] + '日';
  }
  if (d < 20) return '十' + KANJI[d % 10] + '日';
  if (d === 20) return '二十日';
  if (d < 30) return '二十' + (d % 10 ? KANJI[d % 10] : '') + '日';
  if (d === 30) return '三十日';
  return '三十一日';
}

function formatWarekiKanji(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (local < new Date(2019, 4, 1)) {
    try {
      return new Intl.DateTimeFormat('ja-JP', {
        era: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(d);
    } catch {
      return '';
    }
  }

  const y = local.getFullYear();
  const m = local.getMonth() + 1;
  const day = local.getDate();
  const reiwaYear = y - 2018;
  return `令和${reiwaYearToKanji(reiwaYear)}年${monthToKanji(m)}${dayToKanji(day)}`;
}

function mixHex(hexA, hexB, t) {
  const pa = hexA.replace('#', '');
  const pb = hexB.replace('#', '');
  const a = {
    r: parseInt(pa.slice(0, 2), 16),
    g: parseInt(pa.slice(2, 4), 16),
    b: parseInt(pa.slice(4, 6), 16),
  };
  const b = {
    r: parseInt(pb.slice(0, 2), 16),
    g: parseInt(pb.slice(2, 4), 16),
    b: parseInt(pb.slice(4, 6), 16),
  };
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r} ${g} ${bl})`;
}

const KOU_PALETTE_REG = {
  bg: ['#b8a690', '#e2d4bc'],
  border: ['#1e1610', '#9c8262'],
  outline: ['#3d3024', '#e8d4a8'],
};
const KOU_PALETTE_EP = {
  bg: ['#a8967e', '#d8c8b0'],
  border: ['#140e0a', '#8a6e52'],
  outline: ['#2a1e14', '#d4b088'],
};

function applyKouToneToScroll() {
  const sc = document.getElementById('scrollContent');
  if (!sc) return;
  const n = sc.children.length;
  for (let i = 0; i < n; i++) {
    const t = n <= 1 ? 1 : i / (n - 1);
    const el = sc.children[i];
    el.style.setProperty('--kou-tone', String(t));
    const pal = el.classList.contains('news-item--episode') ? KOU_PALETTE_EP : KOU_PALETTE_REG;
    el.style.setProperty('--kou-bg-mixed', mixHex(pal.bg[0], pal.bg[1], t));
    el.style.setProperty('--kou-border-mixed', mixHex(pal.border[0], pal.border[1], t));
    el.style.setProperty('--kou-outline-mixed', mixHex(pal.outline[0], pal.outline[1], t));
  }
}

function buildNewsFragment(rows) {
  const frag = document.createDocumentFragment();
  for (const row of rows) {
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
  return frag;
}

function buildEpisodeFragment(rows) {
  const frag = document.createDocumentFragment();
  for (const row of rows) {
    const slug = String(row.slug || '').trim();
    if (!slug) continue;

    const card = document.createElement('a');
    card.className = 'news-item news-item--vertical news-item--episode news-item--link';
    card.href = 'html/episode.html?slug=' + encodeURIComponent(slug);

    const titleWrap = document.createElement('div');
    titleWrap.className = 'news-title';
    const epLabel =
      row.episode_number != null && Number.isFinite(Number(row.episode_number))
        ? `第${row.episode_number}話 `
        : '';
    titleWrap.textContent = (epLabel + (row.title || slug)).trim();

    const dateEl = document.createElement('div');
    dateEl.className = 'news-date';
    dateEl.textContent = '更新 ' + formatWarekiKanji(row.updated_at);

    const kicker = document.createElement('div');
    kicker.className = 'news-kicker';
    kicker.textContent = 'エピソード';

    card.appendChild(titleWrap);
    card.appendChild(dateEl);
    card.appendChild(kicker);
    frag.appendChild(card);
  }
  return frag;
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

  const { data: newsRows, error: newsErr } = await supabase
    .from('news_posts')
    .select('title, body, link_url, happened_on')
    .eq('status', 'published')
    .order('sort_order', { ascending: true })
    .order('happened_on', { ascending: true })
    .order('updated_at', { ascending: true });

  const { data: epRows, error: epErr } = await supabase
    .from('episodes')
    .select('slug,title,episode_number,updated_at')
    .eq('status', 'published')
    .order('updated_at', { ascending: true })
    .limit(5);

  const hasNews = !newsErr && newsRows && newsRows.length > 0;
  const hasEp = !epErr && epRows && epRows.length > 0;

  if (hasNews) {
    root.innerHTML = '';
    const epFrag = hasEp ? buildEpisodeFragment(epRows) : null;
    const newsFrag = buildNewsFragment(newsRows);
    if (epFrag && epFrag.childNodes.length) {
      root.appendChild(epFrag);
    }
    root.appendChild(newsFrag);
  } else if (hasEp) {
    root.appendChild(buildEpisodeFragment(epRows));
  }

  applyKouToneToScroll();
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      applyKouToneToScroll();
      if (typeof window.scrollKawaraToNewestEnd === 'function') {
        window.scrollKawaraToNewestEnd();
      }
    });
  });
} else {
  applyKouToneToScroll();
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      applyKouToneToScroll();
      if (typeof window.scrollKawaraToNewestEnd === 'function') {
        window.scrollKawaraToNewestEnd();
      }
    });
  });
}
