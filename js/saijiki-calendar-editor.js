/**
 * 歳時記カレンダー編集（管理画面）
 * 空きマスをクリックして追加／既存をクリックして編集
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EVENT_SORT_ASC = true;
const GRID_START_HOUR = 9;
const GRID_END_HOUR = 22;
const MIN_BLOCK_HEIGHT_PX = 22;
const LOOKBACK_DAYS = 60;
const LOOKAHEAD_DAYS = 30;
const SHORT_EVENT_MAX_MINUTES = 150;
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

/** イベント色分け用パレット（落ち着いた水・土・木の色） */
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

const url = window.__SB_URL;
const key = window.__SB_ANON_KEY;
const keyOk = key && String(key).trim().length > 0;
const urlOk =
  url &&
  String(url).trim().length > 0 &&
  !String(url).includes('あなたのプロジェクトID');
const configOk = urlOk && keyOk;

const root = document.getElementById('saijiki-cal-root');
const authPanel = document.getElementById('auth-panel');
const app = document.getElementById('app');
const msgEl = document.getElementById('msg');
const configMissing = document.getElementById('config-missing');
const editorHint = document.getElementById('editor-hint');
const btnSignout = document.getElementById('btn-signout');

const modalEl = document.getElementById('saijiki-cal-modal');
const modalBox = document.getElementById('saijiki-cal-modal-box');
const modalBackdrop = document.getElementById('saijiki-cal-modal-backdrop');
const modalCloseBtn = document.getElementById('saijiki-cal-modal-close');
const modalHeading = document.getElementById('saijiki-cal-modal-heading');
const form = document.getElementById('saijiki-cal-form');
const btnDelete = document.getElementById('btn-delete');
const btnCancel = document.getElementById('btn-cancel');
const allDayCheck = document.getElementById('all_day');
const almanacCheck = document.getElementById('event_almanac');
const timeRow = document.getElementById('time-row');
const btnPeriodAdd = document.getElementById('btn-period-add');
const btnAlmanacAdd = document.getElementById('btn-almanac-add');

const periodModalEl = document.getElementById('saijiki-period-modal');
const periodModalBox = document.getElementById('saijiki-period-modal-box');
const periodModalBackdrop = document.getElementById('saijiki-period-modal-backdrop');
const periodModalCloseBtn = document.getElementById('saijiki-period-modal-close');
const periodModalHeading = document.getElementById('saijiki-period-modal-heading');
const periodForm = document.getElementById('saijiki-period-form');
const btnPeriodDelete = document.getElementById('btn-period-delete');
const btnPeriodCancel = document.getElementById('btn-period-cancel');

let supabase = null;
let allEvents = [];
let allPeriodNotes = [];
let episodeTitleBySlug = new Map();
let himelogCandidates = [];
let selectedHimelogIds = [];
let selectedEventId = null;
let lastScrollLeft = 0;

const himelogSelectedEl = document.getElementById('himelog-selected');
const himelogCandidatesEl = document.getElementById('himelog-candidates');

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** ドラッグ作成用 */
let dragState = null;

if (configMissing) configMissing.hidden = configOk;

function showMsg(text, ok) {
  if (!msgEl) return;
  msgEl.textContent = text;
  msgEl.className = 'saijiki-cal-msg ' + (ok ? 'ok' : 'err');
  msgEl.hidden = false;
  clearTimeout(showMsg._t);
  showMsg._t = setTimeout(() => {
    msgEl.hidden = true;
  }, 5000);
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

function minutesToTimeStr(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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
  const reserved = 140;
  const fromViewport = Math.floor((window.innerHeight - reserved) / hours);
  return Math.max(22, Math.min(30, fromViewport));
}

function hourHeightPx() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--saijiki-hour-h').trim();
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : computeHourHeightPx();
}

function applyViewportGridMetrics() {
  document.documentElement.style.setProperty('--saijiki-hour-h', `${computeHourHeightPx()}px`);
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

  const end = new Date(today);
  end.setDate(end.getDate() + LOOKAHEAD_DAYS);

  events.forEach((ev) => {
    [ev.event_date, ev.event_date_end].filter(Boolean).forEach((dateStr) => {
      const d = parseLocalDate(dateStr);
      if (!d) return;
      if (d < start) start.setTime(d.getTime());
      if (d > end) end.setTime(d.getTime());
    });
  });

  periodNotes.forEach((note) => {
    [note.period_start, note.period_end].filter(Boolean).forEach((dateStr) => {
      const d = parseLocalDate(dateStr);
      if (!d) return;
      if (d < start) start.setTime(d.getTime());
      if (d > end) end.setTime(d.getTime());
    });
  });

  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end) {
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
  const { style = '' } = options;
  const draftClass = note.status !== 'published' ? ' saijiki-period-note--draft' : '';
  const range = formatPeriodRangeLabel(note.period_start, note.period_end);
  const body = note.body && String(note.body).trim() ? String(note.body).trim() : '';
  const styleAttr = style ? ` style="${style}"` : '';
  return (
    `<button type="button" class="saijiki-period-note${draftClass}" data-period-id="${esc(note.id)}"` +
    `${styleAttr} aria-label="${esc(note.title || '期間メモ')}">` +
    `<div class="saijiki-period-note-meta">` +
    `<span>期間：${esc(range)}</span>` +
    `<span class="saijiki-period-note-title-label">期間名：${esc(note.title || '')}</span>` +
    `</div>` +
    (body ? `<div class="saijiki-period-note-body">${esc(body)}</div>` : '') +
    `</button>`
  );
}

