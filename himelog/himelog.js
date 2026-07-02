/**
 * ヒメログ公開ページ
 * himelog_entries テーブルから status='published' のメモを新しい順で読み込み、
 * カード表示する。タグでの絞り込み・タグ検索に対応。
 * 本文は Markdown（marked）で整形。RLS により公開分しか取得できない。
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { marked } from 'https://esm.sh/marked@14';

marked.setOptions({ breaks: true, gfm: true });

const MEMO_TYPE_LABEL = {
  note: '取材メモ',
  thought: '所感',
  raw: '未整理',
  seed: 'エピソードのタネ',
  editorial_meeting: '編集会議',
  site_update: 'サイト改修',
  worldbuilding: '世界観構築',
};

function getMemoTypeLabel(type) {
  if (!type) return '';
  return MEMO_TYPE_LABEL[type] || String(type);
}

const listEl = document.getElementById('himelog-list');
const filterbarEl = document.getElementById('tag-filterbar');
const tagFiltersEl = document.getElementById('tag-filters');
const tagClearEl = document.getElementById('tag-clear');
const tagSearchInput = document.getElementById('tag-search-input');
const tagSearchClear = document.getElementById('tag-search-clear');
const tagSearchHint = document.getElementById('tag-search-hint');
const tagSearchWrap = document.getElementById('tag-search-wrap');

let allEntries = [];
let activeTag = null;
let tagSearchQuery = '';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

function entryDateIso(entry) {
  return entry.written_at || entry.published_at || entry.created_at || null;
}

/** 公開ページでは obsidian:// を本文から除去（Vault名・パス露出防止） */
function sanitizePublicBody(body) {
  let s = String(body || '');
  s = s.replace(/\[([^\]]*)\]\(obsidian:\/\/[^)]+\)/gi, '$1');
  s = s.replace(/obsidian:\/\/[^\s)]+/gi, '');
  return s;
}

function plainBodyText(body) {
  return sanitizePublicBody(body)
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/[#>*`_~-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const COLLAPSE_CHAR_THRESHOLD = 240;
const COLLAPSE_LINE_THRESHOLD = 4;

/** 長いメモ・画像付きだけ折りたたみ対象（短いメモにはたたむボタンを出さない） */
function isCollapsible(body) {
  return shouldStartCollapsed(body);
}

/** 長いメモだけ最初から畳む（短い移行メモは最初は開いた状態） */
function shouldStartCollapsed(body) {
  const raw = String(body || '').trim();
  if (!raw) return false;
  if (/!\[[^\]]*\]\([^)]+\)/.test(raw)) return true;
  const plain = plainBodyText(raw);
  const lines = raw.split('\n').filter((l) => l.trim()).length;
  return plain.length > COLLAPSE_CHAR_THRESHOLD || lines > COLLAPSE_LINE_THRESHOLD;
}

function previewText(entry) {
  const plain = plainBodyText(entry.body);
  if (!plain) return '';
  return plain.length > 120 ? plain.slice(0, 120) + '…' : plain;
}

function entryMatchesTagSearch(entry, query) {
  if (!query) return true;
  return (entry.tags || []).some((t) => t && t.includes(query));
}

function getFilteredEntries() {
  let entries = allEntries;
  const q = tagSearchQuery.trim();

  if (q) {
    entries = entries.filter((e) => entryMatchesTagSearch(e, q));
  }
  if (activeTag) {
    entries = entries.filter((e) => (e.tags || []).includes(activeTag));
  }
  return entries;
}

function updateSearchUi() {
  const q = tagSearchQuery.trim();
  tagSearchClear.hidden = !q;
  if (!q) {
    tagSearchHint.hidden = true;
    tagSearchHint.textContent = '';
    return;
  }
  const count = getFilteredEntries().length;
  tagSearchHint.hidden = false;
  tagSearchHint.textContent =
    `「${q}」を含むタグのメモ：${count}件`;
}

