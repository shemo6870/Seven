import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, getCountFromServer } from 'firebase/firestore';
import { readFileSync } from 'fs';

const firebaseConfig = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));

// Connect to default db
const appDefault = initializeApp(firebaseConfig, "default");
const dbDefault = getFirestore(appDefault, "(default)");

async function test() {
  try {
    const snap = await getCountFromServer(collection(dbDefault, 'products'));
    console.log("Default DB accessible. Products count:", snap.data().count);
  } catch (e: any) {
    console.error("Error accessing default DB:", e.message);
  }
}
test();
