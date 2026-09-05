import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import crypto from "crypto";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, updateDoc, getDoc } from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };
import admin from 'firebase-admin';
import { getFirestore as getAdminFirestore, FieldValue } from 'firebase-admin/firestore';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId
  });
}

const authAdmin = admin.auth();
const firestoreAdmin = getAdminFirestore();
if (firebaseConfig.firestoreDatabaseId) {
  firestoreAdmin.settings({ databaseId: firebaseConfig.firestoreDatabaseId });
}

// Initialize Firebase SDK (Client-side for Firestore access if needed on server)
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

const _filename = typeof import.meta.url !== 'undefined' ? fileURLToPath(import.meta.url) : (typeof __filename !== 'undefined' ? __filename : '');
const _dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(_filename);

import Stripe from 'stripe';
import paypal from '@paypal/checkout-server-sdk';

// PayPal Configuration
function getPaypalClient() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const mode = process.env.PAYPAL_MODE || 'sandbox'; // 'sandbox' or 'live'

  if (!clientId || !clientSecret) {
    throw new Error("PayPal Client ID or Secret is missing in environment variables.");
  }

  const environment = mode === 'live' 
    ? new paypal.core.LiveEnvironment(clientId, clientSecret)
    : new paypal.core.SandboxEnvironment(clientId, clientSecret);
    
  return new paypal.core.PayPalHttpClient(environment);
}

// Lazy-load Stripe to prevent crash if key is missing
let stripeInstance: Stripe | null = null;
const getStripe = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("Stripe Secret Key is missing in environment variables.");
  if (!stripeInstance) {
    stripeInstance = new Stripe(secretKey, { apiVersion: '2025-01-27' as any });
  }
  return stripeInstance;
};

import webPush from 'web-push';

// Web push configuration
const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY || 'BDjTp5QqjCS2injodPPTX-rnssAbcKkPUR5pY1GR6yAHlYUs5YUBKYc6p8rW8sB_I2JcFIqFADvnyogZZBy-ehU',
  privateKey: process.env.VAPID_PRIVATE_KEY || 'kKQofyZ2QrqdhbVqCMlROGSLlvf1jir6FEb2kUJ0QcU'
};

