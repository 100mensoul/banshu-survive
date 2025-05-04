<!-- File: /list/index-0504-new.html -->
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <title>ヒメラボ（Hime Lab）｜播州サバイブ リサーチログ</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    /* 基本スタイル省略: 既存CSSをそのまま利用 */
  </style>
</head>
<body>
  <h1>ヒメラボ（Hime Lab） リサーチログ</h1>

  <!-- 入力フォーム -->
  <form id="form">
    <label for="fixedTag">固定タグ</label>
    <select id="fixedTag" name="fixedTag" required>
      <option value="">選択してください</option>
      <option>プロジェクト</option>
      <option>団体・組織</option>
      <option>企業</option>
      <option>個人活動</option>
      <option>公共施設</option>
      <option>道の駅</option>
    </select>

    <label for="freeTagInput">自由タグ（#付）</label>
    <input list="freeTagList" id="freeTagInput" name="freeTagInput" placeholder="#職人" />
    <datalist id="freeTagList"></datalist>

    <label for="nameInput">施設名・プロジェクト名</label>
    <input type="text" id="nameInput" name="name" placeholder="施設名・プロジェクト名" required />

    <label for="locationInput">所在地（例：長野県信濃町）</label>
    <input type="text" id="locationInput" name="location" placeholder="所在地（例：長野県信濃町）" required />

    <button type="button" id="openDetails">詳細を入力</button>
    <button type="submit">追加</button>
  </form>

  <!-- 詳細モーダル -->
  <div id="modal" class="modal">
    <div class="modal-content">
      <button class="modal-close">×</button>
      <h2>詳細情報</h2>
      <!-- 関係者リスト -->
      <div id="relationsContainer"></div>
      <button type="button" id="addRelation">関係者追加</button>
      <!-- サイトリスト -->
      <div id="sitesContainer"></div>
      <button type="button" id="addSite">サイト追加</button>
    </div>
  </div>

  <!-- フィルタ & 検索 -->
  <div id="tagFilters"></div>
  <input type="text" id="textSearch" placeholder="キーワード検索" />

  <!-- データ表示領域 -->
  <div id="projectList"></div>

  <!-- モジュール読み込み -->
  <script type="module" src="./js/main.js"></script>
</body>
</html>

<!-- File: /list/js/firebase-config.js -->
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, push as firebasePush, onChildAdded } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCtDPnYex-KL2hbHAQe5fYSPv9rz9xTa9A",
  authDomain: "u2memo-36f61.firebaseapp.com",
  databaseURL: "https://u2memo-36f61-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "u2memo-36f61",
  storageBucket: "u2memo-36f61.appspot.com",
  messagingSenderId: "14274931072",
  appId: "1:14274931072:web:5d9c9026905fdc0b383965"
};

// Firebase 初期化
const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);
export const projectsRef = ref(db, 'projects');
export const push        = firebasePush;
export { onChildAdded };

<!-- File: /list/js/main.js -->
import { projectsRef, push, onChildAdded } from './firebase-config.js';

// DOM 要素
const form        = document.getElementById('form');
const list        = document.getElementById('projectList');
const tagFilters  = document.getElementById('tagFilters');
const searchBox   = document.getElementById('textSearch');
const modal       = document.getElementById('modal');
const relCont     = document.getElementById('relationsContainer');
const sitesCont   = document.getElementById('sitesContainer');
const freeList    = document.getElementById('freeTagList');

// アプリ状態
const state = { projects: [], uniqueTags: new Set(), filterTag: null, filterText: '' };

// 新規追加
form.addEventListener('submit', async e => {
  e.preventDefault();
  const data = {
    fixedTag: document.getElementById('fixedTag').value,
    freeTag:  document.getElementById('freeTagInput').value,
    name:     document.getElementById('nameInput').value,
    location: document.getElementById('locationInput').value,
    relations: Array.from(relCont.children).map(div => ({ type: div.children[0].value, name: div.children[1].value })),
    sites:     Array.from(sitesCont.children).map(div => ({ desc: div.children[0].value, url: div.children[1].value })),
    mapUrl:    '',
    createdAt: Date.now()
  };
  await push(projectsRef, data);
  form.reset(); relCont.innerHTML = ''; sitesCont.innerHTML = ''; updateFreeDatalist();
});

// モーダル開閉
document.getElementById('openDetails').onclick = () => modal.style.display = 'flex';
modal.querySelector('.modal-close').onclick      = () => modal.style.display = 'none';

// 関係者追加
document.getElementById('addRelation').onclick = () => {
  const div = document.createElement('div');
  div.innerHTML = '<input placeholder="関係の種類"><input placeholder="名前">';
  relCont.appendChild(div);
};

// サイト追加
document.getElementById('addSite').onclick = () => {
  const div = document.createElement('div');
  div.innerHTML = '<input placeholder="サイト概要"><input placeholder="URL">';
  sitesCont.appendChild(div);
};

// データ購読
onChildAdded(projectsRef, snap => {
  const d = snap.val();
  state.projects.push(d);
  state.uniqueTags.add(d.fixedTag);
  if (d.freeTag) state.uniqueTags.add(d.freeTag);
  renderFilters(); renderList();
});

// フィルタ描画
function renderFilters() {
  tagFilters.innerHTML = '';
  state.uniqueTags.forEach(tag => {
    const btn = document.createElement('button');
    btn.textContent = tag;
    btn.onclick = () => { state.filterTag = tag; renderList(); };
    tagFilters.appendChild(btn);
  });
  const clearBtn = document.createElement('button'); clearBtn.textContent = 'すべて表示';
  clearBtn.className = 'clear'; clearBtn.onclick = () => { state.filterTag = null; renderList(); };
  tagFilters.appendChild(clearBtn);
}

// テキスト検索
searchBox.oninput = () => { state.filterText = searchBox.value; renderList(); };

// リスト描画
function renderList() {
  list.innerHTML = '';
  state.projects.forEach(d => {
    const matchTag  = !state.filterTag || d.fixedTag === state.filterTag || d.freeTag === state.filterTag;
    const text      = `${d.name} ${d.location}`;
    const matchText = !state.filterText || text.includes(state.filterText);
    if (matchTag && matchText) appendCard(d);
  });
}

// カード描画
function appendCard(d) {
  const card = document.createElement('div'); card.className = 'card';
  card.dataset.fixed = d.fixedTag; card.dataset.free = d.freeTag;
  const freeBadge = d.freeTag ? `<div class="badge" style="background:${randomColor()}">${d.freeTag}</div>` : '';
  card.innerHTML = `
    <h2>${d.name}</h2>
    <div class="badge">${d.fixedTag}</div>
    ${freeBadge}
    <p><strong>所在地：</strong>${d.location}</p>
  `;
  list.prepend(card);
}

// ランダムカラー
function randomColor() { return `hsl(${Math.floor(Math.random()*360)},70%,60%)`; }

// datalist 更新
function updateFreeDatalist() {
  freeList.innerHTML = '';
  state.uniqueTags.forEach(t => {
    if (t.startsWith('#')) {
      const opt = document.createElement('option'); opt.value = t;
      freeList.appendChild(opt);
    }
  });
}
