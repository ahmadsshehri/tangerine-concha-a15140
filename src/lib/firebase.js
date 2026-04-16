import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyDwjcvHseCSZGWvvQZGa5qy0l650_LL8E0",
  authDomain: "src-jed1.firebaseapp.com",
  projectId: "src-jed1",
  storageBucket: "src-jed1.firebasestorage.app",
  messagingSenderId: "40527542138",
  appId: "1:40527542138:web:41c2a20f1b97cf102cc8c3"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
