import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function clean() {
  const snap = await getDocs(collection(db, 'products'));
  for (const item of snap.docs) {
    if (item.data().name.includes('Test') || item.data().name.includes('تجربة')) {
      await deleteDoc(doc(db, 'products', item.id));
      console.log('Deleted', item.data().name);
    }
  }
  process.exit(0);
}
clean();
