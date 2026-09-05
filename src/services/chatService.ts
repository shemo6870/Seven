import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  serverTimestamp, 
  onSnapshot, 
  updateDoc, 
  doc, 
  getDocs,
  setDoc,
  limit,
  getDoc,
  deleteDoc,
  increment,
  writeBatch
} from 'firebase/firestore';

export interface Chat {
  id: string;
  participants: string[];
  buyerId: string;
  buyerName: string;
  sellerId: string;
  lastMessage?: string;
  lastMessageAt?: any;
  lastSenderId?: string;
  unreadCount?: number; // Legacy, keeping for compatibility
  buyerUnreadCount?: number;
  sellerUnreadCount?: number;
  buyerTyping?: boolean;
  sellerTyping?: boolean;
  updatedAt: any;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  imageUrl?: string | null;
  createdAt: any;
}

// Fixed seller email based on app logic
const SELLER_EMAIL = 'mahmoudmasry165@gmail.com';

export const getSellerId = async (): Promise<string | null> => {
  const path = 'users';
  try {
    // Try to find the admin in users collection
    const q = query(collection(db, path), where('role', '==', 'admin'), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) return snap.docs[0].id;
    
    // Fallback: look for the specific email
    const q2 = query(collection(db, path), where('email', '==', SELLER_EMAIL), limit(1));
    const snap2 = await getDocs(q2);
    if (!snap2.empty) return snap2.docs[0].id;

    // Fallback: look for the specific phone
    const q3 = query(collection(db, path), where('phoneNumber', '==', '+201115454823'), limit(1));
    const snap3 = await getDocs(q3);
    if (!snap3.empty) return snap3.docs[0].id;

    const q4 = query(collection(db, path), where('phoneNumber', '==', '201115454823'), limit(1));
    const snap4 = await getDocs(q4);
    if (!snap4.empty) return snap4.docs[0].id;

    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return null;
  }
};

export const getOrCreateChat = async (buyerId: string) => {
  const sellerId = await getSellerId();
  if (!sellerId) throw new Error('Seller not found');
  if (buyerId === sellerId) return null; // Seller can't chat with self

  const path = 'chats';
  try {
    // Fetch buyer name from users collection
    let buyerName = 'مشتري';
    const userDoc = await getDoc(doc(db, 'users', buyerId));
    if (userDoc.exists()) {
      buyerName = userDoc.data().name || buyerName;
    }

    const q = query(
      collection(db, path),
      where('buyerId', '==', buyerId),
      where('sellerId', '==', sellerId)
    );

    const snap = await getDocs(q);
    if (!snap.empty) {
      const existingChat = { id: snap.docs[0].id, ...snap.docs[0].data() } as Chat;
      // If name in DB is different from what we found, update it (optional but good for consistency)
      if (existingChat.buyerName !== buyerName) {
        await updateDoc(doc(db, 'chats', existingChat.id), { buyerName });
        existingChat.buyerName = buyerName;
      }
      return existingChat;
    }

    // Create new chat
    const chatData = {
      participants: [buyerId, sellerId],
      buyerId,
      buyerName,
      sellerId,
      lastMessage: '',
      lastMessageAt: serverTimestamp(),
      unreadCount: 0,
      buyerUnreadCount: 0,
      sellerUnreadCount: 0,
      buyerTyping: false,
      sellerTyping: false,
      lastSenderId: '',
      updatedAt: serverTimestamp()
    };

    console.log('Attempting to create chat with data:', JSON.stringify(chatData));
    const docRef = await addDoc(collection(db, path), chatData);
    console.log('Chat created with ID:', docRef.id);
    return { id: docRef.id, ...chatData } as Chat;
  } catch (error) {
    console.error('Detailed create chat error:', error);
    handleFirestoreError(error, OperationType.WRITE, path);
    return null;
  }
};

