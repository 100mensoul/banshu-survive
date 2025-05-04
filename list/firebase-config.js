import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase,
  ref,
  push as firebasePush,
  onChildAdded
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

/* あなたの Firebase 設定 */
const firebaseConfig = {
  apiKey: "AIzaSyCtDPnYex-KL2hbHAQe5fYSPv9rz9xTa9A",
  authDomain: "u2memo-36f61.firebaseapp.com",
  databaseURL: "https://u2memo-36f61-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "u2memo-36f61",
  storageBucket: "u2memo-36f61.appspot.com",
  messagingSenderId: "14274931072",
  appId: "1:14274931072:web:5d9c9026905fdc0b383965"
};

/* 初期化は一度だけ */
const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

/* /projects ノード */
export const projectsRef = ref(db, "projects");
export const push        = firebasePush;
export { onChildAdded };
