/**
 * 歳時記（hime_events）公開ページ — 水の流れ・一本横スクロール
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EVENT_SORT_ASC = true;
const GRID_START_HOUR = 9;
const GRID_END_HOUR = 22;
const MIN_BLOCK_HEIGHT_PX = 22;
const LOOKBACK_DAYS = 60;

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
let navEvents = [];
let episodeTitleBySlug = new Map();
let himelogTitleById = new Map();
let selectedEventId = null;
let lastFocusedBlock = null;

const modalEl = document.getElementById('saijiki-modal');
const modalBox = document.getElementById('saijiki-modal-box');
const modalBody = document.getElementById('saijiki-modal-body');
const modalBackdrop = document.getElementById('saijiki-modal-backdrop');
const modalCloseBtn = document.getElementById('saijiki-modal-close');
const modalPrevBtn = document.getElementById('saijiki-modal-prev');
const modalNextBtn = document.getElementById('saijiki-modal-next');

function sortEvents(events) {
  return [...events].sort((a, b) => {
    const da = a.event_date || '';
    const db = b.event_date || '';
    if (da !== db) return EVENT_SORT_ASC ? da.localeCompare(db) : db.localeCompare(da);
    const ta = parseTimeToMinutes(a.start_time) ?? -1;
    const tb = parseTimeToMinutes(b.start_time) ?? -1;
    if (ta !== tb) return ta - tb;
    return String(a.title || '').localeCompare(String(b.title || ''), 'ja');
  });
}

function setEventUrl(eventId) {
  const nextUrl = new URL(window.location.href);
  if (eventId) {
    nextUrl.searchParams.set('event', eventId);
  } else {
    nextUrl.searchParams.delete('event');
  }
  history.replaceState(null, '', nextUrl);
}

function focusEventInGrid(eventId) {
  const btn = root?.querySelector(`.saijiki-block[data-event-id="${eventId}"]`);
  if (btn) {
    btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
  root?.querySelectorAll('.saijiki-block').forEach((el) => {
    el.classList.toggle('is-selected', el.dataset.eventId === eventId);
  });
}

function updateModalNav() {
  if (!modalPrevBtn || !modalNextBtn) return;
  const idx = navEvents.findIndex((e) => e.id === selectedEventId);
  modalPrevBtn.disabled = idx <= 0;
  modalNextBtn.disabled = idx < 0 || idx >= navEvents.length - 1;
}

function navigateEvent(delta) {
  if (!selectedEventId || !navEvents.length) return;
  const idx = navEvents.findIndex((e) => e.id === selectedEventId);
  if (idx < 0) return;
  const nextIdx = idx + delta;
  if (nextIdx < 0 || nextIdx >= navEvents.length) return;
  showDetail(navEvents[nextIdx], null, { fromNav: true });
}

function initModal() {
  if (!modalEl) return;
  modalBackdrop?.addEventListener('click', closeDetail);
  modalCloseBtn?.addEventListener('click', closeDetail);
  modalPrevBtn?.addEventListener('click', () => navigateEvent(-1));
  modalNextBtn?.addEventListener('click', () => navigateEvent(1));
  document.addEventListener('keydown', (e) => {
    if (!modalEl || modalEl.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDetail();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      navigateEvent(-1);
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      navigateEvent(1);
    }
  });
}

function closeDetail() {
  if (!modalEl || modalEl.hidden) return;
  modalEl.hidden = true;
  document.body.style.overflow = '';
  selectedEventId = null;
  setEventUrl(null);
  root?.querySelectorAll('.saijiki-block').forEach((el) => el.classList.remove('is-selected'));
  if (lastFocusedBlock && typeof lastFocusedBlock.focus === 'function') {
    lastFocusedBlock.focus();
  }
  lastFocusedBlock = null;
}

function renderDetailBody(ev) {
  return (
    `<h3 class="saijiki-detail-title" id="saijiki-modal-title">${esc(ev.title || '')}</h3>` +
    `<p class="saijiki-detail-meta">${esc(detailMeta(ev))}</p>` +
    (ev.note && String(ev.note).trim()
      ? `<p class="saijiki-detail-note">${esc(ev.note)}</p>`
      : '') +
    linkChipsHtml(ev)
  );
}

function showDetail(ev, triggerBtn, options = {}) {
  const { fromNav = false } = options;
  if (!modalEl || !modalBody) return;
  selectedEventId = ev.id;
  if (!fromNav && triggerBtn) {
    lastFocusedBlock = triggerBtn;
  }
  modalBody.innerHTML = renderDetailBody(ev);
  modalEl.hidden = false;
  document.body.style.overflow = 'hidden';
  updateModalNav();
  focusEventInGrid(ev.id);
  setEventUrl(ev.id);
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

function localDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayLocalDateStr() {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return localDateStr(today);
}

function parseLocalDate(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function computeHourHeightPx() {
  const hours = GRID_END_HOUR - GRID_START_HOUR;
  const reserved = 120;
  const fromViewport = Math.floor((window.innerHeight - reserved) / hours);
  return Math.max(22, Math.min(30, fromViewport));
}

function hourHeightPx() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--saijiki-hour-h').trim();
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : computeHourHeightPx();
}

function applyViewportGridMetrics() {
  const hourH = computeHourHeightPx();
  document.documentElement.style.setProperty('--saijiki-hour-h', `${hourH}px`);
}

function gridBodyHeightPx() {
  return (GRID_END_HOUR - GRID_START_HOUR) * hourHeightPx();
}

function minutesToTop(minutes) {
  const start = GRID_START_HOUR * 60;
  const end = GRID_END_HOUR * 60;
  const clamped = Math.max(start, Math.min(end, minutes));
  return ((clamped - start) / 60) * hourHeightPx();
}

function minutesToHeight(startMin, endMin) {
  if (endMin == null) return MIN_BLOCK_HEIGHT_PX;
  const gridStart = GRID_START_HOUR * 60;
  const gridEnd = GRID_END_HOUR * 60;
  const s = Math.max(gridStart, startMin);
  const e = Math.min(gridEnd, endMin);
  const h = ((e - s) / 60) * hourHeightPx();
  return Math.max(MIN_BLOCK_HEIGHT_PX, h);
}

function buildDateRange(events) {
  const today = parseLocalDate(todayLocalDateStr());
  if (!today) return [];

  const start = new Date(today);
  start.setDate(start.getDate() - LOOKBACK_DAYS);

  events.forEach((ev) => {
    [ev.event_date, ev.event_date_end].filter(Boolean).forEach((dateStr) => {
      const d = parseLocalDate(dateStr);
      if (d && d < start) start.setTime(d.getTime());
    });
  });

  const dates = [];
  const cursor = new Date(start);
  while (cursor <= today) {
    dates.push(localDateStr(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function scrollToToday() {
  const scrollEl = root?.querySelector('.saijiki-river-scroll');
  const todayHeader = root?.querySelector('.saijiki-date-header--today');
  if (!scrollEl || !todayHeader) return;

  const scrollRect = scrollEl.getBoundingClientRect();
  const todayRect = todayHeader.getBoundingClientRect();
  scrollEl.scrollLeft += todayRect.right - scrollRect.right;
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

function episodeLinkLabel(slug) {
  const title = episodeTitleBySlug.get(slug);
  return title || slug;
}

function himelogLinkLabel(entryId) {
  const title = himelogTitleById.get(entryId);
  return title && String(title).trim() ? title : '（無題のメモ）';
}

function digestLinkLabel(slug) {
  return slug ? `ダイジェスト（${slug}）` : 'ダイジェスト';
}

function linkChipsHtml(ev) {
  const chips = [];
  if (ev.related_episode_slug) {
    chips.push(
      `<a class="saijiki-chip" href="episode.html?slug=${encodeURIComponent(ev.related_episode_slug)}">${esc(episodeLinkLabel(ev.related_episode_slug))}</a>`
    );
  }
  if (ev.digest_slug) {
    chips.push(
      `<a class="saijiki-chip" href="digest.html?slug=${encodeURIComponent(ev.digest_slug)}">${esc(digestLinkLabel(ev.digest_slug))}</a>`
    );
  }
  const himelogIds = Array.isArray(ev.himelog_entry_ids)
    ? ev.himelog_entry_ids.filter(Boolean)
    : [];
  himelogIds.forEach((id) => {
    chips.push(
      `<a class="saijiki-chip" href="${esc(himelogEntryLink(id))}">${esc(himelogLinkLabel(id))}</a>`
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
  return parts.join(' · ');
}

function eventDurationMinutes(ev) {
  if (isAllDay(ev)) return (GRID_END_HOUR - GRID_START_HOUR) * 60;
  const startMin = parseTimeToMinutes(ev.start_time);
  if (startMin == null) return 60;
  const endMin = parseTimeToMinutes(ev.end_time);
  if (endMin == null) return 60;
  return Math.max(15, endMin - startMin);
}

const SHORT_EVENT_MAX_MINUTES = 150;

function blockSizeClass(ev, slotHeightPx, allday) {
  const parts = [' saijiki-block--vertical'];
  if (allday) {
    parts.push(' saijiki-block--allday');
    return parts.join('');
  }
  const durationMin = eventDurationMinutes(ev);
  const hourH = hourHeightPx();
  const isShort = durationMin <= SHORT_EVENT_MAX_MINUTES || slotHeightPx <= hourH * 3;
  parts.push(isShort ? ' saijiki-block--short' : ' saijiki-block--tall');
  return parts.join('');
}

function blockTimeHtml(ev, allday, sizeClass) {
  if (allday) return '<span class="saijiki-block-time">終日</span>';
  if (!ev.start_time) return '';
  if (sizeClass.includes('saijiki-block--short')) return '';

  const te = ev.end_time ? `〜${formatTimeLabel(ev.end_time)}` : '';
  return `<span class="saijiki-block-time">${esc(formatTimeLabel(ev.start_time))}${esc(te)}</span>`;
}

function blockHtml(ev, slugColorMap, options) {
  const { allday = false, slotHeightPx = 0 } = options || {};
  const accent = slugColor(slugColorMap, ev.related_episode_slug);
  const majorClass = ev.weight === 'major' ? ' saijiki-block--major' : '';
  const sizeClass = blockSizeClass(ev, slotHeightPx, allday);
  const timeHtml = blockTimeHtml(ev, allday, sizeClass);
  return (
    `<button type="button" class="saijiki-block${majorClass}${sizeClass}" data-event-id="${esc(ev.id)}"` +
    ` style="--block-accent:${esc(accent)}" aria-label="${esc(ev.title || '')}">` +
    timeHtml +
    `<span class="saijiki-block-title" title="${esc(ev.title || '')}" data-flap="${esc(ev.title || '')}">${esc(ev.title || '')}</span>` +
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
  const dates = buildDateRange(events);
  if (!dates.length) return '';

  const todayStr = todayLocalDateStr();
  const eventDates = new Set(events.map((e) => e.event_date).filter(Boolean));
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
    const todayClass = d === todayStr ? ' saijiki-date-header--today' : '';
    const emptyClass = !eventDates.has(d) ? ' saijiki-date-header--empty' : '';
    gridHtml +=
      `<div class="saijiki-date-header${monthStartClass}${todayClass}${emptyClass}" style="grid-row:1;grid-column:${i + 2}">` +
      dateHeaderHtml(d, prev) +
      `</div>`;
  });

  gridHtml += `<div class="saijiki-time-gutter" style="grid-row:2;grid-column:1;height:${bodyH}px">`;
  gridHtml += '<div class="saijiki-flow-line" aria-hidden="true"></div>';
  for (let h = GRID_START_HOUR; h < GRID_END_HOUR; h += 1) {
    const top = (h - GRID_START_HOUR) * hourHeightPx();
    gridHtml += `<div class="saijiki-hour-label" style="top:${top}px">${h}:00</div>`;
  }
  gridHtml += '</div>';

  dates.forEach((d, i) => {
    const dayClasses = [
      'saijiki-day-col',
      d === todayStr ? 'saijiki-day-col--today' : '',
      !eventDates.has(d) ? 'saijiki-day-col--empty' : '',
    ]
      .filter(Boolean)
      .join(' ');
    gridHtml += `<div class="${dayClasses}" style="grid-row:2;grid-column:${i + 2};height:${bodyH}px">`;
    const alldayEvents = events.filter((e) => e.event_date === d && isAllDay(e));
    const alldayCount = alldayEvents.length;
    alldayEvents.forEach((ev, alldayIdx) => {
      const segH = alldayCount > 0 ? bodyH / alldayCount : bodyH;
      const top = alldayIdx * segH;
      gridHtml +=
        `<div class="saijiki-block-slot saijiki-block-slot--allday" style="position:absolute;top:${top}px;left:0;right:0;height:${segH}px">` +
        blockHtml(ev, slugColorMap, { allday: true, slotHeightPx: segH }) +
        '</div>';
    });
    events
      .filter((e) => e.event_date === d && !isAllDay(e))
      .forEach((ev) => {
        const startMin = parseTimeToMinutes(ev.start_time);
        if (startMin == null) return;
        const endMin = parseTimeToMinutes(ev.end_time);
        const top = minutesToTop(startMin);
        const height = minutesToHeight(startMin, endMin);
        gridHtml +=
          `<div class="saijiki-block-slot" style="position:absolute;top:${top}px;left:0;right:0;height:${height}px">` +
          blockHtml(ev, slugColorMap, { allday: false, slotHeightPx: height }) +
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
  applyViewportGridMetrics();

  navEvents = sortEvents(events);
  const sorted = navEvents;

  const slugColorMap = buildSlugColorMap(sorted);
  const gridHtml = renderRiverGrid(sorted, slugColorMap);
  if (!gridHtml) {
    root.innerHTML = '<p class="saijiki-empty">カレンダーを表示できませんでした。</p>';
    return;
  }
  root.innerHTML = gridHtml;

  root.querySelectorAll('.saijiki-block').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.eventId;
      const ev = allEvents.find((e) => e.id === id);
      if (ev) showDetail(ev, btn);
    });
  });

  runSplitFlapOnce();

  const hasEventDeepLink = Boolean(getEventIdFromUrl());
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!hasEventDeepLink) scrollToToday();
      openEventFromUrl();
    });
  });
}

let resizeTimer = null;
window.addEventListener('resize', () => {
  if (!root?.querySelector('.saijiki-grid')) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const scrollEl = root.querySelector('.saijiki-river-scroll');
    const prevScroll = scrollEl?.scrollLeft ?? 0;
    renderGrids(allEvents);
    const nextScroll = root.querySelector('.saijiki-river-scroll');
    if (nextScroll) nextScroll.scrollLeft = prevScroll;
    if (selectedEventId && modalEl && !modalEl.hidden) {
      focusEventInGrid(selectedEventId);
      updateModalNav();
    }
  }, 150);
});

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

async function loadHimelogTitles(supabase, events) {
  const ids = [
    ...new Set(
      events.flatMap((e) =>
        Array.isArray(e.himelog_entry_ids) ? e.himelog_entry_ids.filter(Boolean) : []
      )
    ),
  ];
  if (!ids.length) {
    himelogTitleById = new Map();
    return;
  }
  const { data } = await supabase.from('himelog_entries').select('id, title').in('id', ids);
  himelogTitleById = new Map(
    (data || []).map((r) => [r.id, r.title && String(r.title).trim() ? r.title : ''])
  );
}

function getEventIdFromUrl() {
  return (new URLSearchParams(window.location.search).get('event') || '').trim();
}

function openEventFromUrl() {
  const eventId = getEventIdFromUrl();
  if (!eventId) return;

  const ev = allEvents.find((e) => e.id === eventId);
  if (!ev) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const btn = root.querySelector(`.saijiki-block[data-event-id="${eventId}"]`);
      if (btn) {
        btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        showDetail(ev, btn);
      } else {
        showDetail(ev, null);
      }
    });
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
      await loadHimelogTitles(supabase, allEvents);
      renderGrids(allEvents);
    }
  } catch (err) {
    root.innerHTML = '<p class="saijiki-error">読み込めませんでした。</p>';
    console.error(err);
  }
}
