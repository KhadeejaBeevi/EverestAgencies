// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import {getAuth} from "firebase/auth";
import {getFirestore} from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA7cXhr6ei4ff0fVamXC1VgkdVLpW0rjy4",
  authDomain: "login-auth-2f165.firebaseapp.com",
  projectId: "login-auth-2f165",
  storageBucket: "login-auth-2f165.firebasestorage.app",
  messagingSenderId: "626522556298",
  appId: "1:626522556298:web:7441f340bf3f1fc9d1aa73"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth=getAuth(app)
export const db=getFirestore(app);
export default app;