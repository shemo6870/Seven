import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where, serverTimestamp, getDocs, writeBatch, orderBy, getDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Category, Product, User } from '../types';
import { compressImage } from '../lib/image-utils';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { Plus, Trash2, Edit2, X, Save, Image as ImageIcon, Box, DollarSign, Type, Tag, LayoutGrid, Palette, Maximize, ClipboardList, CheckCircle2, Clock, XCircle, Package, MapPin, Smartphone, CreditCard, Banknote, ExternalLink, MessageSquare, GripVertical, Search, Users as UsersIcon, Shield, Lock, Eye, EyeOff, User as UserIcon } from 'lucide-react';
import ReceiptModal from '../components/ReceiptModal';
import AdminChats from './AdminChats';

import { useNavigate, Link } from 'react-router-dom';
import { WHATSAPP_NUMBER } from '../constants';

function PasswordCell({ password }: { password?: string }) {
  const [show, setShow] = useState(false);
  
  if (!password) return <span className="text-gray-300 font-bold italic text-sm">---</span>;
  
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 rounded-xl">
      <Lock size={14} className="text-amber-500" />
      <span className="font-bold text-amber-700 font-mono text-sm leading-none">
        {show ? password : '••••••••'}
      </span>
      <button 
        onClick={() => setShow(!show)}
        className="text-amber-400 hover:text-amber-600 transition-colors"
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

export default function Admin() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'products' | 'orders' | 'payments' | 'reviews' | 'chats' | 'coupons' | 'banners' | 'users' | 'settings'>('products');
  const [chatUserId, setChatUserId] = useState<string | null>(null);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [banners, setBanners] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, name: string, type: 'product' | 'category' } | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [storeName, setStoreName] = useState<string>('');
  const [newStoreName, setNewStoreName] = useState<string>('');
  const [storeLogo, setStoreLogo] = useState<string>('');
  const [newStoreLogo, setNewStoreLogo] = useState<string>('');
  const [logoUploading, setLogoUploading] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editCategoryName, setEditCategoryName] = useState('');
  const [newCategoryParentId, setNewCategoryParentId] = useState<string>('');
  const [editCategoryParentId, setEditCategoryParentId] = useState<string>('');
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    quantity: '',
    imageUrl: '',
    images: [] as string[],
    videoUrl: '',
    colors: [] as string[],
    sizes: [] as string[],
    description: '',
    category: '',
    isActive: true
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);
  const [isUpdatingCoupon, setIsUpdatingCoupon] = useState<string | null>(null);
  const [isUpdatingBanner, setIsUpdatingBanner] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);
  
  const [isReordering, setIsReordering] = useState(false);
  const [reorderedItems, setReorderedItems] = useState<Product[]>([]);
  const [isSavingOrder, setIsSavingOrder] = useState(false);

  const [isReorderingCategories, setIsReorderingCategories] = useState(false);
  const [reorderedCategories, setReorderedCategories] = useState<Category[]>([]);
  const [isSavingCategoryOrder, setIsSavingCategoryOrder] = useState(false);

  const [isSeller, setIsSeller] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({ orders: 0, reviews: 0, chats: 0 });

  // Load last seen timestamps from localStorage
  const getLastSeen = (tab: string) => {
    try {
      const data = localStorage.getItem('admin_last_seen');
      if (data) {
        const parsed = JSON.parse(data);
        return (parsed && typeof parsed === 'object') ? (parsed[tab] || 0) : 0;
      }
    } catch (e) {
      console.error("Error reading last seen timestamp:", e);
    }
    return 0;
  };

  const updateLastSeen = (tab: string) => {
    let parsed: any = {};
    try {
      const data = localStorage.getItem('admin_last_seen');
      if (data) {
        const temp = JSON.parse(data);
        if (temp && typeof temp === 'object') {
          parsed = temp;
        }
      }
    } catch (e) {
      console.error("Error parsing admin_last_seen for update:", e);
    }
    parsed[tab] = Date.now();
    try {
      localStorage.setItem('admin_last_seen', JSON.stringify(parsed));
    } catch (e) {
      console.error("Error writing admin_last_seen:", e);
    }
    
    // Clear unread count for this tab immediately
    setUnreadCounts(prev => ({
      ...prev,
      [tab === 'payments' ? 'orders' : tab]: 0
    }));
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user === null) {
        console.log('No user, navigating to login');
        window.location.href = '/login';
        return;
      }
      
      const phone = user?.phoneNumber?.replace('+', '') || '';
      const email = user?.email?.toLowerCase() || '';
      let isAllowed = phone === WHATSAPP_NUMBER || 
                     phone === WHATSAPP_NUMBER.replace('+', '') || 
                     user?.phoneNumber === WHATSAPP_NUMBER || 
                     user?.phoneNumber === '+' + WHATSAPP_NUMBER ||
                     email === 'mahmoudmasry165@gmail.com' ||
                     email === '201115454823@seven.store' ||
                     email === '01115454823@seven.store';
      
      // Check firestore for role and storeName
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const data = snap.data();
          if (data.role === 'admin') {
            isAllowed = true;
          }
          if (data.storeName) {
            setStoreName(data.storeName);
            setNewStoreName(data.storeName);
          }
          if (data.storeLogo) {
            setStoreLogo(data.storeLogo);
            setNewStoreLogo(data.storeLogo);
          }
        }
      } catch (e) {
        console.error("Error reading user data for admin access:", e);
      }

      if (!isAllowed) {
        console.log('Not allowed, redirecting to login');
        window.location.href = '/login';
        return;
      }

      console.log('Auth State Changed (Admin):', { 
        email: user?.email, 
        phone: user?.phoneNumber, 
        isAllowed,
        uid: user?.uid 
      });

      setIsSeller(isAllowed);
      
      if (!isAllowed) {
        console.log('Not an admin, navigating home');
        navigate('/');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!isSeller) return;
    
    setLoading(true);
    const collectionsToLoad = ['products', 'categories', 'orders', 'reviews', 'coupons', 'banners', 'users'];
    const loaded = new Set<string>();

    const markLoaded = (name: string) => {
      loaded.add(name);
      if (loaded.size >= collectionsToLoad.length) {
        setLoading(false);
      }
    };

    const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
      setProducts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
      markLoaded('products');
    }, (error) => {
      console.error("Products Snapshot Error:", error);
      markLoaded('products');
    });

    const unsubCategories = onSnapshot(collection(db, 'categories'), (snap) => {
      setCategories(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category)));
      markLoaded('categories');
    }, (error) => {
      console.error("Categories Snapshot Error:", error);
      markLoaded('categories');
    });

    const unsubOrders = onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc')), (snap) => {
      const ordersData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOrders(ordersData);
      
      const lastSeen = getLastSeen('payments');
      const unreadCount = ordersData.filter((o: any) => {
        const createdAt = o.createdAt?.toMillis?.() || (o.createdAt?.seconds ? o.createdAt.seconds * 1000 : 0);
        return createdAt > lastSeen;
      }).length;
      setUnreadCounts(prev => ({ ...prev, orders: unreadCount }));
      markLoaded('orders');
    }, (error) => {
      console.error("Orders Snapshot Error:", error);
      markLoaded('orders');
    });

    const unsubReviews = onSnapshot(query(collection(db, 'reviews'), orderBy('createdAt', 'desc')), (snap) => {
      const reviewsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setReviews(reviewsData);
      
      const lastSeen = getLastSeen('reviews');
      const unreadCount = reviewsData.filter((r: any) => {
        const createdAt = r.createdAt?.toMillis?.() || (r.createdAt?.seconds ? r.createdAt.seconds * 1000 : 0);
        return createdAt > lastSeen;
      }).length;
      setUnreadCounts(prev => ({ ...prev, reviews: unreadCount }));
      markLoaded('reviews');
    }, (error) => {
      console.error("Reviews Snapshot Error:", error);
      markLoaded('reviews');
    });

    const unsubCoupons = onSnapshot(query(collection(db, 'coupons'), orderBy('createdAt', 'desc')), (snap) => {
      setCoupons(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      markLoaded('coupons');
    }, (error) => {
      console.error("Coupons Snapshot Error:", error);
      markLoaded('coupons');
    });

    const unsubBanners = onSnapshot(query(collection(db, 'banners'), orderBy('order', 'asc')), (snap) => {
      setBanners(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      markLoaded('banners');
    }, (error) => {
      console.error("Banners Snapshot Error:", error);
      markLoaded('banners');
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
      markLoaded('users');
    }, (error) => {
      console.error("Users Snapshot Error:", error);
      markLoaded('users');
    });

    return () => {
      unsubProducts();
      unsubCategories();
      unsubOrders();
      unsubReviews();
      unsubCoupons();
      unsubBanners();
      unsubUsers();
    };
  }, [isSeller]);

  useEffect(() => {
    if (!isSeller) return;

    // Fetch Chats metadata for notifications periodically
    const fetchChatsMeta = async () => {
      try {
        const qChats = query(collection(db, 'chats'), where('sellerId', '==', auth.currentUser?.uid || ''));
        const snapshot = await getDocs(qChats);
        
        if (activeTab !== 'chats') {
          const lastSeen = getLastSeen('chats');
          const unread = snapshot.docs.filter(doc => {
            const data = doc.data() as any;
            const updatedAt = data.updatedAt?.toMillis?.() || (data.updatedAt?.seconds ? data.updatedAt.seconds * 1000 : 0);
            return updatedAt > lastSeen && data.lastSenderId !== auth.currentUser?.uid;
          }).length;
          setUnreadCounts(prev => ({ ...prev, chats: unread }));
        }
      } catch (error) {
        console.error("Chats Meta Error:", error);
      }
    };

    fetchChatsMeta();
    const interval = setInterval(fetchChatsMeta, 60000); // Check once per minute
    return () => clearInterval(interval);
  }, [isSeller, activeTab]);

  // Update last seen when tab changes
  useEffect(() => {
    if (activeTab === 'payments' || activeTab === 'reviews' || activeTab === 'chats') {
      updateLastSeen(activeTab);
    }
  }, [activeTab]);

  // Auto-select category if none is selected
  useEffect(() => {
    if (!formData.category && categories.length > 0) {
      setFormData(prev => ({ ...prev, category: categories[0].name }));
    }
  }, [categories, formData.category]);

  const COMMON_COLORS = ['أحمر', 'أزرق', 'أخضر', 'أسود', 'أبيض', 'رمادي', 'أصفر', 'وردي', 'ذهب', 'فضي'];
  const COMMON_SIZES = ['S', 'M', 'L', 'XL', 'XXL', '3XL', '37', '38', '39', '40', '41', '42', '43', '44', '45'];

  const toggleSelection = (list: string[], item: string) => {
    if (list.includes(item)) {
      return list.filter(i => i !== item);
    }
    return [...list, item];
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('حجم الصورة كبير جداً (أكثر من 5 ميجابايت). يرجى اختيار صورة أصغر.');
      return;
    }

    setImageUploading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const compressed = await compressImage(reader.result as string, 800, 0.6);
        setFormData(prev => ({ ...prev, imageUrl: compressed }));
      } catch (err) {
        console.error('Compression error:', err);
        setFormData(prev => ({ ...prev, imageUrl: reader.result as string }));
      } finally {
        setImageUploading(false);
      }
    };
    reader.onerror = () => {
      alert('حدث خطأ أثناء تحميل الصورة. حاول مرة أخرى.');
      setImageUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Firestore limit is 1MB total for the document.
    // 1MB of base64 data is about 750KB.
    if (file.size > 800 * 1024) {
      alert('حجم الفيديو المرفوع من الجهاز يجب أن يكون أقل من 800 كيلوبايت ليتم حفظه في قاعدة البيانات. للمساحات الأكبر، يفضل استخدام روابط YouTube.');
      return;
    }

    setVideoUploading(true);
    const reader = new FileReader();
    reader.onloadstart = () => console.log('Video upload started');
    reader.onloadend = () => {
      console.log('Video upload completed, size:', reader.result?.toString().length);
      setFormData(prev => ({ ...prev, videoUrl: reader.result as string }));
      setVideoUploading(false);
    };
    reader.onerror = () => {
      alert('حدث خطأ أثناء تحميل الفيديو.');
      setVideoUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setFormData({ 
      name: '', 
      price: '', 
      quantity: '', 
      imageUrl: '', 
      images: [],
      videoUrl: '',
      colors: [],
      sizes: [],
      description: '', 
      category: categories[0]?.name || '' 
    });
    setEditingProduct(null);
    setIsFormOpen(false);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      price: product.price.toString(),
      quantity: product.quantity.toString(),
      imageUrl: product.imageUrl,
      images: product.images || [],
      videoUrl: product.videoUrl || '',
      colors: product.colors || [],
      sizes: product.sizes || [],
      description: product.description || '',
      category: product.category || categories[0]?.name || '',
      isActive: product.isActive !== false
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form Submit Triggered', formData);

    if (!auth.currentUser) {
      alert('الرجاء تسجيل الدخول أولاً');
      return;
    }

    // Capture any pending custom color/size inputs
    let finalColors = [...formData.colors];
    let finalSizes = [...formData.sizes];

    const colorInput = document.getElementById('custom-color-input') as HTMLInputElement;
    if (colorInput && colorInput.value.trim() && !finalColors.includes(colorInput.value.trim())) {
      finalColors.push(colorInput.value.trim());
      colorInput.value = '';
    }

    const sizeInput = document.getElementById('custom-size-input') as HTMLInputElement;
    if (sizeInput && sizeInput.value.trim() && !finalSizes.includes(sizeInput.value.trim())) {
      finalSizes.push(sizeInput.value.trim());
      sizeInput.value = '';
    }

    // Validation
    const errors = [];
    if (!formData.name.trim()) errors.push('اسم المنتج');
    if (!formData.price.trim()) errors.push('السعر');
    if (!formData.quantity.trim()) errors.push('الكمية');
    if (!formData.category) errors.push('القسم');
    if (!formData.imageUrl.trim()) errors.push('الصورة الأساسية');

    if (errors.length > 0) {
      alert(`يرجى إكمال الحقول التالية: ${errors.join('، ')}`);
      return;
    }

    const price = parseFloat(formData.price);
    const quantity = parseInt(formData.quantity);

    if (isNaN(price) || price < 0) {
      alert('الرجاء إدخال سعر صحيح (رقم أكبر من أو يساوي 0).');
      return;
    }

    if (isNaN(quantity) || quantity < 0) {
      alert('الرجاء إدخال كمية صحيحة (رقم أكبر من أو يساوي 0).');
      return;
    }

    const productData = {
      name: formData.name.trim(),
      price,
      quantity,
      imageUrl: formData.imageUrl.trim(),
      images: formData.images || [],
      videoUrl: formData.videoUrl.trim(),
      colors: finalColors,
      sizes: finalSizes,
      description: formData.description.trim(),
      category: formData.category,
      isActive: formData.isActive,
      sellerId: editingProduct ? editingProduct.sellerId : auth.currentUser.uid,
      storeName: editingProduct ? editingProduct.storeName : (storeName || 'متجر الإدارة'),
      storeLogo: editingProduct ? editingProduct.storeLogo : (storeLogo || ''),
      sellerRole: editingProduct ? editingProduct.sellerRole : 'admin',
      updatedAt: serverTimestamp()
    };

    // Check total size to prevent Firestore 1MB limit error
    const totalSize = JSON.stringify(productData).length;
    if (totalSize > 950000) { 
      alert('حجم بيانات المنتج (الصور والفيديو المرفوع) كبير جداً. هذا حد أقصى من جوجل (1 ميجابايت). يرجى تقليل مساحة المرفقات أو استخدام روابط خارجية (URL) بدلاً من الرفع المباشر.');
      return;
    }
    
    setIsSubmitting(true);
    try {
      if (editingProduct) {
        await updateDoc(doc(db, 'products', editingProduct.id), productData);
        console.log('Product updated:', editingProduct.id);
      } else {
        const docRef = await addDoc(collection(db, 'products'), {
          ...productData,
          createdAt: serverTimestamp()
        });
        console.log('Product created:', docRef.id);
      }
      
      alert('تم حفظ المنتج بنجاح!');
      resetForm();
    } catch (error: any) {
      console.error('Save error details:', error);
      const errorMessage = error?.message?.toLowerCase() || '';
      if (errorMessage.includes('too large') || errorMessage.includes('maximum allowed size')) {
        alert('حجم المنتج كبير جداً. يرجى استخدام صور أصغر أو تقليل عدد الصور.');
      } else if (errorMessage.includes('permission-denied') || errorMessage.includes('insufficient permissions')) {
        alert('ليس لديك صلاحية لحفظ هذا المنتج. يرجى التأكد من تسجيل الدخول.');
      } else {
        alert(`حدث خطأ أثناء الحفظ: ${error.message || 'يرجى مراجعة البيانات والمحاولة مرة أخرى'}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    console.log("Attempting to delete product:", id);
    try {
      await deleteDoc(doc(db, 'products', id));
      console.log("Product deleted successfully");
      setDeleteConfirm(null);
    } catch (error) {
      console.error("Error deleting product:", error);
      handleFirestoreError(error, OperationType.DELETE, 'products');
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !newCategoryName.trim()) return;

    try {
      await addDoc(collection(db, 'categories'), {
        name: newCategoryName.trim(),
        sellerId: auth.currentUser.uid,
        parentId: newCategoryParentId || null
      });
      setNewCategoryName('');
      setNewCategoryParentId('');
      if (!formData.category) setFormData(prev => ({ ...prev, category: newCategoryName.trim() }));
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'categories');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    console.log("Attempting to delete category and its products:", id);
    try {
      const categoryToDelete = categories.find(c => c.id === id);
      if (!categoryToDelete) return;

      const categoryName = categoryToDelete.name;

      const batch = writeBatch(db);

      // 1. Delete the category document
      batch.delete(doc(db, 'categories', id));
      
      // 2. Find and delete all sub-categories
      const subCats = categories.filter(c => c.parentId === id);
      subCats.forEach(sub => {
        batch.delete(doc(db, 'categories', sub.id));
      });

      // 3. Find and delete all products in this category
      const q = query(collection(db, 'products'), where('category', '==', categoryName));
      const querySnapshot = await getDocs(q);
      querySnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // 4. Find and delete all products in sub-categories
      for (const sub of subCats) {
        const qSub = query(collection(db, 'products'), where('category', '==', sub.name));
        const subQuerySnapshot = await getDocs(qSub);
        subQuerySnapshot.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });
      }
      
      await batch.commit();
      console.log("Category, sub-categories and their products deleted successfully");
      setDeleteConfirm(null);
    } catch (error) {
      console.error("Error deleting category:", error);
      handleFirestoreError(error, OperationType.DELETE, 'categories');
    }
  };

  const handleBulkDelete = async () => {
    const isProducsTab = activeTab === 'products';
    const selectedIds = isProducsTab ? selectedProductIds : selectedOrderIds;
    const collectionName = isProducsTab ? 'products' : 'orders';

    if (selectedIds.length === 0) return;
    
    if (!confirm(`هل أنت متأكد من حذف ${selectedIds.length} ${isProducsTab ? 'منتجات' : 'طلبات'}؟`)) return;

    setIsBulkDeleting(true);
    try {
      const batch = writeBatch(db);
      selectedIds.forEach(id => {
        batch.delete(doc(db, collectionName, id));
      });
      await batch.commit();
      
      alert(`تم حذف ${selectedIds.length} ${isProducsTab ? 'منتجات' : 'طلبات'} بنجاح!`);
      if (isProducsTab) setSelectedProductIds([]);
      else setSelectedOrderIds([]);
    } catch (error: any) {
      console.error(`Error bulk deleting ${collectionName}:`, error);
      alert('فشل الحذف الجماعي: ' + (error.message || error));
      handleFirestoreError(error, OperationType.DELETE, collectionName);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrderIds(prev => 
      prev.includes(orderId) 
        ? prev.filter(id => id !== orderId) 
        : [...prev, orderId]
    );
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("حجم الصورة كبير جداً. الحد الأقصى هو 2 ميجابايت.");
      return;
    }

    setLogoUploading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const compressed = await compressImage(reader.result as string, 400, 0.5);
        setNewStoreLogo(compressed);
      } catch (err) {
        console.error("Compression failed:", err);
      } finally {
        setLogoUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const saveStoreName = async () => {
    if (!auth.currentUser) return;
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        storeName: newStoreName,
        storeLogo: newStoreLogo
      });

      // Update store details across all products of the admin
      const productsQuery = query(collection(db, 'products'), where('sellerId', '==', auth.currentUser.uid));
      const productsSnapshot = await getDocs(productsQuery);
      
      if (!productsSnapshot.empty) {
        const batch = writeBatch(db);
        productsSnapshot.forEach((productDoc) => {
          batch.update(productDoc.ref, { storeName: newStoreName, storeLogo: newStoreLogo, sellerRole: 'admin', updatedAt: serverTimestamp() });
        });
        await batch.commit();
      }

      setStoreName(newStoreName);
      setStoreLogo(newStoreLogo);
      alert('تم حفظ إعدادات المتجر وتحديث المنتجات بنجاح');
    } catch (error) {
      console.error('Error saving store name:', error);
      alert('حدث خطأ أثناء حفظ اسم المتجر');
    }
  };

  const toggleSelectAllOrders = () => {
    if (selectedOrderIds.length === filteredOrders.length && filteredOrders.length > 0) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(filteredOrders.map(o => o.id));
    }
  };

  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId) 
        : [...prev, productId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedProductIds.length === filteredProducts.length) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(filteredProducts.map(p => p.id));
    }
  };

  const handleUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || !editCategoryName.trim()) return;

    try {
      const oldName = editingCategory.name;
      const newName = editCategoryName.trim();
      
      // Update the category document
      await updateDoc(doc(db, 'categories', editingCategory.id), {
        name: newName,
        parentId: editCategoryParentId || null
      });

      // Also update all products that use this category name
      const affectedProducts = products.filter(p => p.category === oldName);
      for (const p of affectedProducts) {
        await updateDoc(doc(db, 'products', p.id), {
          category: newName,
          updatedAt: serverTimestamp()
        });
      }

      setEditingCategory(null);
      setEditCategoryName('');
      setEditCategoryParentId('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'categories');
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    console.log(`Updating order ${orderId} to status ${newStatus}`);
    setIsUpdatingStatus(orderId);
    try {
      let updateData: any = { 
        status: newStatus,
        updatedAt: serverTimestamp()
      };

      if (newStatus === 'canceled') {
        const reason = prompt('يرجى إدخال سبب الرفض/الإلغاء (اختياري):');
        if (reason !== null) {
          updateData.rejectionReason = reason;
        }
      }

      await updateDoc(doc(db, 'orders', orderId), updateData);
      console.log(`Order ${orderId} updated successfully`);
      alert('تم تحديث حالة الطلب بنجاح');
    } catch (error: any) {
      console.error('Error updating order status:', error);
      const isPermissionError = error.message?.includes('permission-denied') || error.code?.includes('permission-denied');
      if (isPermissionError) {
        alert('فشل: ليس لديك صلاحية لتعديل هذا الطلب. يرجى التأكد من تسجيل دخولك كمسؤول.');
      } else {
        alert('فشل تحديث حالة الطلب: ' + (error.message || error));
      }
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  const handleDeleteReview = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا التقييم؟')) return;
    try {
      await deleteDoc(doc(db, 'reviews', id));
      alert('تم حذف التقييم بنجاح');
    } catch (error) {
      console.error('Error deleting review:', error);
      handleFirestoreError(error, OperationType.DELETE, `reviews/${id}`);
    }
  };

  const handleToggleUserRole = async (userId: string, userName: string, currentRole: string) => {
    const newRole = currentRole === 'buyer' ? 'seller' : 'buyer';
    const msg = newRole === 'seller' ? `هل أنت متأكد من تحويل حساب "${userName}" إلى حساب تاجر؟` : `هل أنت متأكد من تحويل حساب "${userName}" إلى حساب مشتري؟`;
    if (!confirm(msg)) return;
    try {
      await updateDoc(doc(db, 'users', userId), {
         role: newRole
      });
      alert(`تم تحويل الحساب إلى ${newRole === 'seller' ? 'تاجر' : 'مشتري'} بنجاح`);
    } catch (error) {
       console.error('Error toggling user role:', error);
       alert('حدث خطأ أثناء تغيير نوع الحساب');
    }
  };

  const handleDeleteUser = async (userId: string, userName: string, role?: string) => {
    if (!confirm(`هل أنت متأكد من حذف المستخدم "${userName}" نهائياً؟ سيتم مسح بياناته بالكامل (بما في ذلك السلة والمصادقة) وسيتطلب منه إنشاء حساب جديد.`)) return;
    
    try {
      // 1. Delete from Firebase Auth via server API
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("لم يتم العثور على رمز المصادقة.");

      const response = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, adminToken: idToken })
      });

      let result;
      try {
        result = await response.json();
      } catch (e) {
        result = { error: "خطأ غير متوقع من الخادم" };
      }

      if (!response.ok) {
        // We allow "user not found" to proceed because the goal is for them to be gone
        if (result.error?.includes('auth/user-not-found') || result.code === 'auth/user-not-found') {
          console.warn("User already missing from Auth");
        } else {
          throw new Error(result.error || "فشل حذف المستخدم من المصادقة.");
        }
      }

      // 2. Delete from Firestore (Batch delete user doc and cart)
      const batch = writeBatch(db);
      batch.delete(doc(db, 'users', userId));
      batch.delete(doc(db, 'carts', userId));
      
      // If the user is a seller, we should also delete all their products and categories
      if (role === 'seller') {
        const productsSnapshot = await getDocs(query(collection(db, 'products'), where('sellerId', '==', userId)));
        productsSnapshot.forEach((doc) => {
          batch.delete(doc.ref);
        });
        
        const categoriesSnapshot = await getDocs(query(collection(db, 'categories'), where('sellerId', '==', userId)));
        categoriesSnapshot.forEach((doc) => {
          batch.delete(doc.ref);
        });
      }
      
      await batch.commit();
      
      alert(`تم حذف المستخدم ${userName} بنجاح من قاعدة البيانات.`);
    } catch (error: any) {
      console.error('Error deleting user:', error);
      alert(`خطأ: ${error.message}`);
      handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
    }
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'paid':
        return { color: 'text-green-600 bg-green-50', icon: <CheckCircle2 size={16} />, label: 'تم التحقق والدفع' };
      case 'awaiting_verification':
        return { color: 'text-blue-600 bg-blue-50', icon: <Clock size={16} />, label: 'في انتظار مراجعة التحويل' };
      case 'pending':
        return { color: 'text-amber-600 bg-amber-50', icon: <Clock size={16} />, label: 'في انتظار الدفع / COD' };
      case 'delivered':
        return { color: 'text-emerald-600 bg-emerald-50', icon: <Package size={16} />, label: 'تم التوصيل' };
      case 'canceled':
        return { color: 'text-red-600 bg-red-50', icon: <XCircle size={16} />, label: 'ملغي' };
      default:
        return { color: 'text-gray-600 bg-gray-50', icon: <Clock size={16} />, label: status || 'غير معروف' };
    }
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    let matchesCategory = true;
    if (activeCategory) {
      const activeCat = categories.find(c => c.name === activeCategory);
      if (activeCat) {
        // Get all descendant category names
        const getDescendants = (catId: string): string[] => {
          const subs = categories.filter(c => c.parentId === catId);
          return subs.reduce((acc, sub) => [...acc, sub.name, ...getDescendants(sub.id)], [] as string[]);
        };
        const allowedCategories = [activeCat.name, ...getDescendants(activeCat.id)];
        matchesCategory = allowedCategories.includes(product.category);
      } else {
        matchesCategory = product.category === activeCategory;
      }
    }
    
    return matchesSearch && matchesCategory;
  }).sort((a, b) => {
    const orderA = a.order ?? 1000000;
    const orderB = b.order ?? 1000000;
    if (orderA !== orderB) return orderA - orderB;
    const timeA = (a.createdAt as any)?.toMillis?.() || 0;
    const timeB = (b.createdAt as any)?.toMillis?.() || 0;
    return timeB - timeA;
  });

  const sortedCategories = [...categories].sort((a, b) => {
    const orderA = a.order ?? 1000000;
    const orderB = b.order ?? 1000000;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });

  const handleSaveOrder = async () => {
    setIsSavingOrder(true);
    try {
      const batch = writeBatch(db);
      reorderedItems.forEach((product, index) => {
        const productRef = doc(db, 'products', product.id);
        batch.update(productRef, { 
          order: index,
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();
      setIsReordering(false);
      alert('تم حفظ ترتيب المنتجات بنجاح');
    } catch (error) {
      console.error('Error saving order:', error);
      handleFirestoreError(error, OperationType.WRITE, 'products');
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleSaveCategoryOrder = async () => {
    setIsSavingCategoryOrder(true);
    try {
      const batch = writeBatch(db);
      reorderedCategories.forEach((cat, index) => {
        const catRef = doc(db, 'categories', cat.id);
        batch.update(catRef, { order: index });
      });
      await batch.commit();
      setIsReorderingCategories(false);
      alert('تم حفظ ترتيب الأقسام بنجاح');
    } catch (error) {
      console.error('Error saving categories order:', error);
      handleFirestoreError(error, OperationType.WRITE, 'categories');
    } finally {
      setIsSavingCategoryOrder(false);
    }
  };

  const filteredOrders = orders.filter(order => {
    const query = searchQuery.toLowerCase();
    const matchesId = order.id.toLowerCase().includes(query);
    const matchesName = order.userName?.toLowerCase().includes(query);
    const matchesPhone = order.userPhone?.toLowerCase().includes(query);
    
    if (activeTab === 'payments') {
      // Show ALL orders in the payments tab now, but prioritize ones needing action?
      // Actually, if the user wants to "stick to the orders in Payments", maybe I should just show everything there.
      return matchesId || matchesName || matchesPhone;
    }
    
    return matchesId || matchesName || matchesPhone;
  });

  const filteredReviews = reviews.filter(review => {
    const query = searchQuery.toLowerCase();
    const productName = products.find(p => p.id === review.productId)?.name || 'منتج غير معروف';
    return review.userName.toLowerCase().includes(query) || 
           review.comment.toLowerCase().includes(query) || 
           productName.toLowerCase().includes(query);
  });

  if (loading) {
    return <div className="text-center py-20 font-medium">جاري تحميل البيانات...</div>;
  }

  return (
    <div className="space-y-6 sm:space-y-8 pb-20 px-1 sm:px-0">
      {/* Header Section */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 sm:gap-6">
          <div className="w-full sm:w-auto">
            <div className="flex items-center gap-3 mb-1 justify-center sm:justify-start">
              <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">لوحة التحكم</h1>
            </div>
            <p className="text-gray-500 text-sm text-center sm:text-right">إدارة منتجاتك وأقسام المتجر بسهولة واحترافية</p>
          </div>
          <div className="flex flex-col lg:flex-row gap-3 w-full lg:flex-1 lg:justify-end min-w-0">
            <div className="flex bg-gray-100 p-1 rounded-xl sm:rounded-2xl border border-gray-200 overflow-x-auto flex-nowrap whitespace-nowrap thin-scrollbar flex-1 lg:flex-auto min-w-0">
            <button 
              onClick={() => setActiveTab('products')}
              className={`flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold transition-all flex-shrink-0 ${activeTab === 'products' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Box size={16} className="sm:w-[18px] sm:h-[18px]" />
              <span>المنتجات</span>
            </button>
            <button 
              onClick={() => setActiveTab('payments')}
              className={`flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold transition-all flex-shrink-0 relative ${activeTab === 'payments' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <DollarSign size={16} className="sm:w-[18px] sm:h-[18px]" />
              <span>الطلبات</span>
              {unreadCounts.orders > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] sm:text-[9px] w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center animate-bounce border-2 border-white shadow-sm z-10">
                  {unreadCounts.orders}
                </span>
              )}
            </button>
            <button 
              onClick={() => setActiveTab('reviews')}
              className={`flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold transition-all flex-shrink-0 relative ${activeTab === 'reviews' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <ClipboardList size={16} className="sm:w-[18px] sm:h-[18px]" />
              <span>التقييمات</span>
              {unreadCounts.reviews > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] sm:text-[9px] w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center animate-bounce border-2 border-white shadow-sm z-10">
                  {unreadCounts.reviews}
                </span>
              )}
            </button>
            <button 
              onClick={() => setActiveTab('chats')}
              className={`flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold transition-all flex-shrink-0 relative ${activeTab === 'chats' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <MessageSquare size={16} className="sm:w-[18px] sm:h-[18px]" />
              <span>المحادثات</span>
              {unreadCounts.chats > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] sm:text-[9px] w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center animate-bounce border-2 border-white shadow-sm z-10">
                  {unreadCounts.chats}
                </span>
              )}
            </button>
            <button 
              onClick={() => setActiveTab('coupons')}
              className={`flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold transition-all flex-shrink-0 ${activeTab === 'coupons' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Tag size={16} className="sm:w-[18px] sm:h-[18px]" />
              <span>الكوبونات</span>
            </button>
            <button 
              onClick={() => setActiveTab('banners')}
              className={`flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold transition-all flex-shrink-0 ${activeTab === 'banners' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <ImageIcon size={16} className="sm:w-[18px] sm:h-[18px]" />
              <span>البانرات</span>
            </button>
            <button 
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold transition-all flex-shrink-0 ${activeTab === 'users' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <UsersIcon size={16} className="sm:w-[18px] sm:h-[18px]" />
              <span>المستخدمين</span>
            </button>
            <button 
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold transition-all flex-shrink-0 ${activeTab === 'settings' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Palette size={16} className="sm:w-[18px] sm:h-[18px]" />
              <span>إعدادات المتجر</span>
            </button>
          </div>
          <div className="flex gap-2 w-full sm:w-auto flex-shrink-0">
            <button 
              onClick={() => setIsCategoryModalOpen(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white border-2 border-gray-100 hover:border-blue-200 text-gray-700 px-4 py-2.5 rounded-2xl transition-all font-bold active:scale-95 shadow-sm"
            >
              <LayoutGrid size={18} className="text-blue-500" />
              <span className="whitespace-nowrap">الأقسام</span>
            </button>
            <button 
              onClick={() => {
                if (categories.length === 0) {
                  alert('يرجى إضافة قسم واحد على الأقل قبل إضافة المنتجات.');
                  setIsCategoryModalOpen(true);
                  return;
                }
                setIsFormOpen(true);
              }}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-2xl transition-all shadow-lg shadow-blue-600/20 active:scale-95 font-bold"
            >
              <Plus size={18} />
              <span className="whitespace-nowrap">إضافة منتج</span>
            </button>
          </div>
        </div>
      </div>


      {/* Stats & Search Section */}
      {activeTab !== 'coupons' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          <div className="md:col-span-2 relative">
            <div className="absolute inset-y-0 right-4 sm:right-5 flex items-center pointer-events-none text-gray-400">
              <Search size={18} className="sm:w-5 sm:h-5" />
            </div>
            <input 
              type="text"
              placeholder={activeTab === 'products' ? "ابحث عن منتج بالاسم..." : activeTab === 'reviews' ? "ابحث في التقييمات..." : "بحث عن طلب (رقم الطلب، الهاتف)..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border-2 border-gray-100 rounded-xl sm:rounded-2xl pr-12 sm:pr-14 pl-4 sm:pl-6 py-3 sm:py-4 focus:border-blue-500 shadow-sm focus:outline-none transition-all font-bold text-base sm:text-lg"
            />
          </div>
          <div className="bg-blue-600 rounded-xl sm:rounded-2xl p-4 flex items-center justify-between text-white shadow-lg shadow-blue-600/10">
            {activeTab === 'products' ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <Box size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold opacity-80">إجمالي المنتجات</p>
                    <p className="text-xl font-black">{products.length}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold opacity-80">الأقسام</p>
                  <p className="text-xl font-black">{categories.length}</p>
                </div>
              </>
            ) : activeTab === 'reviews' ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <ClipboardList size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold opacity-80">إجمالي التقييمات</p>
                    <p className="text-xl font-black">{reviews.length}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold opacity-80">متوسط التقييم</p>
                  <p className="text-xl font-black">
                    {reviews.length > 0 
                      ? (reviews.reduce((acc: number, r: any) => acc + r.rating, 0) / reviews.length).toFixed(1) 
                      : '0.0'}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <ClipboardList size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold opacity-80">إجمالي الطلبات</p>
                    <p className="text-xl font-black">{orders.length}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold opacity-80">جديدة/تحت التحقق</p>
                  <p className="text-xl font-black">{orders.filter(o => o.status === 'awaiting_verification' || o.status === 'pending').length}</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'chats' ? (
        <AdminChats initialUserId={chatUserId} />
      ) : activeTab === 'banners' ? (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
            <h2 className="text-2xl font-black text-gray-900 mb-2 flex items-center gap-2">
              <ImageIcon className="text-blue-600" />
              إضافة بانر جديد
            </h2>
            <p className="text-sm text-gray-400 font-bold mb-6">نصيحة: المقاس الأفضل للبانر هو 1200×400 (نسبة 3:1) لتظهر الصورة بوضوح وتملأ كامل المساحة.</p>
            <form 
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const title = (form.elements.namedItem('title') as HTMLInputElement | null)?.value.trim() || '';
                const imageUrl = (form.elements.namedItem('imageUrl') as HTMLInputElement | null)?.value.trim() || '';
                const link = (form.elements.namedItem('link') as HTMLInputElement | null)?.value.trim() || '';
                const order = parseInt((form.elements.namedItem('order') as HTMLInputElement | null)?.value || '0') || 0;
                
                if (!imageUrl) {
                  alert('رابط الصورة مطلوب');
                  return;
                }

                try {
                  await addDoc(collection(db, 'banners'), {
                    title,
                    imageUrl,
                    link,
                    order,
                    isActive: true,
                    createdAt: serverTimestamp()
                  });
                  form.reset();
                  alert('تم إضافة البانر بنجاح');
                } catch (error) {
                  console.error('Error adding banner:', error);
                  handleFirestoreError(error, OperationType.CREATE, 'banners');
                }
              }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4"
            >
              <div className="space-y-2 lg:col-span-2">
                <label className="text-xs font-black text-gray-400">رابط صورة البانر (URL)</label>
                <div className="flex gap-2">
                  <input 
                    name="imageUrl"
                    placeholder="https://example.com/banner.jpg"
                    className="flex-1 bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-3 focus:bg-white focus:border-blue-500 focus:outline-none font-bold"
                    required
                  />
                  <input
                    type="file"
                    id="banner-upload"
                    className="hidden"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onloadend = async () => {
                        try {
                          const compressed = await compressImage(reader.result as string, 1200, 0.6);
                          const input = (e.target as HTMLInputElement).parentElement?.querySelector('input[name="imageUrl"]') as HTMLInputElement;
                          if (input) input.value = compressed;
                        } catch (err) {
                          console.error('Compression error:', err);
                          const input = (e.target as HTMLInputElement).parentElement?.querySelector('input[name="imageUrl"]') as HTMLInputElement;
                          if (input) input.value = reader.result as string;
                        }
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                  <button 
                    type="button"
                    onClick={() => document.getElementById('banner-upload')?.click()}
                    className="p-3 bg-gray-100 hover:bg-gray-200 rounded-2xl transition-all"
                  >
                    <ImageIcon size={20} className="text-gray-600" />
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-gray-400">العنوان (اختياري)</label>
                <input 
                  name="title"
                  placeholder="عرض محدود!"
                  className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-3 focus:bg-white focus:border-blue-500 focus:outline-none font-bold"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-gray-400">الرابط (اختياري)</label>
                <input 
                  name="link"
                  placeholder="/category/perfumes"
                  className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-3 focus:bg-white focus:border-blue-500 focus:outline-none font-bold"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-gray-400">الترتيب</label>
                <input 
                  name="order"
                  type="number"
                  defaultValue={banners.length + 1}
                  className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-3 focus:bg-white focus:border-blue-500 focus:outline-none font-bold text-left"
                  required
                />
              </div>
              <div className="flex items-end">
                <button 
                  type="submit"
                  className="w-full h-12 bg-blue-600 text-white rounded-2xl font-black text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                >
                  إضافة البانر
                </button>
              </div>
            </form>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {banners.length === 0 ? (
              <div className="md:col-span-3 bg-white rounded-3xl p-20 text-center shadow-sm border border-gray-100">
                <p className="text-gray-400 font-bold text-xl">لا توجد بانرات حالية</p>
              </div>
            ) : (
              banners.map((banner) => (
                <div key={banner.id} className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4 group relative overflow-hidden">
                  <div className="aspect-[21/9] rounded-2xl overflow-hidden bg-gray-100">
                    <img src={banner.imageUrl} alt={banner.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-lg font-black text-gray-900">{banner.title || 'بدون عنوان'}</p>
                      <p className="text-xs text-gray-400 font-bold mt-0.5">الترتيب: {banner.order}</p>
                      <div className="flex items-center gap-2 mt-2 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100 w-fit">
                        <span className={`w-2.5 h-2.5 rounded-full ${banner.isActive ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-400'}`}></span>
                        <span className={`text-[11px] font-black uppercase tracking-wider ${banner.isActive ? 'text-green-600' : 'text-red-500'}`}>{banner.isActive ? 'نشط الآن' : 'متوقف مؤقتاً'}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={async () => {
                          setIsUpdatingBanner(banner.id);
                          try {
                            await updateDoc(doc(db, 'banners', banner.id), {
                              isActive: !banner.isActive
                            });
                          } catch (error) {
                            handleFirestoreError(error, OperationType.UPDATE, `banners/${banner.id}`);
                          } finally {
                            setIsUpdatingBanner(null);
                          }
                        }}
                        disabled={isUpdatingBanner === banner.id}
                        className={`p-3 rounded-2xl transition-all shadow-sm border ${banner.isActive ? 'bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100' : 'bg-green-50 text-green-600 border-green-100 hover:bg-green-100'} ${isUpdatingBanner === banner.id ? 'opacity-50' : ''}`}
                        title={banner.isActive ? 'إيقاف التفعيل' : 'تفعيل'}
                      >
                        {isUpdatingBanner === banner.id ? <Clock size={20} className="animate-spin" /> : (banner.isActive ? <XCircle size={20} /> : <CheckCircle2 size={20} />)}
                      </button>
                      <button 
                        onClick={async () => {
                          if (confirm('هل أنت متأكد من حذف هذا البانر؟')) {
                            try {
                              await deleteDoc(doc(db, 'banners', banner.id));
                            } catch (error) {
                              handleFirestoreError(error, OperationType.DELETE, `banners/${banner.id}`);
                            }
                          }
                        }}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        title="حذف"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : activeTab === 'coupons' ? (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
            <h2 className="text-2xl font-black text-gray-900 mb-6 flex items-center gap-2">
              <Tag className="text-blue-600" />
              إنشاء كوبون جديد
            </h2>
            <form 
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const code = (form.elements.namedItem('code') as HTMLInputElement).value.trim().toUpperCase();
                const discountType = (form.elements.namedItem('discountType') as HTMLSelectElement).value as 'fixed' | 'percentage';
                const discountValue = parseFloat((form.elements.namedItem('discountValue') as HTMLInputElement).value);
                const minOrderAmount = parseFloat((form.elements.namedItem('minOrderAmount') as HTMLInputElement).value) || 0;
                
                if (!code || isNaN(discountValue) || discountValue <= 0) {
                  alert('الرجاء إدخال بيانات صحيحة');
                  return;
                }

                if (discountType === 'percentage' && discountValue > 100) {
                  alert('نسبة الخصم لا يمكن أن تتجاوز 100%');
                  return;
                }

                try {
                  await addDoc(collection(db, 'coupons'), {
                    code,
                    discountType,
                    discountValue,
                    minOrderAmount,
                    isActive: true,
                    createdAt: serverTimestamp()
                  });
                  form.reset();
                  alert('تم إضافة الكوبون بنجاح');
                } catch (error) {
                  console.error('Error adding coupon:', error);
                  handleFirestoreError(error, OperationType.CREATE, 'coupons');
                }
              }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4"
            >
              <div className="space-y-2">
                <label className="text-xs font-black text-gray-400">كود الكوبون</label>
                <input 
                  name="code"
                  placeholder="مثال: SAVE20"
                  className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-3 focus:bg-white focus:border-blue-500 focus:outline-none font-bold"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-gray-400">نوع الخصم</label>
                <select 
                  name="discountType"
                  className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-3 focus:bg-white focus:border-blue-500 focus:outline-none font-bold appearance-none"
                  required
                >
                  <option value="fixed">قيمة ثابتة (ج.م)</option>
                  <option value="percentage">نسبة مئوية (%)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-gray-400">قيمة الخصم</label>
                <input 
                  name="discountValue"
                  type="number"
                  placeholder="مثال: 50"
                  className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-3 focus:bg-white focus:border-blue-500 focus:outline-none font-bold text-left"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-gray-400">الحد الأدنى للطلب (ج.م)</label>
                <input 
                  name="minOrderAmount"
                  type="number"
                  placeholder="مثال: 500"
                  className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-3 focus:bg-white focus:border-blue-500 focus:outline-none font-bold text-left"
                />
              </div>
              <div className="flex items-end">
                <button 
                  type="submit"
                  className="w-full h-12 bg-blue-600 text-white rounded-2xl font-black text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                >
                  إضافة الكوبون
                </button>
              </div>
            </form>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {coupons.length === 0 ? (
              <div className="md:col-span-3 bg-white rounded-3xl p-20 text-center shadow-sm border border-gray-100">
                <p className="text-gray-400 font-bold text-xl">لا توجد كوبونات حالية</p>
              </div>
            ) : (
              coupons.map((coupon) => (
                <div key={coupon.id} className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex justify-between items-center group relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-1 h-full bg-blue-600"></div>
                  <div>
                    <p className="text-xl font-black text-gray-900 tracking-wider">{coupon.code}</p>
                    <div className="flex flex-col gap-0.5 mt-1">
                      <p className="text-blue-600 font-black text-sm">
                        خصم: {coupon.discountValue}{coupon.discountType === 'percentage' ? '%' : ' ج.م'}
                      </p>
                      {coupon.minOrderAmount > 0 && (
                        <p className="text-[10px] text-gray-500 font-bold">
                          الحد الأدنى: {coupon.minOrderAmount} ج.م
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100 w-fit">
                      <span className={`w-2.5 h-2.5 rounded-full ${coupon.isActive ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-400'}`}></span>
                      <span className={`text-[11px] font-black uppercase tracking-wider ${coupon.isActive ? 'text-green-600' : 'text-red-500'}`}>{coupon.isActive ? 'نشط الآن' : 'متوقف مؤقتاً'}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={async () => {
                        setIsUpdatingCoupon(coupon.id);
                        try {
                          await updateDoc(doc(db, 'coupons', coupon.id), {
                            isActive: !coupon.isActive
                          });
                        } catch (error) {
                          handleFirestoreError(error, OperationType.UPDATE, `coupons/${coupon.id}`);
                        } finally {
                          setIsUpdatingCoupon(null);
                        }
                      }}
                      disabled={isUpdatingCoupon === coupon.id}
                      className={`p-3 rounded-2xl transition-all shadow-sm border ${coupon.isActive ? 'bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100' : 'bg-green-50 text-green-600 border-green-100 hover:bg-green-100'} ${isUpdatingCoupon === coupon.id ? 'opacity-50' : ''}`}
                      title={coupon.isActive ? 'إيقاف التفعيل' : 'تفعيل'}
                    >
                      {isUpdatingCoupon === coupon.id ? <Clock size={20} className="animate-spin" /> : (coupon.isActive ? <XCircle size={20} /> : <CheckCircle2 size={20} />)}
                    </button>
                    <button 
                      onClick={async () => {
                        if (confirm('هل أنت متأكد من حذف هذا الكوبون؟')) {
                          try {
                            await deleteDoc(doc(db, 'coupons', coupon.id));
                          } catch (error) {
                            handleFirestoreError(error, OperationType.DELETE, `coupons/${coupon.id}`);
                          }
                        }
                      }}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                      title="حذف"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : activeTab === 'users' ? (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
           <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
            <div>
              <h2 className="text-2xl font-black text-gray-900 border-r-4 border-blue-600 pr-4">
                قائمة المستخدمين والعملاء
                <span className="text-gray-400 text-sm mr-3 font-bold">
                  ({users.length} مستخدم)
                </span>
              </h2>
              <p className="text-gray-500 text-sm font-bold mt-1 pr-4 tracking-tight">إحصائيات وبيانات جميع المسجلين في متجرك</p>
            </div>
            
            <div className="relative group w-full md:w-72">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={18} />
              <input 
                type="text"
                placeholder="ابحث بالاسم أو الهاتف..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border-2 border-gray-100 rounded-2xl pr-12 pl-4 py-3 focus:bg-white focus:border-blue-500 focus:outline-none font-bold transition-all shadow-sm"
              />
            </div>
          </div>

          <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="px-8 py-5 text-sm font-black text-gray-400 uppercase tracking-wider">المستخدم</th>
                    <th className="px-8 py-5 text-sm font-black text-gray-400 uppercase tracking-wider">رقم الهاتف</th>
                    <th className="px-8 py-5 text-sm font-black text-gray-400 uppercase tracking-wider">كلمة السر</th>
                    <th className="px-8 py-5 text-sm font-black text-gray-400 uppercase tracking-wider">تاريخ الانضمام</th>
                    <th className="px-8 py-5 text-sm font-black text-gray-400 uppercase tracking-wider text-center">نوع الحساب</th>
                    <th className="px-8 py-5 text-sm font-black text-gray-400 uppercase tracking-wider text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {users
                    .filter(u => 
                      u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                      u.phoneNumber.includes(searchQuery)
                    )
                    .map((user) => (
                      <tr key={user.id} className="group hover:bg-blue-50/20 transition-all duration-300">
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl flex items-center justify-center text-blue-600 font-black text-lg border border-blue-100/50 shadow-sm group-hover:scale-105 transition-transform">
                              {user.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-black text-gray-900 text-base">{user.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-[10px] text-gray-400 font-bold tracking-wider uppercase">ID: {user.id.slice(0, 10)}</p>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                  user.role === 'admin' ? 'bg-red-100 text-red-600' : 
                                  user.role === 'seller' ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {user.role === 'admin' ? 'مشرف' : user.role === 'seller' ? 'تاجر' : 'مشتري'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-xl group-hover:bg-blue-50 transition-colors">
                            <Smartphone size={14} className="text-gray-400 group-hover:text-blue-500" />
                            <span className="font-bold text-gray-700 tracking-wider font-mono">{user.phoneNumber}</span>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <PasswordCell password={user.password} />
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex flex-col gap-1 text-gray-500 font-bold text-sm">
                            <div className="flex items-center gap-2">
                              <Clock size={16} className="text-gray-300" />
                              {user.createdAt ? new Date((user.createdAt.seconds || 0) * 1000).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }) : '---'}
                            </div>
                            {user.createdAt && (
                              <div className="text-xs text-gray-400 mr-6">
                                {new Date((user.createdAt.seconds || 0) * 1000).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-8 py-6 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tight ${
                            user.role === 'seller' 
                              ? 'bg-amber-50 text-amber-600 ring-1 ring-amber-200' 
                              : 'bg-green-50 text-green-600 ring-1 ring-green-200'
                          }`}>
                            <Shield size={12} />
                            {user.role === 'seller' ? 'صاحب المتجر' : 'عميل'}
                          </span>
                        </td>
                        <td className="px-8 py-6 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {user.id !== auth.currentUser?.uid && (
                              <>
                                <button 
                                  onClick={() => {
                                    setChatUserId(user.id);
                                    setActiveTab('chats');
                                  }}
                                  className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                                  title="مراسلة"
                                >
                                  <MessageSquare size={20} />
                                </button>
                                {(user.role === 'buyer' || user.role === 'seller') && (
                                  <button 
                                    onClick={() => handleToggleUserRole(user.id, user.name, user.role)}
                                    className={`p-2 transition-all rounded-xl ${
                                      user.role === 'buyer' 
                                        ? 'text-gray-400 hover:text-amber-500 hover:bg-amber-50'
                                        : 'text-amber-500 hover:text-green-600 hover:bg-green-50'
                                    }`}
                                    title={user.role === 'buyer' ? "تحويل الحساب إلى تاجر" : "تحويل الحساب إلى مشتري"}
                                  >
                                    {user.role === 'buyer' ? <Shield size={20} /> : <UserIcon size={20} />}
                                  </button>
                                )}
                                <button 
                                  onClick={() => handleDeleteUser(user.id, user.name, user.role)}
                                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                  title="حذف هذا المستخدم نهائياً"
                                >
                                  <Trash2 size={20} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-8 py-32 text-center">
                        <div className="flex flex-col items-center gap-4 opacity-30">
                          <UsersIcon size={64} className="text-gray-400" />
                          <p className="text-xl font-bold text-gray-400 italic">لا يوجد مستخدمون حالياً</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === 'settings' ? (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-2">
            <h2 className="text-xl font-black text-gray-900 border-r-4 border-blue-600 pr-3">
              إعدادات الإدارة
            </h2>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
            <div className="max-w-2xl mx-auto py-8">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center">
                  <Palette size={32} className="text-blue-600" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-gray-900">هوية المتجر</h3>
                  <p className="text-gray-500 font-medium">قم بتخصيص اسم المتجر الذي يظهر للمشترين</p>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">شعار المتجر (اللوجو)</label>
                  <div className="flex items-center gap-4">
                    {newStoreLogo ? (
                      <div className="relative">
                        <img src={newStoreLogo} alt="Logo" className="w-16 h-16 rounded-full border-2 border-gray-100 object-cover" />
                        <button 
                          onClick={() => setNewStoreLogo('')}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 bg-gray-50">
                        <ImageIcon size={24} />
                      </div>
                    )}
                    <label className={`cursor-pointer border-2 px-4 py-2 flex-grow text-center rounded-xl transition-all ${logoUploading ? 'bg-gray-100 text-gray-400 border-gray-100' : 'bg-blue-50 text-blue-600 border-blue-50 hover:border-blue-200'}`}>
                      <span className="font-bold">{logoUploading ? 'جاري الرفع...' : 'اختر صورة للشعار'}</span>
                      <input 
                        type="file" 
                        className="hidden" 
                        accept="image/*"
                        disabled={logoUploading}
                        onChange={handleLogoUpload}
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">اسم المتجر (يظهر للعملاء بالموقع)</label>
                  <input
                    type="text"
                    placeholder="مثال: متجر الإدارة"
                    value={newStoreName}
                    onChange={(e) => setNewStoreName(e.target.value)}
                    className="w-full border-2 border-gray-100 rounded-xl px-4 py-3 font-bold focus:border-blue-500 focus:outline-none transition-all"
                  />
                  <p className="mt-2 text-xs text-gray-500 font-medium">سوف يظهر هذا الاسم على كافة المنتجات التي تقوم بإضافتها.</p>
                </div>
                
                <button
                  onClick={saveStoreName}
                  disabled={!newStoreName.trim()}
                  className="w-full bg-blue-600 text-white px-6 py-4 rounded-xl font-black hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-blue-600/20"
                >
                  <Save size={20} /> حفظ التعديلات وتحديث المنتجات
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'payments' ? (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-2">
            <h2 className="text-xl font-black text-gray-900 border-r-4 border-blue-600 pr-3">
              إدارة المدفوعات والطلبات
              <span className="text-gray-400 text-sm mr-2 font-bold">
                ({filteredOrders.length})
              </span>
            </h2>
            
            <div className="flex items-center gap-3">
               <button 
                 onClick={toggleSelectAllOrders}
                 className="text-xs font-black text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-2 rounded-xl border border-blue-100 transition-all"
               >
                 {selectedOrderIds.length > 0 && selectedOrderIds.length === filteredOrders.length ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
               </button>
               {selectedOrderIds.length > 0 && activeTab === 'payments' && (
                 <button 
                   onClick={handleBulkDelete}
                   disabled={isBulkDeleting}
                   className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-xl text-xs font-black hover:bg-red-700 shadow-lg shadow-red-600/20 transition-all active:scale-95 disabled:opacity-50"
                 >
                   <Trash2 size={14} />
                   <span>حذف {selectedOrderIds.length} طلبات</span>
                 </button>
               )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8">
            {filteredOrders.length === 0 ? (
              <div className="md:col-span-2 bg-white rounded-3xl p-20 text-center shadow-sm border border-gray-100">
                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={40} className="text-gray-200" />
                </div>
                <p className="text-gray-400 font-bold text-xl">لا توجد طلبات حالية</p>
              </div>
            ) : (
              filteredOrders.map((order) => {
                const statusInfo = getStatusInfo(order.status);
                return (
                <motion.div 
                  layout
                  key={order.id} 
                  className={`bg-white rounded-3xl p-6 shadow-sm border transition-all relative ${selectedOrderIds.includes(order.id) ? 'border-blue-600 ring-2 ring-blue-600/10' : 'border-gray-100 flex flex-col gap-6'}`}
                >
                  <div className="absolute top-4 left-4 z-10">
                    <input 
                      type="checkbox" 
                      checked={selectedOrderIds.includes(order.id)}
                      onChange={() => toggleOrderSelection(order.id)}
                      className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer shadow-sm"
                    />
                  </div>

                  <div className="flex justify-between items-start mt-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-gray-400">المشتري:</span>
                        <span className="text-sm font-bold text-gray-900">{order.userName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-gray-400">الهاتف:</span>
                        <a href={`tel:${order.userPhone}`} className="text-sm font-bold text-blue-600 hover:underline tracking-wider font-mono">{order.userPhone}</a>
                      </div>
                      <div className="flex flex-col gap-0.5 mt-1">
                        <span className="text-[10px] font-black text-gray-400">العنوان:</span>
                        <p className="text-xs font-bold text-gray-700 leading-relaxed bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
                          {order.address?.city}، {order.address?.area}، {order.address?.street}، عمارة {order.address?.building}{order.address?.apartment ? `، شقة ${order.address?.apartment}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-gray-400">المبلغ:</span>
                        <span className="text-lg font-black text-blue-600">{order.totalPrice} ج.م</span>
                      </div>
                      <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-black text-[10px] w-fit mt-1 ${statusInfo.color}`}>
                        {statusInfo.icon}
                        <span>{statusInfo.label}</span>
                      </div>
                      {order.rejectionReason && (
                        <div className="bg-red-50 text-red-600 p-2 rounded-xl text-[10px] font-bold mt-1 border border-red-100 italic">
                          سبب الرفض: {order.rejectionReason}
                        </div>
                      )}
                    </div>
                    <div className="text-left">
                       <span className="text-[10px] font-black text-gray-400 block mb-1">طريقة الدفع:</span>
                       <span className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full uppercase">
                         {order.paymentMethod === 'instapay' ? 'Instapay' : order.paymentMethod === 'cod' ? 'COD' : 'Wallet'}
                       </span>
                    </div>
                  </div>

                  {order.receiptUrl ? (
                    <div className="relative group aspect-video rounded-2xl overflow-hidden border border-gray-100 shadow-inner">
                      <img 
                        src={order.receiptUrl} 
                        alt="Receipt" 
                        className="w-full h-full object-cover" 
                        onClick={() => setSelectedReceipt(order.receiptUrl)}
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer" onClick={() => setSelectedReceipt(order.receiptUrl)}>
                        <span className="bg-white text-black px-4 py-1.5 rounded-full text-xs font-black shadow-lg">اضغط للتكبير</span>
                      </div>
                    </div>
                  ) : order.paymentMethod !== 'cod' ? (
                    <div className="aspect-video bg-gray-50 rounded-2xl flex items-center justify-center border border-dashed border-gray-200">
                      <p className="text-gray-400 font-bold text-xs italic">لا يوجد إيصال مرفق</p>
                    </div>
                  ) : null}

                  {/* Summary of items */}
                  <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                    <p className="text-[10px] font-black text-gray-400 uppercase">محتويات الطلب:</p>
                    {order.items?.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-xs">
                        <span className="font-bold text-gray-700">{item.name} x{item.quantity}</span>
                        <span className="text-gray-500">{item.price * item.quantity} ج.م</span>
                      </div>
                    ))}
                    {(order.couponCode) && (
                      <div className="flex justify-between items-center text-xs pt-1">
                        <span className="font-bold text-green-600 flex items-center gap-1"><Tag size={10} /> كود الخصم:</span>
                        <span className="text-green-600 font-black">{order.couponCode} (-{order.couponDiscount} ج.م)</span>
                      </div>
                    )}
                    {((order as any).paymentDiscount > 0) && (
                      <div className="flex justify-between items-center text-[10px] pt-1">
                        <span className="font-bold text-emerald-600 italic">خصم الدفع الإلكتروني:</span>
                        <span className="text-emerald-600">-{order.paymentDiscount} ج.م</span>
                      </div>
                    )}
                    {(order.shippingCost !== undefined) && (
                      <div className="flex justify-between items-center text-xs pt-1 border-t border-gray-200">
                        <span className="font-bold text-gray-600 italic">مصاريف الشحن:</span>
                        <span className="text-gray-600">{order.shippingCost === 0 ? 'مجاني' : `${order.shippingCost} ج.م`}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center text-sm pt-1 border-t border-blue-100 bg-blue-50/30 -mx-3 px-3 rounded-b-xl">
                      <span className="font-black text-gray-900">المبلغ النهائي بعد الخصومات:</span>
                      <span className="text-blue-600 font-black">{order.totalPrice} ج.م</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-auto pt-4 border-t border-gray-50">
                    {order.status === 'awaiting_verification' && (
                      <button 
                        onClick={() => handleUpdateOrderStatus(order.id, 'paid')}
                        disabled={isUpdatingStatus === order.id}
                        className="flex-1 bg-green-600 text-white py-3 rounded-2xl font-black text-sm hover:bg-green-700 transition-all shadow-lg shadow-green-600/20 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                      >
                        {isUpdatingStatus === order.id ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : <CheckCircle2 size={18} />}
                        <span>قبول الدفع</span>
                      </button>
                    )}
                    {(order.status === 'paid' || (order.status === 'pending' && order.paymentMethod === 'cod')) && (
                      <button 
                        onClick={() => handleUpdateOrderStatus(order.id, 'delivered')}
                        disabled={isUpdatingStatus === order.id}
                        className="flex-1 bg-blue-600 text-white py-3 rounded-2xl font-black text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                      >
                        <Package size={18} />
                        <span>تم التوصيل</span>
                      </button>
                    )}
                    {['pending', 'awaiting_verification', 'paid'].includes(order.status) && (
                      <button 
                        onClick={() => {
                          if(confirm('هل أنت متأكد من رفض الطلب؟ سيتم إلغاؤه.')) handleUpdateOrderStatus(order.id, 'canceled');
                        }}
                        disabled={isUpdatingStatus === order.id}
                        className="flex-1 bg-red-50 text-red-600 py-3 rounded-2xl font-black text-sm hover:bg-red-100 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                      >
                        <X size={18} />
                        <span>رفض/إلغاء</span>
                      </button>
                    )}
                    <button 
                      onClick={async () => {
                        if(confirm('هل تريد حذف هذا الطلب نهائياً؟')) {
                          console.log(`Attempting to delete order: ${order.id}`);
                          try {
                            await deleteDoc(doc(db, 'orders', order.id));
                            console.log(`Order ${order.id} deleted successfully`);
                            alert('تم حذف الطلب بنجاح');
                          } catch (err: any) {
                            console.error('Delete order error:', err);
                            const isPermissionError = err.message?.includes('permission-denied') || err.code?.includes('permission-denied');
                            if (isPermissionError) {
                              alert('فشل: ليس لديك صلاحية لحذف هذا الطلب.');
                            } else {
                              alert('فشل حذف الطلب: ' + (err.message || err));
                            }
                            handleFirestoreError(err, OperationType.DELETE, `orders/${order.id}`);
                          }
                        }
                      }}
                      className="bg-gray-100 text-gray-400 p-3 rounded-2xl hover:bg-red-50 hover:text-red-600 transition-all font-bold group"
                      title="حذف الطلب نهائياً"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </motion.div>
                );
              })
            )}
          </div>
        </div>
      ) : activeTab === 'reviews' ? (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-2">
            <h2 className="text-xl font-black text-gray-900 border-r-4 border-blue-600 pr-3">
              إدارة التقييمات والمراجعات
              <span className="text-gray-400 text-sm mr-2 font-bold">
                ({filteredReviews.length})
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredReviews.length === 0 ? (
              <div className="md:col-span-2 bg-white rounded-3xl p-20 text-center shadow-sm border border-gray-100">
                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ClipboardList size={40} className="text-gray-200" />
                </div>
                <p className="text-gray-400 font-bold text-xl">لا توجد تقييمات حالية</p>
              </div>
            ) : (
              filteredReviews.map((review) => {
                const product = products.find(p => p.id === review.productId);
                return (
                  <motion.div 
                    layout
                    key={review.id}
                    className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4 relative"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex gap-3">
                         <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center overflow-hidden border border-gray-100">
                           {product ? (
                             <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                           ) : (
                             <Package size={20} className="text-gray-400" />
                           )}
                         </div>
                         <div>
                            <p className="font-black text-gray-900 text-sm">{review.userName}</p>
                            <p className="text-[10px] text-gray-400 font-bold">على منتج: {product?.name || 'منتج غير معروف'}</p>
                         </div>
                      </div>
                      <div className="flex flex-col items-end">
                         <div className="flex items-center gap-0.5 text-amber-500">
                           {Array.from({ length: 5 }).map((_, i) => (
                             <span key={i} className={i < review.rating ? 'fill-current' : 'text-gray-200'}>★</span>
                           ))}
                         </div>
                         <p className="text-[10px] text-gray-400 mt-1">
                           {review.createdAt?.toDate ? review.createdAt.toDate().toLocaleDateString('ar-EG') : 'بتاريخ غير معروف'}
                         </p>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 italic text-gray-700 text-sm leading-relaxed">
                      "{review.comment || 'بدون تعليق'}"
                    </div>

                    <button 
                      onClick={() => handleDeleteReview(review.id)}
                      className="absolute bottom-4 left-4 p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                      title="حذف التقييم"
                    >
                      <Trash2 size={18} />
                    </button>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar - Desktop Only */}
          <aside className="hidden lg:block w-72 shrink-0">
            <div className="sticky top-4 bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-6">
              <div>
                <h2 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-2">
                  <LayoutGrid size={22} className="text-blue-600" />
                  الأقسام
                </h2>
                
                <div className="space-y-2">
                  <button
                    onClick={() => setActiveCategory(null)}
                    className={`w-full text-right px-4 py-3 rounded-xl font-bold transition-all flex items-center gap-3 ${
                      activeCategory === null
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                        : 'text-gray-500 hover:bg-gray-50 hover:text-blue-600'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${activeCategory === null ? 'bg-white' : 'bg-gray-300'}`} />
                    كل المنتجات
                  </button>

                  {sortedCategories.filter(c => !c.parentId).map((main) => {
                    const isActive = activeCategory === main.name || sortedCategories.some(s => s.name === activeCategory && s.parentId === main.id);
                    const isCurrent = activeCategory === main.name;
                    const relevantSubs = sortedCategories.filter(s => s.parentId === main.id);

                    return (
                      <div key={main.id} className="space-y-1">
                        <button
                          onClick={() => setActiveCategory(main.name)}
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
                                onClick={() => setActiveCategory(sub.name)}
                                className={`w-full text-right px-4 py-2 rounded-lg text-sm font-bold transition-all border-r-2 ${
                                  activeCategory === sub.name
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
            </div>
          </aside>

          {/* Main Content Area */}
          <div className="flex-1 space-y-6">
            {/* Mobile Category Filter */}
            <div className="lg:hidden mb-10 space-y-4">
              <div className="overflow-x-auto pb-4 scrollbar-hide flex items-center gap-2 -mx-4 px-4">
                <button
                  onClick={() => setActiveCategory(null)}
                  className={`whitespace-nowrap px-6 py-3 rounded-full font-bold transition-all border-2 flex items-center gap-2 ${
                    activeCategory === null
                      ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20 scale-105'
                      : 'bg-white border-gray-100 text-gray-500 hover:border-blue-200'
                  }`}
                >
                  <Tag size={18} />
                  الكل
                </button>
                {sortedCategories.filter(c => !c.parentId).map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.name)}
                    className={`whitespace-nowrap px-6 py-3 rounded-full font-bold transition-all border-2 flex items-center gap-2 ${
                      activeCategory === cat.name || sortedCategories.some(sub => sub.name === activeCategory && sub.parentId === cat.id)
                        ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20 scale-105'
                        : 'bg-white border-gray-100 text-gray-500 hover:border-blue-200'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>

              {/* Categories bar - subcategories */}
              {(() => {
                const mainCategories = sortedCategories.filter(c => !c.parentId);
                const activeMainCat = mainCategories.find(c => activeCategory === c.name || sortedCategories.some(sub => sub.name === activeCategory && sub.parentId === c.id));
                if (!activeMainCat) return null;
                
                const relevantSubs = sortedCategories.filter(s => s.parentId === activeMainCat.id);
                if (relevantSubs.length === 0) return null;

                return (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide"
                  >
                    <button
                      onClick={() => setActiveCategory(activeMainCat.name)}
                      className={`whitespace-nowrap px-4 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                        activeCategory === activeMainCat.name
                          ? 'bg-blue-100 border-blue-200 text-blue-600'
                          : 'bg-gray-50 border-gray-100 text-gray-500'
                      }`}
                    >
                      الكل في {activeMainCat.name}
                    </button>
                    {relevantSubs.map(sub => (
                      <button
                        key={sub.id}
                        onClick={() => setActiveCategory(sub.name)}
                        className={`whitespace-nowrap px-4 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                          activeCategory === sub.name
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

            <div className="flex justify-between items-center px-2">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-black text-gray-900 border-r-4 border-blue-600 pr-3">
                  {activeCategory || 'جميع المنتجات'} 
                  <span className="text-gray-400 text-sm mr-2 font-bold">({filteredProducts.length})</span>
                </h2>
                
                {filteredProducts.length > 1 && !searchQuery && (
                  <div className="flex items-center gap-2">
                    {!isReordering ? (
                      <button
                        onClick={() => {
                          setIsReordering(true);
                          setReorderedItems(filteredProducts);
                        }}
                        className="flex items-center gap-2 bg-gray-100 text-gray-600 px-4 py-2 rounded-xl text-xs font-black hover:bg-blue-50 hover:text-blue-600 transition-all active:scale-95"
                      >
                        <GripVertical size={14} />
                        تغيير الترتيب
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleSaveOrder}
                          disabled={isSavingOrder}
                          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-black hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-blue-600/20"
                        >
                          <Save size={14} />
                          {isSavingOrder ? 'جاري الحفظ...' : 'حفظ الترتيب'}
                        </button>
                        <button
                          onClick={() => setIsReordering(false)}
                          disabled={isSavingOrder}
                          className="flex items-center gap-2 bg-white border border-gray-200 text-gray-500 px-4 py-2 rounded-xl text-xs font-black hover:bg-gray-50 transition-all active:scale-95"
                        >
                          إلغاء
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {!isReordering && selectedProductIds.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-4 bg-red-50 border border-red-100 px-4 py-2 rounded-2xl"
                >
                  <span className="text-red-600 font-bold text-sm">تم تحديد {selectedProductIds.length} منتجات</span>
                  <button
                    onClick={handleBulkDelete}
                    disabled={isBulkDeleting}
                    className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-red-700 transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Trash2 size={16} />
                    <span>{isBulkDeleting ? 'جاري الحذف...' : 'حذف المحدد'}</span>
                  </button>
                  <button 
                    onClick={() => setSelectedProductIds([])}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X size={16} />
                  </button>
                </motion.div>
              )}
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right">
                  <thead className="bg-gray-50 text-gray-500 text-xs font-black border-b border-gray-100 uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-5 text-center">
                        {!isReordering ? (
                          <input 
                            type="checkbox" 
                            checked={filteredProducts.length > 0 && selectedProductIds.length === filteredProducts.length}
                            onChange={toggleSelectAll}
                            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        ) : (
                          <GripVertical size={18} className="mx-auto text-gray-400" />
                        )}
                      </th>
                      <th className="px-6 py-5">المنتج</th>
                      {!activeCategory && <th className="px-6 py-5 text-center">القسم</th>}
                      <th className="px-6 py-5">السعر</th>
                      <th className="px-6 py-5">المخزون</th>
                      <th className="px-6 py-5">الإجراءات</th>
                    </tr>
                  </thead>
                  {isReordering ? (
                    <Reorder.Group 
                      axis="y" 
                      values={reorderedItems} 
                      onReorder={setReorderedItems}
                      as="tbody"
                      className="divide-y divide-gray-50"
                    >
                      {reorderedItems.map((product) => (
                        <Reorder.Item 
                          key={product.id} 
                          value={product}
                          as="tr"
                          className="hover:bg-gray-50/50 transition-colors group cursor-move select-none"
                        >
                          <td className="px-6 py-5 text-center">
                            <GripVertical size={20} className="mx-auto text-gray-300 group-hover:text-blue-500" />
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-4">
                              <img 
                                src={product.imageUrl} 
                                alt={product.name} 
                                className="w-12 h-12 rounded-xl object-cover bg-gray-100 border border-gray-100"
                                referrerPolicy="no-referrer"
                              />
                              <p className="font-black text-gray-900">{product.name}</p>
                            </div>
                          </td>
                          {!activeCategory && (
                            <td className="px-6 py-5 text-center">
                              <span className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl text-[10px] font-black border border-blue-100">
                                {product.category || 'عام'}
                              </span>
                            </td>
                          )}
                          <td className="px-6 py-5 font-black text-blue-600">{product.price} ج.م</td>
                          <td className="px-6 py-5 font-bold text-gray-500 text-sm">{product.quantity} قطعة</td>
                          <td className="px-6 py-5 text-gray-400 text-xs italic">اسحب للتحريك</td>
                        </Reorder.Item>
                      ))}
                    </Reorder.Group>
                  ) : (
                    <tbody className="divide-y divide-gray-50">
                      {filteredProducts.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-24 text-center">
                            <div className="flex flex-col items-center gap-4 text-gray-400">
                              <Box size={48} className="opacity-20" />
                              <p className="font-bold text-lg italic">لا توجد منتجات مطابقة للبحث أو في هذا القسم</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredProducts.map((product) => (
                          <tr key={product.id} className="hover:bg-gray-50/50 transition-colors group">
                            <td className="px-6 py-5 text-center">
                              <input 
                                type="checkbox" 
                                checked={selectedProductIds.includes(product.id)}
                                onChange={() => toggleProductSelection(product.id)}
                                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-4">
                                <div className="relative">
                                  <img 
                                    src={product.imageUrl} 
                                    alt={product.name} 
                                    className="w-16 h-16 rounded-2xl object-cover bg-gray-100 border border-gray-100 shadow-sm"
                                    referrerPolicy="no-referrer"
                                  />
                                  {product.quantity === 0 && (
                                    <div className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center">
                                      <span className="text-[10px] text-white font-black uppercase">نفذ</span>
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <p className="font-black text-gray-900 group-hover:text-blue-600 transition-colors">{product.name}</p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-bold">
                                      ID: {product.id.slice(0, 6)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>
                            {!activeCategory && (
                              <td className="px-6 py-5 text-center">
                                <span className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl text-xs font-black border border-blue-100">
                                  {product.category || 'عام'}
                                </span>
                              </td>
                            )}
                            <td className="px-6 py-5">
                              <div className="flex flex-col">
                                <span className="font-black text-blue-600 text-lg">{product.price} ج.م</span>
                                <span className="text-[10px] text-gray-400 font-bold">سعر الوحدة</span>
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              <div className="flex flex-col gap-1">
                                <span className={`text-sm font-black ${product.quantity > 5 ? 'text-green-600' : product.quantity > 0 ? 'text-orange-500' : 'text-red-500'}`}>
                                  {product.quantity} قطعة
                                </span>
                                <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full transition-all ${product.quantity > 5 ? 'bg-green-500' : product.quantity > 0 ? 'bg-orange-500' : 'bg-red-500'}`}
                                    style={{ width: `${Math.min((product.quantity / 20) * 100, 100)}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={async () => {
                                    try {
                                      await updateDoc(doc(db, 'products', product.id), {
                                        isActive: product.isActive === false,
                                        updatedAt: serverTimestamp()
                                      });
                                    } catch (error) {
                                      console.error("Error toggling product status:", error);
                                      handleFirestoreError(error, OperationType.UPDATE, `products/${product.id}`);
                                    }
                                  }}
                                  className={`p-2.5 rounded-xl transition-all border shadow-sm hover:shadow-md ${product.isActive !== false ? 'bg-green-50 text-green-600 border-green-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}
                                  title={product.isActive !== false ? 'إيقاف التنشيط' : 'تنشيط المنتج'}
                                >
                                  {product.isActive !== false ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                                </button>
                                <button 
                                  onClick={() => handleEdit(product)}
                                  className="p-2.5 text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-transparent hover:border-blue-100 shadow-sm hover:shadow-md"
                                  title="تعديل المنتج"
                                >
                                  <Edit2 size={20} />
                                </button>
                                <button 
                                  onClick={() => setDeleteConfirm({ id: product.id, name: product.name, type: 'product' })}
                                  className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100 shadow-sm hover:shadow-md"
                                  title="حذف المنتج"
                                >
                                  <Trash2 size={20} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  )}
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={resetForm}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h3 className="text-2xl font-black text-gray-900">
                  {editingProduct ? 'تعديل المنتج' : 'إضافة منتج جديد'}
                </h3>
                <button onClick={resetForm} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-8 overflow-y-auto space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <Tag size={16} className="text-blue-500" />
                    قسم المنتج
                  </label>
                  
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                    className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-medium appearance-none"
                  >
                    <option value="" disabled>اختر قسماً للمنتج...</option>
                    {sortedCategories.filter(c => !c.parentId).map((parent) => (
                      <React.Fragment key={parent.id}>
                        <option value={parent.name} className="font-black text-blue-800">{parent.name} (قسم رئيسي)</option>
                        {sortedCategories.filter(sub => sub.parentId === parent.id).map(sub => (
                          <option key={sub.id} value={sub.name}>&nbsp;&nbsp;&nbsp;- {sub.name}</option>
                        ))}
                      </React.Fragment>
                    ))}
                    {/* Handle orphaned categories */}
                    {sortedCategories.filter(c => c.parentId && !categories.some(p => p.id === c.parentId)).map(orphan => (
                       <option key={orphan.id} value={orphan.name} className="text-red-500">{orphan.name} (تنبيه: قسم فرعي بدون أب)</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400">يجب اختيار قسم من الأقسام التي قمت بإنشائها.</p>
                </div>

                {JSON.stringify(formData).length > 800000 && (
                  <div className="p-4 rounded-xl text-xs flex flex-col gap-2 bg-red-50 text-red-700 border border-red-100">
                    <div className="flex items-center gap-2 font-black text-sm">
                      <Box size={16} />
                      <span className="bg-red-600 text-white px-2 py-0.5 rounded animate-pulse">تنبيه: حجم المنتج كبير جداً!</span>
                    </div>
                    <p className="font-medium leading-relaxed opacity-90">
                      💡 <b>لماذا هذا التنبيه؟</b> قاعدة البيانات تضع حداً أقصى لكل منتج. اقتربت من هذا الحد.
                      <br />
                      ✅ <b>للحل:</b> بدلاً من "رفع الصور"، انسخ "رابط الصورة" من فيسبوك أو تلجرام وضعه في خانة "رابط الصورة". الروابط لا تأخذ مساحة أبداً!
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <Type size={16} className="text-blue-500" />
                    اسم المنتج
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="مثال: ساعة ذكية برو"
                    className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-medium"
                  />
                </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                      <Palette size={16} className="text-blue-500" />
                      الألوان المتاحة (اختر من القائمة أو أضف يدوياً)
                    </label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                       {COMMON_COLORS.map(color => (
                         <button
                           key={color}
                           type="button"
                           onClick={() => setFormData({ ...formData, colors: toggleSelection(formData.colors, color) })}
                           className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all ${
                             formData.colors.includes(color)
                               ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                               : 'bg-white border-gray-100 text-gray-500 hover:border-blue-200'
                           }`}
                         >
                           {color}
                         </button>
                       ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        id="custom-color-input"
                        placeholder="أضف لوناً مخصصاً (اضغط Enter للإضافة)..."
                        className="flex-1 bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-medium"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = (e.target as HTMLInputElement).value.trim();
                            if (val && !formData.colors.includes(val)) {
                              setFormData({ ...formData, colors: [...formData.colors, val] });
                              (e.target as HTMLInputElement).value = '';
                            }
                          }
                        }}
                        onBlur={(e) => {
                          const val = e.target.value.trim();
                          if (val && !formData.colors.includes(val)) {
                            setFormData({ ...formData, colors: [...formData.colors, val] });
                            e.target.value = '';
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const input = document.getElementById('custom-color-input') as HTMLInputElement;
                          const val = input.value.trim();
                          if (val && !formData.colors.includes(val)) {
                            setFormData({ ...formData, colors: [...formData.colors, val] });
                            input.value = '';
                          }
                        }}
                        className="bg-blue-50 text-blue-600 px-4 py-2 rounded-2xl font-bold border-2 border-blue-50 hover:border-blue-200 transition-all"
                      >
                        إضافة
                      </button>
                    </div>
                    {formData.colors.some(c => !COMMON_COLORS.includes(c)) && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {formData.colors.filter(c => !COMMON_COLORS.includes(c)).map((color, idx) => (
                          <span key={idx} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 group border border-blue-100">
                            {color} (مخصص)
                            <button 
                              type="button" 
                              onClick={() => setFormData({ ...formData, colors: formData.colors.filter(c => c !== color) })}
                              className="hover:text-red-500"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                      <Maximize size={16} className="text-blue-500" />
                      المقاسات المتاحة (اختر من القائمة أو أضف يدوياً)
                    </label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                       {COMMON_SIZES.map(size => (
                         <button
                           key={size}
                           type="button"
                           onClick={() => setFormData({ ...formData, sizes: toggleSelection(formData.sizes, size) })}
                           className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all ${
                             formData.sizes.includes(size)
                               ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                               : 'bg-white border-gray-100 text-gray-500 hover:border-blue-200'
                           }`}
                         >
                           {size}
                         </button>
                       ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        id="custom-size-input"
                        placeholder="أضف مقاساً مخصصاً (اضغط Enter للإضافة)..."
                        className="flex-1 bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-medium"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = (e.target as HTMLInputElement).value.trim();
                            if (val && !formData.sizes.includes(val)) {
                              setFormData({ ...formData, sizes: [...formData.sizes, val] });
                              (e.target as HTMLInputElement).value = '';
                            }
                          }
                        }}
                        onBlur={(e) => {
                          const val = e.target.value.trim();
                          if (val && !formData.sizes.includes(val)) {
                            setFormData({ ...formData, sizes: [...formData.sizes, val] });
                            e.target.value = '';
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const input = document.getElementById('custom-size-input') as HTMLInputElement;
                          const val = input.value.trim();
                          if (val && !formData.sizes.includes(val)) {
                            setFormData({ ...formData, sizes: [...formData.sizes, val] });
                            input.value = '';
                          }
                        }}
                        className="bg-blue-50 text-blue-600 px-4 py-2 rounded-2xl font-bold border-2 border-blue-50 hover:border-blue-200 transition-all"
                      >
                        إضافة
                      </button>
                    </div>
                    {formData.sizes.some(s => !COMMON_SIZES.includes(s)) && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {formData.sizes.filter(s => !COMMON_SIZES.includes(s)).map((size, idx) => (
                          <span key={idx} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 group border border-blue-100">
                            {size} (مخصص)
                            <button 
                              type="button" 
                              onClick={() => setFormData({ ...formData, sizes: formData.sizes.filter(s => s !== size) })}
                              className="hover:text-red-500"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                      <DollarSign size={16} className="text-blue-500" />
                      السعر (بالجنيه المصري)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({...formData, price: e.target.value})}
                      placeholder="0.00"
                      className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-medium text-left"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                      <Box size={16} className="text-blue-500" />
                      الكمية المتوفرة
                    </label>
                    <input
                      type="number"
                      value={formData.quantity}
                      onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                      placeholder="0"
                      className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-medium text-left"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <Smartphone size={16} className="text-blue-500" />
                    فيديو المنتج (رابط YouTube أو ارفع من الجهاز)
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={formData.videoUrl}
                      onChange={(e) => setFormData({...formData, videoUrl: e.target.value})}
                      placeholder="رابط YouTube أو فيديو مباشر..."
                      className="flex-1 bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-medium text-left"
                    />
                    <input
                      type="file"
                      id="video-upload"
                      className="hidden"
                      accept="video/*"
                      onChange={handleVideoUpload}
                    />
                    <div className="flex gap-2">
                      <button 
                        type="button"
                        disabled={videoUploading}
                        onClick={() => document.getElementById('video-upload')?.click()}
                        className={`flex-1 sm:flex-none px-5 py-4 sm:py-0 rounded-2xl transition-all flex items-center justify-center border-2 ${videoUploading ? 'bg-gray-100 border-gray-100' : 'bg-white border-gray-100 hover:border-blue-500 text-blue-600'}`}
                      >
                        {videoUploading ? (
                          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Smartphone size={20} />
                            <span className="sm:hidden font-bold">رفع فيديو</span>
                          </div>
                        )}
                      </button>
                      {formData.videoUrl && (
                        <button 
                         type="button"
                         onClick={() => setFormData({...formData, videoUrl: ''})}
                         className="px-5 py-4 sm:py-0 bg-red-50 text-red-600 rounded-2xl hover:bg-red-100 transition-all border-2 border-red-50 flex items-center justify-center"
                         title="حذف الفيديو"
                       >
                         <X size={20} />
                       </button>
                      )}
                    </div>
                  </div>
                  {formData.videoUrl && formData.videoUrl.startsWith('data:') && (
                    <div className="mt-2 p-2 bg-blue-50 rounded-xl flex items-center gap-3">
                      <div className="w-12 h-12 bg-black rounded-lg overflow-hidden">
                        <video src={formData.videoUrl} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] font-bold text-blue-700">تم اختيار فيديو من الجهاز</p>
                        <p className="text-[8px] text-gray-500 line-clamp-1">{formData.videoUrl.substring(0, 50)}...</p>
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] text-gray-400 font-bold">نصيحة: الفيديوهات المرفوعة من الجهاز يجب أن تكون مساحتها صغيرة جداً (أقل من 800KB). يفضل دائماً استخدام روابط YouTube.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <ImageIcon size={16} className="text-blue-500" />
                    صورة المنتج
                  </label>
                  
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={formData.imageUrl}
                        onChange={(e) => setFormData({...formData, imageUrl: e.target.value})}
                        placeholder="رابط الصورة الأساسية..."
                        className="flex-1 bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-medium text-left"
                      />
                      <label className={`cursor-pointer border-2 px-6 py-4 rounded-2xl transition-all flex items-center justify-center gap-2 min-w-[140px] ${imageUploading ? 'bg-gray-100 text-gray-400 border-gray-100 cursor-not-allowed' : 'bg-blue-50 text-blue-600 border-blue-50 hover:border-blue-200'}`}>
                        <ImageIcon size={20} />
                        <span className="font-bold">{imageUploading ? 'جاري...' : 'من الجهاز'}</span>
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="image/*"
                          disabled={imageUploading}
                          onChange={handleImageUpload}
                        />
                      </label>
                    </div>
                  </div>

                  {formData.imageUrl && (
                    <div className="mt-2 p-3 bg-gray-50 rounded-2xl border border-gray-100 flex items-center gap-4">
                      <div className="relative">
                        <img src={formData.imageUrl} alt="Preview" className="w-16 h-16 rounded-xl border-2 border-white shadow-sm object-cover" />
                        <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-md font-bold">أساسية</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-bold text-gray-500 mb-1">الصورة الأساسية (تظهر في الواجهة)</p>
                        <button 
                          type="button"
                          onClick={() => setFormData({...formData, imageUrl: ''})}
                          className="text-xs text-red-500 font-bold hover:underline"
                        >
                          إزالة الصورة
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <ImageIcon size={16} className="text-blue-500" />
                    صور إضافية (اختياري)
                  </label>
                  
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          id="additionalImageUrl"
                          placeholder="أضف رابط صورة إضافية..."
                          className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-medium text-left"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const input = e.target as HTMLInputElement;
                              const val = input.value;
                              if (val) {
                                if ((formData.images || []).length >= 10) {
                                  alert('يمكنك إضافة 10 صور إضافية كحد أقصى.');
                                  return;
                                }
                                setFormData(prev => ({ ...prev, images: [...(prev.images || []), val] }));
                                input.value = '';
                              }
                            }
                          }}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const input = document.getElementById('additionalImageUrl') as HTMLInputElement;
                            const val = input.value;
                            if (val) {
                              if ((formData.images || []).length >= 10) {
                                alert('يمكنك إضافة 10 صور إضافية كحد أقصى.');
                                return;
                              }
                              setFormData(prev => ({ ...prev, images: [...(prev.images || []), val] }));
                              input.value = '';
                            }
                          }}
                          className="flex-1 sm:flex-none bg-gray-100 text-gray-600 border-2 border-gray-100 hover:border-blue-200 px-4 py-4 rounded-2xl transition-all font-bold whitespace-nowrap"
                        >
                          إضافة رابط
                        </button>
                        <label className={`cursor-pointer flex-1 sm:flex-none border-2 px-6 py-4 rounded-2xl transition-all flex items-center justify-center gap-2 min-w-[140px] ${imageUploading ? 'bg-gray-100 text-gray-400 border-gray-100 cursor-not-allowed' : 'bg-blue-50 text-blue-600 border-blue-50 hover:border-blue-200'}`}>
                          <ImageIcon size={20} />
                          <span className="font-bold whitespace-nowrap">{imageUploading ? 'جاري الرفع...' : 'من الجهاز'}</span>
                          <input 
                            type="file" 
                            className="hidden" 
                            accept="image/*"
                            disabled={imageUploading}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.size > 5 * 1024 * 1024) {
                                alert('حجم الصورة كبير جداً (أكثر من 5 ميجابايت).');
                                return;
                              }
                              if ((formData.images || []).length >= 10) {
                                alert('يمكنك إضافة 10 صور إضافية كحد أقصى.');
                                return;
                              }
                              setImageUploading(true);
                              const reader = new FileReader();
                              reader.onloadend = async () => {
                                try {
                                  const compressed = await compressImage(reader.result as string, 800, 0.6);
                                  setFormData(prev => ({ 
                                    ...prev, 
                                    images: [...(prev.images || []), compressed] 
                                  }));
                                } catch (err) {
                                  console.error('Compression error:', err);
                                  setFormData(prev => ({ 
                                    ...prev, 
                                    images: [...(prev.images || []), reader.result as string] 
                                  }));
                                } finally {
                                  setImageUploading(false);
                                }
                              };
                              reader.onerror = () => {
                                alert('حدث خطأ أثناء تحميل الصورة.');
                                setImageUploading(false);
                              };
                              reader.readAsDataURL(file);
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  {formData.images && formData.images.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
                      {formData.images.map((img, index) => (
                        <div key={index} className="relative group aspect-square rounded-2xl overflow-hidden border-2 border-gray-100 shadow-sm">
                          <img src={img} alt={`Gallery ${index}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, images: (prev.images || []).filter((_, i) => i !== index) }))}
                            className="absolute top-2 left-2 bg-red-500 text-white p-1.5 rounded-full transition-opacity shadow-lg"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">وصف المنتج</label>
                  <textarea
                    rows={4}
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    placeholder="أضف تفاصيل المنتج، المواصفات، أو أي معلومات هامة..."
                    className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-medium"
                  />
                </div>

                <div className="space-y-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                    <div>
                      <h4 className="text-sm font-black text-gray-900">حالة المنتج (نشط / متوقف)</h4>
                      <p className="text-[10px] text-gray-500 font-bold">المنتجات المتوقفة لا تظهر للمشترين في المتجر</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                      className={`w-14 h-8 rounded-full relative transition-all ${formData.isActive ? 'bg-green-500 shadow-lg shadow-green-200' : 'bg-gray-200'}`}
                    >
                      <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-sm transition-all ${formData.isActive ? 'right-7' : 'right-1'}`} />
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || imageUploading}
                  className="w-full h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-blue-600/20 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>جاري الحفظ...</span>
                    </div>
                  ) : imageUploading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>جاري معالجة الصور...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <Save size={24} />
                      <span>حفظ المنتج</span>
                    </div>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Category Management Modal */}
      <AnimatePresence>
        {isCategoryModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCategoryModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
                  <LayoutGrid size={24} className="text-blue-600" />
                  إدارة الأقسام
                </h3>
                <button onClick={() => setIsCategoryModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="p-6 flex-1 overflow-y-auto space-y-6">
                <form onSubmit={handleAddCategory} className="space-y-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="اسم القسم الجديد..."
                      className="flex-1 bg-gray-50 border-2 border-gray-50 rounded-2xl px-4 py-3 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-bold"
                    />
                    <button 
                      type="submit"
                      className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-blue-700 transition-all active:scale-95 whitespace-nowrap"
                    >
                      إضافة قسم
                    </button>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">جعل هذا القسم متفرع من (اختياري)</label>
                    <select
                      value={newCategoryParentId}
                      onChange={(e) => setNewCategoryParentId(e.target.value)}
                      className="w-full bg-gray-50 border-2 border-gray-50 rounded-xl px-4 py-2 focus:bg-white focus:border-blue-500 focus:outline-none transition-all text-xs font-bold appearance-none"
                    >
                      <option value="">-- قسم رئيسي (بدون أب) --</option>
                      {sortedCategories.filter(c => !c.parentId).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </form>

                <div className="space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest">الأقسام الحالية</p>
                    {categories.length > 1 && (
                      <div className="flex gap-2">
                        {isReorderingCategories ? (
                          <button
                            onClick={handleSaveCategoryOrder}
                            disabled={isSavingCategoryOrder}
                            className="bg-blue-600 text-white px-3 py-1 rounded-lg text-[10px] font-black hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50"
                          >
                            {isSavingCategoryOrder ? 'جاري الحفظ...' : 'حفظ الترتيب'}
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setIsReorderingCategories(true);
                              setReorderedCategories(sortedCategories.filter(c => !c.parentId));
                            }}
                            className="text-[10px] font-black text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg transition-all"
                          >
                            تغيير ترتيب الأقسام الرئيسية
                          </button>
                        )}
                        {isReorderingCategories && (
                          <button
                            onClick={() => setIsReorderingCategories(false)}
                            className="text-[10px] font-black text-gray-400 hover:bg-gray-100 px-2 py-1 rounded-lg transition-all"
                          >
                            إلغاء
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {categories.length === 0 ? (
                    <div className="text-center py-10 text-gray-400 italic bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-200">
                      لم تضف أي أقسام بعد.
                    </div>
                  ) : isReorderingCategories ? (
                    <Reorder.Group 
                      axis="y" 
                      values={reorderedCategories} 
                      onReorder={setReorderedCategories}
                      className="space-y-2"
                    >
                      {reorderedCategories.map((cat) => (
                        <Reorder.Item 
                          key={cat.id} 
                          value={cat}
                          className="flex items-center justify-between p-4 bg-white rounded-2xl border-2 border-blue-100 cursor-move shadow-sm"
                        >
                          <div className="flex items-center gap-3">
                            <GripVertical size={18} className="text-blue-400" />
                            <span className="font-bold text-gray-900">{cat.name}</span>
                          </div>
                          <span className="text-[10px] text-gray-400 italic">اسحب للتحريك</span>
                        </Reorder.Item>
                      ))}
                    </Reorder.Group>
                  ) : (
                    <div className="space-y-3">
                      {/* Separate into Main and Sub categories */}
                      {sortedCategories.filter(c => !c.parentId).map((mainCat) => (
                        <div key={mainCat.id} className="space-y-2">
                          {/* Main Category Row */}
                          <div className="flex flex-col gap-2 p-4 bg-gray-100 rounded-2xl border border-gray-200 group hover:border-blue-300 transition-all">
                            {editingCategory?.id === mainCat.id ? (
                              <div className="space-y-3">
                                <form onSubmit={handleUpdateCategory} className="flex gap-2">
                                  <input
                                    autoFocus
                                    type="text"
                                    value={editCategoryName}
                                    onChange={(e) => setEditCategoryName(e.target.value)}
                                    className="flex-1 bg-white border-2 border-blue-500 rounded-xl px-3 py-2 focus:outline-none font-bold"
                                  />
                                  <button type="submit" className="bg-green-500 text-white p-2 rounded-xl hover:bg-green-600 transition-all">
                                    <Save size={18} />
                                  </button>
                                  <button type="button" onClick={() => { setEditingCategory(null); setEditCategoryParentId(''); }} className="bg-gray-200 text-gray-600 p-2 rounded-xl hover:bg-gray-300 transition-all">
                                    <X size={18} />
                                  </button>
                                </form>
                                <select
                                  value={editCategoryParentId}
                                  onChange={(e) => setEditCategoryParentId(e.target.value)}
                                  className="w-full bg-white border-2 border-gray-100 rounded-xl px-4 py-2 focus:border-blue-500 focus:outline-none transition-all text-xs font-bold"
                                >
                                  <option value="">-- قسم رئيسي --</option>
                                  {sortedCategories.filter(c => !c.parentId && c.id !== mainCat.id).map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                </select>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between">
                                <span className="font-black text-blue-800">{mainCat.name}</span>
                                <div className="flex items-center gap-2">
                                  <button onClick={() => { setEditingCategory(mainCat); setEditCategoryName(mainCat.name); setEditCategoryParentId(mainCat.parentId || ''); }} className="p-1.5 text-blue-500 hover:bg-blue-100 rounded-lg transition-colors"><Edit2 size={14} /></button>
                                  <button onClick={() => setDeleteConfirm({ id: mainCat.id, name: mainCat.name, type: 'category' })} className="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition-colors"><Trash2 size={14} /></button>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Sub Categories Indented */}
                          {sortedCategories.filter(sub => sub.parentId === mainCat.id).map(subCat => (
                            <div key={subCat.id} className="mr-8 flex flex-col gap-2 p-3 bg-white rounded-xl border-2 border-gray-50 group hover:border-blue-200 transition-all">
                              {editingCategory?.id === subCat.id ? (
                                <div className="space-y-3">
                                  <form onSubmit={handleUpdateCategory} className="flex gap-2">
                                    <input
                                      autoFocus
                                      type="text"
                                      value={editCategoryName}
                                      onChange={(e) => setEditCategoryName(e.target.value)}
                                      className="flex-1 bg-white border-2 border-blue-500 rounded-xl px-3 py-2 focus:outline-none font-bold"
                                    />
                                    <button type="submit" className="bg-green-500 text-white p-2 rounded-xl hover:bg-green-600 transition-all">
                                      <Save size={18} />
                                    </button>
                                    <button type="button" onClick={() => { setEditingCategory(null); setEditCategoryParentId(''); }} className="bg-gray-200 text-gray-600 p-2 rounded-xl hover:bg-gray-300 transition-all">
                                      <X size={18} />
                                    </button>
                                  </form>
                                  <select
                                    value={editCategoryParentId}
                                    onChange={(e) => setEditCategoryParentId(e.target.value)}
                                    className="w-full bg-white border-2 border-gray-100 rounded-xl px-4 py-2 focus:border-blue-500 focus:outline-none transition-all text-xs font-bold"
                                  >
                                    <option value="">-- قسم رئيسي --</option>
                                    {sortedCategories.filter(c => !c.parentId).map(c => (
                                      <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                  </select>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="w-4 h-px bg-gray-300"></div>
                                    <span className="font-bold text-gray-600 text-sm">{subCat.name}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button onClick={() => { setEditingCategory(subCat); setEditCategoryName(subCat.name); setEditCategoryParentId(subCat.parentId || ''); }} className="p-1.5 text-blue-500 hover:bg-blue-100 rounded-lg transition-colors"><Edit2 size={12} /></button>
                                    <button onClick={() => setDeleteConfirm({ id: subCat.id, name: subCat.name, type: 'category' })} className="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition-colors"><Trash2 size={12} /></button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}

                      {/* Orphaned subcategories (if parent was deleted) */}
                      {sortedCategories.filter(c => c.parentId && !categories.some(parent => parent.id === c.parentId)).map(orphan => (
                         <div key={orphan.id} className="flex flex-col gap-2 p-4 bg-red-50 rounded-2xl border border-red-100 group hover:border-red-200 transition-all">
                             <div className="flex items-center justify-between">
                               <span className="font-bold text-red-600">{orphan.name} (قسم بدون أب!)</span>
                               <div className="flex items-center gap-2">
                                 <button onClick={() => { setEditingCategory(orphan); setEditCategoryName(orphan.name); setEditCategoryParentId(''); }} className="p-1.5 text-blue-500 hover:bg-blue-100 rounded-lg transition-colors"><Edit2 size={14} /></button>
                                 <button onClick={() => setDeleteConfirm({ id: orphan.id, name: orphan.name, type: 'category' })} className="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition-colors"><Trash2 size={14} /></button>
                               </div>
                             </div>
                         </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="p-6 bg-gray-50 border-t border-gray-100 text-center">
                <p className="text-xs text-gray-400 font-medium">تساعدك الأقسام في تنظيم منتجاتك وعرضها بشكل أفضل للمشترين.</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirm(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl text-center"
            >
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 size={40} className="text-red-500" />
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-2">تأكيد الحذف</h3>
              <p className="text-gray-500 mb-8 leading-relaxed">
                هل أنت متأكد من حذف "{deleteConfirm.name}"؟ 
                {deleteConfirm.type === 'category' ? ' ستبقى المنتجات المرتبطة بهذا القسم موجودة ولكن باسم القسم القديم.' : ' لا يمكن التراجع عن هذا الإجراء.'}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setDeleteConfirm(null)}
                  className="px-6 py-3 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all active:scale-95"
                >
                  إلغاء
                </button>
                <button 
                  onClick={() => deleteConfirm.type === 'product' ? handleDelete(deleteConfirm.id) : handleDeleteCategory(deleteConfirm.id)}
                  className="px-6 py-3 bg-red-500 text-white rounded-2xl font-bold hover:bg-red-600 transition-all active:scale-95 shadow-lg shadow-red-500/20"
                >
                  حذف نهائي
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ReceiptModal 
        imageUrl={selectedReceipt} 
        onClose={() => setSelectedReceipt(null)} 
      />
    </div>
  );
}
