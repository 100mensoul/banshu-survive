/**
 * はりまノはれま — Supabase 連携版
 * 行優先・15列。5/20（田植え前）〜 9/25。
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

(function () {
  'use strict';

  var COLS = 15;
  var SEASON_START = '2026-05-20';
  var SEASON_END = '2026-09-25';
  var PLANTING_ISO = '2026-05-25';

  var WEATHER_LABELS = {
    future: '（この日はまだ来ていません）',
    sunny: '晴れ',
    cloudy: '曇り',
    rain: '雨',
    'heavy-rain': '大雨',
  };

  var gridEl = document.getElementById('harema-grid-rows');
  var dialog = document.getElementById('harema-modal');
  if (!gridEl || !dialog) return;

  var dayMap = {};
  var photoMap = {};

  function normalizeIso(value) {
    if (value == null || value === '') return '';
    var s = String(value);
    if (s.length >= 10 && s.charAt(4) === '-' && s.charAt(7) === '-') {
      return s.slice(0, 10);
    }
    var d = new Date(s);
    if (!isNaN(d.getTime())) {
      return (
        d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d.getDate()).padStart(2, '0')
      );
    }
    return s;
  }

  function getDay(iso) {
    var key = normalizeIso(iso);
    return dayMap[key] || null;
  }

  function getPhotos(iso) {
    var key = normalizeIso(iso);
    return photoMap[key] || [];
  }

  function parseIso(iso) {
    var p = iso.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function toIso(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  function eachDay(startIso, endIso) {
    var list = [];
    var cur = parseIso(startIso);
    var end = parseIso(endIso);
    while (cur <= end) {
      list.push(toIso(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return list;
  }
  function startOfToday() {
    var t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }
  function isToday(iso) {
    return toIso(startOfToday()) === iso;
  }
  function chunkRows(days) {
    var rows = [];
    for (var i = 0; i < days.length; i += COLS) rows.push(days.slice(i, i + COLS));
    return rows;
  }
  function formatJaDate(iso) {
    var d = parseIso(iso);
    var reiwa = d.getFullYear() - 2018;
    var w = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
    return '令和' + reiwa + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日（' + w + '）';
  }
  function starsText(level) {
    level = Math.max(0, Math.min(5, parseInt(level, 10) || 0));
    return '★'.repeat(level) + '☆'.repeat(5 - level);
  }

  /** 表示ラベルからマスの色用区分を推定（「晴れ」表記なら黄色など） */
  function kindFromLabel(label) {
    var t = (label || '').trim();
    if (!t) return null;
    if (/大雨|豪雨/.test(t)) return 'heavy-rain';
    if (/雨/.test(t)) return 'rain';
    if (/曇/.test(t)) return 'cloudy';
    if (/晴/.test(t)) return 'sunny';
    return null;
  }

  /**
   * マス・モーダルヘッダーの色用。
   * 表示ラベル（手記の体感）を API の weather より優先する。
   * （自動取得で cloudy、ラベルだけ「晴れ」のとき色が付かない問題の対策）
   */
  function inferKindFromRec(rec) {
    if (!rec) return null;

    var fromLabel = kindFromLabel(rec.weather_label);
    if (fromLabel) return fromLabel;

    if (rec.weather) return rec.weather;

    var pr = rec.precip_mm != null ? Number(rec.precip_mm) : null;
    if (pr != null && !isNaN(pr)) {
      if (pr >= 25) return 'heavy-rain';
      if (pr > 0) return 'rain';
    }

    if (
      rec.journal ||
      rec.harema_level ||
      rec.temp_min != null ||
      rec.temp_max != null
    ) {
      return 'sunny';
    }

    return null;
  }

  function resolveKind(iso) {
    var inferred = inferKindFromRec(getDay(iso));
    return inferred || 'future';
  }

  function displayLabel(iso, kind) {
    var rec = getDay(iso);
    if (rec && rec.weather_label) return rec.weather_label;
    return WEATHER_LABELS[kind] || WEATHER_LABELS.future;
  }

  function renderGrid() {
    gridEl.innerHTML = '';
    var rows = chunkRows(eachDay(SEASON_START, SEASON_END));
    rows.forEach(function (rowDays) {
      var row = document.createElement('div');
      row.className = 'harima-harema__row';
      rowDays.forEach(function (iso) {
        var kind = resolveKind(iso);
        var label = displayLabel(iso, kind);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'harima-harema__cell';
        btn.dataset.date = iso;
        btn.dataset.weather = kind;
        btn.setAttribute('aria-label', iso.replace(/-/g, '/') + ' ' + label);
        if (isToday(iso)) btn.classList.add('is-today');
        if (iso === PLANTING_ISO) btn.classList.add('is-planting');
        if (getPhotos(iso).length) btn.classList.add('is-has-photo');
        btn.addEventListener('click', function () {
          openModal(iso);
        });
        row.appendChild(btn);
      });
      gridEl.appendChild(row);
    });
  }

  function openModal(iso) {
    var rec = getDay(iso);
    var kind = resolveKind(iso);
    var label = displayLabel(iso, kind);

    var heroEl = document.getElementById('harema-modal-hero');
    var dateEl = document.getElementById('harema-modal-date');
    var weatherEl = document.getElementById('harema-modal-weather');
    var statsEl = document.getElementById('harema-modal-stats');
    var haremaEl = document.getElementById('harema-modal-harema');
    var starsEl = document.getElementById('harema-modal-stars');
    var journalWrap = document.getElementById('harema-modal-journal-wrap');
    var journalEl = document.getElementById('harema-modal-journal');
    var photosEl = document.getElementById('harema-modal-photos');

    heroEl.dataset.kind = kind;
    weatherEl.textContent = label;
    dateEl.textContent = formatJaDate(iso);

    /* 写真（ヘッダー直下） */
    var photos = getPhotos(iso);
    photosEl.innerHTML = '';
    if (photos.length) {
      photosEl.hidden = false;
      photos.forEach(function (p) {
        var img = document.createElement('img');
        img.src = p.url;
        img.alt = p.caption ? p.caption : formatJaDate(iso) + ' の記録写真';
        img.loading = 'lazy';
        photosEl.appendChild(img);
      });
    } else {
      photosEl.hidden = true;
    }

    /* ハレマ度（写真の下） */
    if (rec && rec.harema_level) {
      haremaEl.hidden = false;
      starsEl.textContent = starsText(rec.harema_level);
    } else {
      haremaEl.hidden = true;
      starsEl.textContent = '';
    }

    /* 気温・降水 */
    statsEl.innerHTML = '';
    if (kind === 'future') {
      var chip = document.createElement('li');
      chip.className = 'harima-harema__dialog-chip harima-harema__dialog-chip--muted';
      chip.textContent = 'この日が来ると天気を記録';
      statsEl.appendChild(chip);
    } else if (rec) {
      var chips = [];
      if (rec.temp_min != null || rec.temp_max != null) {
        var tmin = rec.temp_min != null ? Math.round(rec.temp_min) : '–';
        var tmax = rec.temp_max != null ? Math.round(rec.temp_max) : '–';
        chips.push(tmin + '〜' + tmax + '℃');
      }
      if (rec.precip_mm != null) {
        chips.push('降水 ' + (Math.round(rec.precip_mm * 10) / 10) + ' mm');
      }
      chips.forEach(function (text) {
        var li = document.createElement('li');
        li.className = 'harima-harema__dialog-chip';
        li.textContent = text;
        statsEl.appendChild(li);
      });
    }

    /* ハレアメ手記 */
    if (rec && rec.journal) {
      journalWrap.hidden = false;
      journalEl.textContent = rec.journal;
    } else {
      journalWrap.hidden = true;
      journalEl.textContent = '';
    }

    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  document.getElementById('harema-modal-close').addEventListener('click', function () {
    dialog.close();
  });
  dialog.addEventListener('click', function (ev) {
    if (ev.target === dialog) dialog.close();
  });

  async function loadFromSupabase() {
    var url = window.__SB_URL;
    var key = window.__SB_ANON_KEY;
    if (!url || !key || !String(url).trim() || !String(key).trim()) {
      return;
    }
    try {
      var supabase = createClient(url, key);
      var daysRes = await supabase
        .from('harema_days')
        .select('*')
        .gte('day_date', SEASON_START)
        .lte('day_date', SEASON_END);
      if (!daysRes.error && daysRes.data) {
        daysRes.data.forEach(function (r) {
          var key = normalizeIso(r.day_date);
          r.day_date = key;
          dayMap[key] = r;
        });
      }
      var photosRes = await supabase
        .from('harema_day_photos')
        .select('day_date,url,caption,sort_order')
        .gte('day_date', SEASON_START)
        .lte('day_date', SEASON_END)
        .order('sort_order', { ascending: true });
      if (!photosRes.error && photosRes.data) {
        photosRes.data.forEach(function (p) {
          var key = normalizeIso(p.day_date);
          (photoMap[key] = photoMap[key] || []).push(p);
        });
      }
    } catch (e) {
      /* 失敗時は空グリッド */
    }
  }

  (async function init() {
    await loadFromSupabase();
    renderGrid();
  })();
})();
