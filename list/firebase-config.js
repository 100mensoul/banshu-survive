import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref,
         push as firebasePush, onChildAdded }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = { /* ← いま貼ってある JSON で OK */ };

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

export const projectsRef = ref(db, "projects");
export const push        = firebasePush;
export { onChildAdded };
