import React, { useEffect, useRef } from 'react';
import { collection, query, where, getDocs, limit, orderBy, doc, getDoc } from 'firebase/firestore';
import { auth, db, isQuotaExceededError } from '../lib/firebase';
import { useNotifications } from '../hooks/useNotifications';

export default function NotificationListener() {
  const { requestPermission, sendNotification } = useNotifications();
  const lastMessageIds = useRef<Set<string>>(new Set());
  const isInitialLoad = useRef(true);

  useEffect(() => {
    requestPermission();
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      if (!user) {
        return;
      }

      const fetchChatsForUser = async () => {
        let isAdmin = false;
        
        // 1. Check hardcoded emails first (fastest)
        const sellerEmails = ['mahmoudmasry165@gmail.com', '201115454823@seven.store', '01115454823@seven.store'];
        if (sellerEmails.includes(user.email?.toLowerCase() || '') || user.phoneNumber === '+201115454823' || user.phoneNumber === '201115454823') {
          isAdmin = true;
        } else {
          // 2. Fallback to check role in users collection
          try {
            const userDocRef = doc(db, 'users', user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists() && userDocSnap.data()?.role === 'admin') {
              isAdmin = true;
            }
          } catch (e) {
            console.error('Error fetching user role:', e);
          }
        }

        const chatsQuery = isAdmin 
          ? query(collection(db, 'chats'), orderBy('updatedAt', 'desc'), limit(20))
          : query(collection(db, 'chats'), where('participants', 'array-contains', user.uid));

        const doFetch = async () => {
          try {
            const snapshot = await getDocs(chatsQuery);
            snapshot.docs.forEach((doc) => {
              const chatData = doc.data();
              const messageId = `${doc.id}-${chatData.updatedAt?.toMillis?.() || chatData.updatedAt?.seconds || 0}`;
              
              if (lastMessageIds.current.has(messageId)) return;
              
              if (!isInitialLoad.current) {
                const lastMessage = chatData.lastMessage;
                const lastSenderId = chatData.lastSenderId;

                if (lastMessage && lastSenderId !== user.uid && !document.hasFocus()) {
                  const amISeller = chatData.sellerId === user.uid || (isAdmin && lastSenderId === chatData.buyerId);
                  const senderName = amISeller ? (chatData.buyerName || 'مشتري') : (chatData.storeName || 'المتجر');
                  
                  sendNotification(senderName, {
                    body: lastMessage,
                    tag: doc.id,
                    renotify: true
                  });
                }
              }
              lastMessageIds.current.add(messageId);
            });
            isInitialLoad.current = false;
          } catch (error: any) {
            if (isQuotaExceededError(error)) {
              sessionStorage.setItem('quota_exceeded', 'true');
            } else if (error?.code !== 'permission-denied') {
              console.error('Notification fetch error:', error);
            }
          }
        };

        doFetch();
        const intervalId = setInterval(doFetch, 60000); // Check every minute
        
        if (unsubscribeSnapshot) {
          unsubscribeSnapshot();
        }
        
        unsubscribeSnapshot = () => clearInterval(intervalId);
      };
      
      fetchChatsForUser();
    });

    return () => {
      unsubscribeAuth();
    };
  }, [requestPermission, sendNotification]);

  return null;
}
