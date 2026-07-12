import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORE_TRIBE_CODES = ['banshujin', 'nbt', 'himejin'];

/** @type {{ profiles: Array, clanTitleByCode: Map, index: number }} */
const modalNav = {
  profiles: [],
  clanTitleByCode: new Map(),
  index: -1,
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function firstGlyph(name) {
  const chars = [...String(name || '').trim()];
  return chars[0] || '？';
}

function nameTypoParts(name) {
  const chars = [...String(name || '').trim()];
  if (!chars.length) return [{ text: '？', size: 'xl' }];
  if (chars.length === 1) return [{ text: chars[0], size: 'xl' }];
  if (chars.length === 2) {
    return [
      { text: chars[0], size: 'xl' },
      { text: chars[1], size: 'lg' },
    ];
  }
  const sizes = ['xl', 'md', 'lg', 'sm'];
  return chars.map((text, i) => {
    if (i === 0) return { text, size: 'xl' };
    if (i === chars.length - 1) return { text, size: 'lg' };
    if (i === 1 && chars.length === 3) return { text, size: 'md' };
    return { text, size: sizes[Math.min(i, sizes.length - 1)] };
  });
}

function buildNameHtml(name) {
  return nameTypoParts(name)
    .map(
      (p) =>
        '<span class="typo-name__glyph typo-name__glyph--' +
        esc(p.size) +
        '">' +
        esc(p.text) +
        '</span>',
    )
    .join('');
}

function tribeCode(row) {
  const code = row.tribe_code || 'unknown';
  return ['banshujin', 'nbt', 'himejin', 'unknown'].includes(code) ? code : 'unknown';
}

function clanTitleFor(row) {
  if (!row || !row.clan_code) return null;
  return modalNav.clanTitleByCode.get(row.clan_code) || null;
}

function updateNavButtonsVisibility() {
  const prevBtn = document.querySelector('[data-modal-prev]');
  const nextBtn = document.querySelector('[data-modal-next]');
  const show = modalNav.profiles.length > 1;
  if (prevBtn) prevBtn.hidden = !show;
  if (nextBtn) nextBtn.hidden = !show;
}

function renderModalContent(row, clanTitle, slideDir) {
  const body = document.getElementById('typo-modal-body');
  if (!body || !row) return;

  const metaBits = [esc(row.tribe_label || '未判明')];
  if (clanTitle) metaBits.push(esc(clanTitle));

  const photoUrl = row.photo_url && String(row.photo_url).trim();
  const photoBlock = photoUrl
    ? '<div class="typo-modal__photo"><img src="' +
      esc(photoUrl) +
      '" alt="' +
      esc(row.name) +
      '"></div>'
    : '';

  const taglineBlock = row.tagline
    ? '<p class="typo-modal__tagline">' + esc(row.tagline) + '</p>'
    : '';

  body.classList.remove('is-slide-from-left', 'is-slide-from-right');
  if (slideDir === 'left' || slideDir === 'right') {
    void body.offsetWidth;
  }

  body.innerHTML =
    '<div class="typo-modal__watermark" aria-hidden="true">' +
    esc(firstGlyph(row.name)) +
    '</div>' +
    photoBlock +
    '<p class="typo-modal__meta">' +
    metaBits.join('<span class="typo-modal__meta-sep">·</span>') +
    '</p>' +
    '<div class="typo-modal__name-row" id="typo-modal-title">' +
    buildNameHtml(row.name) +
    '</div>' +
    '<div class="typo-modal__rule" aria-hidden="true"></div>' +
    taglineBlock +
    '<p class="typo-modal__intro">' +
    esc(row.intro || '（紹介文は準備中です）') +
    '</p>';

  if (slideDir === 'right') {
    body.classList.add('is-slide-from-right');
  } else if (slideDir === 'left') {
    body.classList.add('is-slide-from-left');
  }
}

function openModalAt(index, slideDir) {
  const modal = document.getElementById('typo-modal');
  const stage = modal ? modal.querySelector('.typo-modal__stage') : null;
  if (!modal || !modalNav.profiles.length) return;

  const len = modalNav.profiles.length;
  const nextIndex = ((index % len) + len) % len;
  const row = modalNav.profiles[nextIndex];
  if (!row) return;

  const wasHidden = modal.hidden;
  modalNav.index = nextIndex;
  renderModalContent(row, clanTitleFor(row), slideDir || null);
  updateNavButtonsVisibility();

  if (stage) {
    stage.classList.toggle('is-open-float', wasHidden && !slideDir);
  }

  modal.hidden = false;
  document.documentElement.classList.add('typo-modal-open');
}

function openModal(row) {
  if (!row || !modalNav.profiles.length) return;
  const index = modalNav.profiles.findIndex((p) => p === row || (p.slug && p.slug === row.slug));
  openModalAt(index >= 0 ? index : 0, null);
}

function showAdjacent(delta) {
  const modal = document.getElementById('typo-modal');
  if (!modal || modal.hidden || modalNav.profiles.length < 2) return;
  openModalAt(modalNav.index + delta, delta > 0 ? 'right' : 'left');
}

function closeModal() {
  const modal = document.getElementById('typo-modal');
  if (!modal) return;
  modal.hidden = true;
  document.documentElement.classList.remove('typo-modal-open');
  modalNav.index = -1;
  const stage = modal.querySelector('.typo-modal__stage');
  if (stage) stage.classList.remove('is-open-float');
  const body = document.getElementById('typo-modal-body');
  if (body) {
    body.classList.remove('is-slide-from-left', 'is-slide-from-right');
    body.innerHTML = '';
  }
}

function bindModalUi() {
  const modal = document.getElementById('typo-modal');
  if (!modal || modal.dataset.bound === '1') return;
  modal.dataset.bound = '1';
  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-modal]')) closeModal();
    if (e.target.closest('[data-modal-prev]')) showAdjacent(-1);
    if (e.target.closest('[data-modal-next]')) showAdjacent(1);
  });
  document.addEventListener('keydown', (e) => {
    if (modal.hidden) return;
    if (e.key === 'Escape') {
      closeModal();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      showAdjacent(-1);
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      showAdjacent(1);
    }
  });
}

