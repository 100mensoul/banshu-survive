// -----------------------------------------
// File: /list/index-0504-new.html
//  (HTML部分は既に作成済み)
// -----------------------------------------

/* ==== JavaScript File: /list/js/data.js ==== */
import { projectsRef, onChildAdded } from './firebase-config.js';

/**
 * subscribeProjects(callback)
 * - 新規追加を購読し、(key, data) を通知
 */
export function subscribeProjects(callback) {
  onChildAdded(projectsRef, snapshot => {
    callback(snapshot.key, snapshot.val());
  });
}

/* ==== JavaScript File: /list/js/render.js ==== */
/**
 * renderTagButtons(container, uniqueTags, onClick)
 * - ユニークなタグ集合からボタンを描画
 */
export function renderTagButtons(container, uniqueTags, onClick) {
  container.innerHTML = '';
  uniqueTags.forEach(tag => {
    const btn = document.createElement('button');
    btn.textContent = tag;
    btn.addEventListener('click', () => onClick(tag));
    container.appendChild(btn);
  });
  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'すべて表示';
  clearBtn.classList.add('clear');
  clearBtn.addEventListener('click', () => onClick(null));
  container.appendChild(clearBtn);
}

/**
 * renderCard(container, data)
 * - 単純なカード表示
 */
export function renderCard(container, data) {
  const card = document.createElement('div');
  card.className = 'card';
  // 固定タグ・自由タグをデータ属性として保持
  card.dataset.fixed = data.fixedTag || '';
  card.dataset.free  = data.freeTag  || '';
  // カード内容を構築
  card.innerHTML = `
    <h2>${data.name}</h2>
    <div class="badge">${data.fixedTag || ''}</div>
    ${data.freeTag ? `<div class="badge" style="background:${randomColor()}">${data.freeTag}</div>` : ''}
    <p><strong>所在地：</strong>${data.location}</p>
    ${data.relations ? data.relations.map(r => `<p>#${r.type}：${r.name}</p>`).join('') : ''}
    ${data.sites ? data.sites.map(s => `<p><a href="${s.url}" target="_blank">${s.desc}</a></p>`).join('') : ''}
    ${data.mapUrl ? `<p><a href="${data.mapUrl}" target="_blank">地図で見る</a></p>` : ''}
  `;
  container.prepend(card);
}

function randomColor() {
  const h = Math.floor(Math.random() * 360);
  return `hsl(${h},70%,60%)`;
}

/* ==== JavaScript File: /list/js/ui.js ==== */
/**
 * initUI()
 * - 各種DOM要素を取得して返す
 */
export function initUI() {
  return {
    formEl: document.getElementById('form'),
    tagFiltersEl: document.getElementById('tagFilters'),
    textSearchEl: document.getElementById('textSearch'),
    projectListEl: document.getElementById('projectList'),
    modalEl: document.getElementById('modal'),
    relationsContainer: document.getElementById('relationsContainer'),
    sitesContainer: document.getElementById('sitesContainer'),
  };
}

/**
 * bindSearch(inputEl, onSearch)
 */
export function bindSearch(inputEl, onSearch) {
  inputEl.addEventListener('input', () => {
    onSearch(inputEl.value.trim());
  });
}

/* ==== JavaScript File: /list/js/main.js ==== */
import { subscribeProjects } from './data.js';
import { renderTagButtons, renderCard } from './render.js';
import { initUI, bindSearch } from './ui.js';
import { push } from './firebase-config.js';

// アプリ状態管理
const state = {
  projects: [],
  uniqueTags: new Set(),
  filterTag: null,
  filterText: ''
};

const ui = initUI();

// フィルター更新と描画
function applyFilters() {
  const { projectListEl } = ui;
  projectListEl.innerHTML = '';
  state.projects.forEach(proj => {
    const tagsArr = proj.tags?.split(',') || [];
    const matchTag  = !state.filterTag  || tagsArr.includes(state.filterTag);
    const matchText = !state.filterText || (`${proj.name} ${proj.location}`).includes(state.filterText);
    if (matchTag && matchText) renderCard(projectListEl, proj);
  });
}

// タグボタンと検索のバインド
renderTagButtons(ui.tagFiltersEl, state.uniqueTags, tag => {
  state.filterTag = tag;
  applyFilters();
});
bindSearch(ui.textSearchEl, text => {
  state.filterText = text;
  applyFilters();
});

// データ購読
subscribeProjects((key, data) => {
  state.projects.push(data);
  // タグセット更新
  const all = [data.fixedTag, data.freeTag];
  all.forEach(t => t && state.uniqueTags.add(t));
  renderTagButtons(ui.tagFiltersEl, state.uniqueTags, tag => {
    state.filterTag = tag;
    applyFilters();
  });
  applyFilters();
});

// フォーム送信処理
ui.formEl.addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(ui.formEl);
  const data = {
    fixedTag: f.get('fixedTag'),
    freeTag:  f.get('freeTagInput'),
    name:     f.get('name'),
    location: f.get('location'),
    createdAt: Date.now()
    // relations, sites, mapUrl はフェーズ②で実装予定
  };
  await push(ui.projectsRef, data);
  ui.formEl.reset();
});
