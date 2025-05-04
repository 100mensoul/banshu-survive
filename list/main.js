<!-- File: /list/js/firebase-config.js -->
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, push as firebasePush, onChildAdded } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// Firebase 設定
const firebaseConfig = {
  apiKey: "AIzaSyCtDPnYex-KL2hbHAQe5fYSPv9rz9xTa9A",
  authDomain: "u2memo-36f61.firebaseapp.com",
  databaseURL: "https://u2memo-36f61-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "u2memo-36f61",
  storageBucket: "u2memo-36f61.appspot.com",
  messagingSenderId: "14274931072",
  appId: "1:14274931072:web:5d9c9026905fdc0b383965"
};

// 初期化
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
export const projectsRef = ref(db, 'projects');
export const push = firebasePush;
export { onChildAdded };

<!-- File: /list/js/main.js -->
import { projectsRef, push, onChildAdded } from './firebase-config.js';

// DOM 要素
const form       = document.getElementById('form');
const list       = document.getElementById('projectList');
const tagFilters = document.getElementById('tagFilters');
const searchBox  = document.getElementById('textSearch');
const modal      = document.getElementById('modal');
const relCont    = document.getElementById('relationsContainer');
const sitesCont  = document.getElementById('sitesContainer');
const freeList   = document.getElementById('freeTagList');

// アプリ状態
const state = { projects: [], uniqueTags: new Set(), filterTag: null, filterText: '' };

// フォーム送信
form.addEventListener('submit', async e => {
  e.preventDefault();
  const data = {
    fixedTag: document.getElementById('fixedTag').value,
    freeTag:  document.getElementById('freeTagInput').value,
    name:     document.getElementById('nameInput').value,
    location: document.getElementById('locationInput').value,
    relations: Array.from(relCont.children).map(d => ({ type: d.children[0].value, name: d.children[1].value })),
    sites:     Array.from(sitesCont.children).map(d => ({ desc: d.children[0].value, url: d.children[1].value })),
    mapUrl:    '',
    createdAt: Date.now()
  };
  await push(projectsRef, data);
  form.reset(); relCont.innerHTML=''; sitesCont.innerHTML=''; updateFreeDatalist();
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
  const d = snap.val(); state.projects.push(d);
  state.uniqueTags.add(d.fixedTag); if(d.freeTag) state.uniqueTags.add(d.freeTag);
  renderFilters(); renderList();
});

// フィルタ描画
function renderFilters() {
  tagFilters.innerHTML=''; state.uniqueTags.forEach(tag=>{
    const btn=document.createElement('button'); btn.textContent=tag;
    btn.onclick=()=>{state.filterTag=tag; renderList();}; tagFilters.appendChild(btn);
  });
  const clearBtn=document.createElement('button'); clearBtn.textContent='すべて表示'; clearBtn.className='clear';
  clearBtn.onclick=()=>{state.filterTag=null; renderList();}; tagFilters.appendChild(clearBtn);
}

// 検索バインド
searchBox.oninput=()=>{state.filterText=searchBox.value; renderList();};

// リスト描画
function renderList(){ list.innerHTML=''; state.projects.forEach(d=>{
  const matchTag = !state.filterTag || d.fixedTag===state.filterTag || d.freeTag===state.filterTag;
  const txt = `${d.name} ${d.location}`;
  const matchText = !state.filterText || txt.includes(state.filterText);
  if(matchTag && matchText) appendCard(d);
}); }

// カード追加
function appendCard(d){ const card=document.createElement('div'); card.className='card';
  card.dataset.fixed=d.fixedTag; card.dataset.free=d.freeTag;
  const freeBadge=d.freeTag?`<div class="badge" style="background:${randomColor()}">${d.freeTag}</div>`:'';
  card.innerHTML=`<h2>${d.name}</h2><div class="badge">${d.fixedTag}</div>${freeBadge}<p><strong>所在地：</strong>${d.location}</p>`;
  list.prepend(card);
}

// ヘルパー
function randomColor(){return `hsl(${Math.floor(Math.random()*360)},70%,60%)`;} function updateFreeDatalist(){freeList.innerHTML=''; state.uniqueTags.forEach(t=>{ if(t.startsWith('#')){ const o=document.createElement('option'); o.value=t; freeList.appendChild(o);} }); }