function renderPeriodNotesRow(dates, periodNotes, gridRow = 3) {
  const placed = layoutPeriodNotes(periodNotes, dates);
  const maxLane = placed.reduce((m, p) => Math.max(m, p.lane), -1);
  const laneCount = Math.max(1, maxLane + 1);
  const bandH = laneCount * PERIOD_LANE_H_PX;
  let html =
    `<div class="saijiki-period-gutter" style="grid-row:${gridRow};height:${bandH}px">期間</div>` +
    `<div class="saijiki-period-bg" style="grid-row:${gridRow};grid-column:2 / -1;height:${bandH}px"></div>`;

  if (!placed.length) {
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
    html +=
      `<div class="saijiki-period-note-slot"` +
      ` style="grid-column:${startIdx + 2} / ${endIdx + 3};grid-row:${gridRow};` +
      `margin-top:${top}px;height:${height}px;min-height:${height}px">` +
      periodNoteHtml(note, {
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

function getSelectedEventColor() {
  const input = document.getElementById('event_color');
  return normalizeEventColor(input?.value || '');
}

function setSelectedEventColor(value) {
  const input = document.getElementById('event_color');
  const normalized = normalizeEventColor(value);
  if (input) input.value = normalized || '';
  syncColorPaletteUi();
}

function syncColorPaletteUi() {
  const palette = document.getElementById('event-color-palette');
  if (!palette) return;
  const selected = getSelectedEventColor() || '';
  palette.querySelectorAll('.saijiki-cal-color-swatch').forEach((btn) => {
    const v = btn.dataset.color || '';
    btn.classList.toggle('is-selected', v === selected);
    btn.setAttribute('aria-selected', v === selected ? 'true' : 'false');
  });
}

function renderColorPalette() {
  const palette = document.getElementById('event-color-palette');
  if (!palette || palette.dataset.ready === '1') {
    syncColorPaletteUi();
    return;
  }
  palette.innerHTML = '';

  const autoBtn = document.createElement('button');
  autoBtn.type = 'button';
  autoBtn.className = 'saijiki-cal-color-swatch saijiki-cal-color-swatch--auto';
  autoBtn.dataset.color = '';
  autoBtn.title = '自動（関連エピソード）';
  autoBtn.setAttribute('aria-label', '自動色');
  autoBtn.addEventListener('click', () => setSelectedEventColor(null));
  palette.appendChild(autoBtn);

  EVENT_COLOR_PALETTE.forEach((color) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'saijiki-cal-color-swatch';
    btn.dataset.color = color;
    btn.style.setProperty('--swatch', color);
    btn.title = color;
    btn.setAttribute('aria-label', `色 ${color}`);
    btn.addEventListener('click', () => setSelectedEventColor(color));
    palette.appendChild(btn);
  });

  palette.dataset.ready = '1';
  syncColorPaletteUi();
}

function legendLabel(slug) {
  if (!slug) return '独立した出来事';
  const title = episodeTitleBySlug.get(slug);
  return title ? `${title}（${slug}）` : slug;
}

function eventDurationMinutes(ev) {
  if (isAllDay(ev)) return (GRID_END_HOUR - GRID_START_HOUR) * 60;
  const startMin = parseTimeToMinutes(ev.start_time);
  if (startMin == null) return 60;
  const endMin = parseTimeToMinutes(ev.end_time);
  if (endMin == null) return 60;
  return Math.max(15, endMin - startMin);
}

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
  const draftClass = ev.status !== 'published' ? ' saijiki-block--draft' : '';
  const styleAttr = style
    ? ` style="--block-accent:${esc(accent)};${style}"`
    : ` style="--block-accent:${esc(accent)}"`;

  if (almanac) {
    return (
      `<button type="button" class="saijiki-block saijiki-block--almanac${majorClass}${draftClass}" data-event-id="${esc(ev.id)}"` +
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
      `<button type="button" class="saijiki-block saijiki-block--multiday saijiki-block--vertical${majorClass}${draftClass}" data-event-id="${esc(ev.id)}"` +
      `${styleAttr} aria-label="${esc(ev.title || '')}">` +
      `<span class="saijiki-block-time">${esc(range)} · ${esc(timeLabel)}</span>` +
      `<span class="saijiki-block-title" title="${esc(ev.title || '')}">${esc(ev.title || '')}</span>` +
      `</button>`
    );
  }

  const sizeClass = blockSizeClass(ev, slotHeightPx, allday);
  const timeHtml = blockTimeHtml(ev, allday, sizeClass);
  return (
    `<button type="button" class="saijiki-block${majorClass}${sizeClass}${draftClass}" data-event-id="${esc(ev.id)}"` +
    `${styleAttr} aria-label="${esc(ev.title || '')}">` +
    timeHtml +
    `<span class="saijiki-block-title" title="${esc(ev.title || '')}">${esc(ev.title || '')}</span>` +
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
  items.push(
    `<span class="saijiki-legend-item saijiki-legend-item--draft">` +
      `<span class="saijiki-legend-swatch" style="background:#ccc"></span>` +
      `<span>下書き</span></span>`
  );
  return `<div class="saijiki-legend">${items.join('')}</div>`;
}

function dateHeaderHtml(dateStr, prevDateStr) {
  const monthKey = formatMonthKey(dateStr);
  const prevMonthKey = prevDateStr ? formatMonthKey(prevDateStr) : '';
  const isMonthStart = monthKey && monthKey !== prevMonthKey;
  const monthHtml = isMonthStart
    ? `<span class="saijiki-date-month">${esc(monthKey)}</span>`
    : '';
  return `${monthHtml}<span class="saijiki-date-day">${esc(formatDayHeader(dateStr))}</span>`;
}

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
  const hasAlmanacRow = true;
  const mainRow = 3;
  const periodRow = 4;
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
      `<div class="saijiki-date-header${monthStartClass}${todayClass}${emptyClass}"` +
      ` data-date="${esc(d)}" style="grid-row:1;grid-column:${i + 2}">` +
      dateHeaderHtml(d, prev) +
      `</div>`;
  });

  gridHtml += renderAlmanacRow(dates, events, slugColorMap, 2, true);

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

    gridHtml +=
      `<div class="${dayClasses}" data-date="${esc(d)}"` +
      ` style="grid-row:${mainRow};grid-column:${i + 2};height:${bodyH}px">`;

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
      gridHtml += `<div class="saijiki-day-timed-lane" data-date="${esc(d)}">`;
      timedEvents.forEach((ev) => {
        const startMin = parseTimeToMinutes(ev.start_time);
        if (startMin == null) return;
        const endMin = parseTimeToMinutes(ev.end_time);
        const top = minutesToTop(startMin);
        const height = minutesToHeight(startMin, endMin);
        gridHtml +=
          `<div class="saijiki-block-slot"` +
          ` style="position:absolute;top:${top}px;left:0;right:0;height:${height}px">` +
          blockHtml(ev, slugColorMap, { allday: false, slotHeightPx: height }) +
          '</div>';
      });
      gridHtml += '</div>';
    }

    gridHtml += '</div>';
  });

  gridHtml += renderMultiDayVerticalSlots(dates, events, slugColorMap, mainRow, bodyH);

  gridHtml += renderPeriodNotesRow(dates, periodNotes, periodRow);
  gridHtml += '</div>';

  return (
    `<section class="saijiki-river-section">` +
    renderLegend(slugColorMap) +
    `<div class="saijiki-river-scroll" aria-label="時系列カレンダー、クリックで追加・編集">` +
    `<div class="saijiki-river-track">` +
    gridHtml +
    `</div></div></section>`
  );
}

