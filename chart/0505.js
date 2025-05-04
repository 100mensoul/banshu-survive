  <script>
    document.addEventListener('DOMContentLoaded', () => {
      // Firebase 初期化
      const cfg = {
        apiKey: "AIzaSyC6YRajLSSBQQszeaxhSNdj6zs_0-jcXlc",
        authDomain: "banshu-5100b.firebaseapp.com",
        databaseURL: "https://banshu-5100b-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "banshu-5100b",
        storageBucket: "banshu-5100b.appspot.com",
        messagingSenderId: "178397472277",
        appId: "1:178397472277:web:edc9cb8bb9096b605cd01c"
      };
      firebase.initializeApp(cfg);
      const refDB = firebase.database().ref("testcharacters_phase3");

      // DOM取得
      const form          = document.getElementById('person-form');
      const showBtn       = document.getElementById('showDetails');
      const closeBtn      = document.getElementById('closeDetails');
      const saveBtn       = document.getElementById('saveDetails');
      const modal         = document.getElementById('detailsModal');
      const siteContainer = document.getElementById('siteInfos-container');
      const addSiteBtn    = document.getElementById('add-siteInfo');
      const relContainer  = document.getElementById('relations-container');
      const addRelBtn     = document.getElementById('add-relation');
      const listContainer = document.getElementById('person-list');
      const tagInput      = document.getElementById('tags');
      const datalist      = document.getElementById('tagSuggestions');
      let masterData = [];

      // 過去タグ履歴をlocalStorageから取得
      let historyTags = JSON.parse(localStorage.getItem('historyTags') || '[]');
      function updateDatalist() {
        datalist.innerHTML = historyTags.map(t => `<option value="${t}">`).join('');
      }
      updateDatalist();

      // モーダル表示/非表示
      showBtn .addEventListener('click', () => modal.classList.remove('hidden'));
      closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
      saveBtn .addEventListener('click', () => modal.classList.add('hidden'));

      // 行追加
      addSiteBtn.addEventListener('click', () => {
        const d = document.createElement('div'); d.className = 'siteInfo-entry';
        d.innerHTML = `
          <input type="url" class="siteInfo-url" placeholder="URL">
          <input type="text" class="siteInfo-desc" placeholder="説明（公式HPなど）">
        `;
        siteContainer.appendChild(d);
      });
      addRelBtn.addEventListener('click', () => {
        const d = document.createElement('div'); d.className = 'relation-entry';
        d.innerHTML = `
          <input type="text" class="relation-name" placeholder="相手名">
          <input type="text" class="relation-detail" placeholder="エピソード">
        `;
        relContainer.appendChild(d);
      });

      // フォーム送信
      form.addEventListener('submit', e => {
        e.preventDefault();
        const freeTags = tagInput.value.split(',').map(t => t.trim()).filter(Boolean);
        // 新規タグを履歴に追加
        freeTags.forEach(t => {
          if (!historyTags.includes(t)) historyTags.push(t);
        });
        localStorage.setItem('historyTags', JSON.stringify(historyTags));
        updateDatalist();

        const data = {
          realName:        document.getElementById('realName').value.trim(),
          comment:         document.getElementById('comment').value.trim(),
          roleName:        document.getElementById('roleName').value.trim(),
          position:        document.getElementById('position').value.trim(),
          affiliation:     document.getElementById('affiliation').value.trim(),
          fixedTag:        document.getElementById('fixedTag').value,
          freeTags:        freeTags,
          relatedProjects: document.getElementById('relatedProjects').value.split(',').map(t=>t.trim()).filter(Boolean),
          areas:           document.getElementById('areas').value.split(',').map(t=>t.trim()).filter(Boolean),
          sites:           [],
          relations:       [],
          isPublic:        document.getElementById('isPublic').checked,
          updatedAt:       Date.now()
        };
        console.log('Submit data (Phase3):', data);
        siteContainer.querySelectorAll('.siteInfo-entry').forEach(ent => {
          const url  = ent.querySelector('.siteInfo-url').value.trim();
          const desc = ent.querySelector('.siteInfo-desc').value.trim();
          if(url||desc) data.sites.push({url,desc});
        });
        relContainer.querySelectorAll('.relation-entry').forEach(ent => {
          const name   = ent.querySelector('.relation-name').value.trim();
          const detail = ent.querySelector('.relation-detail').value.trim();
          if(name||detail) data.relations.push({name,detail});
        });
        const key = form.dataset.editKey;
        if(key) {
          refDB.child(key).set(data);
          form.dataset.editKey = '';
        } else {
          const newRef = refDB.push();
          newRef.set(data);
        }
        form.reset();
        modal.classList.add('hidden');
      });

      // リアルタイム取得
      refDB.on('value', snap => {
        masterData = [];
        snap.forEach(c => {
          const p = c.val();
          masterData.push({
            _key:             c.key,
            realName:         p.realName || '',
            comment:          p.comment  || '',
            roleName:         p.roleName || '',
            position:         p.position || '',
            affiliation:      p.affiliation || '',
            fixedTag:         p.fixedTag || '',
            freeTags:         Array.isArray(p.freeTags)    ? p.freeTags    : [],
            relatedProjects:  Array.isArray(p.relatedProjects) ? p.relatedProjects : [],
            areas:            Array.isArray(p.areas)       ? p.areas       : [],
            sites:            Array.isArray(p.sites)       ? p.sites       : [],
            relations:        Array.isArray(p.relations)   ? p.relations   : [],
            isPublic:         !!p.isPublic,
            updatedAt:        p.updatedAt || Date.now()
          });
        });
        masterData.sort((a,b)=>b.updatedAt-a.updatedAt);
        renderCards();
      });

      function renderCards() {
        listContainer.innerHTML = '';
        masterData.forEach(p => {
          const card = document.createElement('div'); card.className = 'card';
          if(p.fixedTag) {
            const cls = p.fixedTag==='播州人'?'bg-banshu':p.fixedTag==='NBT'?'bg-nbt':'bg-tosama';
            card.classList.add(cls);
          }
          const tm = new Date(p.updatedAt).toLocaleString('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
          let html = `<strong>更新：</strong>${tm}<br><strong>実名：</strong>${p.realName}<br><strong>コメント：</strong>${p.comment}<details><summary>詳細</summary>`;
          html += `<p><strong>役名：</strong>${p.roleName||'―'}</p><p><strong>肩書き：</strong>${p.position||'―'}</p><p><strong>所属：</strong>${p.affiliation||'―'}</p><p><strong>固定タグ：</strong>${p.fixedTag||'―'}</p>`;
          [['自由タグ', 'freeTags'], ['関連プロジェクト','relatedProjects'], ['エリア','areas']].forEach(([label, key]) => {
            html += `<p><strong>${label}：</strong>${(p[key]||[]).map(t=>`<span class="tag">${t}</span>`).join('')||'―'}</p>`;
          });
          [['サイト情報','sites'], ['関係性','relations']].forEach(([label, key]) => {
            html += `<details><summary>${label}</summary>`;
            p[key].forEach(item => {
              if(key==='sites') html += `<p>${item.desc||''}：<a href="${item.url}" target="_blank">${item.url}</a></p>`;
              else html += `<p>・${item.name||''}：${item.detail||''}</p>`;
            });
            html += `</details>`;
          });
          html += `<p><strong>公開：</strong>${p.isPublic?'公開':'非公開'}</p><button onclick="editPerson('${p._key}')" class="btn">編集</button> <button onclick="deletePerson('${p._key}')" class="btn">削除</button></details>`;
          card.innerHTML = html;
          listContainer.appendChild(card);
        });
      }

      window.editPerson = key => {
        const p = masterData.find(x=>x._key===key);
        form.dataset.editKey = key;
        document.getElementById('realName').value         = p.realName;
        document.getElementById('comment').value          = p.comment;
        document.getElementById('roleName').value         = p.roleName;
        document.getElementById('position').value         = p.position;
        document.getElementById('affiliation').value      = p.affiliation;
        document.getElementById('relatedProjects').value  = p.relatedProjects.join(', ');
        document.getElementById('areas').value            = p.areas.join(', ');
        document.getElementById('fixedTag').value         = p.fixedTag;
        tagInput.value                                     = p.freeTags.join(', ');
        document.getElementById('isPublic').checked       = p.isPublic;
        siteContainer.innerHTML = '';
        p.sites.forEach(s => {
          const d = document.createElement('div'); d.className='siteInfo-entry';
          d.innerHTML = `<input type="url" class="siteInfo-url" value="${s.url||''}"><input type="text" class="siteInfo-desc" value="${s.desc||''}">`;
          siteContainer.appendChild(d);
        });
        relContainer.innerHTML = '';
        p.relations.forEach(r => {
          const d = document.createElement('div'); d.className='relation-entry';
          d.innerHTML = `<input type="text" class="relation-name" value="${r.name||''}"><input type="text" class="relation-detail" value="${r.detail||''}">`;
          relContainer.appendChild(d);
        });
        modal.classList.remove('hidden');
      };

      window.deletePerson = key => {
        if(confirm('このデータを削除しますか？')) refDB.child(key).remove();
      };
    });
  </script>