function renderTagFilters() {
  const tagSet = new Set();
  allEntries.forEach((e) => {
    (e.tags || []).forEach((t) => { if (t) tagSet.add(t); });
  });
  const tags = Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'ja'));
  const q = tagSearchQuery.trim();

  if (!tags.length) {
    filterbarEl.hidden = true;
    return;
  }
  filterbarEl.hidden = false;
  tagFiltersEl.innerHTML = '';

  const visibleTags = q
    ? tags.filter((tag) => tag.includes(q))
    : tags;

  visibleTags.forEach((tag) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'himelog-tag' + (activeTag === tag ? ' himelog-tag--active' : '');
    btn.textContent = '#' + tag;
    btn.addEventListener('click', () => {
      activeTag = activeTag === tag ? null : tag;
      if (activeTag) {
        tagSearchInput.value = activeTag;
        tagSearchQuery = activeTag;
      }
      renderTagFilters();
      renderList();
      updateSearchUi();
    });
    tagFiltersEl.appendChild(btn);
  });

  tagClearEl.hidden = !activeTag && !q;
}

function clearAllFilters() {
  activeTag = null;
  tagSearchQuery = '';
  tagSearchInput.value = '';
  renderTagFilters();
  renderList();
  updateSearchUi();
}

tagClearEl.addEventListener('click', clearAllFilters);

tagSearchClear.addEventListener('click', clearAllFilters);

tagSearchInput.addEventListener('input', () => {
  tagSearchQuery = tagSearchInput.value;
  const q = tagSearchQuery.trim();
  if (q && activeTag && !activeTag.includes(q)) {
    activeTag = null;
  }
  renderTagFilters();
  renderList();
  updateSearchUi();
});

