import { getFirestore } from 'firebase-admin/firestore';
import admin from 'firebase-admin';
import firebaseConfig from './firebase-applet-config.json' assert { type: 'json' };

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId
  });
}

const db = getFirestore();
db.settings({ databaseId: firebaseConfig.firestoreDatabaseId });

async function run() {
  const users = await db.collection('users').get();
  console.log(`Found ${users.size} users.`);
  users.forEach(doc => {
    const data = doc.data();
    console.log(`User ${doc.id}: has pushSubscription? ${!!data.pushSubscription}`);
  });
}

run().catch(console.error);
