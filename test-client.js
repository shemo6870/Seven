import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function test() {
  try {
    const snap = await getDocs(collection(db, 'categories'));
    console.log("Categories Size:", snap.size);
    snap.forEach(d => console.log(d.id, d.data().name));
    process.exit(0);
  } catch (e) {
    console.error("Fetch error:", e.message);
    process.exit(1);
  }
}

test();
