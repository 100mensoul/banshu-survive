import { projectsRef, push, onChildAdded } from "./firebase-config.js";

document.addEventListener("DOMContentLoaded", () => {
  // -------- DOM 取得 --------
  const form   = document.getElementById("form");
  const list   = document.getElementById("projectList");
  const modal  = document.getElementById("modal");
  const relBox = document.getElementById("relationsContainer");
  const siteBox= document.getElementById("sitesContainer");

  const tagFilters = document.getElementById("tagFilters");
  const searchBox  = document.getElementById("textSearch");
  const freeList   = document.getElementById("freeTagList");

  const state = { projects: [], tags: new Set(), filterTag: null, filterText: "" };

  // ---------- 送信 ----------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      fixedTag: form.fixedTag.value,
      freeTag:  form.freeTagInput.value,
      name:     form.name.value,
      location: form.location.value,
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
    form.reset(); relBox.innerHTML = ""; siteBox.innerHTML = "";
  });

  // ---------- モーダル ----------
  document.getElementById("openDetails").onclick = () =>
    (modal.style.display = "flex");
  modal.querySelector(".modal-close").onclick = () =>
    (modal.style.display = "none");

  document.getElementById("addRelation").onclick = () => {
    const d = document.createElement("div");
    d.innerHTML =
      '<input placeholder="関係の種類"><input placeholder="名前">';
    relBox.appendChild(d);
  };

  document.getElementById("addSite").onclick = () => {
    const d = document.createElement("div");
    d.innerHTML =
      '<input placeholder="サイト概要"><input placeholder="URL">';
    siteBox.appendChild(d);
  };

  // ---------- データ購読 ----------
  onChildAdded(projectsRef, (snap) => {
    const d = snap.val();
    state.projects.push(d);
    state.tags.add(d.fixedTag);
    if (d.freeTag) state.tags.add(d.freeTag);
    renderFilters(); renderList();
  });

  // ---------- レンダラ ----------
  function renderFilters() {
    tagFilters.innerHTML = "";
    state.tags.forEach((t) => {
      const b = document.createElement("button");
      b.textContent = t;
      b.onclick = () => { state.filterTag = t; renderList(); };
      tagFilters.appendChild(b);
    });
    const all = document.createElement("button");
    all.textContent = "すべて表示";
    all.className = "clear";
    all.onclick = () => { state.filterTag = null; renderList(); };
    tagFilters.appendChild(all);
  }

  searchBox.oninput = () => {
    state.filterText = searchBox.value;
    renderList();
  };

  function renderList() {
    list.innerHTML = "";
    state.projects.forEach((d) => {
      const byTag  = !state.filterTag ||
                     d.fixedTag === state.filterTag ||
                     d.freeTag  === state.filterTag;
      const byText = !state.filterText ||
                     `${d.name} ${d.location}`.includes(state.filterText);
      if (byTag && byText) list.prepend(makeCard(d));
    });
  }

  function makeCard(d) {
    const wrap = document.createElement("div");
    wrap.className = "card";
    wrap.dataset.fixed = d.fixedTag;
    wrap.dataset.free  = d.freeTag;
    const free = d.freeTag
      ? `<div class="badge" style="background:${randColor()}">${d.freeTag}</div>`
      : "";
    wrap.innerHTML =
      `<h2>${d.name}</h2><div class="badge">${d.fixedTag}</div>${free}` +
      `<p><strong>所在地：</strong>${d.location}</p>`;
    return wrap;
  }

  function randColor() {
    return `hsl(${Math.floor(Math.random() * 360)},70%,60%)`;
  }
});
