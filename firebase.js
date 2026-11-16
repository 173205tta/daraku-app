
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";

import {
  getAuth
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

// Firebaseを初期化
export const firebaseApp = initializeApp(firebaseConfig);

// ログイン認証
export const auth = getAuth(firebaseApp);

// データベース
export const db = getFirestore(firebaseApp);
