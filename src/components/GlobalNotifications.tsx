import React, { useEffect, useState, useRef } from 'react';
import { listenToChats } from '../services/chatService';
import { auth } from '../lib/firebase';
import { playNotificationSound } from '../lib/audio';
import { Bell } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function GlobalNotifications({ isGlobalSellerMode, onUnreadChange }: { isGlobalSellerMode: boolean, onUnreadChange?: (count: number) => void }) {
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [showToast, setShowToast] = useState(false);
  const prevChatsRef = useRef<Record<string, number>>({});
  const isFirstLoadRef = useRef(true);
  const [toastMessage, setToastMessage] = useState('');

  // Request browser notification permission explicitly
  useEffect(() => {
    if ('Notification' in window && 'serviceWorker' in navigator) {
      const subscribeUser = async () => {
        try {
          const permission = await Notification.requestPermission();
          if (permission !== 'granted' || !auth.currentUser) return;
          
          const registration = await navigator.serviceWorker.ready;
          
          // Get VAPID public key
          const response = await fetch('/api/push/vapidPublicKey');
          const vapidPublicKey = await response.text();
          
          const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
          
          let subscription;
          try {
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: convertedVapidKey
            });
          } catch (subErr: any) {
            if (subErr.message && subErr.message.includes('applicationServerKey')) {
              // Unsubscribe from old conflicting key and retry
              const existingSubscription = await registration.pushManager.getSubscription();
              if (existingSubscription) {
                await existingSubscription.unsubscribe();
              }
              subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedVapidKey
              });
            } else {
              throw subErr;
            }
          }

          // Save subscription directly to Firestore
          if (auth.currentUser) {
            import('firebase/firestore').then(({ doc, setDoc }) => {
              import('../lib/firebase').then(({ db }) => {
                setDoc(doc(db, 'users', auth.currentUser!.uid), {
                  pushSubscription: JSON.parse(JSON.stringify(subscription))
                }, { merge: true });
              });
            });
          }
          
        } catch (error) {
          console.error("Service Worker/Push Error:", error);
        }
      };

      // We only subscribe when auth state changes to a logged-in user
      const unsubscribeAuth = auth.onAuthStateChanged(user => {
         if (user) subscribeUser();
      });
      return () => unsubscribeAuth();
    }
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;
    
    const unsubscribe = listenToChats(isGlobalSellerMode, auth.currentUser.uid, (chats) => {
      let total = 0;
      let newMessagedChatData: any = null;
      
      const currentChatsState: Record<string, number> = {};

      chats.forEach(chat => {
        const unreadCount = isGlobalSellerMode ? (chat.sellerUnreadCount || 0) : (chat.buyerUnreadCount || 0);
        total += unreadCount;
        currentChatsState[chat.id] = unreadCount;

        const prevUnreadCount = prevChatsRef.current[chat.id] || 0;
        if (unreadCount > prevUnreadCount && !isFirstLoadRef.current) {
          // Check if the current user isn't the one who sent this last message
          if (chat.lastSenderId !== auth.currentUser?.uid) {
             newMessagedChatData = chat;
          }
        }
      });
      
      isFirstLoadRef.current = false;

      if (newMessagedChatData) {
        // A new message arrived
        playNotificationSound();
        const msgText = newMessagedChatData.lastMessage || 'رسالة جديدة';
        const senderName = isGlobalSellerMode ? newMessagedChatData.buyerName : 'Seven Store';
        const fullMsg = `${senderName}: ${msgText}`;
        setToastMessage(fullMsg);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 5000);
        
        // Show browser notification if permission granted
        if ('Notification' in window && Notification.permission === 'granted') {
          const iconUrl = '/favicon.svg';
          try {
            new Notification('Seven Store', {
              body: fullMsg,
              icon: iconUrl,
              badge: iconUrl
            });
          } catch (e) {
            // Mobile browsers may require a service worker for notifications
            navigator.serviceWorker?.ready.then(registration => {
              registration.showNotification('Seven Store', {
                body: fullMsg,
                icon: iconUrl,
                badge: iconUrl
              });
            }).catch(console.error);
          }
        }
      }
      
      prevChatsRef.current = currentChatsState;
      setUnreadTotal(total);
      if (onUnreadChange) {
        onUnreadChange(total);
      }
    });

    return () => unsubscribe();
  }, [isGlobalSellerMode, auth.currentUser, onUnreadChange]);

  return (
    <AnimatePresence>
      {showToast && (
        <motion.div
           initial={{ opacity: 0, y: -50, x: '-50%' }}
           animate={{ opacity: 1, y: 0, x: '-50%' }}
           exit={{ opacity: 0, y: -50, x: '-50%' }}
           className="fixed top-20 left-1/2 z-[100] bg-white border border-gray-100 shadow-2xl rounded-2xl px-6 py-4 flex items-center gap-3"
        >
          <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <Bell size={20} className="animate-pulse" />
          </div>
          <span className="font-bold text-gray-900 truncate max-w-[200px] sm:max-w-xs">{toastMessage}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
