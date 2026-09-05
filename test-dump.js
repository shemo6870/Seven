import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query } from "firebase/firestore";
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function test() {
  try {
    const snap = await getDocs(query(collection(db, 'products')));
    console.log("DB Size:", snap.size);
    snap.forEach(doc => {
      console.log("- ", doc.data().name, doc.data().sellerId);
    });
    process.exit(0);
  } catch (e) {
    console.error("Fetch error:", e.message);
    process.exit(1);
  }
}

test();
