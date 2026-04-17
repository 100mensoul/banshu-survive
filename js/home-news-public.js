/**
 * トップ「播州事変」: news_posts と episodes を created_at 昇順で混在し、#scrollContent を1回で組み立てる。
 * 古い登録が左、新しい登録が右。右端＝最新が初期表示（scrollKawaraToNewestEnd）。
 * DBに公開データが無いときは index.html の静的HTMLをそのまま残す。
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

/* 案C+ 印なし版: 板は茶系統一、左=濃い 右=淡い */
const KOU_PALETTE_REG = {
  bg: ['#5e4a38', '#a08c71'],
  border: ['#2c1f14', '#2c1f14'],
};
const KOU_PALETTE_EP = {
  bg: ['#5e4a38', '#a08c71'],
  border: ['#2c1f14', '#2c1f14'],
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
  }
}

function buildNewsCard(row) {
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
  return item;
}

function buildEpisodeCard(row) {
  const slug = String(row.slug || '').trim();
  if (!slug) return null;

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
  return card;
}

function createdAtMs(v) {
  if (v == null || v === '') return 0;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
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
    .select('title, body, link_url, happened_on, created_at')
    .eq('status', 'published')
    .order('created_at', { ascending: true });

  const { data: epRows, error: epErr } = await supabase
    .from('episodes')
    .select('slug, title, episode_number, created_at, updated_at')
    .eq('status', 'published')
    .order('created_at', { ascending: true })
    .limit(20);

  const hasNews = !newsErr && newsRows && newsRows.length > 0;
  const hasEp = !epErr && epRows && epRows.length > 0;

  const unified = [];

  if (hasNews) {
    for (const row of newsRows) {
      unified.push({ kind: 'news', sortKey: row.created_at, row });
    }
  }

  if (hasEp) {
    for (const row of epRows) {
      unified.push({ kind: 'episode', sortKey: row.created_at, row });
    }
  }

  unified.sort((a, b) => {
    const ta = createdAtMs(a.sortKey);
    const tb = createdAtMs(b.sortKey);
    if (ta !== tb) return ta - tb;
    if (a.kind !== b.kind) return a.kind === 'news' ? -1 : 1;
    return 0;
  });

  if (unified.length > 0) {
    root.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const item of unified) {
      const el = item.kind === 'news' ? buildNewsCard(item.row) : buildEpisodeCard(item.row);
      if (el) frag.appendChild(el);
    }
    root.appendChild(frag);
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
