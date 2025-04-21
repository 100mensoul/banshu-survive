// /list/firebase-config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, push, onChildAdded, set, child, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// あなたのFirebaseプロジェクト情報
const firebaseConfig = {
  apiKey: "AIzaSyCtDPnYex-KL2hbHAQe5fYSPv9rz9xTa9A",
  authDomain: "u2memo-36f61.firebaseapp.com",
  databaseURL: "https://u2memo-36f61-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "u2memo-36f61",
  storageBucket: "u2memo-36f61.appspot.com",
  messagingSenderId: "14274931072",
  appId: "1:14274931072:web:5d9c9026905fdc0b383965"
};

// Firebase初期化
const app = initializeApp(firebaseConfig);

// Realtime DatabaseとStorageを取得
const db = getDatabase(app);
const projectsRef = ref(db, "projects");

const storage = getStorage(app);

// エクスポートして他のファイルで使えるようにする
export {
  db,
  projectsRef,
  push,
  onChildAdded,
  set,
  child,
  remove,
  storage,
  storageRef,
  uploadBytes,
  getDownloadURL
};