function rememberScroll() {
  const scrollEl = root?.querySelector('.saijiki-river-scroll');
  lastScrollLeft = scrollEl?.scrollLeft ?? 0;
}

function restoreScroll() {
  const scrollEl = root?.querySelector('.saijiki-river-scroll');
  if (scrollEl) scrollEl.scrollLeft = lastScrollLeft;
}

function renderCalendar() {
  if (!root) return;
  rememberScroll();
  applyViewportGridMetrics();
  const sorted = sortEvents(allEvents);
  const slugColorMap = buildSlugColorMap(sorted);
  const html = renderRiverGrid(sorted, slugColorMap, allPeriodNotes);
  if (!html) {
    root.innerHTML = '<p class="saijiki-empty">カレンダーを表示できませんでした。</p>';
    return;
  }
  root.innerHTML = html;
  bindCalendarEvents();
  requestAnimationFrame(() => {
    if (lastScrollLeft > 0) restoreScroll();
    else scrollToToday();
  });
}

function yToHour(dayCol, clientY) {
  const rect = dayCol.getBoundingClientRect();
  const y = clientY - rect.top;
  const hourH = hourHeightPx();
  let hour = GRID_START_HOUR + Math.floor(y / hourH);
  hour = Math.max(GRID_START_HOUR, Math.min(GRID_END_HOUR - 1, hour));
  return hour;
}

