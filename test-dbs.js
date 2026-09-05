import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);

async function testDB(dbId) {
  try {
    const db = getFirestore(app, dbId);
    const snap = await getDocs(collection(db, 'products'));
    console.log(`DB ${dbId} size:`, snap.size);
    snap.forEach(doc => console.log('  -', doc.data().name));
  } catch (e) {
    console.error(`DB ${dbId} error:`, e.message);
  }
}

async function run() {
  await testDB('sevenstore');
  process.exit(0);
}
run();
