import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, query, orderBy,
  onSnapshot, serverTimestamp, doc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js";

// Firebase設定
const firebaseConfig = {
  apiKey: "あなたのAPIキー",
  authDomain: "u2memo-36f61.firebaseapp.com",
  projectId: "u2memo-36f61",
  storageBucket: "u2memo-36f61.appspot.com",
  messagingSenderId: "14274931072",
  appId: "1:14274931072:web:5d9c9026905fdc0b383965"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

const form = document.getElementById("diaryForm");
const list = document.getElementById("diaryList");
const modal = document.getElementById("editModal");
const editTitle = document.getElementById("editTitle");
const editContent = document.getElementById("editContent");
const editTags = document.getElementById("editTags");
const saveEdit = document.getElementById("saveEdit");
const cancelEdit = document.getElementById("cancelEdit");

let currentEditId = null;

// モーダル閉じる
cancelEdit.onclick = () => {
  modal.style.display = "none";
  currentEditId = null;
};

// 編集保存
saveEdit.onclick = async () => {
  if (!currentEditId) return;
  const docRef = doc(db, "diaryEntries", currentEditId);
  await updateDoc(docRef, {
    title: editTitle.value,
    content: editContent.value,
    tags: editTags.value.split(",").map(t => t.trim()).filter(Boolean)
  });
  modal.style.display = "none";
  currentEditId = null;
};

// 投稿処理
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const title = document.getElementById("titleInput").value;
  const content = document.getElementById("contentInput").value;
  const tags = document.getElementById("tagInput").value.split(",").map(t => t.trim()).filter(Boolean);
  const file = document.getElementById("imageInput").files[0];

  let imageUrl = "";

  try {
    if (file) {
      const encodedFileName = encodeURIComponent(file.name); // ← ここが重要！
      const fileRef = ref(storage, `diary/${Date.now()}_${encodedFileName}`);
      console.log("アップロード先:", fileRef.fullPath);

      const snapshot = await uploadBytes(fileRef, file);
      console.log("アップロード成功:", snapshot);

      imageUrl = await getDownloadURL(fileRef);
      console.log("画像URL:", imageUrl);
    }

    await addDoc(collection(db, "diaryEntries"), {
      title,
      content,
      tags,
      imageUrl,
      createdAt: serverTimestamp()
    });

    form.reset();
    alert("投稿が完了しました！");
  } catch (error) {
    console.error("アップロードまたは投稿でエラー:", error);
    alert("画像アップロードエラー：" + error.message);
  }
});

// 表示・編集・削除処理
const q = query(collection(db, "diaryEntries"), orderBy("createdAt", "desc"));
onSnapshot(q, (snapshot) => {
  list.innerHTML = "";
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
      ${data.imageUrl ? `<img src="${data.imageUrl}" alt="画像" />` : ""}
      <h2>${data.title}</h2>
      <p>${data.content}</p>
      <div class="tags">${data.tags.map(tag => `#${tag}`).join(" ")}</div>
      <time>${data.createdAt?.toDate().toLocaleString() ?? ""}</time>
      <div class="actions">
        <button class="editBtn" data-id="${docSnap.id}" data-title="${data.title}" data-content="${data.content}" data-tags="${data.tags.join(',')}">編集</button>
        <button class="deleteBtn" data-id="${docSnap.id}" data-image="${data.imageUrl || ''}">削除</button>
      </div>
    `;

    div.querySelector(".editBtn").onclick = (e) => {
      currentEditId = e.target.dataset.id;
      editTitle.value = e.target.dataset.title;
      editContent.value = e.target.dataset.content;
      editTags.value = e.target.dataset.tags;
      modal.style.display = "flex";
    };

    div.querySelector(".deleteBtn").onclick = async (e) => {
      const id = e.target.dataset.id;
      const imageUrl = e.target.dataset.image;
      if (confirm("この投稿を削除しますか？")) {
        await deleteDoc(doc(db, "diaryEntries", id));
        if (imageUrl) {
          const path = new URL(imageUrl).pathname.split("/o/")[1].split("?")[0];
          const decodedPath = decodeURIComponent(path);
          const imageRef = ref(storage, decodedPath);
          await deleteObject(imageRef);
        }
      }
    };

    list.appendChild(div);
  });
});
