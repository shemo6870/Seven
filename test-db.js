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

const authAdmin = admin.auth();
authAdmin.getUserByEmail('201115454823@seven.store').then(userRecord => {
  return authAdmin.updateUser(userRecord.uid, { password: 'password123' });
}).then(() => console.log('password updated')).catch(console.error);
