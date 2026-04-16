import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function photoBlock(url, name) {
  if (!url || String(url).trim() === '') {
    return '<div class="himejin-photo-placeholder">PHOTO</div>';
  }
  return '<img src="' + esc(url) + '" alt="' + esc(name) + '" loading="lazy">';
}

const CORE_TRIBE_CODES = ['banshujin', 'nbt', 'himejin'];

const url = window.__SB_URL;
const key = window.__SB_ANON_KEY;
const keyOk = key && String(key).trim().length > 0;
const urlOk =
  url &&
  String(url).trim().length > 0 &&
  !String(url).includes('あなたのプロジェクトID');

function openModal(html) {
  const modal = document.getElementById('himejin-modal');
  const body = document.getElementById('himejin-modal-body');
  if (!modal || !body) return;
  body.innerHTML = html;
  modal.hidden = false;
  document.documentElement.classList.add('himejin-modal-open');
}

function closeModal() {
  const modal = document.getElementById('himejin-modal');
  if (!modal) return;
  modal.hidden = true;
  document.documentElement.classList.remove('himejin-modal-open');
  const body = document.getElementById('himejin-modal-body');
  if (body) body.innerHTML = '';
}

function bindModalUi() {
  const modal = document.getElementById('himejin-modal');
  if (!modal || modal.dataset.bound === '1') return;
  modal.dataset.bound = '1';
  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-modal]')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });
}

if (keyOk && urlOk) {
  bindModalUi();
  const supabase = createClient(url, key);

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

  const { data: tribes, error: tribesError } = await supabase
    .from('tribe_descriptions')
    .select('code,title,description');

  if (!tribesError && tribes && tribes.length) {
    for (const row of tribes) {
      if (!CORE_TRIBE_CODES.includes(row.code)) continue;
      const titleEl = tribeTitleMap[row.code];
      const descEl = tribeDescMap[row.code];
      if (titleEl) titleEl.textContent = row.title || titleEl.textContent;
      if (descEl) descEl.textContent = row.description || descEl.textContent;
    }
  }

  const { data: clanRows } = await supabase
    .from('clan_descriptions')
    .select('code,title')
    .order('sort_order', { ascending: true });

  const clanTitleByCode = new Map((clanRows || []).map((c) => [c.code, c.title || c.code]));

  const cardsRoot = document.getElementById('himejin-cards-root');
  if (!cardsRoot) {
    /* no-op */
  } else {
    const { data: profiles, error: profilesError } = await supabase
      .from('himejin_profiles')
      .select('slug,name,tribe_code,tribe_label,clan_code,tagline,intro,photo_url')
      .eq('status', 'published')
      .order('sort_order', { ascending: true })
      .order('updated_at', { ascending: true });

    if (!profilesError && profiles && profiles.length) {
      cardsRoot.innerHTML = '';
      cardsRoot.classList.add('himejin-cards--grid');

      const frag = document.createDocumentFragment();
      for (const row of profiles) {
        const clanTitle = row.clan_code ? clanTitleByCode.get(row.clan_code) : null;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'himejin-tile';
        btn.setAttribute('data-slug', row.slug || '');
        btn.setAttribute('data-category', row.tribe_code || 'unknown');
        btn.setAttribute('aria-haspopup', 'dialog');

        const metaBits = [esc(row.tribe_label || '')];
        if (clanTitle) metaBits.push(esc(clanTitle));

        btn.innerHTML =
          '<div class="himejin-tile__photo">' +
          photoBlock(row.photo_url, row.name) +
          '</div>' +
          '<div class="himejin-tile__meta">' +
          '<span class="himejin-tile__name">' +
          esc(row.name) +
          '</span>' +
          '<span class="himejin-tile__tags">' +
          metaBits.join(' · ') +
          '</span>' +
          '</div>';

        btn.addEventListener('click', () => {
          const clanBlock =
            clanTitle
              ? '<p class="himejin-modal__clan"><strong>姫路クラン</strong> ' + esc(clanTitle) + '</p>'
              : '';
          const html =
            '<div class="himejin-modal__head">' +
            '<h3 id="himejin-modal-title" class="himejin-modal__title">' +
            esc(row.name) +
            '</h3>' +
            '<p class="himejin-modal__tribe"><strong>種族</strong> ' +
            esc(row.tribe_label || '未判明') +
            '</p>' +
            clanBlock +
            (row.tagline
              ? '<p class="himejin-modal__tagline">' + esc(row.tagline) + '</p>'
              : '') +
            '</div>' +
            '<div class="himejin-modal__body">' +
            '<p class="himejin-modal__intro">' +
            esc(row.intro || '（紹介文は準備中です）') +
            '</p>' +
            '</div>';
          openModal(html);
        });

        frag.appendChild(btn);
      }
      cardsRoot.appendChild(frag);
    }
  }
}
