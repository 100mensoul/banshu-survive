/**
 * はりまノはれま — Supabase 連携版
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

(function () {
  'use strict';

  var COLS = 15;
  var SEASON_START = '2026-05-20';
  var SEASON_END = '2026-09-25';
  var PLANTING_ISO = '2026-05-25';
  var SEASON_DAYS = [];

  var WEATHER_LABELS = {
    future: '（この日はまだ来ていません）',
    sunny: '晴れ',
    cloudy: '曇り',
    rain: '雨',
    'heavy-rain': '大雨',
  };

  var sectionEl = document.querySelector('.harima-harema');
  var gridEl = document.getElementById('harema-grid-rows');
  var dialog = document.getElementById('harema-modal');
  var modalShell = document.getElementById('harema-modal-shell');
  if (!gridEl || !dialog || !modalShell) return;

  var dayMap = {};
  var photoMap = {};
  var activeIso = null;
  var activePhotoIndex = 0;

  var prevDayBtn = document.getElementById('harema-modal-prev-day');
  var nextDayBtn = document.getElementById('harema-modal-next-day');
  var prevPhotoBtn = document.getElementById('harema-modal-prev-photo');
  var nextPhotoBtn = document.getElementById('harema-modal-next-photo');

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
    return dayMap[normalizeIso(iso)] || null;
  }

  function getPhotos(iso) {
    return photoMap[normalizeIso(iso)] || [];
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
  function todayIso() {
    return toIso(startOfToday());
  }
  function isToday(iso) {
    return todayIso() === iso;
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

  function dayIndex(iso) {
    return SEASON_DAYS.indexOf(normalizeIso(iso));
  }

  /** テキストから晴/曇/雨を推定（表示ラベル・手記の両方に使う） */
  function kindFromText(text) {
    var t = (text || '').trim();
    if (!t) return null;
    if (/大雨|豪雨/.test(t)) return 'heavy-rain';
    if (/雨/.test(t)) return 'rain';
    if (/曇/.test(t)) return 'cloudy';
    if (/晴|快晴|日差し|日焼け|暑い|猛暑/.test(t)) return 'sunny';
    return null;
  }

  function inferKindFromRec(rec) {
    if (!rec) return null;

    var fromLabel = kindFromText(rec.weather_label);
    if (fromLabel) return fromLabel;

    /* API天気より手記を優先（「晴天」と書いたのに曇り色になる問題の対策） */
    var fromJournal = kindFromText(rec.journal);
    if (fromJournal) return fromJournal;

    if (rec.weather) return rec.weather;

    var pr = rec.precip_mm != null ? Number(rec.precip_mm) : null;
    if (pr != null && !isNaN(pr)) {
      if (pr >= 25) return 'heavy-rain';
      if (pr > 0) return 'rain';
    }

    if (
      rec.harema_level ||
      rec.temp_min != null ||
      rec.temp_max != null
    ) {
      return 'sunny';
    }

    return null;
  }

  function resolveKind(iso) {
    return inferKindFromRec(getDay(iso)) || 'future';
  }

  function displayLabel(iso, kind) {
    var rec = getDay(iso);
    if (rec && rec.weather_label) return rec.weather_label;
    if (rec && rec.journal && kindFromText(rec.journal) === kind) {
      if (/晴/.test(rec.journal)) return '晴れ';
      if (/曇/.test(rec.journal)) return '曇り';
      if (/雨/.test(rec.journal)) return '雨';
    }
    return WEATHER_LABELS[kind] || WEATHER_LABELS.future;
  }

  function renderGrid() {
    gridEl.innerHTML = '';
    var cellIndex = 0;
    var rows = chunkRows(SEASON_DAYS);
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
        btn.dataset.animIndex = String(cellIndex);
        btn.setAttribute('aria-label', iso.replace(/-/g, '/') + ' ' + label);
        if (isToday(iso) && kind !== 'future') btn.classList.add('is-today');
        if (iso === PLANTING_ISO) btn.classList.add('is-planting');
        if (getPhotos(iso).length) btn.classList.add('is-has-photo');
        btn.addEventListener('click', function () {
          openModal(iso, 0);
        });
        row.appendChild(btn);
        cellIndex++;
      });
      gridEl.appendChild(row);
    });
    setupScrollReveal();
  }

  function setupScrollReveal() {
    if (!sectionEl) return;
    var todayIdx = dayIndex(todayIso());
    if (todayIdx < 0) todayIdx = SEASON_DAYS.length - 1;

    var cells = gridEl.querySelectorAll('.harima-harema__cell');
    cells.forEach(function (btn) {
      var i = parseInt(btn.dataset.animIndex, 10) || 0;
      if (i <= todayIdx && btn.dataset.weather !== 'future') {
        btn.classList.add('is-anim-ready');
        btn.style.setProperty('--harema-anim-i', String(i));
      } else {
        btn.style.opacity = '1';
        btn.style.transform = 'none';
      }
    });

    if (sectionEl.classList.contains('is-revealed')) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      sectionEl.classList.add('is-revealed');
      return;
    }

    function isSectionInRevealZone() {
      var rect = sectionEl.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      var lead = vh * 0.1;
      return rect.top < vh + lead && rect.bottom > 0;
    }

    if (isSectionInRevealZone()) {
      sectionEl.classList.add('is-revealed');
      return;
    }

    var obs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            sectionEl.classList.add('is-revealed');
            obs.disconnect();
          }
        });
      },
      { threshold: 0.03, rootMargin: '0px 0px 10% 0px' }
    );
    obs.observe(sectionEl);
  }

  function renderPhotoCarousel(iso) {
    var img = document.getElementById('harema-modal-photo-img');
    var emptyEl = document.getElementById('harema-modal-photo-empty');
    var countEl = document.getElementById('harema-modal-photo-count');
    var photos = getPhotos(iso);

    if (!photos.length) {
      img.hidden = true;
      img.removeAttribute('src');
      img.alt = '';
      emptyEl.hidden = false;
      countEl.hidden = true;
      if (prevPhotoBtn) prevPhotoBtn.hidden = true;
      if (nextPhotoBtn) nextPhotoBtn.hidden = true;
      return;
    }

    if (activePhotoIndex < 0) activePhotoIndex = 0;
    if (activePhotoIndex >= photos.length) {
      activePhotoIndex = photos.length - 1;
    }

    emptyEl.hidden = true;
    img.hidden = false;
    var p = photos[activePhotoIndex];
    img.src = p.url;
    img.alt = p.caption ? p.caption : formatJaDate(iso) + ' の記録写真（' + (activePhotoIndex + 1) + '枚目）';

    if (photos.length > 1) {
      countEl.hidden = false;
      countEl.textContent = activePhotoIndex + 1 + ' / ' + photos.length;
      if (prevPhotoBtn) prevPhotoBtn.hidden = false;
      if (nextPhotoBtn) nextPhotoBtn.hidden = false;
    } else {
      countEl.hidden = true;
      if (prevPhotoBtn) prevPhotoBtn.hidden = true;
      if (nextPhotoBtn) nextPhotoBtn.hidden = true;
    }
  }

  function updateDayNavButtons(iso) {
    var d = parseIso(iso);
    var prev = toIso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
    var next = toIso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
    if (prevDayBtn) prevDayBtn.disabled = prev < SEASON_START;
    if (nextDayBtn) nextDayBtn.disabled = next > SEASON_END;
  }

  function fillModal(iso) {
    activeIso = normalizeIso(iso);
    var rec = getDay(activeIso);
    var kind = resolveKind(activeIso);
    var label = displayLabel(activeIso, kind);

    var heroEl = document.getElementById('harema-modal-hero');
    var weatherEl = document.getElementById('harema-modal-weather');
    var dateEl = document.getElementById('harema-modal-date');
    var statsEl = document.getElementById('harema-modal-stats');
    var starsEl = document.getElementById('harema-modal-stars');
    var journalWrap = document.getElementById('harema-modal-journal-wrap');
    var journalEl = document.getElementById('harema-modal-journal');

    heroEl.dataset.kind = kind;
    weatherEl.textContent = label;
    dateEl.textContent = formatJaDate(activeIso);

    renderPhotoCarousel(activeIso);
    updateDayNavButtons(activeIso);

    starsEl.textContent = rec && rec.harema_level ? starsText(rec.harema_level) : '☆☆☆☆☆';

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

    if (rec && rec.journal) {
      journalWrap.classList.remove('is-empty');
      journalEl.textContent = rec.journal;
    } else {
      journalWrap.classList.add('is-empty');
      journalEl.textContent = '（記録なし）';
    }
  }

  function openModal(iso, photoIndex) {
    activePhotoIndex = photoIndex != null ? photoIndex : 0;
    modalShell.hidden = false;
    fillModal(iso);
    if (!dialog.open) dialog.show();
  }

  function closeModal() {
    if (dialog.open) dialog.close();
    modalShell.hidden = true;
    activeIso = null;
  }

  function shiftDay(delta) {
    if (!activeIso) return;
    var d = parseIso(activeIso);
    d.setDate(d.getDate() + delta);
    var nextIso = toIso(d);
    if (nextIso < SEASON_START || nextIso > SEASON_END) return;
    activePhotoIndex = 0;
    fillModal(nextIso);
  }

  function shiftPhoto(delta) {
    var photos = getPhotos(activeIso);
    if (photos.length <= 1) return;
    activePhotoIndex = (activePhotoIndex + delta + photos.length) % photos.length;
    renderPhotoCarousel(activeIso);
  }

  document.getElementById('harema-modal-close').addEventListener('click', closeModal);

  document.getElementById('harema-modal-overlay').addEventListener('click', closeModal);

  dialog.addEventListener('click', function (ev) {
    ev.stopPropagation();
  });

  dialog.addEventListener('close', function () {
    modalShell.hidden = true;
    activeIso = null;
  });

  if (prevDayBtn) {
    prevDayBtn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      shiftDay(-1);
    });
  }
  if (nextDayBtn) {
    nextDayBtn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      shiftDay(1);
    });
  }
  if (prevPhotoBtn) {
    prevPhotoBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      shiftPhoto(-1);
    });
  }
  if (nextPhotoBtn) {
    nextPhotoBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      shiftPhoto(1);
    });
  }

  dialog.addEventListener('keydown', function (ev) {
    if (!dialog.open) return;
    if (ev.key === 'ArrowLeft') {
      ev.preventDefault();
      if (ev.shiftKey) shiftPhoto(-1);
      else shiftDay(-1);
    } else if (ev.key === 'ArrowRight') {
      ev.preventDefault();
      if (ev.shiftKey) shiftPhoto(1);
      else shiftDay(1);
    } else if (ev.key === 'Escape') {
      closeModal();
    }
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
          var k = normalizeIso(r.day_date);
          r.day_date = k;
          dayMap[k] = r;
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
          var k = normalizeIso(p.day_date);
          (photoMap[k] = photoMap[k] || []).push(p);
        });
      }
    } catch (e) {
      /* 失敗時は空グリッド */
    }
  }

  SEASON_DAYS = eachDay(SEASON_START, SEASON_END);

  (async function init() {
    await loadFromSupabase();
    renderGrid();
  })();
})();
