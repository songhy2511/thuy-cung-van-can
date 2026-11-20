import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// THAY BẰNG CẤU HÌNH FIREBASE CỦA BẠN
const firebaseConfig = {
  apiKey: "AIzaSyBc6XaodvtfBofQ3sWBBHxF1zPz8zMYdFs",
  authDomain: "gameca-28b06.firebaseapp.com",
  databaseURL: "https://gameca-28b06-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "gameca-28b06",
  storageBucket: "gameca-28b06.firebasestorage.app",
  messagingSenderId: "88996681906",
  appId: "1:88996681906:web:6ad17342702618d65691ab",
  measurementId: "G-27V9TF0FQG"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getDatabase(app);