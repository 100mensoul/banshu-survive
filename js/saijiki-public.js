/**
 * 歳時記（hime_events）公開ページ — 水の流れ・一本横スクロール
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EVENT_SORT_ASC = true;
const GRID_START_HOUR = 9;
const GRID_END_HOUR = 22;
const MIN_BLOCK_HEIGHT_PX = 22;
const LOOKBACK_DAYS = 60;
const PERIOD_LANE_H_PX = 118;
const ALMANAC_LANE_H_PX = 28;

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

const EVENT_COLOR_PALETTE = [
  '#5a8f9e',
  '#7ec8e3',
  '#6b9e78',
  '#a8c686',
  '#c4a574',
  '#d9896c',
  '#9b7e6b',
  '#7a6b8a',
  '#c97b9b',
  '#4a6fa5',
];

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
let allPeriodNotes = [];
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

function buildDateRange(events, periodNotes = []) {
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

  periodNotes.forEach((note) => {
    [note.period_start, note.period_end].filter(Boolean).forEach((dateStr) => {
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

function formatPeriodRangeLabel(startStr, endStr) {
  const s = parseLocalDate(startStr);
  const e = parseLocalDate(endStr || startStr);
  if (!s || !e) return '';
  const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  if (localDateStr(s) === localDateStr(e)) return fmt(s);
  return `${fmt(s)}〜${fmt(e)}`;
}

function layoutPeriodNotes(notes, dates) {
  if (!dates.length || !notes.length) return [];
  const placed = [];
  const sorted = [...notes].sort((a, b) => {
    const as = String(a.period_start || '');
    const bs = String(b.period_start || '');
    if (as !== bs) return as < bs ? -1 : 1;
    const ae = String(a.period_end || a.period_start || '');
    const be = String(b.period_end || b.period_start || '');
    return ae < be ? -1 : ae > be ? 1 : 0;
  });

  sorted.forEach((note) => {
    const startStr = note.period_start;
    const endStr =
      note.period_end && String(note.period_end) >= String(startStr)
        ? String(note.period_end)
        : String(startStr);
    if (!startStr) return;

    let startIdx = dates.findIndex((d) => d >= startStr);
    let endIdx = -1;
    for (let i = dates.length - 1; i >= 0; i -= 1) {
      if (dates[i] <= endStr) {
        endIdx = i;
        break;
      }
    }
    if (startIdx < 0 || endIdx < 0 || endIdx < startIdx) return;

    let lane = 0;
    while (
      placed.some(
        (p) => p.lane === lane && !(endIdx < p.startIdx || startIdx > p.endIdx)
      )
    ) {
      lane += 1;
    }
    placed.push({ note, startIdx, endIdx, lane });
  });
  return placed;
}

function layoutSpanningEvents(events, dates, predicate) {
  const filtered = events.filter(predicate);
  if (!dates.length || !filtered.length) return [];
  const placed = [];
  const sorted = [...filtered].sort((a, b) => {
    const as = String(a.event_date || '');
    const bs = String(b.event_date || '');
    if (as !== bs) return as < bs ? -1 : 1;
    const ae = eventEndDateStr(a);
    const be = eventEndDateStr(b);
    return ae < be ? -1 : ae > be ? 1 : 0;
  });

  sorted.forEach((ev) => {
    const startStr = ev.event_date;
    const endStr = eventEndDateStr(ev);
    if (!startStr) return;

    let startIdx = dates.findIndex((d) => d >= startStr);
    let endIdx = -1;
    for (let i = dates.length - 1; i >= 0; i -= 1) {
      if (dates[i] <= endStr) {
        endIdx = i;
        break;
      }
    }
    if (startIdx < 0 || endIdx < 0 || endIdx < startIdx) return;

    let lane = 0;
    while (
      placed.some(
        (p) => p.lane === lane && !(endIdx < p.startIdx || startIdx > p.endIdx)
      )
    ) {
      lane += 1;
    }
    placed.push({ ev, startIdx, endIdx, lane });
  });
  return placed;
}

function renderAlmanacRow(dates, events, slugColorMap, gridRow, alwaysShow = false) {
  const placed = layoutSpanningEvents(events, dates, isAlmanac);
  if (!placed.length && !alwaysShow) return '';

  const maxLane = placed.reduce((m, p) => Math.max(m, p.lane), -1);
  const laneCount = Math.max(1, maxLane + 1);
  const bandH = laneCount * ALMANAC_LANE_H_PX;
  let html =
    `<div class="saijiki-almanac-gutter" style="grid-row:${gridRow};height:${bandH}px">暦</div>` +
    `<div class="saijiki-almanac-bg" style="grid-row:${gridRow};grid-column:2 / -1;height:${bandH}px" data-almanac-empty="1"></div>`;

  if (!placed.length && alwaysShow) {
    html +=
      `<button type="button" class="saijiki-almanac-empty"` +
      ` style="grid-row:${gridRow};grid-column:2 / -1;height:${bandH}px" data-almanac-empty="1">` +
      `暦イベントを追加（夏至・祭日など）` +
      `</button>`;
    return html;
  }

  placed.forEach(({ ev, startIdx, endIdx, lane }) => {
    const top = lane * ALMANAC_LANE_H_PX + 2;
    const height = ALMANAC_LANE_H_PX - 4;
    html +=
      `<div class="saijiki-almanac-slot"` +
      ` style="grid-column:${startIdx + 2} / ${endIdx + 3};grid-row:${gridRow};` +
      `margin-top:${top}px;height:${height}px;min-height:${height}px">` +
      blockHtml(ev, slugColorMap, {
        almanac: true,
        style: 'position:absolute;inset:0;width:auto;height:auto;margin:0',
      }) +
      `</div>`;
  });

  return html;
}

function renderMultiDayVerticalSlots(dates, events, slugColorMap, mainRow, bodyH) {
  let html = '';

  layoutSpanningEvents(
    events,
    dates,
    (e) => !isAlmanac(e) && isAllDay(e) && isMultiDay(e)
  ).forEach(({ ev, startIdx, endIdx }) => {
    html +=
      `<div class="saijiki-md-slot saijiki-md-slot--allday"` +
      ` style="grid-column:${startIdx + 2} / ${endIdx + 3};grid-row:${mainRow};height:${bodyH}px">` +
      blockHtml(ev, slugColorMap, {
        multiday: true,
        allday: true,
        slotHeightPx: bodyH,
        style: 'position:absolute;inset:0;width:auto;height:auto;margin:0',
      }) +
      `</div>`;
  });

  layoutSpanningEvents(
    events,
    dates,
    (e) => !isAlmanac(e) && !isAllDay(e) && isMultiDay(e)
  ).forEach(({ ev, startIdx, endIdx }) => {
    const startMin = parseTimeToMinutes(ev.start_time);
    if (startMin == null) return;
    const endMin = parseTimeToMinutes(ev.end_time);
    const top = minutesToTop(startMin);
    const height = minutesToHeight(startMin, endMin);
    html +=
      `<div class="saijiki-md-slot saijiki-md-slot--timed"` +
      ` style="grid-column:${startIdx + 2} / ${endIdx + 3};grid-row:${mainRow};` +
      `margin-top:${top}px;height:${height}px;min-height:${height}px">` +
      blockHtml(ev, slugColorMap, {
        multiday: true,
        allday: false,
        slotHeightPx: height,
        style: 'position:absolute;inset:0;width:auto;height:auto;margin:0',
      }) +
      `</div>`;
  });

  return html;
}

function periodNoteHtml(note, options = {}) {
  const { editable = false, style = '' } = options;
  const draftClass = note.status !== 'published' ? ' saijiki-period-note--draft' : '';
  const range = formatPeriodRangeLabel(note.period_start, note.period_end);
  const body = note.body && String(note.body).trim() ? String(note.body).trim() : '';
  const tag = editable ? 'button' : 'article';
  const typeAttr = editable ? ' type="button"' : '';
  const styleAttr = style ? ` style="${style}"` : '';
  return (
    `<${tag}${typeAttr} class="saijiki-period-note${draftClass}" data-period-id="${esc(note.id)}"` +
    `${styleAttr} aria-label="${esc(note.title || '期間メモ')}">` +
    `<div class="saijiki-period-note-meta">` +
    `<span>期間：${esc(range)}</span>` +
    `<span class="saijiki-period-note-title-label">期間名：${esc(note.title || '')}</span>` +
    `</div>` +
    (body ? `<div class="saijiki-period-note-body">${esc(body)}</div>` : '') +
    `</${tag}>`
  );
}

function renderPeriodNotesRow(dates, periodNotes, options = {}) {
  const { editable = false, alwaysShow = false, gridRow = 3 } = options;
  const placed = layoutPeriodNotes(periodNotes, dates);
  if (!placed.length && !alwaysShow) return '';

  const maxLane = placed.reduce((m, p) => Math.max(m, p.lane), -1);
  const laneCount = Math.max(1, maxLane + 1);
  const bandH = laneCount * PERIOD_LANE_H_PX;
  let html =
    `<div class="saijiki-period-gutter" style="grid-row:${gridRow};height:${bandH}px">期間</div>` +
    `<div class="saijiki-period-bg" style="grid-row:${gridRow};grid-column:2 / -1;height:${bandH}px"></div>`;

  if (!placed.length && alwaysShow) {
    html +=
      `<button type="button" class="saijiki-period-empty"` +
      ` style="grid-row:${gridRow};grid-column:2 / -1;height:${bandH}px" data-period-empty="1">` +
      `期間メモを追加（複数日の概要）` +
      `</button>`;
    return html;
  }

  placed.forEach(({ note, startIdx, endIdx, lane }) => {
    const top = lane * PERIOD_LANE_H_PX + 2;
    const height = PERIOD_LANE_H_PX - 4;
    const colStart = startIdx + 2;
    const colEnd = endIdx + 3;
    html +=
      `<div class="saijiki-period-note-slot"` +
      ` style="grid-column:${colStart} / ${colEnd};grid-row:${gridRow};` +
      `margin-top:${top}px;height:${height}px;min-height:${height}px">` +
      periodNoteHtml(note, {
        editable,
        style: 'position:absolute;inset:0;width:auto;height:auto;margin:0',
      }) +
      `</div>`;
  });

  return html;
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

function isAlmanac(ev) {
  return String(ev.event_kind || 'standard') === 'almanac';
}

function eventEndDateStr(ev) {
  const start = String(ev.event_date || '');
  if (!start) return '';
  return ev.event_date_end && String(ev.event_date_end) >= start
    ? String(ev.event_date_end)
    : start;
}

function isMultiDay(ev) {
  if (!ev.event_date) return false;
  return eventEndDateStr(ev) > String(ev.event_date);
}

/** その日に表示するか（終日の複数日は開始〜終了の各日） */
function eventCoversDate(ev, dateStr) {
  const start = ev.event_date;
  if (!start || !dateStr) return false;
  const end =
    ev.event_date_end && String(ev.event_date_end) >= start
      ? String(ev.event_date_end)
      : start;
  return dateStr >= start && dateStr <= end;
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

function normalizeEventColor(value) {
  if (!value) return null;
  const s = String(value).trim().toLowerCase();
  return EVENT_COLOR_PALETTE.find((c) => c.toLowerCase() === s) || null;
}

function eventAccent(ev, slugColorMap) {
  const custom = normalizeEventColor(ev.color);
  if (custom) return custom;
  return slugColor(slugColorMap, ev.related_episode_slug);
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
  if (allday) return ' saijiki-block--vertical saijiki-block--allday saijiki-block--tall';
  const parts = [' saijiki-block--vertical'];
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
  const {
    allday = false,
    slotHeightPx = 0,
    multiday = false,
    almanac = false,
    style = '',
  } = options || {};
  const accent = eventAccent(ev, slugColorMap);
  const majorClass = ev.weight === 'major' ? ' saijiki-block--major' : '';
  const styleAttr = style
    ? ` style="--block-accent:${esc(accent)};${style}"`
    : ` style="--block-accent:${esc(accent)}"`;

  if (almanac) {
    return (
      `<button type="button" class="saijiki-block saijiki-block--almanac${majorClass}" data-event-id="${esc(ev.id)}"` +
      `${styleAttr} aria-label="${esc(ev.title || '')}">` +
      `<span class="saijiki-block-title" title="${esc(ev.title || '')}">${esc(ev.title || '')}</span>` +
      `</button>`
    );
  }

  if (multiday) {
    const range = formatPeriodRangeLabel(ev.event_date, ev.event_date_end);
    const timeLabel = allday
      ? '終日'
      : `${formatTimeLabel(ev.start_time)}${ev.end_time ? `〜${formatTimeLabel(ev.end_time)}` : ''}`;
    return (
      `<button type="button" class="saijiki-block saijiki-block--multiday saijiki-block--vertical${majorClass}" data-event-id="${esc(ev.id)}"` +
      `${styleAttr} aria-label="${esc(ev.title || '')}">` +
      `<span class="saijiki-block-time">${esc(range)} · ${esc(timeLabel)}</span>` +
      `<span class="saijiki-block-title" title="${esc(ev.title || '')}">${esc(ev.title || '')}</span>` +
      `</button>`
    );
  }

  const sizeClass = blockSizeClass(ev, slotHeightPx, allday);
  const timeHtml = blockTimeHtml(ev, allday, sizeClass);
  return (
    `<button type="button" class="saijiki-block${majorClass}${sizeClass}" data-event-id="${esc(ev.id)}"` +
    `${styleAttr} aria-label="${esc(ev.title || '')}">` +
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

function renderRiverGrid(events, slugColorMap, periodNotes = []) {
  const dates = buildDateRange(events, periodNotes);
  if (!dates.length) return '';

  const todayStr = todayLocalDateStr();
  const eventDates = new Set();
  events.forEach((e) => {
    if (!e.event_date) return;
    const start = parseLocalDate(e.event_date);
    const endStr =
      e.event_date_end && String(e.event_date_end) >= e.event_date
        ? e.event_date_end
        : e.event_date;
    const end = parseLocalDate(endStr);
    if (!start || !end) {
      eventDates.add(e.event_date);
      return;
    }
    const cursor = new Date(start);
    while (cursor <= end) {
      eventDates.add(localDateStr(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  });
  const colCount = dates.length;
  const bodyH = gridBodyHeightPx();
  const hasAlmanacRow = events.some(isAlmanac);
  const mainRow = hasAlmanacRow ? 3 : 2;
  const periodRow = hasAlmanacRow ? 4 : 3;
  const splitFlags = dates.map((d) => {
    const a = events.some(
      (e) =>
        !isAlmanac(e) &&
        isAllDay(e) &&
        !isMultiDay(e) &&
        eventCoversDate(e, d)
    );
    const t = events.some(
      (e) => !isAlmanac(e) && !isAllDay(e) && !isMultiDay(e) && e.event_date === d
    );
    return a && t;
  });
  const colWidths = dates
    .map((_, i) => (splitFlags[i] ? 'var(--saijiki-col-w-split)' : 'var(--saijiki-col-w)'))
    .join(' ');
  let gridHtml =
    `<div class="saijiki-grid" style="--saijiki-cols:${colCount};` +
    `grid-template-columns:var(--saijiki-gutter-w) ${colWidths}">`;

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

  if (hasAlmanacRow) {
    gridHtml += renderAlmanacRow(dates, events, slugColorMap, 2);
  }

  gridHtml += `<div class="saijiki-time-gutter" style="grid-row:${mainRow};grid-column:1;height:${bodyH}px">`;
  gridHtml += '<div class="saijiki-flow-line" aria-hidden="true"></div>';
  for (let h = GRID_START_HOUR; h < GRID_END_HOUR; h += 1) {
    const top = (h - GRID_START_HOUR) * hourHeightPx();
    gridHtml += `<div class="saijiki-hour-label" style="top:${top}px">${h}:00</div>`;
  }
  gridHtml += '</div>';

  dates.forEach((d, i) => {
    const alldayEvents = events.filter(
      (e) =>
        !isAlmanac(e) &&
        isAllDay(e) &&
        !isMultiDay(e) &&
        eventCoversDate(e, d)
    );
    const timedEvents = events.filter(
      (e) => !isAlmanac(e) && !isAllDay(e) && !isMultiDay(e) && e.event_date === d
    );
    const hasAllDay = alldayEvents.length > 0;
    const hasTimed = timedEvents.length > 0;
    const split = splitFlags[i];
    const dayClasses = [
      'saijiki-day-col',
      d === todayStr ? 'saijiki-day-col--today' : '',
      !eventDates.has(d) ? 'saijiki-day-col--empty' : '',
      hasAllDay ? 'saijiki-day-col--has-allday' : '',
      split ? 'saijiki-day-col--split' : '',
      hasAllDay && !hasTimed ? 'saijiki-day-col--allday-only' : '',
    ]
      .filter(Boolean)
      .join(' ');

    gridHtml += `<div class="${dayClasses}" style="grid-row:${mainRow};grid-column:${i + 2};height:${bodyH}px">`;

    if (hasAllDay) {
      gridHtml += `<div class="saijiki-day-allday-lane" style="--allday-count:${alldayEvents.length}">`;
      alldayEvents.forEach((ev) => {
        gridHtml +=
          `<div class="saijiki-block-slot saijiki-block-slot--allday"` +
          ` style="position:relative;flex:1;min-width:0;height:100%">` +
          blockHtml(ev, slugColorMap, { allday: true, slotHeightPx: bodyH }) +
          '</div>';
      });
      gridHtml += '</div>';
    }

    if (hasTimed || !hasAllDay) {
      gridHtml += '<div class="saijiki-day-timed-lane">';
      timedEvents.forEach((ev) => {
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
    }

    gridHtml += '</div>';
  });

  gridHtml += renderMultiDayVerticalSlots(dates, events, slugColorMap, mainRow, bodyH);

  gridHtml += renderPeriodNotesRow(dates, periodNotes, {
    editable: false,
    alwaysShow: false,
    gridRow: periodRow,
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

function renderGrids(events, periodNotes = allPeriodNotes) {
  applyViewportGridMetrics();

  navEvents = sortEvents(events);
  const sorted = navEvents;

  const slugColorMap = buildSlugColorMap(sorted);
  const gridHtml = renderRiverGrid(sorted, slugColorMap, periodNotes);
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
    const [eventsRes, notesRes] = await Promise.all([
      supabase
        .from('hime_events')
        .select('*')
        .eq('status', 'published')
        .order('event_date', { ascending: EVENT_SORT_ASC }),
      supabase
        .from('hime_period_notes')
        .select('*')
        .eq('status', 'published')
        .order('period_start', { ascending: true }),
    ]);

    if (eventsRes.error) {
      root.innerHTML = `<p class="saijiki-error">読み込めませんでした。（${esc(eventsRes.error.message)}）</p>`;
    } else {
      allEvents = eventsRes.data || [];
      if (notesRes.error) {
        console.warn('period notes:', notesRes.error.message);
        allPeriodNotes = [];
      } else {
        allPeriodNotes = notesRes.data || [];
      }
      await loadEpisodeTitles(supabase, allEvents);
      await loadHimelogTitles(supabase, allEvents);
      renderGrids(allEvents, allPeriodNotes);
    }
  } catch (err) {
    root.innerHTML = '<p class="saijiki-error">読み込めませんでした。</p>';
    console.error(err);
  }
}
