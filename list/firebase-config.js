import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, push as firebasePush, onChildAdded } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCtDPnYex-KL2hbHAQe5fYSPv9rz9xTa9A",
  authDomain: "u2memo-36f61.firebaseapp.com",
  databaseURL: "https://u2memo-36f61-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "u2memo-36f61",
  storageBucket: "u2memo-36f61.appspot.com",
  messagingSenderId: "14274931072",
  appId: "1:14274931072:web:5d9c9026905fdc0b383965"
};

// Firebase 初期化
const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

// Realtime Database の /projects ノード
export const projectsRef = ref(db, 'projects');
// データ追加用 push
export const push        = firebasePush;
// 購読用 onChildAdded
export { onChildAdded };
