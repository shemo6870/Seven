import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import Home from './pages/Home';
import Admin from './pages/Admin';
import Merchant from './pages/Merchant';
import Login from './pages/Login';
import Settings from './pages/Settings';
import Orders from './pages/Orders';
import Coupons from './pages/Coupons';
import { STORE_NAME, WHATSAPP_NUMBER } from './constants';
import { ShoppingBag, User as UserIcon, LogOut, MessageCircle, ShoppingCart, ShieldCheck, Settings as SettingsIcon, ClipboardList, Tag, ChevronUp, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CartProvider, useCart } from './context/CartContext';
import CartDrawer from './components/CartDrawer';
import ChatWindow from './components/ChatWindow';
import GlobalNotifications from './components/GlobalNotifications';
import NotificationListener from './components/NotificationListener';
import AboutUsModal from './components/AboutUsModal';
import StatsModal from './components/StatsModal';
import { Info, BarChart3 } from 'lucide-react';

function Navbar({ onCartClick, onStatsClick }: { onCartClick: () => void, onStatsClick: () => void }) {
  const { totalItems } = useCart();
  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userRef = doc(db, 'users', u.uid);
        try {
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            setUserName(userSnap.data().name || 'مستخدِم');
            setUserRole(userSnap.data().role || 'buyer');
          } else {
            // If user profile document is missing in Firestore, DO NOT log them out.
            // Create a default user profile automatically to handle the missing document.
            const uEmail = u.email?.toLowerCase() || '';
            const uPhone = u.phoneNumber || '';
            const cleanPhone = uPhone.replace('+', '');
            const isAdminEmail = uEmail === 'mahmoudmasry165@gmail.com';
            const isSellerCred = cleanPhone === WHATSAPP_NUMBER || uPhone === '+' + WHATSAPP_NUMBER || uEmail === '201115454823@seven.store' || uEmail === '01115454823@seven.store';
            
            const defaultRole = isAdminEmail ? 'admin' : (isSellerCred ? 'seller' : 'buyer');
            const defaultName = u.displayName || (isAdminEmail ? 'المشرف' : (isSellerCred ? 'التاجر' : 'مشتري'));
            
            try {
              const { setDoc, serverTimestamp } = await import('firebase/firestore');
              await setDoc(userRef, {
                name: defaultName,
                email: uEmail || '',
                phoneNumber: uPhone || '',
                role: defaultRole,
                createdAt: serverTimestamp()
              });
              setUserName(defaultName);
              setUserRole(defaultRole);
            } catch (createErr) {
              console.error("Error creating default user profile:", createErr);
              setUserName(defaultName);
              setUserRole(defaultRole);
            }
          }
        } catch (readErr) {
          console.error("Error reading user profile:", readErr);
          // Fall back gracefully instead of crashing or logging out
          const uEmail = u.email?.toLowerCase() || '';
          const uPhone = u.phoneNumber || '';
          const cleanPhone = uPhone.replace('+', '');
          const isAdminEmail = uEmail === 'mahmoudmasry165@gmail.com';
          const isSellerCred = cleanPhone === WHATSAPP_NUMBER || uPhone === '+' + WHATSAPP_NUMBER || uEmail === '201115454823@seven.store' || uEmail === '01115454823@seven.store';
          
          const defaultRole = isAdminEmail ? 'admin' : (isSellerCred ? 'seller' : 'buyer');
          const defaultName = u.displayName || (isAdminEmail ? 'المشرف' : (isSellerCred ? 'التاجر' : 'مشتري'));
          
          setUserName(defaultName);
          setUserRole(defaultRole);
        }
      } else {
        setUserRole('');
        setUserName('');
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleSignOut = async () => {
    await auth.signOut();
    window.location.href = '/';
  };

  const isSeller = (user?.phoneNumber?.replace('+', '') === WHATSAPP_NUMBER) || 
                   (user?.phoneNumber === WHATSAPP_NUMBER) || 
                   (user?.phoneNumber === '+' + WHATSAPP_NUMBER) ||
                   (user?.email?.toLowerCase() === 'mahmoudmasry165@gmail.com') ||
                   (user?.email?.toLowerCase() === '201115454823@seven.store') ||
                   (user?.email?.toLowerCase() === '01115454823@seven.store');

  if (loading) return null;

  return (
    <nav className="bg-white/90 backdrop-blur-md shadow-sm sticky top-0 z-50 border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-14 sm:h-18 items-center overflow-x-auto no-scrollbar scroll-smooth gap-4 px-2 sm:px-0">
          <div className="flex items-center gap-2 flex-shrink-0 py-2 min-w-fit">
            <Link to="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20 group-hover:scale-110 transition-transform flex-shrink-0">
                <ShoppingBag className="text-white" size={18} />
              </div>
              <span className="text-lg sm:text-2xl font-black text-gray-900 tracking-tighter whitespace-nowrap">
                SEVEN<span className="text-blue-600">.</span>
              </span>
            </Link>
          </div>
          
          <div className="flex items-center gap-1.5 sm:gap-4 flex-shrink-0 py-2 ml-1 min-w-fit">
            <Link to="/" className="relative group overflow-hidden px-3 py-1.5 rounded-lg transition-all">
              <span className="relative z-10 text-gray-600 group-hover:text-blue-600 transition-colors font-black text-sm sm:text-base whitespace-nowrap">
                المتجر
              </span>
              <div className="absolute inset-0 bg-blue-50/0 group-hover:bg-blue-50 transition-all -translate-y-full group-hover:translate-y-0" />
            </Link>
            
            {!isSeller && userRole !== 'seller' && (
              <button 
                onClick={onCartClick}
                className="relative p-2.5 text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-all active:scale-90 group"
              >
                <ShoppingCart size={22} className="sm:w-[26px] sm:h-[26px] group-hover:rotate-[-10deg] transition-transform" />
                {totalItems > 0 && (
                  <motion.span 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-black rounded-full min-w-[18px] h-[18px] flex items-center justify-center border-2 border-white shadow-md px-1"
                  >
                    {totalItems}
                  </motion.span>
                )}
              </button>
            )}

            {user ? (
              <div className="flex items-center gap-1.5 sm:gap-2">
                {!isSeller && userRole !== 'seller' && (
                  <Link 
                    to="/orders" 
                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                    title="طلباتي"
                  >
                    <ClipboardList size={22} className="sm:w-[24px] sm:h-[24px]" />
                  </Link>
                )}
                
                {isSeller ? (
                  <Link to="/admin" className="bg-blue-600 text-white px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl hover:bg-blue-700 transition-all flex items-center gap-1.5 sm:gap-2 font-black shadow-lg shadow-blue-600/30 text-xs sm:text-sm whitespace-nowrap active:scale-95">
                    <ShieldCheck size={18} />
                    <span className="hidden sm:inline">لوحة التحكم</span>
                    <span className="sm:hidden">أدمن</span>
                  </Link>
                ) : userRole === 'seller' ? (
                  <Link to="/merchant" className="bg-amber-600 text-white px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl hover:bg-amber-700 transition-all flex items-center gap-1.5 sm:gap-2 font-black shadow-lg shadow-amber-600/30 text-xs sm:text-sm whitespace-nowrap active:scale-95">
                    <ShoppingBag size={18} />
                    <span className="hidden sm:inline">لوحة التاجر</span>
                    <span className="sm:hidden">تاجر</span>
                  </Link>
                ) : (
                  <Link 
                    to="/settings"
                    className="flex items-center gap-1.5 sm:gap-2 bg-gray-50 px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-gray-700 font-black border border-gray-100 hover:bg-gray-100 transition-all text-xs sm:text-sm whitespace-nowrap active:scale-95"
                  >
                    <div className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 shadow-sm shadow-blue-600/10">
                      <UserIcon size={14} className="sm:w-[16px] sm:h-[16px]" />
                    </div>
                    <span className="max-w-[70px] sm:max-w-[120px] truncate">{userName || 'المشتري'}</span>
                  </Link>
                )}

                <div className="flex items-center gap-1 sm:gap-1.5 bg-gray-50 p-1 rounded-xl border border-gray-100">
                  {!isSeller && (
                    <Link 
                      to="/settings"
                      className="p-1.5 sm:p-2 text-gray-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all shadow-sm sm:shadow-none"
                      title="الإعدادات"
                    >
                      <SettingsIcon size={18} className="sm:w-[20px] sm:h-[20px]" />
                    </Link>
                  )}
                  <button 
                    onClick={handleSignOut}
                    className="p-1.5 sm:p-2 text-gray-400 hover:text-red-500 hover:bg-white rounded-lg transition-all shadow-sm sm:shadow-none"
                    title="تسجيل الخروج"
                  >
                    <LogOut size={18} className="sm:w-[20px] sm:h-[20px]" />
                  </button>
                </div>
              </div>
            ) : (
              <Link to="/login" className="bg-blue-600 text-white px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl text-sm font-black flex items-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/30 active:scale-95">
                <UserIcon size={18} />
                <span>دخول</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) return null;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function BuyerRoute({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) return null;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) return null;

  const isSeller = (user?.phoneNumber?.replace('+', '') === WHATSAPP_NUMBER) || 
                   (user?.phoneNumber === WHATSAPP_NUMBER) || 
                   (user?.phoneNumber === '+' + WHATSAPP_NUMBER) || 
                   (user?.email?.toLowerCase() === 'mahmoudmasry165@gmail.com') ||
                   (user?.email?.toLowerCase() === '201115454823@seven.store') ||
                   (user?.email?.toLowerCase() === '01115454823@seven.store');

  if (!user || !isSeller) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function MerchantRoute({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userRef = doc(db, 'users', u.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setUserRole(userSnap.data().role || '');
        }
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) return null;

  if (!user || userRole !== 'seller') {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const openWhatsApp = (number: string) => {
    window.open(`https://wa.me/${number}`, '_blank');
  };

  return (
    <CartProvider>
      <Router>
        <AppContent isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} openWhatsApp={openWhatsApp} />
      </Router>
    </CartProvider>
  );
}

function AppContent({ isCartOpen, setIsCartOpen, openWhatsApp }: any) {
  const { clearCart } = useCart();
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [isAboutUsOpen, setIsAboutUsOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [isMenuExpanded, setIsMenuExpanded] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const { doc, getDoc } = await import('firebase/firestore');
          const userRef = doc(db, 'users', u.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            setUserRole(userSnap.data().role || 'buyer');
          } else {
            const uEmail = u.email?.toLowerCase() || '';
            const uPhone = u.phoneNumber || '';
            const cleanPhone = uPhone.replace('+', '');
            const isAdminEmail = uEmail === 'mahmoudmasry165@gmail.com';
            const isSellerCred = cleanPhone === WHATSAPP_NUMBER || uPhone === '+' + WHATSAPP_NUMBER || uEmail === '201115454823@seven.store' || uEmail === '01115454823@seven.store';
            
            const defaultRole = isAdminEmail ? 'admin' : (isSellerCred ? 'seller' : 'buyer');
            const defaultName = u.displayName || (isAdminEmail ? 'المشرف' : (isSellerCred ? 'التاجر' : 'مشتري'));
            
            try {
              const { setDoc, serverTimestamp } = await import('firebase/firestore');
              await setDoc(userRef, {
                name: defaultName,
                email: uEmail || '',
                phoneNumber: uPhone || '',
                role: defaultRole,
                createdAt: serverTimestamp()
              });
              setUserRole(defaultRole);
            } catch (createErr) {
              console.error("Error creating default profile in AppContent:", createErr);
              setUserRole(defaultRole);
            }
          }
        } catch (readErr) {
          console.error("Error reading profile in AppContent:", readErr);
          const uEmail = u.email?.toLowerCase() || '';
          const uPhone = u.phoneNumber || '';
          const cleanPhone = uPhone.replace('+', '');
          const isAdminEmail = uEmail === 'mahmoudmasry165@gmail.com';
          const isSellerCred = cleanPhone === WHATSAPP_NUMBER || uPhone === '+' + WHATSAPP_NUMBER || uEmail === '201115454823@seven.store' || uEmail === '01115454823@seven.store';
          
          const defaultRole = isAdminEmail ? 'admin' : (isSellerCred ? 'seller' : 'buyer');
          setUserRole(defaultRole);
        }
      } else {
        setUserRole('');
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (loading) return;

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('success')) {
      const updateOrderAfterSuccess = async () => {
        try {
          if (user) {
            const { collection, query, where, orderBy, limit, getDocs, updateDoc, doc, getDoc } = await import('firebase/firestore');
            const urlOrderId = urlParams.get('orderId');
            
            if (urlOrderId) {
              // Direct update using specific orderId
              const orderRef = doc(db, 'orders', urlOrderId);
              const orderSnap = await getDoc(orderRef);
              if (orderSnap.exists() && orderSnap.data().status === 'pending') {
                await updateDoc(orderRef, { status: 'paid' });
                console.log('Order marked as paid directly:', urlOrderId);
              }
            } else {
              // Fallback to latest pending order logic
              const q = query(
                collection(db, 'orders'),
                where('userId', '==', user.uid),
                where('status', '==', 'pending'),
                orderBy('createdAt', 'desc'),
                limit(1)
              );
              const querySnapshot = await getDocs(q);
              if (!querySnapshot.empty) {
                const orderDoc = querySnapshot.docs[0];
                await updateDoc(doc(db, 'orders', orderDoc.id), { status: 'paid' });
                console.log('Order marked as paid via fallback:', orderDoc.id);
              }
            }
            alert('تمت عملية الدفع بنجاح! شكراً لك على تسوقك.');
            clearCart();
          }
        } catch (error) {
          console.error('Error updating order after success:', error);
          alert('حدث خطأ أثناء تحديث حالة الطلب، ولكن تم استلام الدفع بنجاح.');
        } finally {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      };

      updateOrderAfterSuccess();
    } else if (urlParams.get('canceled')) {
      alert('تم إلغاء عملية الدفع. يمكنك المحاولة مرة أخرى في أي وقت.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [clearCart, user, loading]);

  const isSeller = (user?.phoneNumber?.replace('+', '') === WHATSAPP_NUMBER) || 
                   (user?.phoneNumber === WHATSAPP_NUMBER) || 
                   (user?.phoneNumber === '+' + WHATSAPP_NUMBER) ||
                   (user?.email?.toLowerCase() === 'mahmoudmasry165@gmail.com') ||
                   (user?.email?.toLowerCase() === '201115454823@seven.store') ||
                   (user?.email?.toLowerCase() === '01115454823@seven.store');

  if (loading) return null;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans" dir="rtl">
      <Navbar 
        onCartClick={() => {
          if (!auth.currentUser) {
            alert('يرجى تسجيل الدخول أو إنشاء حساب لعرض السلة.');
            window.location.href = '/login';
          } else {
            setIsCartOpen(true);
          }
        }} 
        onStatsClick={() => setIsStatsOpen(true)} 
      />
      
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
          <Route path="/merchant" element={<MerchantRoute><Merchant /></MerchantRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
          <Route path="/coupons" element={<BuyerRoute><Coupons /></BuyerRoute>} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Bottom Navigation Removed as requested */}

      <GlobalNotifications isGlobalSellerMode={isSeller} onUnreadChange={setUnreadChatCount} />

      <footer className="py-12 bg-white border-t border-gray-100 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 opacity-40 grayscale">
              <ShoppingBag size={24} />
              <span className="text-2xl font-black tracking-tighter text-gray-900">
                SEVEN<span className="text-blue-600">.</span>
              </span>
            </div>
            <p className="text-gray-400 text-sm font-medium tracking-wide">
              برمجة وتطوير <span className="text-blue-600 font-bold">Mahmoud Masry</span>
            </p>
          </div>
        </div>
      </footer>

      <NotificationListener />
      
      <AboutUsModal isOpen={isAboutUsOpen} onClose={() => setIsAboutUsOpen(false)} />
      <StatsModal isOpen={isStatsOpen} onClose={() => setIsStatsOpen(false)} />

      <div className="fixed bottom-6 left-6 flex flex-col-reverse items-center gap-3 z-[90]">
        {/* Toggle Button */}
        <AnimatePresence>
          {isMenuExpanded && (
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.8 }}
              className="flex flex-col-reverse items-center gap-3"
            >
              {user ? (
                <>
                  {/* Support Chat - Hide for seller */}
                  {!isSeller && <ChatWindow />}
                  
                  {/* Coupons Button */}
                  {(!isSeller && userRole !== 'seller') && (
                    <Link 
                      to="/coupons"
                      className="w-14 h-14 bg-amber-500 text-white rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95 group relative border border-white/20"
                      title="كوبونات الخصم"
                    >
                      <Tag size={28} />
                      <span className="absolute left-full ml-4 bottom-1/2 translate-y-1/2 bg-white text-gray-900 px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-bold opacity-100 sm:opacity-0 sm:group-hover:opacity-100 whitespace-nowrap shadow-xl border border-gray-100 transition-all pointer-events-none translate-x-0 sm:translate-x-2 sm:group-hover:translate-x-0">
                        كوبونات الخصم
                      </span>
                    </Link>
                  )}

                  {/* Visitors Stats */}
                  <button 
                    onClick={() => {
                      setIsStatsOpen(true);
                      setIsMenuExpanded(false);
                    }}
                    className="w-14 h-14 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95 group relative border border-white/20"
                    title="إحصائيات المتجر"
                  >
                    <BarChart3 size={28} />
                    <span className="absolute left-full ml-4 bottom-1/2 translate-y-1/2 bg-white text-gray-900 px-3 py-1.5 rounded-xl text-xs font-bold opacity-0 group-hover:opacity-100 whitespace-nowrap shadow-xl border border-gray-100 transition-all pointer-events-none translate-x-2 group-hover:translate-x-0">
                      إحصائيات الزوار
                    </span>
                  </button>

                  {/* Who We Are Button */}
                  {!isSeller && (
                    <button 
                      onClick={() => {
                        setIsAboutUsOpen(true);
                        setIsMenuExpanded(false);
                      }}
                      className="w-14 h-14 bg-white text-blue-600 rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95 group relative border border-gray-100"
                      title="من نحن"
                    >
                      <Info size={28} />
                      <span className="absolute left-full ml-4 bottom-1/2 translate-y-1/2 bg-white text-gray-900 px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-bold opacity-100 sm:opacity-0 sm:group-hover:opacity-100 whitespace-nowrap shadow-xl border border-gray-100 transition-all pointer-events-none translate-x-0 sm:translate-x-2 sm:group-hover:translate-x-0">
                        من نحن
                      </span>
                    </button>
                  )}
                </>
              ) : (
                <>
                  {/* Visitors Stats */}
                  <button 
                    onClick={() => {
                      setIsStatsOpen(true);
                      setIsMenuExpanded(false);
                    }}
                    className="w-14 h-14 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95 group relative border border-white/20"
                    title="إحصائيات المتجر"
                  >
                    <BarChart3 size={28} />
                    <span className="absolute left-full ml-4 bottom-1/2 translate-y-1/2 bg-white text-gray-900 px-3 py-1.5 rounded-xl text-xs font-bold opacity-0 group-hover:opacity-100 whitespace-nowrap shadow-xl border border-gray-100 transition-all pointer-events-none translate-x-2 group-hover:translate-x-0">
                      إحصائيات الزوار
                    </span>
                  </button>

                  {/* Who We Are Button */}
                  <button 
                    onClick={() => {
                      setIsAboutUsOpen(true);
                      setIsMenuExpanded(false);
                    }}
                    className="w-14 h-14 bg-white text-blue-600 rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95 group relative border border-gray-100"
                    title="من نحن"
                  >
                    <Info size={28} />
                    <span className="absolute left-full ml-4 bottom-1/2 translate-y-1/2 bg-white text-gray-900 px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-bold opacity-100 sm:opacity-0 sm:group-hover:opacity-100 whitespace-nowrap shadow-xl border border-gray-100 transition-all pointer-events-none translate-x-0 sm:translate-x-2 sm:group-hover:translate-x-0">
                      من نحن
                    </span>
                  </button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scroll to Top Button */}
        <AnimatePresence>
          {showScrollTop && (
            <motion.button
              initial={{ opacity: 0, y: 10, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.8 }}
              onClick={scrollToTop}
              className="w-14 h-14 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95 group relative border border-white/20"
              title="العودة للأعلى"
            >
              <ChevronUp size={28} />
              <span className="absolute left-full ml-4 bottom-1/2 translate-y-1/2 bg-white text-gray-900 px-3 py-1.5 rounded-xl text-xs font-bold opacity-0 group-hover:opacity-100 whitespace-nowrap shadow-xl border border-gray-100 transition-all pointer-events-none translate-x-2 group-hover:translate-x-0">
                العودة للأعلى
              </span>
            </motion.button>
          )}
        </AnimatePresence>

        {/* Toggle Button */}
        <motion.button 
          onClick={() => setIsMenuExpanded(!isMenuExpanded)}
          animate={!isMenuExpanded ? {
            y: [0, -3, 3, -3, 3, 0],
            rotate: 0
          } : { rotate: 180 }}
          transition={!isMenuExpanded ? {
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          } : { duration: 0.3 }}
          className="w-14 h-14 bg-white text-blue-600 rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95 group relative border border-gray-100 z-[91]"
          title={isMenuExpanded ? "إغلاق" : "المزيد"}
        >
          {isMenuExpanded ? <X size={28} /> : <ChevronUp size={28} />}
          {!isMenuExpanded && unreadChatCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] sm:text-xs w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center font-bold border-2 border-white shadow-sm animate-bounce">
              {unreadChatCount}
            </span>
          )}
        </motion.button>
      </div>
      </div>
    );
}
