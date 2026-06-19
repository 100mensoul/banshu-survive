/**
 * ヒメログ公開ページ
 * himelog_entries テーブルから status='published' のメモを新しい順で読み込み、
 * カード表示する。タグでの絞り込みに対応。
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
};

const listEl = document.getElementById('himelog-list');
const filterbarEl = document.getElementById('tag-filterbar');
const tagFiltersEl = document.getElementById('tag-filters');
const tagClearEl = document.getElementById('tag-clear');

let allEntries = [];
let activeTag = null;

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

function renderTagFilters() {
  const tagSet = new Set();
  allEntries.forEach((e) => {
    (e.tags || []).forEach((t) => { if (t) tagSet.add(t); });
  });
  const tags = Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'ja'));

  if (!tags.length) {
    filterbarEl.hidden = true;
    return;
  }
  filterbarEl.hidden = false;
  tagFiltersEl.innerHTML = '';
  tags.forEach((tag) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'himelog-tag' + (activeTag === tag ? ' himelog-tag--active' : '');
    btn.textContent = '#' + tag;
    btn.addEventListener('click', () => {
      activeTag = activeTag === tag ? null : tag;
      renderTagFilters();
      renderList();
    });
    tagFiltersEl.appendChild(btn);
  });
  tagClearEl.hidden = !activeTag;
}

tagClearEl.addEventListener('click', () => {
  activeTag = null;
  renderTagFilters();
  renderList();
});

function cardHtml(entry) {
  const typeLabel = MEMO_TYPE_LABEL[entry.memo_type] || '';
  const typeHtml = typeLabel ? `<span class="himelog-card-type">${esc(typeLabel)}</span>` : '';
  const titleHtml = entry.title ? `<h2 class="himelog-card-title">${esc(entry.title)}</h2>` : '';
  const bodyHtml = `<div class="himelog-card-body">${marked.parse(entry.body || '')}</div>`;

  const tags = entry.tags || [];
  const tagsHtml = tags.length
    ? `<span class="himelog-card-tags">${tags
        .map((t) => `<span class="himelog-tag">#${esc(t)}</span>`)
        .join('')}</span>`
    : '';

  const epHtml = entry.related_episode_slug
    ? `<a class="himelog-card-episode" href="../html/episode.html?slug=${encodeURIComponent(entry.related_episode_slug)}">関連エピソードへ →</a>`
    : '';

  const dateHtml = `<span class="himelog-card-date">${esc(formatDate(entryDateIso(entry)))}</span>`;

  return `
    <article class="himelog-card">
      ${typeHtml}
      ${titleHtml}
      ${bodyHtml}
      <div class="himelog-card-meta">
        ${tagsHtml}
        ${epHtml}
        ${dateHtml}
      </div>
    </article>
  `;
}

function renderList() {
  const entries = activeTag
    ? allEntries.filter((e) => (e.tags || []).includes(activeTag))
    : allEntries;

  if (!entries.length) {
    listEl.innerHTML = '<p class="himelog-empty">まだ公開されたメモはありません。</p>';
    return;
  }
  listEl.innerHTML = entries.map(cardHtml).join('');
}

async function init() {
  const url = window.__SB_URL;
  const key = window.__SB_ANON_KEY;
  const keyOk = key && String(key).trim().length > 0;
  const urlOk = url && String(url).trim().length > 0 && !String(url).includes('あなたのプロジェクトID');

  if (!urlOk || !keyOk) {
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
  } catch (e) {
    listEl.innerHTML = `<p class="himelog-error">読み込みエラー: ${esc(e.message)}</p>`;
  }
}

init();
