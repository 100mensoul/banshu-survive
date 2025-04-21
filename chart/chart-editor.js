import { db } from "./firebase-config.js";
import {
  ref,
  push,
  set,
  onValue,
  remove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const form = document.getElementById("addCharacterForm");
const list = document.getElementById("characterList");

let editingKey = null;
let currentFilter = "all";
const charRef = ref(db, "characters");

// カテゴリフィルター処理
document.querySelectorAll(".category-filter button").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentFilter = btn.getAttribute("data-filter");
    renderCharacters(); // フィルター反映
  });
});

// キャラクター追加 or 編集
form.addEventListener("submit", (e) => {
  e.preventDefault();

  const name = document.getElementById("name").value.trim();
  const desc = document.getElementById("description").value.trim();
  const group = document.getElementById("group").value;
  const writer = document.getElementById("writer").value.trim();
  const url = document.getElementById("url").value.trim();
  const timestamp = Date.now();

  if (name && desc && writer) {
    const data = { name, description: desc, group, writer, timestamp };
    if (url) data.url = url;

    if (editingKey) {
      set(ref(db, `characters/${editingKey}`), data);
      editingKey = null;
      form.querySelector("button").textContent = "追加する";
    } else {
      push(charRef, data);
    }

    form.reset();
  }
});

// 表示描画関数（カテゴリ絞り込み、降順表示）
function renderCharacters() {
  onValue(charRef, (snapshot) => {
    list.innerHTML = "<h2>登録済みキャラクター</h2>";

    if (!snapshot.exists()) {
      list.innerHTML += "<p>まだキャラクターが登録されていません。</p>";
      return;
    }

    const items = [];

    snapshot.forEach((child) => {
      const key = child.key;
      const { name, description, group, writer, timestamp, url } = child.val();
      if (currentFilter === "all" || group === currentFilter) {
        items.push({ key, name, description, group, writer, timestamp, url });
      }
    });

    // 新着順（降順）
    items.sort((a, b) => b.timestamp - a.timestamp);

    for (const item of items) {
      const date = new Date(item.timestamp);
      const timeStr = date.toLocaleString("ja-JP");

      const div = document.createElement("div");
      div.className = "character-card";
      div.innerHTML = `
        <h3>${item.name} <span class="group">[${item.group}]</span></h3>
        <p>${item.description}</p>
        ${item.url ? `<p><a href="${item.url}" target="_blank">関連リンク</a></p>` : ""}
        <p><small>記入：${item.writer}｜${timeStr}</small></p>
        <button data-key="${item.key}" class="edit-btn">編集</button>
        <button data-key="${item.key}" class="delete-btn">削除</button>
      `;
      list.appendChild(div);
    }

    // 編集機能
    document.querySelectorAll(".edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-key");
        const target = items.find(i => i.key === key);
        document.getElementById("name").value = target.name;
        document.getElementById("description").value = target.description;
        document.getElementById("group").value = target.group;
        document.getElementById("writer").value = target.writer;
        document.getElementById("url").value = target.url || "";
        editingKey = key;
        form.querySelector("button").textContent = "更新する";
        window.scrollTo(0, 0);
      });
    });

    // 削除機能
    document.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-key");
        const target = ref(db, "characters/" + key);
        remove(target);
      });
    });
  });
}

// 初期表示
renderCharacters();