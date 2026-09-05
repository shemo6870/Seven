import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);

async function test() {
  try {
    // 201115454823@seven.store is admin, so we will be an admin. Admin can add products.
    const cred = await signInWithEmailAndPassword(auth, "201115454823@seven.store", "123456");
    console.log("Logged in:", cred.user.uid);
    const data = {
        name: "Test product",
        price: 100,
        quantity: 10,
        imageUrl: "https://example.com/test.png",
        images: [],
        description: "description",
        category: "عام",
        isActive: true,
        colors: [],
        sizes: [],
        videoUrl: "",
        sellerId: cred.user.uid,
        storeName: "test",
        sellerRole: "admin",
        updatedAt: serverTimestamp()
    };
    const res = await addDoc(collection(db, 'products'), { ...data, createdAt: serverTimestamp() });
    console.log("added", res.id);
    process.exit(0);
  } catch (e) {
    console.error("error:", e);
    process.exit(1);
  }
}

test();
