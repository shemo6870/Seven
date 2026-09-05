import React, { createContext, useContext, useState, useEffect } from 'react';
import { Product } from '../types';
import { auth, db, isQuotaExceededError } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

interface CartItem extends Product {
  cartQuantity: number;
  selectedColor?: string;
  selectedSize?: string;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (product: Product, selectedColor?: string, selectedSize?: string, quantity?: number) => void;
  removeFromCart: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  shippingCost: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        setUserId(null);
        setItems([]); // Clear local items on logout
      }
    });
    return unsubscribe;
  }, []);

  // Firestore Sync - One time fetch on mount/auth change
  useEffect(() => {
    if (!userId) return;

    const fetchCart = async () => {
      try {
        const docRef = doc(db, 'carts', userId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setItems(docSnap.data().items || []);
        } else {
          setItems([]);
        }
      } catch (error: any) {
        if (isQuotaExceededError(error)) {
          sessionStorage.setItem('quota_exceeded', 'true');
        } else if (error?.code !== 'permission-denied') {
          console.error("Cart Fetch Error:", error);
        }
      }
    };

    fetchCart();
  }, [userId]);

  // Sync to Firestore function helper
  const syncToFirestore = async (newItems: CartItem[]) => {
    if (userId) {
      try {
        await setDoc(doc(db, 'carts', userId), { items: newItems }, { merge: true });
      } catch (err) {
        console.error('Error syncing cart:', err);
      }
    }
    // Still keep in localStorage for guest support if needed, but primary is firestore for logged in users
    if (!userId) {
      localStorage.setItem('cart', JSON.stringify(newItems));
    }
  };

  const addToCart = (product: Product, colorProp?: string, sizeProp?: string, quantity = 1) => {
    const selectedColor = colorProp || '';
    const selectedSize = sizeProp || '';
    
    setItems(prev => {
      const existingIndex = prev.findIndex(item => 
        item.id === product.id && 
        (item.selectedColor || '') === selectedColor && 
        (item.selectedSize || '') === selectedSize
      );

      let newItems;
      if (existingIndex > -1) {
        newItems = [...prev];
        newItems[existingIndex] = {
          ...newItems[existingIndex],
          cartQuantity: newItems[existingIndex].cartQuantity + quantity
        };
      } else {
        newItems = [...prev, { 
          ...product, 
          cartQuantity: quantity, 
          selectedColor, 
          selectedSize 
        }];
      }
      syncToFirestore(newItems);
      return newItems;
    });
  };

  const removeFromCart = (cartId: string) => {
    setItems(prev => {
      const newItems = prev.filter(item => {
        const currentCartId = `${item.id}-${item.selectedColor || ''}-${item.selectedSize || ''}`;
        return currentCartId !== cartId;
      });
      syncToFirestore(newItems);
      return newItems;
    });
  };

  const updateQuantity = (cartId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(cartId);
      return;
    }
    setItems(prev => {
      const newItems = prev.map(item => {
        const currentCartId = `${item.id}-${item.selectedColor || ''}-${item.selectedSize || ''}`;
        return currentCartId === cartId ? { ...item, cartQuantity: quantity } : item;
      });
      syncToFirestore(newItems);
      return newItems;
    });
  };

  const clearCart = () => {
    setItems([]);
    syncToFirestore([]);
  };

  const totalItems = items.reduce((sum, item) => sum + item.cartQuantity, 0);
  const totalPrice = items.reduce((sum, item) => sum + (item.price * item.cartQuantity), 0);
  const shippingCost = (totalPrice >= 2000 || totalPrice === 0) ? 0 : 70;

  return (
    <CartContext.Provider value={{ 
      items, 
      addToCart, 
      removeFromCart, 
      updateQuantity, 
      clearCart, 
      totalItems, 
      totalPrice,
      shippingCost
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
