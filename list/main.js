// ===== File Structure =====
// /list/
//   ├── index-0504-new.html   ← HTML (参照のみ)
//   └── js/
//       ├── firebase-config.js ← 既存ファイル（initializeApp + exports）
//       └── main.js            ← 新規作成ファイル

/* ==== HTML File: index-0504-new.html ==== */
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>ヒメラボ（Hime Lab）｜播州サバイブ リサーチログ</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <h1>ヒメラボ（Hime Lab） リサーチログ</h1>

  <form id="form">
    <!-- フォーム要素省略 -->
  </form>

  <!-- 詳細モーダル省略 -->

  <div id="tagFilters"></div>
  <input type="text" id="textSearch" placeholder="キーワード検索">
  <div id="projectList"></div>

  <!-- モジュールを読み込むだけ -->
  <script type="module" src="./js/main.js"></script>
</body>
</html>

/* ==== JavaScript File: js/main.js ==== */
import { projectsRef, push, onChildAdded } from './firebase-config.js';

// DOM 要素取得
const form       = document.getElementById('form');
const list       = document.getElementById('projectList');
const tagFilters = document.getElementById('tagFilters');
const searchBox  = document.getElementById('textSearch');
const modal      = document.getElementById('modal');
const relCont    = document.getElementById('relationsContainer');
const sitesCont  = document.getElementById('sitesContainer');
const freeList   = document.getElementById('freeTagList');

// アプリ状態
const state = {
  projects: [],
  uniqueTags: new Set(),
  filterTag: null,
  filterText: ''
};

// フォーム送信
form.addEventListener('submit', async e => {
  e.preventDefault();
  const data = {
    fixedTag: form.fixedTag.value,
    freeTag: form.freeTagInput.value,
    name: form.name.value,
    location: form.location.value,
    relations: Array.from(relCont.children).map(d => ({ type: d.children[0].value, name: d.children[1].value })),
    sites: Array.from(sitesCont.children).map(d => ({ desc: d.children[0].value, url: d.children[1].value })),
    mapUrl: '',
    createdAt: Date.now()
  };
  await push(projectsRef, data);
  form.reset();
  relCont.innerHTML = '';
  sitesCont.innerHTML = '';
  updateFreeDatalist();
});

// モーダル開閉
document.getElementById('openDetails').onclick = () => modal.style.display = 'flex';
modal.querySelector('.modal-close').onclick = () => modal.style.display = 'none';

// 関係者追加／サイト追加
document.getElementById('addRelation').onclick = () => {
  const d = document.createElement('div');
  d.innerHTML = '<input placeholder="関係の種類"><input placeholder="名前">';
  relCont.appendChild(d);
};

document.getElementById('addSite').onclick = () => {
  const d = document.createElement('div');
  d.innerHTML = '<input placeholder="サイト概要"><input placeholder="URL">';
  sitesCont.appendChild(d);
};

// データ購読
onChildAdded(projectsRef, snap => {
  const d = snap.val();
  state.projects.push(d);
  state.uniqueTags.add(d.fixedTag);
  if (d.freeTag) state.uniqueTags.add(d.freeTag);
  renderFilters();
  renderList();
});

// フィルタ描画
function renderFilters() {
  tagFilters.innerHTML = '';
  state.uniqueTags.forEach(tag => {
    const b = document.createElement('button');
    b.textContent = tag;
    b.onclick = () => { state.filterTag = tag; renderList(); };
    tagFilters.appendChild(b);
  });
  const c = document.createElement('button');
  c.textContent = 'すべて表示';
  c.className = 'clear';
  c.onclick = () => { state.filterTag = null; renderList(); };
  tagFilters.appendChild(c);
}

// テキスト検索
searchBox.oninput = () => { state.filterText = searchBox.value; renderList(); };

// リスト描画
function renderList() {
  list.innerHTML = '';
  state.projects.forEach(d => {
    const matchTag = !state.filterTag || d.fixedTag === state.filterTag || d.freeTag === state.filterTag;
    const text = `${d.name} ${d.location}`;
    const matchText = !state.filterText || text.includes(state.filterText);
    if (matchTag && matchText) appendCard(d);
  });
}

// カード表示
function appendCard(d) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.fixed = d.fixedTag;
  card.dataset.free = d.freeTag;
  const freeBadge = d.freeTag ? `<div class="badge" style="background:${randomColor()}">${d.freeTag}</div>` : '';
  card.innerHTML = `
    <h2>${d.name}</h2>
    <div class="badge">${d.fixedTag}</div>
    ${freeBadge}
    <p><strong>所在地：</strong>${d.location}</p>
  `;
  list.prepend(card);
}

// ヘルパー
function randomColor() {
  return `hsl(${Math.floor(Math.random() * 360)},70%,60%)`;
}

function updateFreeDatalist() {
  freeList.innerHTML = '';
  state.uniqueTags.forEach(t => {
    if (t.startsWith('#')) {
      const opt = document.createElement('option');
      opt.value = t;
      freeList.appendChild(opt);
    }
  });
}
