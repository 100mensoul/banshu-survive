import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCtDPnYex-K...", // あなたのキーで置き換えてね
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

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const title = document.getElementById("titleInput").value;
  const content = document.getElementById("contentInput").value;
  const tags = document.getElementById("tagInput").value.split(",").map(t => t.trim()).filter(Boolean);
  const file = document.getElementById("imageInput").files[0];

  let imageUrl = "";
  if (file) {
    const fileRef = ref(storage, `diary/${Date.now()}_${file.name}`);
    await uploadBytes(fileRef, file);
    imageUrl = await getDownloadURL(fileRef);
  }

  await addDoc(collection(db, "diaryEntries"), {
    title,
    content,
    tags,
    imageUrl,
    createdAt: serverTimestamp()
  });

  form.reset();
});

const q = query(collection(db, "diaryEntries"), orderBy("createdAt", "desc"));
onSnapshot(q, (snapshot) => {
  list.innerHTML = "";
  snapshot.forEach((doc) => {
    const data = doc.data();
    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
      ${data.imageUrl ? `<img src="${data.imageUrl}" alt="画像" />` : ""}
      <h2>${data.title}</h2>
      <p>${data.content}</p>
      <div class="tags">${data.tags.map(tag => `#${tag}`).join(" ")}</div>
      <time>${data.createdAt?.toDate().toLocaleString() ?? ""}</time>
    `;
    list.appendChild(div);
  });
});