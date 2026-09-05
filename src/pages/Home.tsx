import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, where, getDocs, limit, startAfter, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType, isQuotaExceededError } from '../lib/firebase';
import { Product, Category, Coupon, Banner } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { WHATSAPP_NUMBER } from '../constants';
import { useCart } from '../context/CartContext';
import { X, ShoppingCart, Info, Tag, Plus, ShieldCheck, Minus, ShoppingBag, LayoutGrid, Search, ChevronLeft, ChevronRight, LogIn, Star, Ticket, ArrowLeft, Maximize, MousePointerClick, Smartphone, Share2, Check, Filter, Coins } from 'lucide-react';
import ProductReviews from '../components/ProductReviews';
import { Link } from 'react-router-dom';
import ReviewSummary from '../components/ReviewSummary';

const PRODUCTS_PER_PAGE = 50;

const STORE_COLORS = [
  'text-orange-500',
  'text-rose-500',
  'text-fuchsia-500',
  'text-violet-500',
  'text-emerald-500',
  'text-cyan-500',
  'text-teal-500',
  'text-lime-600',
  'text-pink-500',
  'text-amber-600',
  'text-indigo-500',
  'text-red-500',
];

const getStoreColor = (product: Product) => {
  if (product.sellerRole === 'admin') return 'text-blue-600';
  
  let hash = 0;
  if (product.sellerId) {
    for (let i = 0; i < product.sellerId.length; i++) {
      hash = product.sellerId.charCodeAt(i) + ((hash << 5) - hash);
    }
  }
  return STORE_COLORS[Math.abs(hash) % STORE_COLORS.length];
};