webPush.setVapidDetails(
  'mailto:support@seven.store',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // VAPID Public Key retrieval
  app.get('/api/push/vapidPublicKey', (req, res) => {
    res.send(vapidKeys.publicKey);
  });

  // Send Push Notification
  app.post('/api/push/send', async (req, res) => {
    const { subscription, payload } = req.body;
    if (!subscription || !payload) {
      return res.status(400).json({ error: "Missing subscription or payload" });
    }
    
    try {
      await webPush.sendNotification(subscription, JSON.stringify(payload), {
        urgency: 'high',
        TTL: 24 * 60 * 60 // 24 hours
      });
      res.status(200).json({ success: true });
    } catch (error: any) {
      if (error.statusCode === 410 || error.statusCode === 404) {
        return res.status(410).json({ error: "Subscription expired", expired: true });
      }
      console.error("Error sending push notification:", error);
      res.status(500).json({ error: "Failed to send notification" });
    }
  });

  // Admin: Delete User from Auth
  app.post("/api/admin/delete-user", async (req, res) => {
    const { userId, adminToken } = req.body;

    if (!userId || !adminToken) {
      return res.status(400).json({ error: "Missing userId or adminToken" });
    }

    try {
      // Verify admin token
      const decodedToken = await authAdmin.verifyIdToken(adminToken);
      const adminEmail = decodedToken.email?.toLowerCase();
      const adminPhone = decodedToken.phone_number;
      
      // Simple admin check based on email or phone
      const isAdminEmail = adminEmail === 'mahmoudmasry165@gmail.com' || 
                           adminEmail === '201115454823@seven.store';
      const isAdminPhone = adminPhone === '+201115454823' || adminPhone === '201115454823';
      
      if (!isAdminEmail && !isAdminPhone) {
        console.warn(`Unauthorized delete attempt: email=${adminEmail}, phone=${adminPhone}`);
        return res.status(403).json({ error: "Unauthorized. Admin privileges required." });
      }

      // Delete user from Auth
      try {
        await authAdmin.deleteUser(userId);
        console.log(`Successfully deleted user ${userId} from Auth`);
      } catch (authError: any) {
        // If user already gone, it's fine
        if (authError.code === 'auth/user-not-found') {
          console.log(`User ${userId} already deleted from Auth`);
        } else {
          throw authError;
        }
      }
      
      res.json({ success: true, message: `User ${userId} handled` });
    } catch (error: any) {
      console.error("Error in delete-user API:", error);
      res.status(500).json({ 
        error: error.message || "Failed to process user deletion",
        code: error.code
      });
    }
  });

  // Recover Password securely via verified phone idToken
  app.post("/api/auth/recover-password", async (req, res) => {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: "البيانات المطلوبة ناقصة." });
    }

    try {
      const decodedToken = await authAdmin.verifyIdToken(idToken);
      const phone = decodedToken.phone_number;

      if (!phone) {
        return res.status(400).json({ error: "فشل التحقق من رقم الهاتف." });
      }

      const phoneVariations = Array.from(new Set([
        phone,
        phone.replace('+20', '0'),
        phone.replace('+', ''),
        phone.replace(/^0/, '+20')
      ])).filter(Boolean);

      let oldPassword = null;
      for (const p of phoneVariations) {
         const qSnap = await firestoreAdmin.collection('users').where('phoneNumber', '==', p).get();
         if (!qSnap.empty) {
            oldPassword = qSnap.docs[0].data().password;
            if (oldPassword) break;
         }
      }

      if (!oldPassword) {
        return res.status(404).json({ error: "لم يتم العثور على حساب مسجل بهذا الرقم أو أن الحساب لا يحمل كلمة سر." });
      }

      res.json({ success: true, password: oldPassword });
    } catch (error: any) {
      console.error("Error in recover-password API:", error);
      res.status(500).json({ 
        error: error.message || "فشل استرجاع كلمة السر.",
        code: error.code
      });
    }
  });

  // Reset Password securely via verified phone idToken
  app.post("/api/auth/reset-password", async (req, res) => {
    const { idToken, newPassword } = req.body;

    if (!idToken || !newPassword) {
      return res.status(400).json({ error: "البيانات المطلوبة ناقصة." });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "كلمة السر يجب أن تكون 6 أحرف على الأقل." });
    }

    try {
      // 1. Verify the Phone Auth user ID Token
      const decodedToken = await authAdmin.verifyIdToken(idToken);
      const phone = decodedToken.phone_number;

      if (!phone) {
        return res.status(400).json({ error: "فشل التحقق من رقم الهاتف." });
      }

      // 2. Identify all possible email variations since phone formats vary
      const phoneVariations = Array.from(new Set([
        phone,
        phone.replace('+20', '0'),
        phone.replace('+', ''),
        phone.replace(/^0/, '+20')
      ])).filter(Boolean);

      let successCount = 0;

      for (const p of phoneVariations) {
         const virtualEmail = `${p.replace('+', '')}@seven.store`;
         try {
           const emailUser = await authAdmin.getUserByEmail(virtualEmail);
           
           // Update auth password
           await authAdmin.updateUser(emailUser.uid, {
             password: newPassword
           });
           
           successCount++;
         } catch (e: any) {
             // Usually auth/user-not-found
             console.log("Variations search:", virtualEmail, e.code || e.message);
         }
      }
      
      if (successCount === 0) {
          return res.status(404).json({ error: "لم يتم العثور على حساب مسجل بهذا الرقم." });
      }

      res.json({ success: true, message: "تم تغيير كلمة السر بنجاح." });
    } catch (error: any) {
      console.error("Error in reset-password API:", error);
      res.status(500).json({ 
        error: error.message || "فشل تغيير كلمة السر في النظام.",
        code: error.code
      });
    }
  });

  // Manual Payment Logic: The frontend handles order creation via Firestore directly.
  // We keep the server mostly for serving the app and potential future shared logic.

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Global error handler caught:", err);
    res.status(err.status || 500).json({
      error: err.message || "Internal Server Error",
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined
    });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
