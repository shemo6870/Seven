import admin from 'firebase-admin';

admin.initializeApp();

const run = async () => {
    const email = '201115454823@seven.store';
    try {
       const user = await admin.auth().getUserByEmail(email);
       console.log("User found:", user.uid);
       
       await admin.auth().updateUser(user.uid, { password: 'newPassword123' });
       console.log("Password updated via admin SDK!");
    } catch(e) {
       console.error("error:", e);
    }
}
run();
