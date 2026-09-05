import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const firebaseConfig = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId
  });
}

const db = admin.firestore();
if (firebaseConfig.firestoreDatabaseId) {
  db.settings({ databaseId: firebaseConfig.firestoreDatabaseId });
}

db.collection('products').get().then(snap => {
  console.log(`Found ${snap.size} products.`);
  snap.forEach(doc => {
    console.log(`- ${doc.id}: ${doc.data().name}`);
  });
}).catch(console.error);
