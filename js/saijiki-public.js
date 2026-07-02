/**
 * 歳時記（hime_events）公開ページ — 時間割グリッド
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** true=古い順 / false=新しい順 */
const EVENT_SORT_ASC = true;

/** グリッド表示時間帯 */
const GRID_START_HOUR = 9;
const GRID_END_HOUR = 22;
const HOUR_HEIGHT_PX = 48;
const MIN_BLOCK_HEIGHT_PX = 28;

/** slug ごとの自動色（後から調整しやすいよう定数化） */
const SLUG_PALETTE = [
  '#e8f5d6',
  '#fff3c4',
  '#ffe0b2',
  '#f8d7da',
  '#d1ecf1',
  '#e2d5f1',
  '#ffd6e7',
  '#d4edda',
];
const UNCLASSIFIED_COLOR = '#e8e8e8';

const FLAP_CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワ';

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
  if (!slug) return '未分類';
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
  const bg = slugColor(slugColorMap, ev.related_episode_slug);
  const majorClass = ev.weight === 'major' ? ' saijiki-block--major' : '';
  const alldayClass = allday ? ' saijiki-block--allday' : '';
  let timeHtml = '';
  if (!allday && ev.start_time) {
    const te = ev.end_time ? `〜${formatTimeLabel(ev.end_time)}` : '';
    timeHtml = `<span class="saijiki-block-time">${esc(formatTimeLabel(ev.start_time))}${esc(te)}</span>`;
  }
  return (
    `<button type="button" class="saijiki-block${majorClass}${alldayClass}" data-event-id="${esc(ev.id)}"` +
    ` style="background:${esc(bg)}" aria-label="${esc(ev.title || '')}">` +
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

function renderMonthGrid(monthKey, monthEvents, slugColorMap) {
  const dates = [...new Set(monthEvents.map((e) => e.event_date).filter(Boolean))].sort((a, b) =>
    EVENT_SORT_ASC ? a.localeCompare(b) : b.localeCompare(a)
  );
  if (!dates.length) return '';

  const colCount = dates.length;
  const bodyH = gridBodyHeightPx();
  let gridHtml = `<div class="saijiki-grid-scroll"><div class="saijiki-grid" style="--saijiki-cols:${colCount}">`;

  gridHtml += '<div class="saijiki-grid-corner" style="grid-row:1;grid-column:1"></div>';
  dates.forEach((d, i) => {
    gridHtml += `<div class="saijiki-date-header" style="grid-row:1;grid-column:${i + 2}">${esc(formatDayHeader(d))}</div>`;
  });

  gridHtml += '<div class="saijiki-allday-label" style="grid-row:2;grid-column:1">終日</div>';
  dates.forEach((d, i) => {
    const alldayEvents = monthEvents.filter((e) => e.event_date === d && isAllDay(e));
    let colHtml = '';
    alldayEvents.forEach((ev) => {
      colHtml += blockHtml(ev, slugColorMap, { allday: true });
    });
    gridHtml += `<div class="saijiki-allday-col" style="grid-row:2;grid-column:${i + 2}">${colHtml}</div>`;
  });

  gridHtml += `<div class="saijiki-time-gutter" style="grid-row:3;grid-column:1;height:${bodyH}px">`;
  for (let h = GRID_START_HOUR; h < GRID_END_HOUR; h += 1) {
    const top = (h - GRID_START_HOUR) * HOUR_HEIGHT_PX;
    gridHtml += `<div class="saijiki-hour-label" style="top:${top}px">${h}:00</div>`;
  }
  gridHtml += '</div>';

  dates.forEach((d, i) => {
    gridHtml += `<div class="saijiki-day-col" style="grid-row:3;grid-column:${i + 2};height:${bodyH}px">`;
    monthEvents
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

  gridHtml += '</div></div>';
  return (
    `<section class="saijiki-month-section">` +
    `<h2 class="saijiki-month">${esc(monthKey)}</h2>` +
    renderLegend(slugColorMap) +
    gridHtml +
    `</section>`
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
  const byMonth = new Map();
  sorted.forEach((ev) => {
    const key = formatMonthKey(ev.event_date) || '日付不明';
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(ev);
  });

  const monthKeys = [...byMonth.keys()].sort((a, b) => {
    const sampleA = byMonth.get(a)[0]?.event_date || '';
    const sampleB = byMonth.get(b)[0]?.event_date || '';
    return EVENT_SORT_ASC ? sampleA.localeCompare(sampleB) : sampleB.localeCompare(sampleA);
  });

  let html = '';
  monthKeys.forEach((monthKey) => {
    html += renderMonthGrid(monthKey, byMonth.get(monthKey), slugColorMap);
  });
  root.innerHTML = html;

  root.querySelectorAll('.saijiki-block').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.eventId;
      const ev = allEvents.find((e) => e.id === id);
      if (ev) showDetail(ev, btn);
    });
  });

  runSplitFlapOnce();
}

function runSplitFlapOnce() {
  if (flapAnimationStarted || prefersReducedMotion) return;
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

if (!root) {
  /* noop */
} else if (!urlOk || !keyOk) {
  root.innerHTML = '<p class="saijiki-error">Supabase の接続設定がありません。</p>';
} else {
  initModal();
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
