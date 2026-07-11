/**
 * ひめじんタイポ比較ラボ — 設定の切り替えと localStorage 保存
 */
const LAB_DEFAULTS = {
  'typo-font': 'noto',
  'typo-size': 'm',
  'typo-page-bg': 'forest',
  'typo-modal-bg': 'tribe',
  'typo-watermark': 'soft',
  'typo-tagline': 'italic',
};

const LAB_LABELS = {
  'typo-font': {
    noto: 'Noto Sans（現行）',
    mincho: 'しっぽり明朝',
    serif: 'Noto Serif',
    zen: 'Zen 角ゴシック',
    yuji: 'Yuji Boku',
    dot: 'ドット',
  },
  'typo-size': {
    m: 'M（現行）',
    l: 'L +22%',
    xl: 'XL +48%',
    xxl: 'XXL +82%',
  },
  'typo-page-bg': {
    forest: '森（現行）',
    void: '真っ黒',
    ledger: '台帳・羊皮',
    ink: 'インク青',
  },
  'typo-modal-bg': {
    tribe: '種族色（現行）',
    void: '真っ黒',
    forest: '森',
    gold: '金',
    cold: '冷色',
  },
  'typo-watermark': {
    soft: '薄い（現行）',
    mid: '中',
    bold: '濃い',
  },
  'typo-tagline': {
    italic: 'イタリック（現行）',
    bold: '太字ゴシック',
    thin: '細字・字間広',
  },
};

const STORAGE_KEY = 'himejin-typo-lab-v1';

function applyLabSettings(settings) {
  const root = document.documentElement;
  Object.entries(settings).forEach(([key, value]) => {
    root.setAttribute('data-' + key, value);
  });
}

function readSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...LAB_DEFAULTS };
    return { ...LAB_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...LAB_DEFAULTS };
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* no-op */
  }
}

function statusText(settings) {
  const f = LAB_LABELS['typo-font'][settings['typo-font']];
  const s = LAB_LABELS['typo-size'][settings['typo-size']];
  const pb = LAB_LABELS['typo-page-bg'][settings['typo-page-bg']];
  const mb = LAB_LABELS['typo-modal-bg'][settings['typo-modal-bg']];
  return 'フォント: ' + f + ' / サイズ: ' + s + ' / 背景: ' + pb + ' / モーダル: ' + mb;
}

function bindLabPanel() {
  const panel = document.getElementById('typo-lab-panel');
  const status = document.getElementById('typo-lab-status');
  if (!panel) return;

  let settings = readSettings();
  applyLabSettings(settings);
  if (status) status.textContent = statusText(settings);

  panel.querySelectorAll('.typo-lab-chip').forEach((chip) => {
    const group = chip.getAttribute('data-group');
    const value = chip.getAttribute('data-value');
    if (!group || !value) return;

    if (settings[group] === value) chip.classList.add('is-active');

    chip.addEventListener('click', () => {
      settings = { ...settings, [group]: value };
      applyLabSettings(settings);
      saveSettings(settings);

      panel.querySelectorAll('.typo-lab-chip[data-group="' + group + '"]').forEach((c) => {
        c.classList.toggle('is-active', c.getAttribute('data-value') === value);
      });
      if (status) status.textContent = statusText(settings);

      const modal = document.getElementById('typo-modal');
      if (modal && !modal.hidden && settings['typo-modal-bg'] !== 'tribe') {
        const stage = modal.querySelector('.typo-modal__stage');
        if (stage) {
          stage.style.removeProperty('background');
        }
      }
    });
  });

  const resetBtn = document.getElementById('typo-lab-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      settings = { ...LAB_DEFAULTS };
      applyLabSettings(settings);
      saveSettings(settings);
      panel.querySelectorAll('.typo-lab-chip').forEach((chip) => {
        const group = chip.getAttribute('data-group');
        const value = chip.getAttribute('data-value');
        chip.classList.toggle('is-active', settings[group] === value);
      });
      if (status) status.textContent = statusText(settings);
    });
  }
}

document.addEventListener('DOMContentLoaded', bindLabPanel);
