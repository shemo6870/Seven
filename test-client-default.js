import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const dbDefault = getFirestore(app);

async function test() {
  try {
    const snap = await getDocs(collection(dbDefault, 'products'));
    console.log("Default DB Size:", snap.size);
    process.exit(0);
  } catch (e) {
    console.error("Fetch error:", e.message);
    process.exit(1);
  }
}

test();