function bindCalendarEvents() {
  root.querySelectorAll('.saijiki-block').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.eventId;
      const ev = allEvents.find((x) => x.id === id);
      if (ev) openEditModal(ev);
    });
  });

  root.querySelectorAll('.saijiki-day-timed-lane').forEach((lane) => {
    lane.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.saijiki-block')) return;
      const dayCol = lane.closest('.saijiki-day-col');
      const date = dayCol?.dataset.date || lane.dataset.date;
      if (!date) return;
      e.preventDefault();
      const hour = yToHour(lane, e.clientY);
      startDragCreate(lane, date, hour, e.pointerId);
    });
  });

  root.querySelectorAll('.saijiki-day-col:not(.saijiki-day-col--has-allday)').forEach((col) => {
    col.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.saijiki-block')) return;
      if (e.target.closest('.saijiki-day-timed-lane')) return;
      const date = col.dataset.date;
      if (!date) return;
      e.preventDefault();
      const timedLane = col.querySelector('.saijiki-day-timed-lane') || col;
      const hour = yToHour(timedLane, e.clientY);
      startDragCreate(timedLane, date, hour, e.pointerId);
    });
  });

  root.querySelectorAll('.saijiki-date-header').forEach((header) => {
    header.addEventListener('click', () => {
      const date = header.dataset.date;
      if (!date) return;
      openCreateModal({ event_date: date, start_time: '', end_time: '', allDay: true });
    });
  });

  root.querySelectorAll('.saijiki-day-allday-lane').forEach((lane) => {
    lane.addEventListener('click', (e) => {
      if (e.target.closest('.saijiki-block')) return;
      const date = lane.closest('.saijiki-day-col')?.dataset.date;
      if (!date) return;
      openCreateModal({ event_date: date, start_time: '', end_time: '', allDay: true });
    });
  });

  root.querySelectorAll('.saijiki-period-note').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.periodId;
      const note = allPeriodNotes.find((x) => x.id === id);
      if (note) openPeriodEditModal(note);
    });
  });

  root.querySelectorAll('[data-period-empty]').forEach((btn) => {
    btn.addEventListener('click', () => openPeriodCreateModal());
  });

  root.querySelectorAll('.saijiki-period-bg').forEach((bg) => {
    bg.addEventListener('click', () => openPeriodCreateModal());
  });

  root.querySelectorAll('[data-almanac-empty]').forEach((btn) => {
    btn.addEventListener('click', () => openCreateModal({ almanac: true }));
  });

  root.querySelectorAll('.saijiki-almanac-bg').forEach((bg) => {
    bg.addEventListener('click', () => openCreateModal({ almanac: true }));
  });
}

function clearDragGhost() {
  root?.querySelectorAll('.saijiki-cal-drag-ghost').forEach((el) => el.remove());
}

function updateDragGhost() {
  if (!dragState) return;
  clearDragGhost();
  const hourH = hourHeightPx();
  const from = Math.min(dragState.startHour, dragState.currentHour);
  const to = Math.max(dragState.startHour, dragState.currentHour);
  const top = (from - GRID_START_HOUR) * hourH;
  const height = Math.max(hourH, (to - from + 1) * hourH);
  const ghost = document.createElement('div');
  ghost.className = 'saijiki-cal-drag-ghost';
  ghost.style.top = `${top}px`;
  ghost.style.height = `${height}px`;
  dragState.col.appendChild(ghost);
}

