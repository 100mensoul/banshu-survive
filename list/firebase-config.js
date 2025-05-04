<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <title>ヒメラボ（Hime Lab）｜播州サバイブ リサーチログ</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family:"Hiragino Kaku Gothic ProN",sans-serif; margin:1rem; background:#fffde7; color:#333; }
    h1 { text-align:center; margin-bottom:1rem; font-size:2rem; }
    form { max-width:600px; margin:0 auto 2rem; background:#fff; padding:1.5rem; border-radius:8px; box-shadow:2px 2px 5px rgba(0,0,0,0.1); }
    label { display:block; margin-bottom:0.5rem; font-weight:bold; }
    input, textarea, select, button { width:100%; padding:0.75rem; margin-bottom:1rem; border-radius:6px; box-sizing:border-box; font-size:1rem; }
    input, textarea, select { border:1px solid #ccc; }
    button { background:#4caf50; color:#fff; border:none; cursor:pointer; }
    button.clear { background:#ccc; color:#333; }
    #tagFilters { max-width:600px; margin:0 auto 1rem; display:flex; flex-wrap:wrap; gap:0.5rem; }
    #tagFilters button { padding:0.5rem 1rem; border:none; border-radius:6px; cursor:pointer; background:#eee; }
    #tagFilters button.active { background:#4caf50; color:white; }
    .card { background:white; border-radius:8px; box-shadow:2px 2px 5px rgba(0,0,0,0.1); padding:1rem; margin:1rem auto; max-width:600px; }
    .badge { display:inline-block; padding:0.3rem 0.6rem; border-radius:4px; font-size:0.85rem; color:#fff; margin-right:0.5rem; }
    .card[data-fixed="プロジェクト"] { border-left:4px solid #1976d2; }
    .card[data-fixed="団体・組織"] { border-left:4px solid #388e3c; }
    .card[data-fixed="企業"] { border-left:4px solid #f57c00; }
    .card[data-fixed="個人活動"] { border-left:4px solid #7b1fa2; }
    .card[data-fixed="公共施設"] { border-left:4px solid #0288d1; }
    .card[data-fixed="道の駅"] { border-left:4px solid #d32f2f; }
    .modal { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); justify-content:center; align-items:center; }
    .modal-content { background:white; padding:1rem; border-radius:6px; max-width:500px; width:90%; position:relative; }
    .modal-close { position:absolute; top:0.5rem; right:0.5rem; background:#f44336; color:white; border:none; padding:0.3rem 0.6rem; cursor:pointer; }
  </style>
</head>
<body>
  <h1>ヒメラボ（Hime Lab） リサーチログ</h1>
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
    <div id="relationsContainer"></div>
    <button type="button" id="addSite">サイト追加</button>
    <div id="sitesContainer"></div>
    <button type="submit">追加</button>
  </form>

  <div id="tagFilters"></div>
  <input type="text" id="textSearch" placeholder="キーワード検索" style="max-width:600px; margin:0.5rem auto; display:block;" />
  <div id="projectList"></div>

  <div id="modal" class="modal">
    <div class="modal-content">
      <button class="modal-close">×</button>
      <h2>詳細情報</h2>
      <button type="button" id="addRelation">関係者追加</button>
      <div id="relationsContainer"></div>
    </div>
  </div>

  <script type="module">
    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
    import { getDatabase, ref, push, onChildAdded } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
    // Firebase config
    const firebaseConfig = { apiKey: "AIzaSyCtDPnYex-KL2hbHAQe5fYSPv9rz9xTa9A", authDomain: "u2memo-36f61.firebaseapp.com", databaseURL: "https://u2memo-36f61-default-rtdb.asia-southeast1.firebasedatabase.app", projectId: "u2memo-36f61", storageBucket: "u2memo-36f61.appspot.com", messagingSenderId: "14274931072", appId: "1:14274931072:web:5d9c9026905fdc0b383965" };
    const app = initializeApp(firebaseConfig);
    const db  = getDatabase(app);
    const projectsRef = ref(db, 'projects');

    document.addEventListener('DOMContentLoaded', () => {
      const form      = document.getElementById('form');
      const list      = document.getElementById('projectList');
      const tagFilters= document.getElementById('tagFilters');
      const searchBox = document.getElementById('textSearch');
      const freeList  = document.getElementById('freeTagList');
      const modal     = document.getElementById('modal');
      const relCont   = document.getElementById('relationsContainer');
      const sitesCont = document.getElementById('sitesContainer');
      const freeTags  = new Set();
      let state = { projects: [], uniqueTags: new Set(), filterTag: null, filterText: '' };

      // Form submit
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const data = {
          fixedTag: document.getElementById('fixedTag').value,
          freeTag:  document.getElementById('freeTagInput').value,
          name:     document.getElementById('nameInput').value,
          location: document.getElementById('locationInput').value,
          relations: Array.from(relCont.children).map(div => ({ type: div.querySelector('input').value, name: div.querySelectorAll('input')[1].value })),
          sites: Array.from(sitesCont.children).map(div => ({ desc: div.querySelector('input').value, url: div.querySelectorAll('input')[1].value })),
          mapUrl: '',
          createdAt: Date.now()
        };
        if(data.freeTag) freeTags.add(data.freeTag);
        await push(projectsRef, data);
        form.reset(); relCont.innerHTML=''; sitesCont.innerHTML=''; updateFreeDatalist();
      });

      // Add relation
      document.getElementById('addRelation').addEventListener('click', () => {
        const div = document.createElement('div');
        div.innerHTML = '<input placeholder="関係の種類" /><input placeholder="名前" />';
        relCont.appendChild(div);
      });

      // Add site
      document.getElementById('addSite').addEventListener('click', () => {
        const div = document.createElement('div');
        div.innerHTML = '<input placeholder="サイト概要" /><input placeholder="URL" />';
        sitesCont.appendChild(div);
      });

      // Open modal
      document.getElementById('openDetails').addEventListener('click', () => {
        modal.style.display = 'flex';
      });
      // Close modal
      modal.querySelector('.modal-close').addEventListener('click', () => {
        modal.style.display = 'none';
      });

      // Subscribe projects
      onChildAdded(projectsRef, snap => {
        const d = snap.val();
        state.projects.push(d);
        state.uniqueTags.add(d.fixedTag);
        if(d.freeTag) state.uniqueTags.add(d.freeTag);
        renderFilters(); renderList();
      });

      // Render filters
      function renderFilters() {
        tagFilters.innerHTML = '';
        state.uniqueTags.forEach(tag => {
          const btn = document.createElement('button'); btn.textContent = tag;
          btn.addEventListener('click', () => { state.filterTag = tag; renderList(); });
          tagFilters.appendChild(btn);
        });
        const clear = document.createElement('button'); clear.textContent = 'すべて表示';
        clear.classList.add('clear'); clear.addEventListener('click', () => { state.filterTag = null; renderList(); });
        tagFilters.appendChild(clear);
      }

      // Search
      searchBox.addEventListener('input', () => { state.filterText = searchBox.value; renderList(); });

      // Render list
      function renderList() {
        list.innerHTML = '';
        state.projects.forEach(d => {
          const matchTag = !state.filterTag || d.fixedTag === state.filterTag || d.freeTag === state.filterTag;
          const text = `${d.name} ${d.location}`;
          const matchText = !state.filterText || text.includes(state.filterText);
          if(matchTag && matchText) appendCard(d);
        });
      }

      // Append card
      function appendCard(d) {
        const card = document.createElement('div'); card.className='card';
        card.dataset.fixed = d.fixedTag; card.dataset.free = d.freeTag;
        card.innerHTML = `<h2>${d.name}</h2>
          <div class="badge">${d.fixedTag}</div>
          ${d.freeTag? `<div class="badge" style="background:${randomColor()}">${d.freeTag}</div>`:''}
          <p><strong>所在地：</strong>${d.location}</p>
          ${d.relations? d.relations.map(r=>`<p>${r.type}：${r.name}</p>`).join(''): ''}
          ${d.sites? d.sites.map(s=>`<p><a href="${s.url}" target="_blank">${s.desc}</a></p>`).join(''): ''}
        `;
        list.prepend(card);
      }

      function randomColor() { return `hsl(${Math.floor(Math.random()*360)},70%,60%)`; }
      function updateFreeDatalist() { freeList.innerHTML = ''; freeTags.forEach(t=> freeList.appendChild(Object.assign(document.createElement('option'),{value:t}))); }
    });
  </script>
</body>
</html>