export const sendMessage = async (chatId: string, text: string, senderId: string, imageUrl?: string) => {
  const path = `chats/${chatId}/messages`;
  try {
    const messageData = {
      senderId,
      text,
      imageUrl: imageUrl || null,
      createdAt: serverTimestamp()
    };

    await addDoc(collection(db, path), messageData);

    // Update chat last message and increment unread count
    const chatRef = doc(db, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);
    
    if (!chatSnap.exists()) {
      console.error('Chat document does not exist:', chatId);
      return;
    }

    const chatData = chatSnap.data() as Chat;
    
    const updates: any = {
      lastMessage: imageUrl ? '📷 صورة' : text,
      lastMessageAt: serverTimestamp(),
      lastSenderId: senderId,
      updatedAt: serverTimestamp()
    };

    // If sender is buyer, increment seller unread count
    if (senderId === chatData.buyerId) {
      updates.sellerUnreadCount = increment(1);
    } else {
      // If sender is seller (or any admin), increment buyer unread count
      updates.buyerUnreadCount = increment(1);
    }

    await updateDoc(chatRef, updates);

    // Fetch the chat document to find out who to send the push notification to
    try {
      const chatDoc = await getDoc(chatRef);
      if (chatDoc.exists()) {
        const chatData = chatDoc.data() as Chat;
        const isBuyer = senderId === chatData.buyerId;
        const receiverId = isBuyer ? chatData.sellerId : chatData.buyerId;
        const senderName = isBuyer ? chatData.buyerName : 'Seven Store';
        
        // Fetch receiver's subscription from their user document
        const receiverDoc = await getDoc(doc(db, 'users', receiverId));
        if (receiverDoc.exists()) {
          const subscription = receiverDoc.data()?.pushSubscription;
          
          if (subscription) {
            const payload = {
              title: 'Seven Store',
              body: `${senderName}: ${text || 'أرسل صورة'}`
            };

            await fetch('/api/push/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ subscription, payload })
            });
          }
        }
      }
    } catch (pushErr) {
      console.error('Failed to send push notification:', pushErr);
    }
  } catch (error) {
    console.error('Error in sendMessage:', error);
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const fetchMessages = async (chatId: string) => {
  const path = `chats/${chatId}/messages`;
  try {
    const q = query(
      collection(db, path),
      orderBy('createdAt', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Message[];
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

export const fetchChats = async (isSeller: boolean, userId: string) => {
  const path = 'chats';
  
  try {
    const q = isSeller
      ? query(collection(db, path), orderBy('updatedAt', 'desc'))
      : query(collection(db, path), where('buyerId', '==', userId), orderBy('updatedAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Chat[];
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

export const listenToMessages = (chatId: string, callback: (messages: Message[]) => void) => {
  const path = `chats/${chatId}/messages`;
  const q = query(
    collection(db, path),
    orderBy('createdAt', 'asc')
  );

  return onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    const messages = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data({ serverTimestamps: 'estimate' })
    })) as Message[];
    callback(messages);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, path);
  });
};

export const listenToChats = (isSeller: boolean, userId: string, callback: (chats: Chat[]) => void) => {
  const path = 'chats';
  
  const q = isSeller
    ? query(collection(db, path), orderBy('updatedAt', 'desc'))
    : query(collection(db, path), where('buyerId', '==', userId), orderBy('updatedAt', 'desc'));

  return onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    const chats = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data({ serverTimestamps: 'estimate' })
    })) as Chat[];
    callback(chats);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, path);
  });
};

export const deleteChat = async (chatId: string) => {
  const path = `chats/${chatId}`;
  try {
    const messagesRef = collection(db, `chats/${chatId}/messages`);
    const msgsSnap = await getDocs(messagesRef);
    
    // Process batch deletion (Firestore limits to 500 ops per batch)
    const batches = [];
    let currentBatch = writeBatch(db);
    let count = 0;
    
    msgsSnap.docs.forEach(doc => {
      currentBatch.delete(doc.ref);
      count++;
      if (count === 499) { // Leave 1 for the chat doc if needed, or just 500
        batches.push(currentBatch.commit());
        currentBatch = writeBatch(db);
        count = 0;
      }
    });
    
    currentBatch.delete(doc(db, 'chats', chatId));
    batches.push(currentBatch.commit());
    
    await Promise.all(batches);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};

export const markAsRead = async (chatId: string, isSeller: boolean) => {
  const path = `chats/${chatId}`;
  const chatRef = doc(db, 'chats', chatId);
  try {
    const field = isSeller ? 'sellerUnreadCount' : 'buyerUnreadCount';
    await updateDoc(chatRef, {
      [field]: 0
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const setTypingStatus = async (chatId: string, isSeller: boolean, isTyping: boolean) => {
  const path = `chats/${chatId}`;
  const chatRef = doc(db, 'chats', chatId);
  try {
    const field = isSeller ? 'sellerTyping' : 'buyerTyping';
    await updateDoc(chatRef, {
      [field]: isTyping
    });
  } catch (error) {
    // Only log if not a permission error or specific one we don't care about for background tasks
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};