export default function Home() {
  const { addToCart, updateQuantity, items } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStore, setSelectedStore] = useState<{id: string, name: string, logo: string} | null>(null);
  const [minPrice, setMinPrice] = useState<number | ''>('');
  const [maxPrice, setMaxPrice] = useState<number | ''>('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'priceAsc' | 'priceDesc' | 'bestSelling' | 'topRated'>('newest');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [banners, setBanners] = useState<Banner[]>([]);

  const getYouTubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);

  const [direction, setDirection] = useState(0);

  useEffect(() => {
    if (selectedProduct) {
      setSelectedColor(selectedProduct.colors?.[0] || '');
      setSelectedSize(selectedProduct.sizes?.[0] || '');
      setSelectedQuantity(1);
    }
  }, [selectedProduct]);

  // Initial fetch for categories and banners (Static data usually)
  useEffect(() => {
    // 1. Try to load categories from Cache first
    const cachedCats = sessionStorage.getItem('cached_categories');
    if (cachedCats) {
      try {
        const parsed = JSON.parse(cachedCats);
        if (Array.isArray(parsed)) {
          setCategories(parsed);
        }
      } catch (e) {
        console.error("Error parsing cached categories:", e);
      }
    }

    const unsubCats = onSnapshot(collection(db, 'categories'), (snapshot) => {
      const cats = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) })) as Category[];
      setCategories(cats || []);
      sessionStorage.setItem('cached_categories', JSON.stringify(cats || []));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'categories');
    });

    // 2. Try to load banners from Cache first
    const cachedBanners = sessionStorage.getItem('cached_banners');
    if (cachedBanners) {
      try {
        const parsed = JSON.parse(cachedBanners);
        if (Array.isArray(parsed)) {
          setBanners(parsed);
        }
      } catch (e) {
        console.error("Error parsing cached banners:", e);
      }
    }

    const unsubBanners = onSnapshot(
      query(collection(db, 'banners'), where('isActive', '==', true), orderBy('order', 'asc')), 
      (snapshot) => {
        const bannersData = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) })) as Banner[];
        setBanners(bannersData || []);
        sessionStorage.setItem('cached_banners', JSON.stringify(bannersData || []));
      }, (error) => {
        if (isQuotaExceededError(error)) {
          sessionStorage.setItem('quota_exceeded', 'true');
        }
      }
    );

    fetchInitialProducts(true);

    return () => {
      unsubCats();
      unsubBanners();
    };
  }, []);

  // Separate effect for product fetching to handle categories readiness and store changes
  useEffect(() => {
    const catsLength = (categories || []).length;
    if (catsLength > 0 || selectedCategory === 'all') {
      fetchInitialProducts((products || []).length > 0);
    }
  }, [selectedCategory, selectedStore?.id, (categories || []).length]);

  const fetchInitialProducts = async (isSilent = false) => {
    if (!isSilent) setLoading(true);

    const cacheKey = `products_${selectedStore?.id || 'all'}_${selectedCategory}`;
    const cachedStr = sessionStorage.getItem(cacheKey);
    if (cachedStr) {
      try {
        const { data, timestamp } = JSON.parse(cachedStr);
        if (Date.now() - timestamp < 1000 * 60 * 5) { // 5 minutes cache
          setProducts(data);
          if (!isSilent) setLoading(false);
          return;
        }
      } catch (e) {
        console.error("Error parsing products cache", e);
      }
    }

    try {
      let qProds;
      if (selectedStore) {
        // Fetch all products of this store (up to 150) so we can filter and show tabs client-side
        qProds = query(
          collection(db, 'products'),
          where('sellerId', '==', selectedStore.id),
          limit(150)
        );
      } else if (selectedCategory === 'all') {
        qProds = query(
          collection(db, 'products'), 
          orderBy('createdAt', 'desc'),
          limit(PRODUCTS_PER_PAGE)
        );
      } else {
        // Check if selectedCategory is a parent category
        const parentCat = categories.find(c => c.name === selectedCategory && !c.parentId);
        
        if (parentCat) {
          // If it's a parent, get all its subcategories
          const subCatNames = categories.filter(c => c.parentId === parentCat.id).map(c => c.name);
          // Include the parent category name itself just in case products are tagged with it
          const allRelevantCats = [selectedCategory, ...subCatNames];
          
          // Firestore 'in' query supports up to 30 elements
          qProds = query(
            collection(db, 'products'), 
            where('category', 'in', allRelevantCats.slice(0, 30)),
            orderBy('createdAt', 'desc'),
            limit(PRODUCTS_PER_PAGE)
          );
        } else {
          qProds = query(
            collection(db, 'products'), 
            where('category', '==', selectedCategory),
            orderBy('createdAt', 'desc'),
            limit(PRODUCTS_PER_PAGE)
          );
        }
      }
      
      const snapshot = await getDocs(qProds);
      const prods = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        _randomSort: Math.random(),
        ...(doc.data() as any) 
      })) as (Product & { _randomSort?: number })[];
      
      setProducts(prods);
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ data: prods, timestamp: Date.now() }));
      } catch (e) {
        console.error("Error setting products cache", e);
      }
    } catch (error) {
      if (!isQuotaExceededError(error)) {
        console.error("Error fetching products:", error);
      }
      handleFirestoreError(error, OperationType.LIST, 'products');
    } finally {
      setLoading(false);
    }
  };

  // If category changes, we might need a different approach, but for now let's filter client-side 
  // or fetch by category if the list is huge. 
  // Given current app structure, let's keep client-side filtering for search/category if not extreme.

  // Banner auto-play control
  const [isHoveringBanner, setIsHoveringBanner] = useState(false);

  useEffect(() => {
    if (banners.length <= 1 || isHoveringBanner) return;
    const timer = setInterval(() => {
      setCurrentBannerIndex(prev => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [banners, isHoveringBanner]);

  const paginate = (newDirection: number) => {
    setDirection(newDirection);
    setCurrentBannerIndex(prev => (prev + newDirection + banners.length) % banners.length);
  };

  const filteredProducts = products.filter(p => {
    const matchesIsActive = p.isActive !== false;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (p.storeName?.toLowerCase() || '').includes(searchQuery.toLowerCase());
    const matchesStore = selectedStore ? (p.sellerId === selectedStore.id) : true;
    const matchesMinPrice = minPrice === '' || p.price >= minPrice;
    const matchesMaxPrice = maxPrice === '' || p.price <= maxPrice;
    const matchesStock = !inStockOnly || p.quantity > 0;
    
    // Category matching logic
    let matchesCategory = selectedCategory === 'all';
    if (!matchesCategory) {
      const parentCat = categories.find(c => c.name === selectedCategory && !c.parentId);
      if (parentCat) {
        const subCatNames = categories.filter(c => c.parentId === parentCat.id).map(c => c.name);
        matchesCategory = p.category === selectedCategory || subCatNames.includes(p.category);
      } else {
        matchesCategory = p.category === selectedCategory;
      }
    }
    
    return matchesIsActive && matchesSearch && matchesStore && matchesMinPrice && matchesMaxPrice && matchesStock && matchesCategory;
  }).sort((a: any, b: any) => {
    if (sortBy === 'priceAsc') return a.price - b.price;
    if (sortBy === 'priceDesc') return b.price - a.price;
    if (sortBy === 'bestSelling') return (b.salesCount || 0) - (a.salesCount || 0);
    if (sortBy === 'topRated') return (b.rating || 0) - (a.rating || 0);
    
    if (selectedCategory === 'all' && sortBy === 'newest') {
      return (a._randomSort || 0) - (b._randomSort || 0);
    }
    
    // Default: Sort by order then newest
    const orderA = a.order ?? 1000000;
    const orderB = b.order ?? 1000000;
    if (orderA !== orderB) return orderA - orderB;
    return 0; // Pre-sorted by date via query
  });

  // Derive top-level categories
  const displayCategories = useMemo(() => {
    if (!selectedStore) return categories;
    
    // Find all categories used by the selected merchant's products
    const merchantProductCategories = new Set(
      products.filter(p => p.sellerId === selectedStore.id).map(p => p.category)
    );
    
    return categories.filter(c => 
      merchantProductCategories.has(c.name) || 
      (c.parentId && categories.find(parent => parent.id === c.parentId && merchantProductCategories.has(parent.name))) || 
      categories.some(sub => sub.parentId === c.id && merchantProductCategories.has(sub.name))
    );
  }, [categories, products, selectedStore]);

  const mainCategories = [...displayCategories].filter(c => !c.parentId).sort((a, b) => {
    const orderA = a.order ?? 1000000;
    const orderB = b.order ?? 1000000;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });
  const subCategories = [...displayCategories].filter(c => c.parentId).sort((a, b) => {
    const orderA = a.order ?? 1000000;
    const orderB = b.order ?? 1000000;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });

  const uniqueStores = useMemo(() => {
    const storesMap = new Map<string, { id: string, name: string, logo: string }>();
    products.forEach(p => {
      if (p.storeName && p.sellerId) {
        if (!storesMap.has(p.sellerId)) {
          storesMap.set(p.sellerId, {
            id: p.sellerId,
            name: p.storeName,
            logo: p.storeLogo || ''
          });
        }
      }
    });
    return Array.from(storesMap.values());
  }, [products]);

  const [isAdding, setIsAdding] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);

  // Handle Deep Linking (?p=productId) - Initial Load ONLY
  useEffect(() => {
    const handleDeepLink = async () => {
      const params = new URLSearchParams(window.location.search);
      const productId = params.get('p');
      
      if (productId) {
        try {
          // Fetch directly to ensure we have it even if not in current page
          const docRef = doc(db, 'products', productId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const productData = { id: docSnap.id, ...docSnap.data() } as Product;
            // Only open if active
            if (productData.isActive !== false) {
              setSelectedProduct(productData);
            } else {
              // If inactive, clear the URL param
              window.history.replaceState({}, '', window.location.pathname);
              alert('عذراً، هذا المنتج غير متوفر حالياً.');
            }
          }
        } catch (error) {
          console.error("Error opening shared product:", error);
        }
      }
    };
    
    handleDeepLink();

    // Handle back button
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const productId = params.get('p');
      if (!productId) {
        setSelectedProduct(null);
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []); // Only on mount

  // Sync state back to URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const productIdInUrl = params.get('p');

    if (selectedProduct) {
      if (productIdInUrl !== selectedProduct.id) {
        const newUrl = `${window.location.origin}${window.location.pathname}?p=${selectedProduct.id}`;
        window.history.pushState({ productId: selectedProduct.id }, '', newUrl);
      }
    } else {
      if (productIdInUrl) {
        window.history.pushState({}, '', window.location.pathname);
      }
    }
  }, [selectedProduct?.id]);

  const handleShare = (e: React.MouseEvent, product: Product) => {
    e.stopPropagation();
    const shareUrl = `${window.location.origin}/?p=${product.id}`;
    const shareText = `تحقق من هذا المنتج الرائع في متجر SEVEN:\n${product.name}\nالسعر: ${product.price} ج.م\n\nتفضل بزيارة المنتج من هنا:`;
    
    if (navigator.share) {
      navigator.share({
        title: product.name,
        text: shareText,
        url: shareUrl
      }).catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('Error sharing', error);
        }
      });
    } else {
      navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      setShareSuccess(product.id);
      setTimeout(() => setShareSuccess(null), 2000);
    }
  };

  const handleAddToCart = () => {
    if (!selectedProduct) return;
    
    // Check if user is authenticated
    if (!auth.currentUser) {
      alert('يرجى تسجيل الدخول أو إنشاء حساب للمتابعة وإضافة المنتجات للسلة.');
      window.location.href = '/login';
      return;
    }
    
    setIsAdding(true);
    // Artificial delay for better UX
    setTimeout(() => {
      addToCart(selectedProduct, selectedColor, selectedSize, selectedQuantity);
      setIsAdding(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
      setSelectedProduct(null);
    }, 400);
  };

  const getCartItem = (id: string, color?: string, size?: string) => 
    items.find(item => item.id === id && item.selectedColor === color && item.selectedSize === size);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-blue-600 font-bold animate-pulse">جاري تحميل المنتجات...</p>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-8 text-center px-4">
        <motion.h1 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl sm:text-4xl font-extrabold text-gray-900 mb-4 leading-tight shrink-0"
        >
          أهلاً بك في متجر Seven
        </motion.h1>
        <p className="text-gray-600 text-base sm:text-lg">نتمنى لك رحلة تسوق ممتعة ومليئة بالرضا</p>
      </header>

      {/* Banner Section */}
      {banners.length > 0 && (
        <div 
          className="relative mb-8 sm:mb-12 rounded-3xl sm:rounded-[2rem] overflow-hidden min-h-[200px] sm:min-h-[300px] md:h-[450px] bg-gray-100 shadow-[0_10px_30px_rgba(0,0,0,0.1)] border border-gray-100/50 group"
          onMouseEnter={() => setIsHoveringBanner(true)}
          onMouseLeave={() => setIsHoveringBanner(false)}
        >
          <AnimatePresence initial={false} custom={direction}>
            <motion.div
              key={currentBannerIndex}
              custom={direction}
              variants={{
                enter: (direction: number) => ({
                  x: direction > 0 ? '100%' : '-100%',
                  opacity: 0
                }),
                center: {
                  zIndex: 1,
                  x: 0,
                  opacity: 1
                },
                exit: (direction: number) => ({
                  zIndex: 0,
                  x: direction < 0 ? '100%' : '-100%',
                  opacity: 0
                })
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 }
              }}
              className="absolute inset-0 flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing touch-pan-y"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={1}
              onDragEnd={(_, info) => {
                const swipe = info.offset.x;
                const threshold = 50;
                if (swipe > threshold) {
                  paginate(-1);
                } else if (swipe < -threshold) {
                  paginate(1);
                }
              }}
            >
              {banners[currentBannerIndex] ? (
                <>
                  {/* Blurred background for "auto-fit" look */}
                  <img 
                    src={banners[currentBannerIndex].imageUrl} 
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover blur-3xl opacity-30 scale-110 pointer-events-none"
                  />
                  
                  <img 
                    src={banners[currentBannerIndex].imageUrl} 
                    alt={banners[currentBannerIndex].title}
                    className="relative w-full h-full object-cover transition-transform duration-[10s] linear group-hover:scale-105 pointer-events-none"
                    referrerPolicy="no-referrer"
                  />
                  
                  {banners[currentBannerIndex].title && (
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end p-8 md:p-12 pointer-events-none">
                       <div className="max-w-2xl">
                         <motion.div
                           initial={{ y: 30, opacity: 0 }}
                           animate={{ y: 0, opacity: 1 }}
                           transition={{ delay: 0.2, duration: 0.5 }}
                         >
                           <span className="inline-block px-4 py-1.5 bg-blue-600 text-white text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-full mb-4 shadow-lg shadow-blue-600/30">عرض خاص</span>
                           <h3 className="text-white text-2xl sm:text-4xl md:text-5xl font-black leading-tight drop-shadow-2xl">
                             {banners[currentBannerIndex].title}
                           </h3>
                         </motion.div>
                       </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                  <div className="animate-pulse flex flex-col items-center gap-2">
                    <div className="w-12 h-12 bg-gray-200 rounded-full" />
                    <div className="h-4 w-32 bg-gray-200 rounded" />
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          
          {banners.length > 1 && (
            <>
              {/* Auto-play progress bar */}
              <div className="absolute top-0 left-0 w-full h-1 bg-white/20 z-20">
                <motion.div 
                  key={currentBannerIndex + (isHoveringBanner ? '_paused' : '_running')}
                  initial={{ width: "0%" }}
                  animate={{ width: isHoveringBanner ? "0%" : "100%" }}
                  transition={{ duration: isHoveringBanner ? 0 : 5, ease: "linear" }}
                  className="h-full bg-blue-500 shadow-[0_0_10px_#3b82f6]"
                />
              </div>

            </>
          )}
        </div>
      )}

      {/* Search Bar */}
      <div className="mb-4 max-w-2xl mx-auto relative group">
        <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-600 transition-colors">
          <Search size={22} />
        </div>
        <input
          type="text"
          placeholder="ابحث عن منتج أو تاجر..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-white border-2 border-gray-100 rounded-3xl py-4 pr-12 pl-6 text-lg focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 transition-all shadow-sm group-hover:shadow-md"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute inset-y-0 left-0 pl-4 flex items-center text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {selectedStore && (
        <div className="max-w-2xl mx-auto mb-8 flex justify-center">
          <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm font-medium">
            {selectedStore.logo ? (
              <img src={selectedStore.logo} alt={selectedStore.name} className="w-6 h-6 rounded-full object-cover" />
            ) : (
              <ShieldCheck size={18} />
            )}
            <span>منتجات التاجر: <strong className="font-black">{selectedStore.name}</strong></span>
            <button
              onClick={() => {
                setSelectedStore(null);
                setSelectedCategory('all');
              }}
              className="bg-white/50 hover:bg-white p-1 rounded-full transition-colors text-blue-600 mr-2"
            >
              <X size={14} strokeWidth={3} />
            </button>
          </div>
        </div>
      )}

      {/* Merchants List */}
      {!selectedStore && uniqueStores.length > 0 && (
        <div className="max-w-7xl mx-auto mb-8">
          <h2 className="text-xl font-black mb-4 px-4 text-gray-900 border-r-4 border-blue-600 pr-3">المتاجر المميزة</h2>
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide px-4 snap-x">
            {uniqueStores.map(store => (
              <button
                key={store.id}
                onClick={() => {
                  setSelectedStore(store);
                  setSearchQuery('');
                  setSelectedCategory('all');
                }}
                className={`flex flex-col items-center gap-3 min-w-[80px] snap-start transition-all opacity-80 hover:opacity-100 hover:scale-105`}
              >
                {store.logo ? (
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-gray-100 shadow-sm p-0.5 bg-white overflow-hidden">
                    <img src={store.logo} alt={store.name} className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                ) : (
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-gray-100 bg-gray-50 flex items-center justify-center p-0.5 shadow-sm">
                    <ShieldCheck size={28} className="text-gray-400" />
                  </div>
                )}
                <span className="text-xs sm:text-sm font-bold text-center line-clamp-2 text-gray-700">{store.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Category Filter Section */}
      <div className="flex flex-col lg:flex-row-reverse gap-8 mb-12">
        {/* Sidebar - Desktop Only */}
        <aside className="hidden lg:block w-72 shrink-0">
          <div className="sticky top-24 bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-8">
            <div>
              <h2 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-2">
                <LayoutGrid size={22} className="text-blue-600" />
                الأقسام
              </h2>
              
              <div className="space-y-2">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`w-full text-right px-4 py-3 rounded-xl font-bold transition-all flex items-center gap-3 ${
                    selectedCategory === 'all'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-blue-600'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${selectedCategory === 'all' ? 'bg-white' : 'bg-gray-300'}`} />
                  كل المنتجات
                </button>

                {mainCategories.map((main) => {
                  const isActive = selectedCategory === main.name || subCategories.some(s => s.name === selectedCategory && s.parentId === main.id);
                  const isCurrent = selectedCategory === main.name;
                  const relevantSubs = subCategories.filter(s => s.parentId === main.id);

                  return (
                    <div key={main.id} className="space-y-1">
                      <button
                        onClick={() => setSelectedCategory(main.name)}
                        className={`w-full text-right px-4 py-3 rounded-xl font-bold transition-all flex items-center justify-between group ${
                          isActive
                            ? isCurrent ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-blue-50 text-blue-600'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-blue-600'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${isActive ? (isCurrent ? 'bg-white' : 'bg-blue-600') : 'bg-gray-300 group-hover:bg-blue-300'}`} />
                          <span>{main.name}</span>
                        </div>
                        {relevantSubs.length > 0 && <span className={`text-[10px] px-2 py-0.5 rounded-md ${isActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-500'}`}>{relevantSubs.length}</span>}
                      </button>

                      {/* Subcategories - show if parent is active */}
                      {isActive && relevantSubs.length > 0 && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mr-6 space-y-1 overflow-hidden"
                        >
                          {relevantSubs.map(sub => (
                            <button
                              key={sub.id}
                              onClick={() => setSelectedCategory(sub.name)}
                              className={`w-full text-right px-4 py-2 rounded-lg text-sm font-bold transition-all border-r-2 ${
                                selectedCategory === sub.name
                                  ? 'bg-blue-50/50 border-blue-600 text-blue-600'
                                  : 'border-transparent text-gray-500 hover:text-blue-500 hover:border-blue-200'
                              }`}
                            >
                              {sub.name}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Filters Section */}
            <div className="pt-6 border-t border-gray-100">
              <button 
                onClick={() => setShowFilters(!showFilters)}
                className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all border ${
                  showFilters 
                    ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200' 
                    : 'bg-white border-gray-100 text-gray-900 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Filter size={18} />
                  <span className="font-black text-sm">تصفية المنتجات</span>
                </div>
                {showFilters ? <Minus size={18} /> : <Plus size={18} />}
              </button>

              <AnimatePresence>
                {showFilters && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-6 space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">خيارات التصفية</h3>
                        {(maxPrice !== '' || minPrice !== '' || inStockOnly || sortBy !== 'newest') && (
                          <button 
                            onClick={() => {
                              setMaxPrice('');
                              setMinPrice('');
                              setInStockOnly(false);
                              setSortBy('newest');
                            }}
                            className="text-[10px] font-black text-red-500 hover:text-red-600 flex items-center gap-1"
                          >
                            <X size={12} />
                            إلغاء الكل
                          </button>
                        )}
                      </div>

                      <div className="space-y-6">
                        {/* Sort dropdown */}
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">ترتيب حسب</label>
                          <select 
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as any)}
                            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-700 focus:ring-2 focus:ring-blue-100 focus:border-blue-600 outline-none transition-all appearance-none cursor-pointer"
                          >
                            <option value="newest">الأحدث والمميز</option>
                            <option value="bestSelling">الأكثر مبيعاً</option>
                            <option value="topRated">الأعلى تقييماً</option>
                            <option value="priceAsc">السعر: من الأقل للأعلى</option>
                            <option value="priceDesc">السعر: من الأعلى للأقل</option>
                          </select>
                        </div>

                        {/* Stock Toggle */}
                        <button 
                          onClick={() => setInStockOnly(!inStockOnly)}
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                            inStockOnly 
                              ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100' 
                              : 'bg-white border-gray-100 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <span className="text-xs font-black">المتوفر في المخزون فقط</span>
                          <div className={`w-10 h-5 rounded-full relative transition-colors ${inStockOnly ? 'bg-white/20' : 'bg-gray-200'}`}>
                            <div className={`absolute top-1 w-3 h-3 rounded-full transition-all ${inStockOnly ? 'right-6 bg-white' : 'right-1 bg-gray-400'}`} />
                          </div>
                        </button>

                        {/* Price range manual input */}
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">نطاق السعر (ج.م)</label>
                          <div className="flex items-center gap-3">
                            <div className="relative flex-1">
                              <input
                                type="number"
                                placeholder="من"
                                value={minPrice}
                                onChange={(e) => setMinPrice(e.target.value === '' ? '' : Number(e.target.value))}
                                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-center text-xs font-bold focus:ring-2 focus:ring-blue-100 focus:border-blue-600 outline-none transition-all"
                              />
                            </div>
                            <span className="text-gray-300">—</span>
                            <div className="relative flex-1">
                              <input
                                type="number"
                                placeholder="إلى"
                                value={maxPrice}
                                onChange={(e) => setMaxPrice(e.target.value === '' ? '' : Number(e.target.value))}
                                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-center text-xs font-bold focus:ring-2 focus:ring-blue-100 focus:border-blue-600 outline-none transition-all"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 space-y-2">
              <div className="flex items-center gap-2 text-amber-600">
                <Ticket size={18} />
                <span className="font-bold text-sm">عروض اليوم</span>
              </div>
              <p className="text-[10px] text-amber-700 font-medium leading-relaxed">استخدم كوبونات الخصم المتوفرة للحصول على أفضل سعر!</p>
              <Link to="/coupons" className="inline-block text-[10px] font-black text-amber-600 underline">عرض الكوبونات</Link>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1">
          {/* Mobile Filters Area */}
          <div className="lg:hidden mb-8 space-y-4">
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={`w-full flex items-center justify-between p-5 rounded-3xl transition-all border shadow-sm ${
                showFilters 
                  ? 'bg-blue-600 border-blue-600 text-white' 
                  : 'bg-white border-gray-100 text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${showFilters ? 'bg-white/20' : 'bg-blue-50 text-blue-600'}`}>
                  <Filter size={14} />
                </div>
                <span className="text-[13px] font-black">خيارات التصفية والترتيب</span>
              </div>
              <div className="flex items-center gap-2">
                {(maxPrice !== '' || minPrice !== '' || inStockOnly || sortBy !== 'newest') && !showFilters && (
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                )}
                {showFilters ? <Minus size={18} /> : <Plus size={18} />}
              </div>
            </button>

            <AnimatePresence>
              {showFilters && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xl space-y-5"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-gray-900">تصفية المنتجات</h3>
                    {(maxPrice !== '' || minPrice !== '' || inStockOnly || sortBy !== 'newest') && (
                      <button 
                        onClick={() => {
                          setMaxPrice('');
                          setMinPrice('');
                          setInStockOnly(false);
                          setSortBy('newest');
                        }} 
                        className="text-[10px] font-black text-red-500 bg-red-50 px-3 py-1.5 rounded-full flex items-center gap-1"
                      >
                        <X size={12} />
                        مسح الكل
                      </button>
                    )}
                  </div>

                  {/* Mobile Sort & Stock Toggle */}
                  <div className="flex flex-col gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 mr-2">ترتيب المنتجات</label>
                      <select 
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-[11px] font-black text-gray-700 outline-none appearance-none"
                      >
                        <option value="newest">الأحدث</option>
                        <option value="bestSelling">الأكثر مبيعاً</option>
                        <option value="topRated">الأعلى تقييماً</option>
                        <option value="priceAsc">السعر: الأقل</option>
                        <option value="priceDesc">السعر: الأعلى</option>
                      </select>
                    </div>
                    <button 
                      onClick={() => setInStockOnly(!inStockOnly)}
                      className={`w-full py-3 rounded-xl text-[11px] font-black border transition-all flex items-center justify-center gap-2 ${
                        inStockOnly ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-gray-200 text-gray-500'
                      }`}
                    >
                      {inStockOnly ? <Check size={14} /> : null}
                      {inStockOnly ? 'بالمخزون فقط' : 'إظهار كل الكميات'}
                    </button>
                  </div>
                  
                  {/* Mobile Price Entry */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 mr-2">نطاق السعر</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        placeholder="السعر من"
                        value={minPrice}
                        onChange={(e) => setMinPrice(e.target.value === '' ? '' : Number(e.target.value))}
                        className="flex-1 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-center text-[11px] font-bold focus:ring-2 focus:ring-blue-100 focus:border-blue-600 outline-none"
                      />
                      <input
                        type="number"
                        placeholder="إلى"
                        value={maxPrice}
                        onChange={(e) => setMaxPrice(e.target.value === '' ? '' : Number(e.target.value))}
                        className="flex-1 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-center text-[11px] font-bold focus:ring-2 focus:ring-blue-100 focus:border-blue-600 outline-none"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="overflow-x-auto pb-4 scrollbar-hide flex items-center gap-2 -mx-4 px-4 sticky top-[3.5rem] bg-gray-50/80 backdrop-blur-md z-30 py-2 border-b border-gray-100 sm:relative sm:top-0 sm:bg-transparent sm:border-none">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`whitespace-nowrap px-5 py-2.5 rounded-full text-sm font-bold transition-all border-2 flex items-center gap-2 ${
                  selectedCategory === 'all'
                    ? 'bg-blue-600 border-blue-600 text-white shadow-lg'
                    : 'bg-white border-gray-100 text-gray-500'
                }`}
              >
                الكل
              </button>
              {mainCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.name)}
                  className={`whitespace-nowrap px-5 py-2.5 rounded-full text-sm font-bold transition-all border-2 flex items-center gap-2 ${
                    selectedCategory === cat.name || subCategories.some(sub => sub.name === selectedCategory && sub.parentId === cat.id)
                      ? 'bg-blue-600 border-blue-600 text-white shadow-lg'
                      : 'bg-white border-gray-100 text-gray-500 hover:border-blue-200'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Mobile Subcategories */}
            {(() => {
              const activeMainCat = mainCategories.find(c => c.name === selectedCategory || subCategories.some(sub => sub.name === selectedCategory && sub.parentId === c.id));
              if (!activeMainCat) return null;
              
              const relevantSubs = subCategories.filter(s => s.parentId === activeMainCat.id);
              if (relevantSubs.length === 0) return null;

              return (
                <motion.div 
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide"
                >
                  <button
                    onClick={() => setSelectedCategory(activeMainCat.name)}
                    className={`whitespace-nowrap px-4 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                      selectedCategory === activeMainCat.name
                        ? 'bg-blue-100 border-blue-200 text-blue-600'
                        : 'bg-gray-50 border-gray-100 text-gray-500'
                    }`}
                  >
                    الكل في {activeMainCat.name}
                  </button>
                  {relevantSubs.map(sub => (
                    <button
                      key={sub.id}
                      onClick={() => setSelectedCategory(sub.name)}
                      className={`whitespace-nowrap px-4 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                        selectedCategory === sub.name
                          ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                          : 'bg-white border-gray-100 text-gray-500'
                      }`}
                    >
                      {sub.name}
                    </button>
                  ))}
                </motion.div>
              );
            })()}
          </div>

          {filteredProducts.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-[2.5rem] border-2 border-dashed border-gray-100">
              <ShoppingBag size={48} className="mx-auto text-gray-200 mb-4" />
              <p className="text-gray-400 text-xl font-medium">لا توجد منتجات في هذا القسم حالياً.</p>
              <button 
                onClick={() => setSelectedCategory('all')}
                className="mt-4 text-blue-600 font-bold hover:underline"
              >
                العودة لكل المنتجات
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-8">
              {filteredProducts.map((product) => (
                <motion.div
                  key={product.id}
                  layoutId={product.id}
                  onClick={() => setSelectedProduct(product)}
                  whileHover={{ y: -5 }}
                  className="bg-white rounded-2xl sm:rounded-3xl shadow-sm hover:shadow-xl transition-all cursor-pointer overflow-hidden group border border-gray-50 flex flex-col h-full"
                >
                  <div className="relative aspect-[4/5] overflow-hidden bg-gray-50">
                    <img 
                      src={product.imageUrl} 
                      alt={product.name}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                      referrerPolicy="no-referrer"
                    />
                    {product.quantity <= 0 && (
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center">
                        <span className="bg-red-500 text-white px-3 py-1 rounded-full text-[8px] sm:text-xs font-black uppercase tracking-wider shadow-lg">نفذ</span>
                      </div>
                    )}
                    <div className="absolute top-2 right-2 sm:top-4 sm:left-4">
                      <span className="bg-white/90 backdrop-blur px-2 py-0.5 sm:px-3 sm:py-1 rounded-lg sm:rounded-xl text-[8px] sm:text-[10px] font-black text-blue-600 shadow-sm border border-blue-50 uppercase">{product.category}</span>
                    </div>
                  </div>
                  <div className="p-3 sm:p-6 flex-1 flex flex-col">
                    {product.storeName && (
                      <div 
                        className="flex items-center gap-1.5 mb-1 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedStore({ id: product.sellerId, name: product.storeName!, logo: product.storeLogo || '' });
                          // Clear search query if they explicitly click on a store, 
                          // or leave it so it filters within the store?
                          // Usually clearing search is better when selecting a specific store.
                          setSearchQuery('');
                          setSelectedCategory('all');
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        {product.storeLogo && (
                           <img src={product.storeLogo} alt={product.storeName} className="w-4 h-4 sm:w-5 sm:h-5 rounded-full object-cover shadow-sm border border-gray-100" referrerPolicy="no-referrer" />
                        )}
                        <p className={`text-[10px] sm:text-xs font-bold line-clamp-1 hover:underline ${getStoreColor(product)}`}>{product.storeName}</p>
                      </div>
                    )}
                    <h3 className="text-sm sm:text-lg font-black text-gray-900 mb-1 group-hover:text-blue-600 transition-colors line-clamp-2">{product.name}</h3>
                    <div className="mb-2 sm:mb-4 scale-75 sm:scale-100 origin-right">
                      <ReviewSummary productId={product.id} />
                    </div>
                    <div className="flex justify-between items-center mt-auto">
                      <div className="flex flex-col">
                        <span className="text-sm sm:text-2xl font-black text-blue-600">{product.price} <small className="text-[10px] sm:text-xs font-bold text-gray-400">ج.م</small></span>
                      </div>
                      
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <button
                          onClick={(e) => handleShare(e, product)}
                          className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center transition-all shadow-sm ${
                            shareSuccess === product.id 
                              ? 'bg-green-100 text-green-600' 
                              : 'bg-white border border-gray-100 text-gray-500 hover:text-blue-600 hover:bg-blue-50'
                          }`}
                          title="مشاركة المنتج"
                        >
                          {shareSuccess === product.id ? <Check size={16} /> : <Share2 size={16} />}
                        </button>
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-50 text-blue-600 rounded-lg sm:rounded-xl flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm group-hover:shadow-blue-600/30">
                          <Plus size={16} className="sm:hidden" />
                          <Plus size={20} className="hidden sm:block" />
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Product Details Modal */}
      <AnimatePresence>
        {selectedProduct && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setSelectedProduct(null);
                setActiveImageIndex(0);
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              layoutId={selectedProduct.id}
              className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-4xl overflow-y-auto md:overflow-hidden shadow-2xl flex flex-col md:flex-row h-[92dvh] md:h-auto md:max-h-[85vh] mt-auto sm:mt-0"
            >
                <div className="sticky top-4 right-4 z-50 flex gap-2 justify-end w-full px-4 pt-4 md:absolute md:w-auto md:px-0 md:pt-0 -mb-14 md:mb-0 pointer-events-none">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleShare(e, selectedProduct);
                    }}
                    className="bg-white/80 backdrop-blur hover:bg-white p-2 rounded-full shadow-lg transition-colors flex items-center justify-center text-blue-600 pointer-events-auto"
                    title="مشاركة المنتج"
                  >
                    {shareSuccess === selectedProduct.id ? <Check size={20} /> : <Share2 size={20} />}
                  </button>
                  <button 
                    onClick={() => {
                      setSelectedProduct(null);
                      setActiveImageIndex(0);
                    }}
                    className="bg-white/80 backdrop-blur hover:bg-white p-2 rounded-full shadow-lg transition-colors pointer-events-auto"
                  >
                    <X size={24} />
                  </button>
                </div>

              <div className="w-full md:w-1/2 flex flex-col bg-gray-100 flex-shrink-0 relative">
                <div className="relative aspect-square md:flex-1 group/img cursor-zoom-in">
                  <AnimatePresence mode="wait">
                    {(() => {
                      const allMedia = [
                        { type: 'image', url: selectedProduct.imageUrl },
                        ...(selectedProduct.images || []).map(img => ({ type: 'image', url: img })),
                        ...(selectedProduct.videoUrl ? [{ type: 'video', url: selectedProduct.videoUrl }] : [])
                      ];
                      const currentMedia = allMedia[activeImageIndex];

                      if (currentMedia.type === 'video') {
                        const ytId = getYouTubeId(currentMedia.url);
                        return (
                          <motion.div
                            key="video"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="w-full h-full"
                          >
                            {ytId ? (
                              <iframe
                                src={`https://www.youtube.com/embed/${ytId}?autoplay=0`}
                                className="w-full h-full"
                                allowFullScreen
                                title="Product Video"
                              />
                            ) : (
                              <video
                                src={currentMedia.url}
                                controls
                                className="w-full h-full object-contain bg-black"
                              />
                            )}
                          </motion.div>
                        );
                      }

                      return (
                        <motion.img 
                          key={activeImageIndex}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          src={currentMedia.url} 
                          alt={selectedProduct.name}
                          onClick={() => setFullScreenImage(currentMedia.url)}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-105"
                          referrerPolicy="no-referrer"
                        />
                      );
                    })()}
                  </AnimatePresence>

                  <div className="absolute top-4 left-4 z-10 opacity-0 group-hover/img:opacity-100 transition-opacity">
                    <div className="bg-black/50 backdrop-blur-md text-white p-2 rounded-full shadow-lg">
                      <Maximize size={20} />
                    </div>
                  </div>

                  {(() => {
                    const allMedia = [
                      { type: 'image', url: selectedProduct.imageUrl },
                      ...(selectedProduct.images || []).map(img => ({ type: 'image', url: img })),
                      ...(selectedProduct.videoUrl ? [{ type: 'video', url: selectedProduct.videoUrl }] : [])
                    ];
                    if (allMedia.length <= 1) return null;
                    return (
                      <div className="absolute inset-0 flex items-center justify-between p-4 pointer-events-none">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveImageIndex(prev => prev === allMedia.length - 1 ? 0 : prev + 1);
                          }}
                          className="p-2 rounded-full bg-white/50 hover:bg-white text-gray-800 shadow-lg transition-all pointer-events-auto backdrop-blur-sm"
                        >
                          <ChevronRight size={24} />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveImageIndex(prev => prev === 0 ? allMedia.length - 1 : prev - 1);
                          }}
                          className="p-2 rounded-full bg-white/50 hover:bg-white text-gray-800 shadow-lg transition-all pointer-events-auto backdrop-blur-sm"
                        >
                          <ChevronLeft size={24} />
                        </button>
                      </div>
                    );
                  })()}
                </div>
                
                {(() => {
                  const allMedia = [
                    { type: 'image', url: selectedProduct.imageUrl },
                    ...(selectedProduct.images || []).map(img => ({ type: 'image', url: img })),
                    ...(selectedProduct.videoUrl ? [{ type: 'video', url: selectedProduct.videoUrl }] : [])
                  ];
                  if (allMedia.length <= 1) return null;
                  return (
                    <div className="p-4 flex gap-2 overflow-x-auto bg-white/50 backdrop-blur border-t border-gray-100">
                      {allMedia.map((media, idx) => (
                        <button
                          key={idx}
                          onClick={() => setActiveImageIndex(idx)}
                          className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 flex items-center justify-center bg-black ${
                            activeImageIndex === idx ? 'border-blue-600 scale-105 shadow-md' : 'border-transparent opacity-60 hover:opacity-100'
                          }`}
                        >
                          {media.type === 'video' ? (
                            <div className="w-full h-full flex items-center justify-center bg-gray-900 text-white">
                              <Smartphone size={24} className="opacity-50" />
                              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">فيديو</span>
                            </div>
                          ) : (
                            <img src={media.url} alt="Thumbnail" className="w-full h-full object-cover" />
                          )}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <div className="w-full md:w-1/2 flex flex-col flex-1 relative z-10 bg-white shadow-[0_-10px_20px_rgba(0,0,0,0.05)] md:shadow-none min-h-0 md:min-h-0">
                <div className="flex-1 md:overflow-y-auto p-5 pb-36 md:pb-8 sm:p-8 thin-scrollbar min-h-0">
                  {selectedProduct.storeName && (
                    <div 
                      className="flex items-center gap-2 mb-2 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => {
                        setSelectedStore({ id: selectedProduct.sellerId, name: selectedProduct.storeName!, logo: selectedProduct.storeLogo || '' });
                        setSearchQuery('');
                        setSelectedCategory('all');
                        setSelectedProduct(null); // Close modal
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                       {selectedProduct.storeLogo ? (
                         <img src={selectedProduct.storeLogo} alt={selectedProduct.storeName} className="w-6 h-6 sm:w-8 sm:h-8 rounded-full object-cover shadow-sm border border-gray-100" referrerPolicy="no-referrer" />
                       ) : (
                         <ShieldCheck className={getStoreColor(selectedProduct)} size={20} />
                       )}
                       <p className={`font-bold flex items-center gap-1.5 hover:underline ${getStoreColor(selectedProduct)}`}>{selectedProduct.storeName}</p>
                    </div>
                  )}
                  <h2 className="text-xl sm:text-3xl font-black text-gray-900 mb-2 sm:mb-4">{selectedProduct.name}</h2>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-4">
                    <span className="text-2xl sm:text-3xl font-black text-blue-600">{selectedProduct.price} ج.م</span>
                    <div className="scale-90 sm:scale-100 origin-right">
                      <ReviewSummary productId={selectedProduct.id} />
                    </div>
                    <span className={`px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-sm font-bold ${selectedProduct.quantity > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {selectedProduct.quantity > 0 ? `بالمخزون: ${selectedProduct.quantity}` : 'غير متوفر'}
                    </span>
                  </div>

                  <div className="space-y-6">
                    <h3 className="text-xl font-bold text-gray-900 border-b pb-2 flex items-center gap-2">
                       <LayoutGrid size={20} className="text-blue-600" />
                      تخصيص طلبك
                    </h3>

                    {selectedProduct.colors && selectedProduct.colors.length > 0 && (
                      <div className="space-y-3">
                        <p className="text-sm font-bold text-gray-700">اختر اللون:</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedProduct.colors.map((color) => (
                            <button
                              key={color}
                              onClick={() => setSelectedColor(color)}
                              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border-2 ${
                                selectedColor === color 
                                  ? 'bg-blue-600 border-blue-600 text-white shadow-md scale-105' 
                                  : 'bg-white border-gray-100 text-gray-600 hover:border-blue-200'
                              }`}
                            >
                              {color}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedProduct.sizes && selectedProduct.sizes.length > 0 && (
                      <div className="space-y-3">
                        <p className="text-sm font-bold text-gray-700">اختر المقاس:</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedProduct.sizes.map((size) => (
                            <button
                              key={size}
                              onClick={() => setSelectedSize(size)}
                              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border-2 ${
                                selectedSize === size 
                                  ? 'bg-blue-600 border-blue-600 text-white shadow-md scale-105' 
                                  : 'bg-white border-gray-100 text-gray-600 hover:border-blue-200'
                              }`}
                            >
                              {size}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      <p className="text-sm font-bold text-gray-700">الكمية:</p>
                      <div className="flex items-center gap-4 bg-gray-50 w-fit p-1 rounded-2xl border border-gray-100">
                        <button 
                          onClick={() => setSelectedQuantity(Math.max(1, selectedQuantity - 1))}
                          className="w-10 h-10 flex items-center justify-center bg-white rounded-xl text-blue-600 shadow-sm hover:bg-blue-600 hover:text-white transition-all disabled:opacity-50"
                        >
                          <Minus size={18} />
                        </button>
                        <span className="font-black text-blue-600 text-xl min-w-[40px] text-center">{selectedQuantity}</span>
                        <button 
                          onClick={() => setSelectedQuantity(Math.min(selectedProduct.quantity, selectedQuantity + 1))}
                          className="w-10 h-10 flex items-center justify-center bg-white rounded-xl text-blue-600 shadow-sm hover:bg-blue-600 hover:text-white transition-all disabled:opacity-50"
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {selectedProduct.quantity > 0 && (
                    <div className="mt-8 mb-8 p-6 bg-blue-50/50 rounded-2xl border border-blue-100 flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center">
                        <ShoppingBag size={24} />
                      </div>
                      <div>
                        <p className="text-gray-900 font-bold">متوفر بالمخزون</p>
                        <p className="text-sm text-blue-600 font-medium">الكمية: {selectedProduct.quantity} قطعة</p>
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-4 text-gray-600 leading-relaxed">
                    <h4 className="text-lg font-bold text-gray-900 border-b pb-2 flex items-center gap-2">
                       <Info size={18} className="text-blue-600" />
                      تفاصيل المنتج
                    </h4>
                    <p className="whitespace-pre-wrap">{selectedProduct.description || 'لا يوجد وصف متاح لهذا المنتج.'}</p>
                  </div>

                  {/* Reviews Section */}
                  <ProductReviews productId={selectedProduct.id} />
                </div>

                <div className="p-5 sm:p-8 border-t border-gray-100 flex-shrink-0 bg-white fixed md:sticky bottom-0 left-0 right-0 md:bottom-0 z-30 shadow-[0_-12px_30px_rgba(0,0,0,0.15)] md:shadow-none w-full md:w-auto">
                  {!auth.currentUser && (
                    <div className="mb-4 p-4 bg-amber-50 border border-amber-100 rounded-xl text-amber-800 text-sm font-bold flex items-center gap-2">
                      <LogIn size={18} />
                      <span>يرجى تسجيل الدخول لتتمكن من إضافة المنتج للسلة.</span>
                    </div>
                  )}
                  {getCartItem(selectedProduct.id, selectedColor, selectedSize) ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-center bg-blue-50 rounded-2xl p-4 gap-8 border border-blue-100">
                        <button 
                          onClick={() => {
                            const cartId = `${selectedProduct.id}-${selectedColor}-${selectedSize}`;
                            updateQuantity(cartId, getCartItem(selectedProduct.id, selectedColor, selectedSize)!.cartQuantity - 1);
                          }}
                          className="w-12 h-12 flex items-center justify-center bg-white rounded-xl text-blue-600 shadow-md hover:bg-blue-600 hover:text-white transition-all transform active:scale-90"
                        >
                          <Minus size={20} />
                        </button>
                        <div className="text-center">
                          <span className="block text-blue-600 font-extrabold text-3xl">{getCartItem(selectedProduct.id, selectedColor, selectedSize)!.cartQuantity}</span>
                          <span className="text-xs text-blue-400 font-bold uppercase tracking-widest">في السلة</span>
                        </div>
                        <button 
                          onClick={() => {
                            const cartId = `${selectedProduct.id}-${selectedColor}-${selectedSize}`;
                            updateQuantity(cartId, getCartItem(selectedProduct.id, selectedColor, selectedSize)!.cartQuantity + 1);
                          }}
                          className="w-12 h-12 flex items-center justify-center bg-white rounded-xl text-blue-600 shadow-md hover:bg-blue-600 hover:text-white transition-all transform active:scale-90"
                        >
                          <Plus size={20} />
                        </button>
                      </div>
                      <p className="text-center text-gray-400 text-sm font-medium">الإجمالي لهذا الاختيار: {getCartItem(selectedProduct.id, selectedColor, selectedSize)!.cartQuantity * selectedProduct.price} ج.م</p>
                      <button
                        onClick={() => {
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                          setSelectedProduct(null);
                        }}
                        className="w-full h-16 flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white text-xl font-black rounded-2xl transition-all shadow-xl shadow-blue-600/20 transform active:scale-[0.98]"
                      >
                        <ShoppingCart size={24} />
                        <span>أضف للسلة</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <button 
                        onClick={handleAddToCart}
                        disabled={selectedProduct.quantity <= 0 || isAdding}
                        className="h-16 w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-lg sm:text-xl font-black rounded-2xl transition-all shadow-xl shadow-blue-600/20 transform active:scale-[0.98]"
                      >
                        {isAdding ? (
                          <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <ShoppingCart size={24} />
                        )}
                        <span>{selectedProduct.quantity <= 0 ? 'المنتج غير متوفر' : 'أضف للسلة'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Full Screen Image Viewer */}
      <AnimatePresence>
        {fullScreenImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md"
            onClick={() => setFullScreenImage(null)}
          >
            <motion.button
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute top-8 right-8 z-10 text-white hover:text-gray-300 transition-colors bg-white/10 p-3 rounded-full backdrop-blur-md"
              onClick={() => setFullScreenImage(null)}
            >
              <X size={32} />
            </motion.button>
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={fullScreenImage}
              alt="Full screen"
              className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
              onClick={(e) => e.stopPropagation()}
              referrerPolicy="no-referrer"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Toast */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed bottom-10 right-10 z-[200] bg-green-500 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-3 font-black"
          >
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
              <Plus size={20} />
            </div>
            <span>تم إضافة المنتج للسلة بنجاح!</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
