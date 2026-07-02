/**
 * 歳時記 — 水の流れプロトタイプ（一本横スクロール）
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EVENT_SORT_ASC = true;
const GRID_START_HOUR = 9;
const GRID_END_HOUR = 22;
const HOUR_HEIGHT_PX = 48;
const MIN_BLOCK_HEIGHT_PX = 28;

const SLUG_PALETTE = [
  '#7ec8e3',
  '#a8e6cf',
  '#ffd3a5',
  '#ffaaa5',
  '#c3b1e1',
  '#b5ead7',
  '#ffc8dd',
  '#dfe7fd',
];
const UNCLASSIFIED_COLOR = '#b8c9d4';

const ENABLE_FLAP_ANIMATION = false;

const root = document.getElementById('saijiki-root');
const url = window.__SB_URL;
const key = window.__SB_ANON_KEY;
const keyOk = key && String(key).trim().length > 0;
const urlOk =
  url &&
  String(url).trim().length > 0 &&
  !String(url).includes('あなたのプロジェクトID');

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let flapAnimationStarted = false;

let allEvents = [];
let episodeTitleBySlug = new Map();
let selectedEventId = null;
let lastFocusedBlock = null;

const modalEl = document.getElementById('saijiki-modal');
const modalBox = document.getElementById('saijiki-modal-box');
const modalBody = document.getElementById('saijiki-modal-body');
const modalBackdrop = document.getElementById('saijiki-modal-backdrop');
const modalCloseBtn = document.getElementById('saijiki-modal-close');

function initModal() {
  if (!modalEl) return;
  modalBackdrop?.addEventListener('click', closeDetail);
  modalCloseBtn?.addEventListener('click', closeDetail);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalEl && !modalEl.hidden) {
      e.preventDefault();
      closeDetail();
    }
  });
}

function closeDetail() {
  if (!modalEl || modalEl.hidden) return;
  modalEl.hidden = true;
  document.body.style.overflow = '';
  selectedEventId = null;
  root?.querySelectorAll('.saijiki-block').forEach((el) => el.classList.remove('is-selected'));
  if (lastFocusedBlock && typeof lastFocusedBlock.focus === 'function') {
    lastFocusedBlock.focus();
  }
  lastFocusedBlock = null;
}

function showDetail(ev, triggerBtn) {
  if (!modalEl || !modalBody) return;
  selectedEventId = ev.id;
  lastFocusedBlock = triggerBtn || document.activeElement;
  root.querySelectorAll('.saijiki-block').forEach((el) => {
    el.classList.toggle('is-selected', el.dataset.eventId === ev.id);
  });
  modalBody.innerHTML =
    `<h3 class="saijiki-detail-title" id="saijiki-modal-title">${esc(ev.title || '')}</h3>` +
    `<p class="saijiki-detail-meta">${esc(detailMeta(ev))}</p>` +
    (ev.note && String(ev.note).trim()
      ? `<p class="saijiki-detail-note">${esc(ev.note)}</p>`
      : '') +
    linkChipsHtml(ev);
  modalEl.hidden = false;
  document.body.style.overflow = 'hidden';
  modalBox?.focus();
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMonthKey(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

function formatDayHeader(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatTimeLabel(t) {
  if (!t) return '';
  const s = String(t);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

function parseTimeToMinutes(t) {
  if (!t) return null;
  const parts = String(t).split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || '0', 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function gridBodyHeightPx() {
  return (GRID_END_HOUR - GRID_START_HOUR) * HOUR_HEIGHT_PX;
}

function minutesToTop(minutes) {
  const start = GRID_START_HOUR * 60;
  const end = GRID_END_HOUR * 60;
  const clamped = Math.max(start, Math.min(end, minutes));
  return ((clamped - start) / 60) * HOUR_HEIGHT_PX;
}

function minutesToHeight(startMin, endMin) {
  if (endMin == null) return MIN_BLOCK_HEIGHT_PX;
  const gridStart = GRID_START_HOUR * 60;
  const gridEnd = GRID_END_HOUR * 60;
  const s = Math.max(gridStart, startMin);
  const e = Math.min(gridEnd, endMin);
  const h = ((e - s) / 60) * HOUR_HEIGHT_PX;
  return Math.max(MIN_BLOCK_HEIGHT_PX, h);
}

function isAllDay(ev) {
  return !ev.start_time;
}

function buildSlugColorMap(events) {
  const map = new Map();
  let idx = 0;
  events.forEach((ev) => {
    const slug = (ev.related_episode_slug || '').trim();
    const key = slug || '__none__';
    if (!map.has(key)) {
      map.set(key, slug ? SLUG_PALETTE[idx % SLUG_PALETTE.length] : UNCLASSIFIED_COLOR);
      idx += 1;
    }
  });
  return map;
}

function slugColor(slugColorMap, slug) {
  const key = (slug || '').trim() || '__none__';
  return slugColorMap.get(key) || UNCLASSIFIED_COLOR;
}

function legendLabel(slug) {
  if (!slug) return '独立した出来事';
  const title = episodeTitleBySlug.get(slug);
  return title ? `${title}（${slug}）` : slug;
}

function himelogEntryLink(entryId) {
  return `../himelog/index.html?entry=${encodeURIComponent(entryId)}`;
}

function linkChipsHtml(ev) {
  const chips = [];
  if (ev.related_episode_slug) {
    chips.push(
      `<a class="saijiki-chip" href="episode.html?slug=${encodeURIComponent(ev.related_episode_slug)}">📖 本編</a>`
    );
  }
  if (ev.digest_slug) {
    chips.push(
      `<a class="saijiki-chip" href="digest.html?slug=${encodeURIComponent(ev.digest_slug)}">📷 ダイジェスト</a>`
    );
  }
  const himelogIds = Array.isArray(ev.himelog_entry_ids)
    ? ev.himelog_entry_ids.filter(Boolean)
    : [];
  himelogIds.forEach((id, index) => {
    const label = himelogIds.length === 1 ? '📝 メモ' : `📝 メモ${index + 1}`;
    chips.push(
      `<a class="saijiki-chip" href="${esc(himelogEntryLink(id))}">${label}</a>`
    );
  });
  return chips.length ? `<div class="saijiki-links">${chips.join('')}</div>` : '';
}

function detailMeta(ev) {
  const parts = [formatDayHeader(ev.event_date)];
  if (ev.event_date_end && ev.event_date_end !== ev.event_date) {
    parts[0] = `${formatDayHeader(ev.event_date)}〜${formatDayHeader(ev.event_date_end)}`;
  }
  if (ev.start_time) {
    const t = formatTimeLabel(ev.start_time);
    const te = ev.end_time ? `〜${formatTimeLabel(ev.end_time)}` : '';
    parts.push(`${t}${te}`);
  } else {
    parts.push('終日');
  }
  if (ev.related_episode_slug) {
    parts.push(`本編: ${ev.related_episode_slug}`);
  }
  return parts.join(' · ');
}

function blockHtml(ev, slugColorMap, options) {
  const { allday = false } = options || {};
  const accent = slugColor(slugColorMap, ev.related_episode_slug);
  const majorClass = ev.weight === 'major' ? ' saijiki-block--major' : '';
  const alldayClass = allday ? ' saijiki-block--allday' : '';
  let timeHtml = '';
  if (!allday && ev.start_time) {
    const te = ev.end_time ? `〜${formatTimeLabel(ev.end_time)}` : '';
    timeHtml = `<span class="saijiki-block-time">${esc(formatTimeLabel(ev.start_time))}${esc(te)}</span>`;
  }
  return (
    `<button type="button" class="saijiki-block${majorClass}${alldayClass}" data-event-id="${esc(ev.id)}"` +
    ` style="--block-accent:${esc(accent)}" aria-label="${esc(ev.title || '')}">` +
    timeHtml +
    `<span class="saijiki-block-title" data-flap="${esc(ev.title || '')}">${esc(ev.title || '')}</span>` +
    `</button>`
  );
}

function renderLegend(slugColorMap) {
  const items = [];
  slugColorMap.forEach((color, key) => {
    const slug = key === '__none__' ? '' : key;
    items.push(
      `<span class="saijiki-legend-item">` +
      `<span class="saijiki-legend-swatch" style="background:${esc(color)}"></span>` +
      `<span>${esc(legendLabel(slug))}</span></span>`
    );
  });
  return items.length ? `<div class="saijiki-legend">${items.join('')}</div>` : '';
}

function dateHeaderHtml(dateStr, prevDateStr) {
  const monthKey = formatMonthKey(dateStr);
  const prevMonthKey = prevDateStr ? formatMonthKey(prevDateStr) : '';
  const isMonthStart = monthKey && monthKey !== prevMonthKey;
  const monthHtml = isMonthStart
    ? `<span class="saijiki-date-month">${esc(monthKey)}</span>`
    : '';
  return (
    `${monthHtml}<span class="saijiki-date-day">${esc(formatDayHeader(dateStr))}</span>`
  );
}

function renderRiverGrid(events, slugColorMap) {
  const dates = [...new Set(events.map((e) => e.event_date).filter(Boolean))].sort((a, b) =>
    EVENT_SORT_ASC ? a.localeCompare(b) : b.localeCompare(a)
  );
  if (!dates.length) return '';

  const colCount = dates.length;
  const bodyH = gridBodyHeightPx();
  let gridHtml = `<div class="saijiki-grid" style="--saijiki-cols:${colCount}">`;

  gridHtml += '<div class="saijiki-grid-corner" style="grid-row:1;grid-column:1"></div>';
  dates.forEach((d, i) => {
    const prev = i > 0 ? dates[i - 1] : '';
    const monthStartClass =
      formatMonthKey(d) !== formatMonthKey(prev) && prev !== ''
        ? ' saijiki-date-header--month-edge'
        : i === 0
          ? ' saijiki-date-header--month-start'
          : '';
    gridHtml +=
      `<div class="saijiki-date-header${monthStartClass}" style="grid-row:1;grid-column:${i + 2}">` +
      dateHeaderHtml(d, prev) +
      `</div>`;
  });

  gridHtml += '<div class="saijiki-allday-label" style="grid-row:2;grid-column:1">終日</div>';
  dates.forEach((d, i) => {
    const alldayEvents = events.filter((e) => e.event_date === d && isAllDay(e));
    let colHtml = '';
    alldayEvents.forEach((ev) => {
      colHtml += blockHtml(ev, slugColorMap, { allday: true });
    });
    gridHtml += `<div class="saijiki-allday-col" style="grid-row:2;grid-column:${i + 2}">${colHtml}</div>`;
  });

  gridHtml += `<div class="saijiki-time-gutter" style="grid-row:3;grid-column:1;height:${bodyH}px">`;
  gridHtml += '<div class="saijiki-flow-line" aria-hidden="true"></div>';
  for (let h = GRID_START_HOUR; h < GRID_END_HOUR; h += 1) {
    const top = (h - GRID_START_HOUR) * HOUR_HEIGHT_PX;
    gridHtml += `<div class="saijiki-hour-label" style="top:${top}px">${h}:00</div>`;
  }
  gridHtml += '</div>';

  dates.forEach((d, i) => {
    gridHtml += `<div class="saijiki-day-col" style="grid-row:3;grid-column:${i + 2};height:${bodyH}px">`;
    events
      .filter((e) => e.event_date === d && !isAllDay(e))
      .forEach((ev) => {
        const startMin = parseTimeToMinutes(ev.start_time);
        if (startMin == null) return;
        const endMin = parseTimeToMinutes(ev.end_time);
        const top = minutesToTop(startMin);
        const height = minutesToHeight(startMin, endMin);
        gridHtml +=
          `<div style="position:absolute;top:${top}px;left:0;right:0;height:${height}px">` +
          blockHtml(ev, slugColorMap, { allday: false }) +
          '</div>';
      });
    gridHtml += '</div>';
  });

  gridHtml += '</div>';

  return (
    `<section class="saijiki-river-section">` +
    renderLegend(slugColorMap) +
    `<div class="saijiki-river-scroll" aria-label="時系列カレンダー、横にスクロール">` +
    `<div class="saijiki-river-track">` +
    gridHtml +
    `</div></div></section>`
  );
}

function renderGrids(events) {
  if (!events.length) {
    root.innerHTML = '<p class="saijiki-empty">まだ公開された出来事はありません。</p>';
    return;
  }

  const sorted = [...events].sort((a, b) => {
    const da = a.event_date || '';
    const db = b.event_date || '';
    if (da !== db) return EVENT_SORT_ASC ? da.localeCompare(db) : db.localeCompare(da);
    const ta = parseTimeToMinutes(a.start_time) ?? -1;
    const tb = parseTimeToMinutes(b.start_time) ?? -1;
    if (ta !== tb) return ta - tb;
    return String(a.title || '').localeCompare(String(b.title || ''), 'ja');
  });

  const slugColorMap = buildSlugColorMap(sorted);
  root.innerHTML = renderRiverGrid(sorted, slugColorMap);

  root.querySelectorAll('.saijiki-block').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.eventId;
      const ev = allEvents.find((e) => e.id === id);
      if (ev) showDetail(ev, btn);
    });
  });

  runSplitFlapOnce();
}

const FLAP_CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワ';

function runSplitFlapOnce() {
  if (flapAnimationStarted || prefersReducedMotion || !ENABLE_FLAP_ANIMATION) return;
  flapAnimationStarted = true;

  const titles = root.querySelectorAll('.saijiki-block-title[data-flap]');
  if (!titles.length) return;

  const maxTotalMs = 2000;
  const stagger = Math.min(80, Math.floor(maxTotalMs / titles.length));
  const durationPer = Math.min(800, 500);

  titles.forEach((el, index) => {
    const finalText = el.dataset.flap || '';
    if (!finalText) return;

    const delay = index * stagger;
    setTimeout(() => {
      const start = performance.now();
      function tick(now) {
        const elapsed = now - start;
        if (elapsed >= durationPer) {
          el.textContent = finalText;
          return;
        }
        let out = '';
        const progress = elapsed / durationPer;
        for (let i = 0; i < finalText.length; i += 1) {
          if (i / finalText.length < progress) {
            out += finalText[i];
          } else {
            out += FLAP_CHARS[Math.floor(Math.random() * FLAP_CHARS.length)];
          }
        }
        el.textContent = out;
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }, delay);
  });
}

async function loadEpisodeTitles(supabase, events) {
  const slugs = [...new Set(
    events.map((e) => (e.related_episode_slug || '').trim()).filter(Boolean)
  )];
  if (!slugs.length) {
    episodeTitleBySlug = new Map();
    return;
  }
  const { data } = await supabase
    .from('episodes')
    .select('slug, title')
    .in('slug', slugs);
  episodeTitleBySlug = new Map((data || []).map((r) => [r.slug, r.title]));
}

function initBackgroundVideo() {
  const video = document.querySelector('.saijiki-proto-bg-video');
  if (!video || prefersReducedMotion) {
    document.body.classList.add('saijiki-proto--no-video');
    return;
  }

  const start = () => {
    video.preload = 'auto';
    video.load();
    video.play().catch(() => {
      document.body.classList.add('saijiki-proto--no-video');
    });
  };

  if ('requestIdleCallback' in window) {
    requestIdleCallback(start, { timeout: 2500 });
  } else {
    window.setTimeout(start, 500);
  }
}

if (!root) {
  /* noop */
} else if (!urlOk || !keyOk) {
  root.innerHTML = '<p class="saijiki-error">Supabase の接続設定がありません。</p>';
} else {
  initModal();
  initBackgroundVideo();
  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from('hime_events')
      .select('*')
      .eq('status', 'published')
      .order('event_date', { ascending: EVENT_SORT_ASC });

    if (error) {
      root.innerHTML = `<p class="saijiki-error">読み込めませんでした。（${esc(error.message)}）</p>`;
    } else {
      allEvents = data || [];
      await loadEpisodeTitles(supabase, allEvents);
      renderGrids(allEvents);
    }
  } catch (err) {
    root.innerHTML = '<p class="saijiki-error">読み込めませんでした。</p>';
    console.error(err);
  }
}
