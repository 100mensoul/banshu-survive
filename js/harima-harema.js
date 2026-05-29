/**
 * はりまノはれま — プロトタイプ
 * 行優先・15列。5/20（田植え前）〜 9/25。
 * サンプル天気は SAMPLE_DAYS のみ。写真は localStorage（本番 Supabase 予定）。
 */
(function () {
  'use strict';

  var COLS = 15;
  var SEASON_START = '2026-05-20';
  var SEASON_END = '2026-09-25';

  var WEATHER_LABELS = {
    future: '（この日はまだ来ていません）',
    sunny: '晴れ',
    cloudy: '曇り',
    rain: '雨',
    'heavy-rain': '大雨',
  };

  var SAMPLE_DAYS = {
    '2026-05-20': {
      kind: 'sunny',
      label: '晴れ',
      note: '田植え前 — 圃場まわりの準備',
    },
    '2026-05-21': {
      kind: 'sunny',
      label: '晴れ',
      note: '田の海をかきまぜ、土よせ',
    },
    '2026-05-22': {
      kind: 'cloudy',
      label: '曇り',
      note: '田植え前',
    },
    '2026-05-23': {
      kind: 'sunny',
      label: '晴れ',
      note: '苗迎えの準備',
    },
    '2026-05-24': {
      kind: 'cloudy',
      label: '曇り',
      note: '田植え前日',
    },
    '2026-05-25': {
      kind: 'sunny',
      label: '晴れ',
      note: '田植え',
      imageUrl: 'images/taue.jpg',
    },
    '2026-05-26': {
      kind: 'sunny',
      label: '晴れ',
    },
    '2026-05-27': {
      kind: 'rain',
      label: '曇りのち雨',
      precip: 6,
      tMin: 17,
      tMax: 22,
    },
    '2026-05-28': {
      kind: 'cloudy',
      label: '曇り',
    },
    '2026-05-29': {
      kind: 'sunny',
      label: '晴れ',
    },
  };

  var gridEl = document.getElementById('harema-grid-rows');
  var dialog = document.getElementById('harema-modal');
  var demoToggle = document.getElementById('harema-demo-colors');

  var activeIso = null;
  var activeDemoAll = false;

  if (!gridEl || !dialog) {
    return;
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

  function getSample(iso) {
    return SAMPLE_DAYS[iso] || null;
  }

  function getPhotoUrl(iso) {
    var sample = getSample(iso);
    return sample && sample.imageUrl ? sample.imageUrl : '';
  }

  function hashWeather(iso) {
    var h = 0;
    for (var i = 0; i < iso.length; i++) {
      h = (h * 31 + iso.charCodeAt(i)) | 0;
    }
    var r = Math.abs(h) % 100;
    if (r < 42) return 'sunny';
    if (r < 68) return 'cloudy';
    if (r < 88) return 'rain';
    return 'heavy-rain';
  }

  function mockStats(iso, kind) {
    var h = 0;
    for (var i = 0; i < iso.length; i++) {
      h = (h * 17 + iso.charCodeAt(i)) | 0;
    }
    var n = Math.abs(h);
    var precip = 0;
    if (kind === 'rain') precip = (n % 28) + 2;
    if (kind === 'heavy-rain') precip = (n % 55) + 30;
    var tMax = 18 + (n % 14);
    var tMin = tMax - (4 + (n % 6));
    return {
      precip: precip,
      tMax: tMax,
      tMin: tMin,
    };
  }

  function resolveKind(iso, demoAll) {
    var sample = getSample(iso);
    if (sample) return sample.kind;
    if (demoAll) return hashWeather(iso);
    return 'future';
  }

  function chunkRows(days) {
    var rows = [];
    for (var i = 0; i < days.length; i += COLS) {
      rows.push(days.slice(i, i + COLS));
    }
    return rows;
  }

  function formatJaDate(iso) {
    var d = parseIso(iso);
    var reiwa = d.getFullYear() - 2018;
    var w = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
    return (
      '令和' +
      reiwa +
      '年' +
      (d.getMonth() + 1) +
      '月' +
      d.getDate() +
      '日（' +
      w +
      '）'
    );
  }

  function formatShortDate(iso) {
    var d = parseIso(iso);
    return d.getMonth() + 1 + ' / ' + d.getDate();
  }

  function buildDayRecord(iso, demoAll) {
    var sample = getSample(iso);
    var kind = resolveKind(iso, demoAll);
    var label =
      sample && sample.label
        ? sample.label
        : WEATHER_LABELS[kind] || WEATHER_LABELS.future;
    var stats = null;
    if (kind !== 'future') {
      if (
        sample &&
        (sample.precip !== undefined ||
          sample.tMin !== undefined ||
          sample.tMax !== undefined)
      ) {
        var base = mockStats(iso, kind);
        stats = {
          precip: sample.precip !== undefined ? sample.precip : base.precip,
          tMin: sample.tMin !== undefined ? sample.tMin : base.tMin,
          tMax: sample.tMax !== undefined ? sample.tMax : base.tMax,
        };
      } else {
        stats = mockStats(iso, kind);
      }
    }
    return {
      iso: iso,
      kind: kind,
      label: label,
      stats: stats,
      note: sample && sample.note ? sample.note : '',
      edited: !!(sample && sample.edited),
      today: isToday(iso),
      hasSample: !!sample,
      photoUrl: getPhotoUrl(iso),
    };
  }

  function renderGrid(demoAll) {
    gridEl.innerHTML = '';
    var days = eachDay(SEASON_START, SEASON_END);
    var rows = chunkRows(days);
    rows.forEach(function (rowDays) {
      var row = document.createElement('div');
      row.className = 'harima-harema__row';
      rowDays.forEach(function (iso) {
        var rec = buildDayRecord(iso, demoAll);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'harima-harema__cell';
        btn.dataset.date = iso;
        btn.dataset.weather = rec.kind;
        btn.setAttribute(
          'aria-label',
          iso.replace(/-/g, '/') + ' ' + rec.label
        );
        if (rec.today) btn.classList.add('is-today');
        if (rec.edited) btn.classList.add('is-edited');
        if (iso === '2026-05-25') btn.classList.add('is-planting');
        if (rec.photoUrl) btn.classList.add('is-has-photo');
        btn.addEventListener('click', function () {
          openModal(rec, demoAll);
        });
        row.appendChild(btn);
      });
      gridEl.appendChild(row);
    });
  }

  function renderPhotoSection(iso) {
    var figure = document.getElementById('harema-modal-photo-figure');
    var img = document.getElementById('harema-modal-photo');
    var url = getPhotoUrl(iso);

    if (url) {
      figure.hidden = false;
      img.src = url;
      img.alt = formatJaDate(iso) + ' の記録写真';
    } else {
      figure.hidden = true;
      img.removeAttribute('src');
      img.alt = '';
    }
  }

  function openModal(rec, demoAll) {
    activeIso = rec.iso;
    activeDemoAll = demoAll;

    var heroEl = document.getElementById('harema-modal-hero');
    var dateEl = document.getElementById('harema-modal-date');
    var weatherEl = document.getElementById('harema-modal-weather');
    var statsEl = document.getElementById('harema-modal-stats');
    var noteEl = document.getElementById('harema-modal-note');
    var badgeEl = document.getElementById('harema-modal-badge');
    var protoEl = document.getElementById('harema-modal-proto');

    heroEl.dataset.kind = rec.kind;
    weatherEl.textContent = rec.label;
    dateEl.textContent = formatJaDate(rec.iso);

    statsEl.innerHTML = '';
    if (rec.kind === 'future' && !demoAll) {
      var chip = document.createElement('li');
      chip.className = 'harima-harema__dialog-chip harima-harema__dialog-chip--muted';
      chip.textContent = 'この日が来ると天気を記録';
      statsEl.appendChild(chip);
    } else if (rec.stats) {
      var chips = [
        rec.stats.tMin + '〜' + rec.stats.tMax + '℃',
        '降水 ' + rec.stats.precip + ' mm',
        '上原田',
      ];
      chips.forEach(function (text) {
        var li = document.createElement('li');
        li.className = 'harima-harema__dialog-chip';
        li.textContent = text;
        statsEl.appendChild(li);
      });
    }

    if (rec.note) {
      noteEl.hidden = false;
      noteEl.textContent = rec.note;
    } else {
      noteEl.hidden = true;
      noteEl.textContent = '';
    }

    badgeEl.hidden = !rec.edited;
    protoEl.textContent = rec.hasSample
      ? 'サンプル（5月）'
      : demoAll
        ? '開発用ランダム色'
        : '未記録の日';

    renderPhotoSection(rec.iso);

    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function renderAll() {
    var demoAll = demoToggle && demoToggle.checked;
    renderGrid(demoAll);
  }

  document.getElementById('harema-modal-close').addEventListener('click', function () {
    dialog.close();
    activeIso = null;
  });

  dialog.addEventListener('click', function (ev) {
    if (ev.target === dialog) {
      dialog.close();
      activeIso = null;
    }
  });

  if (demoToggle) {
    demoToggle.addEventListener('change', renderAll);
  }

  renderAll();
})();