function cardHtml(entry) {
  const typeLabel = getMemoTypeLabel(entry.memo_type);
  const typeHtml = typeLabel ? `<span class="himelog-card-type">${esc(typeLabel)}</span>` : '';
  const collapsible = isCollapsible(entry.body);
  const startsCollapsed = collapsible && shouldStartCollapsed(entry.body);
  const titleText = entry.title || '';
  const titleHtml = titleText
    ? `<h2 class="himelog-card-title">${esc(titleText)}</h2>`
    : (collapsible ? `<h2 class="himelog-card-title">${esc(previewText(entry))}</h2>` : '');
  const previewHtml = collapsible && titleText && previewText(entry)
    ? `<p class="himelog-card-preview">${esc(previewText(entry))}</p>`
    : '';
  const bodyHtml = `<div class="himelog-card-body">${marked.parse(sanitizePublicBody(entry.body || ''))}</div>`;

  const tags = entry.tags || [];
  const tagsHtml = tags.length
    ? `<span class="himelog-card-tags">${tags
        .map((t) => `<span class="himelog-tag">#${esc(t)}</span>`)
        .join('')}</span>`
    : '';

  const epHtml = entry.related_episode_slug
    ? `<a class="himelog-card-episode" href="../html/episode.html?slug=${encodeURIComponent(entry.related_episode_slug)}">関連エピソードへ →</a>`
    : '';

  const dateStr = formatDate(entryDateIso(entry));
  const dateHtml = dateStr ? `<span class="himelog-card-date">${esc(dateStr)}</span>` : '';
  const topLineHtml =
    typeHtml || dateHtml
      ? `<div class="himelog-card-topline">${typeHtml}${dateHtml}</div>`
      : '';

  const actionsHtml = collapsible
    ? `<div class="himelog-card-actions">
         <button type="button" class="himelog-card-fold himelog-card-fold--open" aria-label="続きを読む">
           <span class="himelog-card-fold-lines" aria-hidden="true">
             <span class="himelog-card-fold-line himelog-card-fold-line--long"></span>
             <span class="himelog-card-fold-line himelog-card-fold-line--mid"></span>
             <span class="himelog-card-fold-line himelog-card-fold-line--short"></span>
           </span>
         </button>
         <button type="button" class="himelog-card-fold himelog-card-fold--collapse" aria-label="たたむ">たたむ</button>
       </div>`
    : '';

  const cardClass = collapsible
    ? (startsCollapsed ? 'himelog-card is-collapsed' : 'himelog-card is-expanded')
    : 'himelog-card is-expanded';

  const footerInner = `${tagsHtml}${epHtml}`;
  const footerHtml = footerInner
    ? `<div class="himelog-card-footer"><div class="himelog-card-meta">${footerInner}</div></div>`
    : '';

  return `
    <article id="himelog-${esc(entry.id)}" class="${cardClass}" data-entry-id="${esc(entry.id)}" data-collapsible="${collapsible ? '1' : '0'}">
      <div class="himelog-card-header">
        <div class="himelog-card-head-main">
          ${topLineHtml}
          ${titleHtml}
          ${previewHtml}
        </div>
      </div>
      <div class="himelog-card-body-wrap">
        ${bodyHtml}
      </div>
      ${footerHtml}
      ${actionsHtml}
    </article>
  `;
}

function setCardExpanded(card, expanded) {
  card.classList.toggle('is-expanded', expanded);
  card.classList.toggle('is-collapsed', !expanded);
  const openBtn = card.querySelector('.himelog-card-fold--open');
  const collapseBtn = card.querySelector('.himelog-card-fold--collapse');
  if (openBtn) openBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  if (collapseBtn) collapseBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

listEl.addEventListener('click', (e) => {
  const openBtn = e.target.closest('.himelog-card-fold--open');
  const collapseBtn = e.target.closest('.himelog-card-fold--collapse');
  if (!openBtn && !collapseBtn) return;
  const card = (openBtn || collapseBtn).closest('.himelog-card');
  if (!card || card.dataset.collapsible !== '1') return;
  if (openBtn) setCardExpanded(card, true);
  if (collapseBtn) setCardExpanded(card, false);
});

function renderList() {
  const entries = getFilteredEntries();
  const q = tagSearchQuery.trim();

  if (!allEntries.length) {
    listEl.innerHTML = '<p class="himelog-empty">まだ公開されたメモはありません。</p>';
    return;
  }

  if (!entries.length) {
    if (q || activeTag) {
      const label = activeTag || q;
      listEl.innerHTML =
        `<p class="himelog-empty">「${esc(label)}」に一致するタグのメモはありません。</p>`;
    } else {
      listEl.innerHTML = '<p class="himelog-empty">該当するメモはありません。</p>';
    }
    return;
  }

  listEl.innerHTML = entries.map(cardHtml).join('');
}

function getEntryIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const id = (params.get('entry') || '').trim();
  if (id) return id;
  const hash = (window.location.hash || '').replace(/^#/, '').trim();
  if (hash.startsWith('himelog-')) return hash.slice('himelog-'.length);
  return '';
}

function focusEntryCard(entryId) {
  if (!entryId) return false;
  const card = document.getElementById(`himelog-${entryId}`);
  if (!card) return false;

  if (card.dataset.collapsible === '1') {
    setCardExpanded(card, true);
  }

  card.classList.add('is-highlight');
  window.setTimeout(() => card.classList.remove('is-highlight'), 2200);

  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}

function openEntryFromUrl() {
  const entryId = getEntryIdFromUrl();
  if (!entryId) return;

  if (!allEntries.some((e) => e.id === entryId)) return;

  if (!getFilteredEntries().some((e) => e.id === entryId)) {
    clearAllFilters();
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      focusEntryCard(entryId);
    });
  });
}

async function init() {
  const url = window.__SB_URL;
  const key = window.__SB_ANON_KEY;
  const keyOk = key && String(key).trim().length > 0;
  const urlOk = url && String(url).trim().length > 0 && !String(url).includes('あなたのプロジェクトID');

  if (!urlOk || !keyOk) {
    tagSearchWrap.hidden = true;
    listEl.innerHTML = '<p class="himelog-error">接続設定がありません。</p>';
    return;
  }

  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from('himelog_entries')
      .select('*')
      .eq('status', 'published')
      .order('created_at', { ascending: false });

    if (error) {
      listEl.innerHTML = `<p class="himelog-error">読み込みエラー: ${esc(error.message)}</p>`;
      return;
    }

    allEntries = data || [];
    renderTagFilters();
    renderList();
    updateSearchUi();
    openEntryFromUrl();
  } catch (e) {
    listEl.innerHTML = `<p class="himelog-error">読み込みエラー: ${esc(e.message)}</p>`;
  }
}

init();
