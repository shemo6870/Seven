import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';

const firebaseConfig = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function seed() {
  try {
    // We don't know the exact UID, but we can't write to the user doc without it.
    console.log("Cannot seed without UID");
  } catch(e) {
    console.log(e);
  }
}
seed();