function pickSpotlightIndex(count) {
  if (count < 1) return -1;
  const day = new Date();
  const seed = day.getFullYear() * 10000 + (day.getMonth() + 1) * 100 + day.getDate();
  return seed % count;
}

function renderSpotlight(row, onOpen) {
  const section = document.getElementById('himejin-spotlight-section');
  const root = document.getElementById('himejin-spotlight-root');
  if (!section || !root || !row) return;

  section.hidden = false;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'himejin-spotlight';
  btn.setAttribute('aria-label', row.name + 'の詳細を見る');
  btn.innerHTML =
    '<span class="himejin-spotlight__badge">PICK UP</span>' +
    '<span class="himejin-spotlight__glyph" aria-hidden="true">' +
    esc(firstGlyph(row.name)) +
    '</span>' +
    '<div class="himejin-spotlight__body">' +
    '<p class="himejin-spotlight__name">' +
    esc(row.name) +
    '</p>' +
    (row.tagline
      ? '<p class="himejin-spotlight__tagline">' + esc(row.tagline) + '</p>'
      : '<p class="himejin-spotlight__tagline">' + esc(row.tribe_label || '') + '</p>') +
    '</div>';
  btn.addEventListener('click', () => onOpen(row));
  root.replaceChildren(btn);
}

function buildIndexButton(row, onOpen) {
  const code = tribeCode(row);
  const clanTitle = clanTitleFor(row);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'typo-index__item';
  btn.setAttribute('data-slug', row.slug || '');
  btn.setAttribute('data-category', code);
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.innerHTML =
    '<span class="typo-index__bg-char" aria-hidden="true">' +
    esc(firstGlyph(row.name)) +
    '</span>' +
    '<span class="typo-index__name">' +
    esc(row.name) +
    '</span>' +
    '<span class="typo-index__tribe">' +
    esc(row.tribe_label || '') +
    (clanTitle ? ' · ' + esc(clanTitle) : '') +
    '</span>' +
    (row.tagline ? '<span class="typo-index__tagline">' + esc(row.tagline) + '</span>' : '');
  btn.addEventListener('click', () => onOpen(row));
  return btn;
}

function renderIndex(profiles, clanTitleByCode) {
  const root = document.getElementById('typo-index-root');
  if (!root) return;

  modalNav.profiles = profiles;
  modalNav.clanTitleByCode = clanTitleByCode;
  modalNav.index = -1;
  updateNavButtonsVisibility();

  const openForRow = (row) => openModal(row);
  const frag = document.createDocumentFragment();

  const spotlightIdx = pickSpotlightIndex(profiles.length);
  if (spotlightIdx >= 0) {
    renderSpotlight(profiles[spotlightIdx], openForRow);
  }

  profiles.forEach((row, index) => {
    const btn = buildIndexButton(row, openForRow);
    if (index === spotlightIdx) {
      btn.setAttribute('data-spotlight', '1');
    }
    frag.appendChild(btn);
  });

  root.replaceChildren(frag);
  root.removeAttribute('aria-busy');
}

async function loadTribeDescriptions(supabase) {
  const tribeTitleMap = {
    banshujin: document.getElementById('tribe-title-banshujin'),
    nbt: document.getElementById('tribe-title-nbt'),
    himejin: document.getElementById('tribe-title-himejin'),
  };
  const tribeDescMap = {
    banshujin: document.getElementById('tribe-desc-banshujin'),
    nbt: document.getElementById('tribe-desc-nbt'),
    himejin: document.getElementById('tribe-desc-himejin'),
  };

  const { data: tribes, error } = await supabase
    .from('tribe_descriptions')
    .select('code,title,description');

  if (error || !tribes || !tribes.length) return;

  for (const row of tribes) {
    if (!CORE_TRIBE_CODES.includes(row.code)) continue;
    const titleEl = tribeTitleMap[row.code];
    const descEl = tribeDescMap[row.code];
    if (titleEl) titleEl.textContent = row.title || titleEl.textContent;
    if (descEl) descEl.textContent = row.description || descEl.textContent;
  }
}

bindModalUi();
updateNavButtonsVisibility();

const url = window.__SB_URL;
const key = window.__SB_ANON_KEY;
const keyOk = key && String(key).trim().length > 0;
const urlOk =
  url && String(url).trim().length > 0 && !String(url).includes('あなたのプロジェクトID');

if (keyOk && urlOk) {
  const supabase = createClient(url, key);

  const [clanResult, profilesResult] = await Promise.all([
    supabase.from('clan_descriptions').select('code,title').order('sort_order', { ascending: true }),
    supabase
      .from('himejin_profiles')
      .select('slug,name,tribe_code,tribe_label,clan_code,tagline,intro,photo_url')
      .eq('status', 'published')
      .order('sort_order', { ascending: true })
      .order('updated_at', { ascending: true }),
  ]);

  await loadTribeDescriptions(supabase);

  const clanTitleByCode = new Map((clanResult.data || []).map((c) => [c.code, c.title || c.code]));
  const profiles = profilesResult.data;
  const profilesError = profilesResult.error;

  if (!profilesError && profiles && profiles.length) {
    renderIndex(profiles, clanTitleByCode);
  }
}

document.body.classList.add('himejin-ready');
