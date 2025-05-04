import { projectsRef, push, onChildAdded } from "./firebase-config.js";

document.addEventListener("DOMContentLoaded", () => {
  /* ---------- DOM ---------- */
  const form   = document.getElementById("form");
  const list   = document.getElementById("projectList");
  const modal  = document.getElementById("modal");
  const relBox = document.getElementById("relationsContainer");
  const siteBox= document.getElementById("sitesContainer");

  const tagFilters = document.getElementById("tagFilters");
  const searchBox  = document.getElementById("textSearch");
  const freeList   = document.getElementById("freeTagList");

  const state = { projects: [], tags: new Set(), filterTag: null, filterText: "" };

  /* ---------- 送信 ---------- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      fixedTag : form.fixedTag.value,
      freeTag  : form.freeTagInput.value,
      name     : form.name.value,
      location : form.location.value,
      relations: Array.from(relBox.children).map(d => ({
        type: d.children[0]?.value ?? "",
        name: d.children[1]?.value ?? ""
      })),
      sites: Array.from(siteBox.children).map(d => ({
        desc: d.children[0]?.value ?? "",
        url : d.children[1]?.value ?? ""
      })),
      createdAt: Date.now()
    };
    await push(projectsRef, data);
    form.reset(); relBox.innerHTML = ""; siteBox.innerHTML = ""; updateFreeDatalist();
  });

  /* ---------- モーダル ---------- */
  document.getElementById("openDetails").onclick = () => modal.style.display = "flex";
  modal.querySelector(".modal-close").onclick     = () => modal.style.display = "none";

  document.getElementById("addRelation").onclick = () => {
    const div = document.createElement("div");
    div.innerHTML = '<input placeholder="関係の種類"><input placeholder="名前">';
    relBox.appendChild(div);
  };
  document.getElementById("addSite").onclick = () => {
    const div = document.createElement("div");
    div.innerHTML = '<input placeholder="サイト概要"><input placeholder="URL">';
    siteBox.appendChild(div);
  };

  /* ---------- データ購読 ---------- */
  onChildAdded(projectsRef, snap => {
    const d = snap.val();
    state.projects.push(d);
    if (d.fixedTag) state.tags.add(d.fixedTag);
    if (d.freeTag)  state.tags.add(d.freeTag);
    renderFilters(); renderList();
  });

  /* ---------- フィルタ ---------- */
  function renderFilters() {
    tagFilters.innerHTML = "";
    state.tags.forEach(t => {
      if (!t) return;                           // 空文字・undefined を除外
      const b = document.createElement("button");
      b.textContent = t;
      b.onclick = () => { state.filterTag = t; renderList(); };
      tagFilters.appendChild(b);
    });
    const all = document.createElement("button");
    all.textContent = "すべて表示";
    all.className   = "clear";
    all.onclick     = () => { state.filterTag = null; renderList(); };
    tagFilters.appendChild(all);
  }

  /* ---------- 検索 ---------- */
  searchBox.oninput = () => { state.filterText = searchBox.value; renderList(); };

  /* ---------- リスト描画 ---------- */
  function renderList() {
    list.innerHTML = "";
    state.projects.forEach(d => {
      const byTag  = !state.filterTag || d.fixedTag === state.filterTag || d.freeTag === state.filterTag;
      const byText = !state.filterText || `${d.name} ${d.location}`.includes(state.filterText);
      if (byTag && byText) list.prepend(makeCard(d));
    });
  }

  /* ---------- カード生成 ---------- */
  function makeCard(d) {
    const wrap = document.createElement("div");
    wrap.className = "card";

    const badgeF = d.fixedTag
      ? `<div class="badge" style="background:#1976d2">${d.fixedTag}</div>` : "";
    const badgeR = d.freeTag
      ? `<div class="badge" style="background:${randColor()}">${d.freeTag}</div>` : "";

    /* relations / sites は Realtime DB でオブジェクト化されるので Object.values */
    const relHtml  = d.relations
      ? Object.values(d.relations)
          .filter(r => r.type || r.name)
          .map(r => `<p>${r.type}：${r.name}</p>`).join("")
      : "";

    const siteHtml = d.sites
      ? Object.values(d.sites)
          .filter(s => s.url)
          .map(s => `<p><a href="${s.url}" target="_blank">${s.desc || s.url}</a></p>`).join("")
      : "";

    wrap.innerHTML =
      `<h2>${d.name}</h2>${badgeF}${badgeR}
       <p><strong>所在地：</strong>${d.location}</p>
       ${relHtml}${siteHtml}`;

    return wrap;
  }

  /* ---------- 補助 ---------- */
  function randColor() { return `hsl(${Math.floor(Math.random() * 360)},70%,60%)`; }

  function updateFreeDatalist() {
    freeList.innerHTML = "";
    state.tags.forEach(t => {
      if (t.startsWith("#")) {
        const opt = document.createElement("option"); opt.value = t;
        freeList.appendChild(opt);
      }
    });
  }
});
