import { db } from "./firebase-config.js";
import {
  ref,
  push,
  onValue,
  remove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const form = document.getElementById("addCharacterForm");
const list = document.getElementById("characterList");
const charRef = ref(db, "characters");

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

onValue(charRef, (snapshot) => {
  list.innerHTML = "<h2>登録済みキャラクター</h2>";
  snapshot.forEach((child) => {
    const { name, description, group } = child.val();
    const div = document.createElement("div");
    div.className = "character-card";
    div.innerHTML = `
      <h3>${name} <span class="group">[${group}]</span></h3>
      <p>${description}</p>
      <button onclick="deleteCharacter('${child.key}')">削除</button>
    `;
    list.appendChild(div);
  });
});

// グローバルに削除関数を登録
window.deleteCharacter = (key) => {
  const target = ref(db, "characters/" + key);
  remove(target);
};