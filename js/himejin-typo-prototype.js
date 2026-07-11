import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TRIBE_STAGE = {
  banshujin: {
    accent: '#9fc99f',
    bg: 'linear-gradient(160deg, #121a14 0%, #0a100c 55%, #060a08 100%)',
  },
  nbt: {
    accent: '#fff100',
    bg: 'linear-gradient(160deg, #1a1810 0%, #0f0e08 55%, #080806 100%)',
  },
  himejin: {
    accent: '#8ec0ff',
    bg: 'linear-gradient(160deg, #10141c 0%, #0a0d14 55%, #060810 100%)',
  },
  unknown: {
    accent: 'rgba(236, 239, 233, 0.55)',
    bg: 'linear-gradient(160deg, #121412 0%, #0a0c0a 55%, #060806 100%)',
  },
};

const STATIC_FALLBACK = [
  {
    slug: 'kurabayashi',
    name: '倉林',
    tribe_code: 'nbt',
    tribe_label: 'NEOバンシュウ族',
    tagline: '想いを形にする建築家',
    intro:
      '姫路在住の建築家。ツインコモンズから車で5分、奇跡的なご近所さん。静かな佇まいの奥に情熱を秘めている。Rの自由すぎる構想を「嵐」と呼びながらも、寛大に受け入れ、理念の根底を理解した上で形にしていく。Rと同年代。',
    photo_url: '',
  },
  {
    slug: 'hashimoto',
    name: '橋本',
    tribe_code: 'banshujin',
    tribe_label: '播州族',
    tagline: '内と外をつなぐ道先案内人',
    intro:
      '「ウント」という社名が象徴するように、人と人、内と外をつなぐ仕事をしている。学生にも教え、姫路の中枢ネットワークに精通する。外からやってきたRにとっての良きアドバイザーにしてメンター。40代なかば、Rのお兄さん的存在。',
    photo_url: '',
  },
  {
    slug: 'inada',
    name: '稲田',
    tribe_code: 'banshujin',
    tribe_label: '播州族',
    tagline: '仏の笑顔で夢を聴く人',
    intro:
      '代々の会社を営みながら、土地を活かした社会貢献に取り組む。姫路の再開発事業の立役者の一人。商工会議所の要職にあり、普通なら届かないところへの橋を架けてくれる。農業、食、教育——Rと目指す方向が重なるキーパーソン。物腰は柔らかく、いつも笑ってRの夢を聞いてくれる。美術館の仕事も手がける。',
    photo_url: '',
  },
  {
    slug: 'yasuda',
    name: '安田さん',
    tribe_code: 'banshujin',
    tribe_label: '播州族',
    tagline: '',
    intro: '（紹介文は準備中です）',
    photo_url: '',
  },
  {
    slug: 'banshu-taro',
    name: '播州太郎',
    tribe_code: 'unknown',
    tribe_label: '未判明',
    tagline: '',
    intro: '（紹介文は準備中です）',
    photo_url: '',
  },
  {
    slug: 'harima-hanako',
    name: '播磨花子',
    tribe_code: 'himejin',
    tribe_label: '播州人',
    tagline: '',
    intro: '（紹介文は準備中です）',
    photo_url: '',
  },
  {
    slug: 'mizushima',
    name: '水嶋',
    tribe_code: 'unknown',
    tribe_label: '外様',
    tagline: '',
    intro: '（紹介文は準備中です）',
    photo_url: '',
  },
];

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

/** 文字ごとにサイズ階層を割り当て（躍動感のリズム） */
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
  return TRIBE_STAGE[code] ? code : 'unknown';
}

function openModal(row, clanTitle) {
  const modal = document.getElementById('typo-modal');
  const body = document.getElementById('typo-modal-body');
  if (!modal || !body) return;

  const code = tribeCode(row);
  const stage = TRIBE_STAGE[code];
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

  const stageEl = modal.querySelector('.typo-modal__stage');
  if (stageEl) {
    stageEl.style.setProperty('--typo-stage-bg', stage.bg);
    stageEl.style.setProperty('--typo-stage-accent', stage.accent);
    stageEl.style.background = stage.bg;
  }

  modal.hidden = false;
  document.documentElement.classList.add('typo-modal-open');
}

function closeModal() {
  const modal = document.getElementById('typo-modal');
  if (!modal) return;
  modal.hidden = true;
  document.documentElement.classList.remove('typo-modal-open');
  const body = document.getElementById('typo-modal-body');
  if (body) body.innerHTML = '';
}

function bindModalUi() {
  const modal = document.getElementById('typo-modal');
  if (!modal || modal.dataset.bound === '1') return;
  modal.dataset.bound = '1';
  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-modal]')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });
}

function renderIndex(profiles, clanTitleByCode) {
  const root = document.getElementById('typo-index-root');
  if (!root) return;

  const frag = document.createDocumentFragment();
  profiles.forEach((row) => {
    const code = tribeCode(row);
    const clanTitle = row.clan_code ? clanTitleByCode.get(row.clan_code) : null;
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
    btn.addEventListener('click', () => openModal(row, clanTitle));
    frag.appendChild(btn);
  });
  root.innerHTML = '';
  root.appendChild(frag);
}

async function loadProfiles() {
  const url = window.__SB_URL;
  const key = window.__SB_ANON_KEY;
  const keyOk = key && String(key).trim().length > 0;
  const urlOk =
    url &&
    String(url).trim().length > 0 &&
    !String(url).includes('あなたのプロジェクトID');

  if (!keyOk || !urlOk) {
    return { profiles: STATIC_FALLBACK, clanTitleByCode: new Map() };
  }

  const supabase = createClient(url, key);
  const clanTitleByCode = new Map();

  const { data: clanRows } = await supabase
    .from('clan_descriptions')
    .select('code,title')
    .order('sort_order', { ascending: true });
  for (const c of clanRows || []) {
    clanTitleByCode.set(c.code, c.title || c.code);
  }

  const { data: profiles, error } = await supabase
    .from('himejin_profiles')
    .select('slug,name,tribe_code,tribe_label,clan_code,tagline,intro,photo_url')
    .eq('status', 'published')
    .order('sort_order', { ascending: true })
    .order('updated_at', { ascending: true });

  if (error || !profiles || !profiles.length) {
    return { profiles: STATIC_FALLBACK, clanTitleByCode };
  }
  return { profiles, clanTitleByCode };
}

bindModalUi();
const { profiles, clanTitleByCode } = await loadProfiles();
renderIndex(profiles, clanTitleByCode);
