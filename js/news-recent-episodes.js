/**
 * トップ「播州事変」: 公開済みエピソードを updated_at 昇順で最大5件、
 * #scrollContent の末尾に縦書き瓦版カードで追加します（右ほど新しい）。
 * 直前に js/supabase-public-config.js を読み込んでください。
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const KANJI = '〇一二三四五六七八九';

/** @param {number} y 令和年（1〜） */
function reiwaYearToKanji(y) {
  if (y < 1) return String(y);
  if (y <= 10) return KANJI[y];
  if (y < 20) return '十' + (y % 10 ? KANJI[y % 10] : '');
  if (y === 20) return '二十';
  if (y < 30) return '二十' + (y % 10 ? KANJI[y % 10] : '');
  return String(y);
}

/** @param {number} m 月 1-12 */
function monthToKanji(m) {
  const names = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
  return (names[m] || String(m)) + '月';
}

/** @param {number} d 日 1-31 */
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

/** ISO 日時を「令和○年○月○日」風の漢字表記に（令和以前は Intl にフォールバック） */
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

/** #RRGGBB を t=0→1 で線形補間（color-mix+calc が環境で無効になるのを避ける） */
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

/** 通常札・エピソード札の配色（左＝古い＝暗、右＝新しい＝明） */
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

/** 左→右で t=0→1（左＝暗め、右＝明め）。混色結果を --kou-*-mixed にセット */
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

const scrollContent = document.getElementById('scrollContent');
const url = window.__SB_URL;
const key = window.__SB_ANON_KEY;
const keyOk = key && String(key).trim().length > 0;
const urlOk =
  url &&
  String(url).trim().length > 0 &&
  !String(url).includes('あなたのプロジェクトID');

if (scrollContent && urlOk && keyOk) {
  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from('episodes')
    .select('slug,title,episode_number,updated_at')
    .eq('status', 'published')
    .order('updated_at', { ascending: true })
    .limit(5);

  if (!error && data && data.length) {
    const frag = document.createDocumentFragment();
    for (const row of data) {
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
    scrollContent.appendChild(frag);
  }
}

applyKouToneToScroll();
