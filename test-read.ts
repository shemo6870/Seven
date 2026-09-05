import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';
import { readFileSync } from 'fs';

const firebaseConfig = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function test() {
  try {
    const snap = await getDocs(query(collection(db, 'products'), limit(1)));
    console.log("Read successful! Found", snap.size, "products");
  } catch (e: any) {
    console.error("Error reading DB:", e.message);
  }
}
test();