function startDragCreate(col, date, hour, pointerId) {
  dragState = {
    col,
    date,
    startHour: hour,
    currentHour: hour,
    pointerId,
    moved: false,
  };
  updateDragGhost();
  col.setPointerCapture?.(pointerId);

  const onMove = (e) => {
    if (!dragState || e.pointerId !== pointerId) return;
    const nextHour = yToHour(col, e.clientY);
    if (nextHour !== dragState.currentHour) {
      dragState.moved = true;
      dragState.currentHour = nextHour;
      updateDragGhost();
    } else if (Math.abs(e.clientY - (col.getBoundingClientRect().top + (hour - GRID_START_HOUR) * hourHeightPx())) > 6) {
      dragState.moved = true;
    }
  };

  const onUp = (e) => {
    if (!dragState || e.pointerId !== pointerId) return;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    try {
      col.releasePointerCapture?.(pointerId);
    } catch (_) {
      /* noop */
    }

    const from = Math.min(dragState.startHour, dragState.currentHour);
    const to = Math.max(dragState.startHour, dragState.currentHour);
    const start = minutesToTimeStr(from * 60);
    const endHour = Math.min(GRID_END_HOUR, to + 1);
    const end = endHour > from ? minutesToTimeStr(endHour * 60) : '';
    clearDragGhost();
    dragState = null;
    openCreateModal({ event_date: date, start_time: start, end_time: end, allDay: false });
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
}

function syncAllDayUi() {
  const isAlmanac = Boolean(almanacCheck?.checked);
  const isAll = isAlmanac || Boolean(allDayCheck?.checked);
  if (isAlmanac && allDayCheck) allDayCheck.checked = true;
  if (allDayCheck) allDayCheck.disabled = isAlmanac;
  if (timeRow) timeRow.classList.toggle('is-disabled', isAll);
  if (isAll) {
    document.getElementById('start_time').value = '';
    document.getElementById('end_time').value = '';
  }
}

function himelogLabel(entry) {
  if (entry.title && entry.title.trim()) return entry.title.trim();
  if (entry.body && entry.body.trim()) {
    const t = entry.body.trim();
    return t.length > 30 ? t.slice(0, 30) + '…' : t;
  }
  return '（無題）';
}

function himelogDateLabel(entry) {
  const iso = entry.written_at || entry.created_at;
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ja-JP');
}

function renderHimelogSelected() {
  if (!himelogSelectedEl) return;
  himelogSelectedEl.innerHTML = '';
  if (!selectedHimelogIds.length) {
    himelogSelectedEl.innerHTML = '<span class="saijiki-cal-himelog-hint">まだ選択されていません</span>';
    return;
  }
  selectedHimelogIds.forEach((id) => {
    const entry = himelogCandidates.find((e) => e.id === id);
    const label = entry ? himelogLabel(entry) : id.slice(0, 8) + '…';
    const chip = document.createElement('span');
    chip.className = 'saijiki-cal-himelog-chip';
    chip.innerHTML = esc(label) + '<button type="button" aria-label="削除">×</button>';
    chip.querySelector('button').addEventListener('click', () => {
      selectedHimelogIds = selectedHimelogIds.filter((x) => x !== id);
      renderHimelogPicker();
    });
    himelogSelectedEl.appendChild(chip);
  });
}

function renderHimelogCandidates() {
  if (!himelogCandidatesEl) return;
  if (!himelogCandidates.length) {
    himelogCandidatesEl.innerHTML =
      '<p class="saijiki-cal-himelog-hint" style="margin:0.35rem;">ひめろぐがありません</p>';
    return;
  }
  himelogCandidatesEl.innerHTML = '';
  himelogCandidates.forEach((entry) => {
    const row = document.createElement('label');
    row.className = 'saijiki-cal-himelog-candidate';
    const checked = selectedHimelogIds.includes(entry.id);
    const statusText =
      entry.status === 'published' ? '公開' : entry.status === 'private' ? '非公開' : '下書き';
    row.innerHTML =
      `<input type="checkbox" value="${esc(entry.id)}"${checked ? ' checked' : ''}>` +
      `<span><strong>${esc(himelogLabel(entry))}</strong>` +
      `<span class="saijiki-cal-himelog-candidate-meta"> ${esc(statusText)} · ${esc(himelogDateLabel(entry))}</span></span>`;
    row.querySelector('input').addEventListener('change', (ev) => {
      const id = entry.id;
      if (ev.target.checked) {
        if (!selectedHimelogIds.includes(id)) selectedHimelogIds.push(id);
      } else {
        selectedHimelogIds = selectedHimelogIds.filter((x) => x !== id);
      }
      renderHimelogSelected();
    });
    himelogCandidatesEl.appendChild(row);
  });
}

function renderHimelogPicker() {
  renderHimelogSelected();
  renderHimelogCandidates();
}

async function loadHimelogCandidates() {
  if (!himelogCandidatesEl) return;
  const { data, error } = await supabase
    .from('himelog_entries')
    .select('id, title, body, written_at, created_at, status')
    .order('created_at', { ascending: false });
  if (error) {
    himelogCandidatesEl.innerHTML =
      '<p class="saijiki-cal-himelog-hint" style="margin:0.35rem;color:#a44;">ひめろぐ取得エラー: ' +
      esc(error.message) +
      '</p>';
    return;
  }
  himelogCandidates = data || [];
  renderHimelogPicker();
}

function clearForm() {
  document.getElementById('row-id').value = '';
  document.getElementById('title').value = '';
  document.getElementById('event_date').value = '';
  document.getElementById('event_date_end').value = '';
  document.getElementById('start_time').value = '';
  document.getElementById('end_time').value = '';
  document.getElementById('note').value = '';
  document.getElementById('weight').value = 'normal';
  document.getElementById('status').value = 'draft';
  document.getElementById('related_episode_slug').value = '';
  if (allDayCheck) allDayCheck.checked = false;
  if (almanacCheck) almanacCheck.checked = false;
  selectedHimelogIds = [];
  setSelectedEventColor(null);
  renderHimelogPicker();
  syncAllDayUi();
  selectedEventId = null;
  if (btnDelete) btnDelete.hidden = true;
}

function fillForm(row) {
  document.getElementById('row-id').value = row.id || '';
  document.getElementById('title').value = row.title || '';
  document.getElementById('event_date').value = row.event_date || '';
  document.getElementById('event_date_end').value = row.event_date_end || '';
  const start = formatTimeLabel(row.start_time);
  const end = formatTimeLabel(row.end_time);
  document.getElementById('start_time').value = start;
  document.getElementById('end_time').value = end;
  if (allDayCheck) allDayCheck.checked = !start && !isAlmanac(row);
  if (almanacCheck) almanacCheck.checked = isAlmanac(row);
  document.getElementById('note').value = row.note || '';
  document.getElementById('weight').value = row.weight || 'normal';
  document.getElementById('status').value = row.status || 'draft';
  document.getElementById('related_episode_slug').value = row.related_episode_slug || '';
  setSelectedEventColor(row.color || null);
  selectedHimelogIds = Array.isArray(row.himelog_entry_ids) ? [...row.himelog_entry_ids] : [];
  renderHimelogPicker();
  syncAllDayUi();
  selectedEventId = row.id || null;
  if (btnDelete) btnDelete.hidden = !row.id;
}

function openModal() {
  if (!modalEl) return;
  closePeriodModal();
  modalEl.hidden = false;
  document.body.style.overflow = 'hidden';
  modalBox?.focus();
}

function closeModal() {
  if (!modalEl || modalEl.hidden) return;
  modalEl.hidden = true;
  document.body.style.overflow = '';
  clearForm();
  root?.querySelectorAll('.saijiki-block').forEach((el) => el.classList.remove('is-selected'));
}

function openCreateModal(preset) {
  clearForm();
  if (modalHeading) {
    modalHeading.textContent = preset.almanac ? '暦イベントを追加' : '出来事を追加';
  }
  document.getElementById('event_date').value = preset.event_date || todayLocalDateStr();
  if (preset.almanac && almanacCheck) {
    almanacCheck.checked = true;
    syncAllDayUi();
  } else if (preset.allDay) {
    if (allDayCheck) allDayCheck.checked = true;
    syncAllDayUi();
  } else {
    document.getElementById('start_time').value = preset.start_time || '';
    document.getElementById('end_time').value = preset.end_time || '';
  }
  if (preset.event_date_end) {
    document.getElementById('event_date_end').value = preset.event_date_end;
  }
  document.getElementById('status').value = 'draft';
  openModal();
  document.getElementById('title')?.focus();
}

function openEditModal(ev) {
  clearForm();
  if (modalHeading) modalHeading.textContent = '出来事を編集';
  fillForm(ev);
  root?.querySelectorAll('.saijiki-block').forEach((el) => {
    el.classList.toggle('is-selected', el.dataset.eventId === ev.id);
  });
  openModal();
  document.getElementById('title')?.focus();
}

async function loadEpisodeTitles(events) {
  const slugs = [
    ...new Set(events.map((e) => (e.related_episode_slug || '').trim()).filter(Boolean)),
  ];
  if (!slugs.length) {
    episodeTitleBySlug = new Map();
    return;
  }
  const { data } = await supabase.from('episodes').select('slug, title').in('slug', slugs);
  episodeTitleBySlug = new Map((data || []).map((r) => [r.slug, r.title]));
}

async function loadEvents() {
  const [eventsRes, notesRes] = await Promise.all([
    supabase.from('hime_events').select('*').order('event_date', { ascending: true }),
    supabase.from('hime_period_notes').select('*').order('period_start', { ascending: true }),
  ]);

  if (eventsRes.error) {
    root.innerHTML = `<p class="saijiki-error">読み込めませんでした。（${esc(eventsRes.error.message)}）</p>`;
    showMsg('一覧取得エラー: ' + eventsRes.error.message, false);
    return;
  }
  allEvents = eventsRes.data || [];
  if (notesRes.error) {
    console.warn('period notes:', notesRes.error.message);
    allPeriodNotes = [];
    if (String(notesRes.error.message || '').includes('hime_period_notes')) {
      showMsg('期間メモ用テーブル未作成です。SQLを実行してください', false);
    }
  } else {
    allPeriodNotes = notesRes.data || [];
  }
  await loadEpisodeTitles(allEvents);
  renderCalendar();
}

function clearPeriodForm() {
  document.getElementById('period-row-id').value = '';
  document.getElementById('period_title').value = '';
  document.getElementById('period_start').value = '';
  document.getElementById('period_end').value = '';
  document.getElementById('period_body').value = '';
  document.getElementById('period_status').value = 'draft';
  if (btnPeriodDelete) btnPeriodDelete.hidden = true;
}

function fillPeriodForm(row) {
  document.getElementById('period-row-id').value = row.id || '';
  document.getElementById('period_title').value = row.title || '';
  document.getElementById('period_start').value = row.period_start || '';
  document.getElementById('period_end').value = row.period_end || row.period_start || '';
  document.getElementById('period_body').value = row.body || '';
  document.getElementById('period_status').value = row.status || 'draft';
  if (btnPeriodDelete) btnPeriodDelete.hidden = !row.id;
}

function openPeriodModal() {
  if (!periodModalEl) return;
  closeModal();
  periodModalEl.hidden = false;
  document.body.style.overflow = 'hidden';
  periodModalBox?.focus();
}

function closePeriodModal() {
  if (!periodModalEl || periodModalEl.hidden) return;
  periodModalEl.hidden = true;
  document.body.style.overflow = '';
  clearPeriodForm();
}

function openPeriodCreateModal(preset = {}) {
  clearPeriodForm();
  if (periodModalHeading) periodModalHeading.textContent = '期間メモを追加';
  const today = todayLocalDateStr();
  document.getElementById('period_start').value = preset.period_start || today;
  document.getElementById('period_end').value = preset.period_end || today;
  document.getElementById('period_status').value = 'draft';
  openPeriodModal();
  document.getElementById('period_title')?.focus();
}

function openPeriodEditModal(note) {
  clearPeriodForm();
  if (periodModalHeading) periodModalHeading.textContent = '期間メモを編集';
  fillPeriodForm(note);
  openPeriodModal();
  document.getElementById('period_title')?.focus();
}

async function savePeriodNote(e) {
  e.preventDefault();
  const id = document.getElementById('period-row-id').value.trim();
  const title = document.getElementById('period_title').value.trim();
  const periodStart = document.getElementById('period_start').value;
  const periodEnd = document.getElementById('period_end').value;
  if (!title || !periodStart || !periodEnd) {
    showMsg('期間名・開始日・終了日は必須です', false);
    return;
  }
  if (periodEnd < periodStart) {
    showMsg('終了日は開始日以降にしてください', false);
    return;
  }

  const payload = {
    title,
    period_start: periodStart,
    period_end: periodEnd,
    body: document.getElementById('period_body').value.trim() || null,
    status: document.getElementById('period_status').value,
  };

  rememberScroll();
  let result;
  if (id) {
    result = await supabase
      .from('hime_period_notes')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();
  } else {
    result = await supabase.from('hime_period_notes').insert(payload).select('*').single();
  }

  if (result.error) {
    showMsg('保存エラー: ' + result.error.message, false);
    return;
  }

  closePeriodModal();
  await loadEvents();
  restoreScroll();
  showMsg('期間メモを保存しました', true);
}

async function deletePeriodNote() {
  const id = document.getElementById('period-row-id').value.trim();
  if (!id) {
    showMsg('削除できるのは保存済みの行だけです', false);
    return;
  }
  if (!confirm('この期間メモを削除しますか？（元に戻せません）')) return;

  rememberScroll();
  const { error } = await supabase.from('hime_period_notes').delete().eq('id', id);
  if (error) {
    showMsg('削除エラー: ' + error.message, false);
    return;
  }
  closePeriodModal();
  await loadEvents();
  restoreScroll();
  showMsg('期間メモを削除しました', true);
}

async function saveEvent(e) {
  e.preventDefault();
  const id = document.getElementById('row-id').value.trim();
  const eventDate = document.getElementById('event_date').value;
  const title = document.getElementById('title').value.trim();
  if (!eventDate || !title) {
    showMsg('日付と出来事は必須です', false);
    return;
  }

  const eventDateEnd = document.getElementById('event_date_end').value || null;
  if (eventDateEnd && eventDateEnd < eventDate) {
    showMsg('終了日は開始日以降にしてください', false);
    return;
  }

  const isAlmanacEvent = Boolean(almanacCheck?.checked);
  const isAll = isAlmanacEvent || Boolean(allDayCheck?.checked);
  let startTime = isAll ? null : document.getElementById('start_time').value || null;
  let endTime = isAll ? null : document.getElementById('end_time').value || null;

  if (!isAlmanacEvent && endTime && !startTime) {
    if (!confirm('終了時刻だけが入力されています。このまま保存しますか？')) return;
  } else if (startTime && endTime && endTime < startTime) {
    if (!confirm('終了時刻が開始時刻より早いです。このまま保存しますか？')) return;
  }

  const status = document.getElementById('status').value;
  if (status === 'published') {
    const unpublished = selectedHimelogIds.filter((hid) => {
      const entry = himelogCandidates.find((x) => x.id === hid);
      return entry && entry.status !== 'published';
    });
    if (unpublished.length > 0) {
      const ok = confirm(
        '公開イベントに、下書きまたは非公開のひめろぐが ' +
          unpublished.length +
          ' 件含まれています。このまま保存しますか？'
      );
      if (!ok) return;
    }
  }

  const existing = id ? allEvents.find((x) => x.id === id) : null;
  const payload = {
    event_date: eventDate,
    event_date_end: eventDateEnd,
    start_time: startTime,
    end_time: endTime,
    title,
    note: document.getElementById('note').value.trim() || null,
    weight: document.getElementById('weight').value,
    status,
    related_episode_slug: document.getElementById('related_episode_slug').value.trim() || null,
    digest_slug: existing?.digest_slug ?? null,
    himelog_entry_ids: selectedHimelogIds,
    color: getSelectedEventColor(),
    event_kind: isAlmanacEvent ? 'almanac' : 'standard',
  };

  rememberScroll();
  let result;
  if (id) {
    result = await supabase.from('hime_events').update(payload).eq('id', id).select('*').single();
  } else {
    result = await supabase.from('hime_events').insert(payload).select('*').single();
  }

  if (result.error) {
    showMsg('保存エラー: ' + result.error.message, false);
    return;
  }

  closeModal();
  await loadEvents();
  restoreScroll();
  showMsg('保存しました', true);
}

async function deleteEvent() {
  const id = document.getElementById('row-id').value.trim();
  if (!id) {
    showMsg('削除できるのは保存済みの行だけです', false);
    return;
  }
  if (!confirm('この出来事を削除しますか？（元に戻せません）')) return;

  rememberScroll();
  const { error } = await supabase.from('hime_events').delete().eq('id', id);
  if (error) {
    showMsg('削除エラー: ' + error.message, false);
    return;
  }
  closeModal();
  await loadEvents();
  restoreScroll();
  showMsg('削除しました', true);
}

function initModalUi() {
  renderColorPalette();
  modalBackdrop?.addEventListener('click', closeModal);
  modalCloseBtn?.addEventListener('click', closeModal);
  btnCancel?.addEventListener('click', closeModal);
  btnDelete?.addEventListener('click', deleteEvent);
  form?.addEventListener('submit', saveEvent);
  allDayCheck?.addEventListener('change', syncAllDayUi);
  almanacCheck?.addEventListener('change', syncAllDayUi);
  btnAlmanacAdd?.addEventListener('click', () => openCreateModal({ almanac: true }));

  periodModalBackdrop?.addEventListener('click', closePeriodModal);
  periodModalCloseBtn?.addEventListener('click', closePeriodModal);
  btnPeriodCancel?.addEventListener('click', closePeriodModal);
  btnPeriodDelete?.addEventListener('click', deletePeriodNote);
  periodForm?.addEventListener('submit', savePeriodNote);
  btnPeriodAdd?.addEventListener('click', () => openPeriodCreateModal());

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (periodModalEl && !periodModalEl.hidden) {
      e.preventDefault();
      closePeriodModal();
      return;
    }
    if (modalEl && !modalEl.hidden) {
      e.preventDefault();
      closeModal();
    }
  });
}

