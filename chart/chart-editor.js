import { db } from "./firebase-config.js";
import {
  ref,
  push,
  onValue,
  remove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// DOM取得
const form = document.getElementById("addCharacterForm");
const list = document.getElementById("characterList");

// DBの参照先
const charRef = ref(db, "characters");

// キャラクター追加処理
form.addEventListener("submit", (e) => {
  e.preventDefault();

  const name = document.getElementById("name").value.trim();
  const desc = document.getElementById("description").value.trim();
  const group = document.getElementById("group").value;

  if (name && desc) {
    push(charRef, { name, description: desc, group });
    form.reset();
  }
});

// データ読み込み＆表示（リアルタイム更新）
onValue(charRef, (snapshot) => {
  list.innerHTML = "<h2>登録済みキャラクター</h2>";

  if (!snapshot.exists()) {
    list.innerHTML += "<p>まだキャラクターが登録されていません。</p>";
    return;
  }

  snapshot.forEach((child) => {
    const key = child.key;
    const { name, description, group } = child.val();

    const div = document.createElement("div");
    div.className = "character-card";
    div.innerHTML = `
      <h3>${name} <span class="group">[${group}]</span></h3>
      <p>${description}</p>
      <button data-key="${key}" class="delete-btn">削除</button>
    `;
    list.appendChild(div);
  });

  // 削除ボタンのイベント設定
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-key");
      const target = ref(db, "characters/" + key);
      remove(target);
    });
  });
});