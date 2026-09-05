import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

// Connect to the specific DB
const app1 = initializeApp(config, "app1");
const db1 = getFirestore(app1, config.firestoreDatabaseId);

// Connect to default DB
const app2 = initializeApp(config, "app2");
const db2 = getFirestore(app2, "(default)");

async function check() {
  try {
    const snap1 = await getDocs(collection(db1, 'products'));
    console.log("DB1 (ai-studio) products count:", snap1.size);
  } catch(e) {
    console.log("DB1 error:", e.message);
  }
  
  try {
    const snap2 = await getDocs(collection(db2, 'products'));
    console.log("DB2 (default) products count:", snap2.size);
  } catch(e) {
    console.log("DB2 error:", e.message);
  }
  process.exit(0);
}
check();