function setUiSession(session) {
  if (session) {
    authPanel.hidden = true;
    app.hidden = false;
    if (editorHint) editorHint.hidden = false;
    if (btnSignout) btnSignout.hidden = false;
    if (btnPeriodAdd) btnPeriodAdd.hidden = false;
    if (btnAlmanacAdd) btnAlmanacAdd.hidden = false;
    loadHimelogCandidates();
    loadEvents();
  } else {
    authPanel.hidden = false;
    app.hidden = true;
    if (editorHint) editorHint.hidden = true;
    if (btnSignout) btnSignout.hidden = true;
    if (btnPeriodAdd) btnPeriodAdd.hidden = true;
    if (btnAlmanacAdd) btnAlmanacAdd.hidden = true;
    if (root) root.innerHTML = '';
    closeModal();
    closePeriodModal();
  }
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

let resizeTimer = null;
window.addEventListener('resize', () => {
  if (!app || app.hidden || !root?.querySelector('.saijiki-grid')) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    rememberScroll();
    renderCalendar();
    restoreScroll();
  }, 150);
});

if (!configOk) {
  /* config missing banner already shown */
} else {
  supabase = createClient(url, key);
  initModalUi();
  initBackgroundVideo();

  document.getElementById('btn-signin')?.addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      showMsg('ログイン失敗: ' + error.message, false);
      return;
    }
    showMsg('ログインしました', true);
  });

  btnSignout?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    showMsg('ログアウトしました', true);
  });

  supabase.auth.onAuthStateChange((_e, session) => setUiSession(session));
  const {
    data: { session },
  } = await supabase.auth.getSession();
  setUiSession(session);
}
