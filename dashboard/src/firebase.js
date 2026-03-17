// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// PASTE THE firebaseConfig OBJECT YOU COPIED FROM THE WEBSITE HERE
const firebaseConfig = {
  apiKey: "AIzaSyCLvx07QYMRAJgvgaHPTA3V6nTer11N9b4",
  authDomain: "forest-audio-ai.firebaseapp.com",
  projectId: "forest-audio-ai",
  storageBucket: "forest-audio-ai.firebasestorage.app",
  messagingSenderId: "845538072879",
  appId: "1:845538072879:web:513a75781ebf41275ca9da",
  measurementId: "G-NM1P3129D3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export the Firestore database instance so we can use it in other parts of our app
export const db = getFirestore(app);