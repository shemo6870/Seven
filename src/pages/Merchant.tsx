import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where, serverTimestamp, orderBy, arrayRemove, getDocs, writeBatch } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Category, Product, Order } from '../types';
import { compressImage } from '../lib/image-utils';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, Edit2, X, Save, Image as ImageIcon, Box, Tag, LayoutGrid, ClipboardList, Package, ExternalLink, ShieldCheck, CheckCircle2, XCircle, Smartphone, Palette, Maximize, DollarSign, Type, Clock, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const COMMON_COLORS = ['أسود', 'أبيض', 'أحمر', 'أزرق', 'أخضر', 'أصفر', 'رمادي', 'كحلي', 'وردي', 'بيج', 'بني', 'برتقالي', 'بنفسجي', 'فضي', 'ذهبي', 'نحاسي', 'زيتي'];
const COMMON_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'];

const toggleSelection = (array: string[] = [], item: string) => {
  if (array.includes(item)) return array.filter(i => i !== item);
  return [...array, item];
};

export default function Merchant() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'products' | 'orders' | 'categories' | 'settings'>('products');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string>('');
  const [newStoreName, setNewStoreName] = useState<string>('');
  const [storeLogo, setStoreLogo] = useState<string>('');
  const [newStoreLogo, setNewStoreLogo] = useState<string>('');
  const [logoUploading, setLogoUploading] = useState(false);
  
  // Category management
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryParentId, setNewCategoryParentId] = useState('');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [editCategoryParentId, setEditCategoryParentId] = useState('');

  // Product management
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<Partial<Product>>({
    name: '',
    price: undefined,
    quantity: undefined,
    imageUrl: '',
    images: [] as string[],
    description: '',
    category: '',
    isActive: true,
    colors: [],
    sizes: [],
    videoUrl: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [additionalImageUploading, setAdditionalImageUploading] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'paid':
        return { color: 'text-green-600 bg-green-50', icon: <CheckCircle2 size={16} />, label: 'تم التحقق والدفع' };
      case 'awaiting_verification':
        return { color: 'text-blue-600 bg-blue-50', icon: <Clock size={16} />, label: 'في انتظار مراجعة التحويل' };
      case 'pending':
        return { color: 'text-blue-600 bg-blue-50', icon: <Clock size={16} />, label: 'في انتظار الدفع / COD' };
      case 'delivered':
        return { color: 'text-emerald-600 bg-emerald-50', icon: <Package size={16} />, label: 'تم التوصيل' };
      case 'canceled':
        return { color: 'text-red-600 bg-red-50', icon: <XCircle size={16} />, label: 'ملغي' };
      default:
        return { color: 'text-gray-600 bg-gray-50', icon: <Clock size={16} />, label: status || 'غير معروف' };
    }
  };
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setMerchantId(user.uid);
        import('firebase/firestore').then(({ doc, getDoc }) => {
          getDoc(doc(db, 'users', user.uid)).then(snap => {
            if (snap.exists()) {
              if (snap.data().storeName) {
                setStoreName(snap.data().storeName);
                setNewStoreName(snap.data().storeName);
              }
              if (snap.data().storeLogo) {
                setStoreLogo(snap.data().storeLogo);
                setNewStoreLogo(snap.data().storeLogo);
              }
            }
          });
        });
      } else {
        navigate('/login');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!merchantId) return;
    
    setLoading(true);
    
    const unsubProducts = onSnapshot(
      query(collection(db, 'products'), where('sellerId', '==', merchantId)),
      (snap) => {
        setProducts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
      }
    );

    const unsubCategories = onSnapshot(collection(db, 'categories'), (snap) => {
      setCategories(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category)));
      setLoading(false);
    });

    const unsubOrders = onSnapshot(
      query(collection(db, 'orders'), where('sellerIds', 'array-contains', merchantId), orderBy('createdAt', 'desc')),
      (snap) => {
        setOrders(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
      }
    );

    return () => {
      unsubProducts();
      unsubCategories();
      unsubOrders();
    };
  }, [merchantId]);

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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("حجم الصورة كبير جداً. الحد الأقصى هو 5 ميجابايت.");
      return;
    }

    setImageUploading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const compressed = await compressImage(reader.result as string, 800, 0.4);
        setFormData(prev => ({ ...prev, imageUrl: compressed }));
      } catch (err) {
        console.error('Compression error:', err);
        setFormData(prev => ({ ...prev, imageUrl: reader.result as string }));
      } finally {
        setImageUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAdditionalImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("حجم الصورة كبير جداً. الحد الأقصى هو 5 ميجابايت.");
      return;
    }

    if ((formData.images || []).length >= 10) {
      alert("الحد الأقصى للصور الإضافية هو 10 صور.");
      return;
    }

    setAdditionalImageUploading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const compressed = await compressImage(reader.result as string, 800, 0.4);
        setFormData(prev => ({ ...prev, images: [...(prev.images || []), compressed] }));
      } catch (err) {
        console.error('Compression error:', err);
        setFormData(prev => ({ ...prev, images: [...(prev.images || []), reader.result as string] }));
      } finally {
        setAdditionalImageUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('حجم الفيديو كبير جداً (أكثر من 10 ميجابايت). الرجاء استخدام فيديو أصغر أو رابط يوتيوب.');
      return;
    }
    setVideoUploading(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData({...formData, videoUrl: reader.result as string});
      setVideoUploading(false);
    };
    reader.onerror = () => {
      alert('حدث خطأ أثناء تحميل الفيديو.');
      setVideoUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchantId) return;
    setIsSubmitting(true);

    try {
      const productData = {
        name: formData.name,
        price: formData.price !== undefined && formData.price !== null ? Number(formData.price) : 0,
        quantity: formData.quantity !== undefined && formData.quantity !== null ? Number(formData.quantity) : 0,
        imageUrl: formData.imageUrl,
        images: formData.images || [],
        description: formData.description || '',
        category: formData.category || 'عام',
        isActive: formData.isActive ?? true,
        colors: formData.colors || [],
        sizes: formData.sizes || [],
        videoUrl: formData.videoUrl || '',
        sellerId: merchantId,
        storeName: storeName || 'متجر جديد',
        storeLogo: storeLogo || '',
        sellerRole: 'seller',
        updatedAt: serverTimestamp()
      };

      if (editingProduct) {
        await updateDoc(doc(db, 'products', editingProduct.id), productData);
      } else {
        await addDoc(collection(db, 'products'), {
          ...productData,
          createdAt: serverTimestamp()
        });
      }

      setIsFormOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error saving product:', error);
      alert('حدث خطأ أثناء حفظ المنتج');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذا المنتج؟')) {
      try {
        await deleteDoc(doc(db, 'products', id));
      } catch (error) {
        console.error('Error deleting product:', error);
        alert('حدث خطأ أثناء حذف المنتج');
      }
    }
  };

  const updateOrderStatus = async (orderId: string, status: string) => {
    if (!status) return;
    setIsUpdatingStatus(orderId);
    try {
      const updateData: any = { status, updatedAt: serverTimestamp() };
      
      if (status === 'canceled') {
        const reason = prompt('يرجى إدخال سبب الرفض/الإلغاء (اختياري):');
        if (reason !== null) {
          updateData.rejectionReason = reason;
        }
      }

      await updateDoc(doc(db, 'orders', orderId), updateData);
    } catch (error) {
      console.error('Error updating order:', error);
      alert('حدث خطأ أثناء تحديث حالة الطلب');
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الطلب من واجهتك؟')) return;
    
    setIsUpdatingStatus(orderId);
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        sellerIds: arrayRemove(merchantId),
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error removing order:', error);
      alert('حدث خطأ أثناء حذف الطلب');
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  const saveStoreName = async () => {
    if (!merchantId) return;
    try {
      await updateDoc(doc(db, 'users', merchantId), {
        storeName: newStoreName,
        storeLogo: newStoreLogo
      });

      // Update store details across all products of the merchant
      const productsQuery = query(collection(db, 'products'), where('sellerId', '==', merchantId));
      const productsSnapshot = await getDocs(productsQuery);
      
      if (!productsSnapshot.empty) {
        const batch = writeBatch(db);
        productsSnapshot.forEach((productDoc) => {
          batch.update(productDoc.ref, { storeName: newStoreName, storeLogo: newStoreLogo, sellerRole: 'seller', updatedAt: serverTimestamp() });
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

  // Category functions
  const sortedCategories = [...categories].sort((a, b) => (a.order || 0) - (b.order || 0));

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchantId || !newCategoryName.trim()) return;
    try {
      await addDoc(collection(db, 'categories'), {
        name: newCategoryName.trim(),
        sellerId: merchantId,
        parentId: newCategoryParentId || null,
        order: categories.length
      });
      setNewCategoryName('');
      setNewCategoryParentId('');
    } catch (error) {
      console.error('Error adding category:', error);
      alert('حدث خطأ أثناء إضافة القسم');
    }
  };

  const handleUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || !editCategoryName.trim()) return;
    try {
      await updateDoc(doc(db, 'categories', editingCategory.id), {
        name: editCategoryName.trim(),
        parentId: editCategoryParentId || null
      });
      setEditingCategory(null);
      setEditCategoryParentId('');
    } catch (error) {
      console.error("Error updating category: ", error);
      alert('حدث خطأ أثناء التحديث.');
    }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    if (window.confirm(`هل أنت متأكد من حذف قسم "${name}"؟ إذا كان قسماً رئيسياً، ستصبح الأقسام الفرعية التابعة له الأقسام يتيمة.`)) {
      try {
        await deleteDoc(doc(db, 'categories', id));
      } catch (err) {
        console.error(err);
        alert('حدث خطأ أثناء الحذف.');
      }
    }
  };

  const resetForm = () => {
    setEditingProduct(null);
    setIsFormOpen(false);
    setFormData({
      name: '',
      price: undefined,
      quantity: undefined,
      imageUrl: '',
      images: [],
      description: '',
      category: '',
      isActive: true,
      colors: [],
      sizes: [],
      videoUrl: ''
    });
  };

  const openEditForm = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      price: product.price,
      quantity: product.quantity || 0,
      imageUrl: product.imageUrl,
      images: product.images || [],
      description: product.description || '',
      category: product.category,
      isActive: product.isActive ?? true,
      colors: product.colors || [],
      sizes: product.sizes || [],
      videoUrl: product.videoUrl || ''
    });
    setIsFormOpen(true);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-gray-600 font-bold">جاري تحميل البيانات...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 min-h-[calc(100vh-80px)]" dir="rtl">
      {/* Notice Banner */}
      <div className="bg-blue-50 border border-blue-100 text-blue-800 p-4 rounded-3xl flex items-center gap-3 shadow-sm mx-0">
        <Info className="flex-shrink-0 text-blue-600" size={24} />
        <p className="font-bold text-sm sm:text-base leading-relaxed">
          تنويه: سوف يتم تحصيل أموالك في نهاية كل أسبوع يرجى التواصل مع الدعم لمعرفة المزيد من التفاصيل
        </p>
      </div>
      
      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        {/* Sidebar */}
        <div className="lg:w-64 flex-shrink-0 w-full">
        <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 flex flex-row lg:flex-col gap-2 overflow-x-auto lg:sticky top-24 thin-scrollbar">
          <button
            onClick={() => setActiveTab('products')}
            className={`flex items-center gap-3 p-4 rounded-xl font-bold transition-all whitespace-nowrap min-w-max ${
              activeTab === 'products' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Box size={24} className={activeTab === 'products' ? 'animate-bounce' : ''} />
            المنتجات
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex items-center gap-3 p-4 rounded-xl font-bold transition-all whitespace-nowrap min-w-max ${
              activeTab === 'orders' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <ClipboardList size={24} className={activeTab === 'orders' ? 'animate-bounce' : ''} />
            الطلبات
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={`flex items-center gap-3 p-4 rounded-xl font-bold transition-all whitespace-nowrap min-w-max ${
              activeTab === 'categories' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <LayoutGrid size={24} className={activeTab === 'categories' ? 'animate-bounce' : ''} />
            الأقسام
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-3 p-4 rounded-xl font-bold transition-all whitespace-nowrap min-w-max ${
              activeTab === 'settings' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <ShieldCheck size={24} className={activeTab === 'settings' ? 'animate-bounce' : ''} />
            الإعدادات
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        {activeTab === 'products' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
              <h2 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                <Box className="text-blue-600" /> منتجاتي
              </h2>
              <button
                onClick={() => { resetForm(); setIsFormOpen(true); }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20 active:scale-95"
              >
                <Plus size={20} /> إضافة منتج
              </button>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right">
                  <thead className="bg-gray-50 text-gray-500 text-xs font-black border-b border-gray-100 uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-5">المنتج</th>
                      <th className="px-6 py-5 text-center">القسم</th>
                      <th className="px-6 py-5">السعر</th>
                      <th className="px-6 py-5">المخزون</th>
                      <th className="px-6 py-5">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {products.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-24 text-center">
                          <div className="flex flex-col items-center gap-4 text-gray-400">
                            <Box size={48} className="opacity-20" />
                            <p className="font-bold text-lg italic">لا يوجد منتجات حتى الآن</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      products.map((product) => (
                        <tr key={product.id} className="hover:bg-gray-50 transition-colors group">
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-4">
                              <div className="relative">
                                <img 
                                  src={product.imageUrl} 
                                  alt={product.name} 
                                  className="w-16 h-16 rounded-xl object-cover bg-gray-100 border border-gray-200"
                                  referrerPolicy="no-referrer"
                                />
                                {!product.isActive && (
                                  <div className="absolute inset-0 bg-black/60 rounded-xl flex items-center justify-center">
                                    <span className="text-[10px] text-white font-bold px-1 text-center leading-tight">غير<br/>مفعل</span>
                                  </div>
                                )}
                              </div>
                              <div>
                                <p className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{product.name}</p>
                                <span className="text-xs text-gray-500 font-mono">ID: {product.id.slice(0, 6)}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-5 text-center">
                            <span className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl text-xs font-black border border-blue-100 whitespace-nowrap">
                              {product.category || 'عام'}
                            </span>
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex flex-col">
                              <span className="font-black text-gray-900">{product.price} ج.م</span>
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <span className={`text-sm font-bold ${product.quantity > 5 ? 'text-green-600' : product.quantity > 0 ? 'text-blue-500' : 'text-red-500'}`}>
                              {product.quantity} قطعة
                            </span>
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
                                  }
                                }}
                                className={`p-2.5 rounded-xl transition-all border shadow-sm hover:shadow-md ${product.isActive !== false ? 'bg-green-50 text-green-600 border-green-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}
                                title={product.isActive !== false ? 'إيقاف التنشيط' : 'تنشيط المنتج'}
                              >
                                {product.isActive !== false ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                              </button>
                              <button 
                                onClick={() => openEditForm(product)}
                                className="p-2.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all border border-blue-100 shadow-sm hover:shadow-md"
                                title="تعديل المنتج"
                              >
                                <Edit2 size={20} />
                              </button>
                              <button 
                                onClick={() => handleDelete(product.id)}
                                className="p-2.5 text-red-500 bg-red-50 hover:bg-red-100 rounded-xl transition-all border border-red-100 shadow-sm hover:shadow-md"
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
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Categories Tab */}
        {activeTab === 'categories' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 mb-6">
              <h2 className="text-2xl font-black text-gray-900 flex items-center gap-3 mb-6">
                <LayoutGrid className="text-blue-600" /> إدارة الأقسام
              </h2>
              <form onSubmit={handleAddCategory} className="flex flex-col gap-4">
                <div className="flex gap-4">
                  <input
                    type="text"
                    placeholder="اسم القسم الجديد"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    className="flex-1 bg-gray-50 border-2 border-gray-50 rounded-xl px-4 py-3 font-bold focus:bg-white focus:border-blue-500 focus:outline-none transition-all"
                  />
                  <button
                    type="submit"
                    disabled={!newCategoryName.trim()}
                    className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-all active:scale-95"
                  >
                    <Plus size={20} /> إضافة قسم
                  </button>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">جعل هذا القسم متفرع من (اختياري)</label>
                  <select
                    value={newCategoryParentId}
                    onChange={(e) => setNewCategoryParentId(e.target.value)}
                    className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-4 py-3 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-bold appearance-none"
                  >
                    <option value="">-- قسم رئيسي (بدون أب) --</option>
                    {sortedCategories.filter(c => !c.parentId).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </form>
            </div>
            
            <div className="space-y-4">
              {sortedCategories.filter(c => !c.parentId).map(mainCat => (
                <div key={mainCat.id} className="space-y-2">
                  <div className="bg-gray-100 p-4 rounded-2xl border border-gray-200 group hover:border-blue-300 transition-all">
                    {editingCategory?.id === mainCat.id ? (
                      <form onSubmit={handleUpdateCategory} className="space-y-3">
                        <div className="flex gap-2">
                          <input
                            autoFocus
                            type="text"
                            value={editCategoryName}
                            onChange={(e) => setEditCategoryName(e.target.value)}
                            className="flex-1 bg-white border-2 border-blue-500 rounded-xl px-3 py-2 focus:outline-none font-bold"
                          />
                          <button type="submit" className="bg-green-500 text-white p-2 rounded-xl hover:bg-green-600 transition-all"><Save size={18} /></button>
                          <button type="button" onClick={() => { setEditingCategory(null); setEditCategoryParentId(''); }} className="bg-gray-200 text-gray-600 p-2 rounded-xl hover:bg-gray-300 transition-all"><X size={18} /></button>
                        </div>
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
                      </form>
                    ) : (
                      <div className="flex items-center justify-between font-bold text-blue-800">
                        <span>{mainCat.name}</span>
                        {mainCat.sellerId === merchantId && (
                          <div className="flex items-center gap-2">
                            <button onClick={() => { setEditingCategory(mainCat); setEditCategoryName(mainCat.name); setEditCategoryParentId(mainCat.parentId || ''); }} className="p-1.5 text-blue-500 hover:bg-blue-100 rounded-lg transition-colors"><Edit2 size={16} /></button>
                            <button onClick={() => handleDeleteCategory(mainCat.id, mainCat.name)} className="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition-colors"><Trash2 size={16} /></button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {sortedCategories.filter(sub => sub.parentId === mainCat.id).map(subCat => (
                    <div key={subCat.id} className="mr-8 flex flex-col gap-2 p-3 bg-white rounded-xl border border-gray-100 group hover:border-blue-200 transition-all">
                      {editingCategory?.id === subCat.id ? (
                        <form onSubmit={handleUpdateCategory} className="space-y-3">
                          <div className="flex gap-2">
                            <input
                              autoFocus
                              type="text"
                              value={editCategoryName}
                              onChange={(e) => setEditCategoryName(e.target.value)}
                              className="flex-1 bg-white border-2 border-blue-500 rounded-xl px-3 py-2 focus:outline-none font-bold"
                            />
                            <button type="submit" className="bg-green-500 text-white p-2 rounded-xl hover:bg-green-600 transition-all"><Save size={18} /></button>
                            <button type="button" onClick={() => { setEditingCategory(null); setEditCategoryParentId(''); }} className="bg-gray-200 text-gray-600 p-2 rounded-xl hover:bg-gray-300 transition-all"><X size={18} /></button>
                          </div>
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
                        </form>
                      ) : (
                        <div className="flex items-center justify-between font-bold text-gray-600">
                          <div className="flex items-center gap-2">
                             <div className="w-4 h-px bg-gray-300"></div>
                             <span>{subCat.name}</span>
                          </div>
                          {subCat.sellerId === merchantId && (
                            <div className="flex items-center gap-2">
                              <button onClick={() => { setEditingCategory(subCat); setEditCategoryName(subCat.name); setEditCategoryParentId(subCat.parentId || ''); }} className="p-1.5 text-blue-500 hover:bg-blue-100 rounded-lg transition-colors"><Edit2 size={14} /></button>
                              <button onClick={() => handleDeleteCategory(subCat.id, subCat.name)} className="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition-colors"><Trash2 size={14} /></button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Orders Tab */}
        {activeTab === 'orders' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-2">
              <h2 className="text-xl font-black text-gray-900 border-r-4 border-blue-600 pr-3">
                إدارة الطلبات
                <span className="text-gray-400 text-sm mr-2 font-bold">
                  ({orders.length})
                </span>
              </h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8">
              {orders.length === 0 ? (
                <div className="md:col-span-2 bg-white rounded-3xl p-20 text-center shadow-sm border border-gray-100">
                  <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 size={40} className="text-gray-200" />
                  </div>
                  <p className="text-gray-400 font-bold text-xl">لا توجد طلبات حالية</p>
                </div>
              ) : (
                orders.map(order => {
                  const merchantItems = order.items.filter(item => item.sellerId === merchantId);
                  const statusInfo = getStatusInfo(order.status);
                  
                  return (
                    <motion.div 
                      layout
                      key={order.id} 
                      className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 transition-all relative flex flex-col gap-6"
                    >
                      <div className="flex justify-between items-start mt-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-gray-400">المشتري:</span>
                            <span className="text-sm font-bold text-gray-900">{order.userName || 'غير متوفر'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-gray-400">الهاتف:</span>
                            <a href={`tel:${order.userPhone}`} className="text-sm font-bold text-blue-600 hover:underline tracking-wider font-mono">{order.userPhone}</a>
                          </div>
                          {order.address && (
                             <div className="flex flex-col gap-0.5 mt-1">
                               <span className="text-[10px] font-black text-gray-400">العنوان:</span>
                               <p className="text-xs font-bold text-gray-700 leading-relaxed bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
                                 {order.address?.city}، {order.address?.area}، {order.address?.street}، عمارة {order.address?.building}{order.address?.apartment ? `، شقة ${order.address?.apartment}` : ''}
                               </p>
                             </div>
                          )}
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

                      {/* Summary of merchant items */}
                      <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                        <p className="text-[10px] font-black text-gray-400 uppercase">محتويات الطلب بمتجرك:</p>
                        {merchantItems.map((item: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center text-xs">
                            <span className="font-bold text-gray-700">{item.name} x{item.quantity}</span>
                            <span className="text-blue-600 font-bold">{item.price * item.quantity} ج.م</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-2 mt-auto pt-4 border-t border-gray-50">
                        {order.status === 'awaiting_verification' && (
                          <button 
                            onClick={() => updateOrderStatus(order.id, 'paid')}
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
                            onClick={() => updateOrderStatus(order.id, 'delivered')}
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
                              if(confirm('هل أنت متأكد من رفض الطلب؟ سيتم إلغاؤه.')) updateOrderStatus(order.id, 'canceled');
                            }}
                            disabled={isUpdatingStatus === order.id}
                            className="flex-1 bg-red-50 text-red-600 py-3 rounded-2xl font-black text-sm hover:bg-red-100 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                          >
                            <X size={18} />
                            <span>رفض/إلغاء</span>
                          </button>
                        )}
                        <button 
                          onClick={() => handleDeleteOrder(order.id)}
                          disabled={isUpdatingStatus === order.id}
                          className="flex-1 bg-gray-50 text-gray-600 py-3 rounded-2xl font-black text-sm hover:bg-gray-100 hover:text-red-600 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                          title="حذف الطلب نهائياً"
                        >
                          <Trash2 size={18} />
                          <span>حذف</span>
                        </button>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-6 flex justify-center">
             <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 mb-6 max-w-lg w-full">
              <h2 className="text-2xl font-black text-gray-900 flex items-center gap-3 mb-6">
                <ShieldCheck className="text-blue-600" /> إعدادات المتجر
              </h2>
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
                    placeholder="مثال: متجر السعادة"
                    value={newStoreName}
                    onChange={(e) => setNewStoreName(e.target.value)}
                    className="w-full border-2 border-gray-100 rounded-xl px-4 py-3 font-bold focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <button
                  onClick={saveStoreName}
                  disabled={!newStoreName.trim()}
                  className="w-full bg-blue-600 text-white px-6 py-4 rounded-xl font-black hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Save size={20} /> حفظ التعديلات
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Product Modal */}
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
                {/* Category */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <Tag size={16} className="text-blue-500" />
                    قسم المنتج
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                    className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-medium appearance-none"
                    required
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
                  </select>
                </div>

                {/* Name */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <Type size={16} className="text-blue-500" />
                    اسم المنتج
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-medium"
                  />
                </div>

                {/* Price and Quantity */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                      <DollarSign size={16} className="text-blue-500" />
                      السعر (بالجنيه المصري)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={formData.price ?? ''}
                      onChange={(e) => setFormData({...formData, price: e.target.value === '' ? undefined : Number(e.target.value)})}
                      className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-medium"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                      <Box size={16} className="text-blue-500" />
                      الكمية المتوفرة
                    </label>
                    <input
                      type="number"
                      required
                      value={formData.quantity ?? ''}
                      onChange={(e) => setFormData({...formData, quantity: e.target.value === '' ? undefined : Number(e.target.value)})}
                      className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-medium"
                    />
                  </div>
                </div>

                {/* Colors */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <Palette size={16} className="text-blue-500" />
                    الألوان المتاحة (اختياري)
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {COMMON_COLORS.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormData({ ...formData, colors: toggleSelection(formData.colors, color) })}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all ${
                          (formData.colors || []).includes(color)
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
                      id="merchant-color-input"
                      placeholder="أضف لوناً يدوياً (اضغط Enter للإضافة)"
                      className="flex-1 bg-gray-50 border-2 border-gray-50 rounded-xl px-4 py-3 focus:bg-white focus:border-blue-500 focus:outline-none transition-all text-sm font-medium"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = (e.target as HTMLInputElement).value.trim();
                          if (val && !(formData.colors || []).includes(val)) {
                            setFormData({ ...formData, colors: [...(formData.colors || []), val] });
                            (e.target as HTMLInputElement).value = '';
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById('merchant-color-input') as HTMLInputElement;
                        const val = input.value.trim();
                        if (val && !(formData.colors || []).includes(val)) {
                          setFormData({ ...formData, colors: [...(formData.colors || []), val] });
                          input.value = '';
                        }
                      }}
                      className="bg-blue-50 text-blue-600 px-4 py-2 rounded-xl font-bold border border-blue-100 hover:bg-blue-100 transition-all text-sm"
                    >
                      إضافة
                    </button>
                  </div>
                  {(formData.colors || []).some((c: string) => !COMMON_COLORS.includes(c)) && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {(formData.colors || []).filter((c: string) => !COMMON_COLORS.includes(c)).map((color: string, idx: number) => (
                        <span key={idx} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 group border border-blue-100">
                          {color}
                          <button 
                            type="button" 
                            onClick={() => setFormData({ ...formData, colors: formData.colors!.filter(c => c !== color) })}
                            className="hover:text-red-500"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Sizes */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <Maximize size={16} className="text-blue-500" />
                    المقاسات المتاحة (اختياري)
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {COMMON_SIZES.map(size => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setFormData({ ...formData, sizes: toggleSelection(formData.sizes, size) })}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all ${
                          (formData.sizes || []).includes(size)
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
                      id="merchant-size-input"
                      placeholder="أضف مقاساً يدوياً (اضغط Enter للإضافة)"
                      className="flex-1 bg-gray-50 border-2 border-gray-50 rounded-xl px-4 py-3 focus:bg-white focus:border-blue-500 focus:outline-none transition-all text-sm font-medium"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = (e.target as HTMLInputElement).value.trim();
                          if (val && !(formData.sizes || []).includes(val)) {
                            setFormData({ ...formData, sizes: [...(formData.sizes || []), val] });
                            (e.target as HTMLInputElement).value = '';
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById('merchant-size-input') as HTMLInputElement;
                        const val = input.value.trim();
                        if (val && !(formData.sizes || []).includes(val)) {
                          setFormData({ ...formData, sizes: [...(formData.sizes || []), val] });
                          input.value = '';
                        }
                      }}
                      className="bg-blue-50 text-blue-600 px-4 py-2 rounded-xl font-bold border border-blue-100 hover:bg-blue-100 transition-all text-sm"
                    >
                      إضافة
                    </button>
                  </div>
                  {(formData.sizes || []).some((s: string) => !COMMON_SIZES.includes(s)) && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {(formData.sizes || []).filter((s: string) => !COMMON_SIZES.includes(s)).map((size: string, idx: number) => (
                        <span key={idx} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 group border border-blue-100">
                          {size}
                          <button 
                            type="button" 
                            onClick={() => setFormData({ ...formData, sizes: formData.sizes!.filter(s => s !== size) })}
                            className="hover:text-red-500"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Video */}
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
                      id="video-upload-merchant"
                      className="hidden"
                      accept="video/*"
                      onChange={handleVideoUpload}
                    />
                    <div className="flex gap-2">
                      <button 
                        type="button"
                        disabled={videoUploading}
                        onClick={() => document.getElementById('video-upload-merchant')?.click()}
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
                </div>

                {/* Main Image */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <ImageIcon size={16} className="text-blue-500" />
                    صورة المنتج الأساسية
                  </label>
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
                  {formData.imageUrl && (
                    <div className="mt-2 p-3 bg-gray-50 rounded-2xl border border-gray-100 flex items-center gap-4">
                      <div className="relative">
                        <img src={formData.imageUrl} alt="Preview" className="w-16 h-16 rounded-xl border-2 border-white shadow-sm object-cover" />
                      </div>
                      <div className="flex-1">
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

                {/* Additional Images */}
                <div className="space-y-4">
                  <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <ImageIcon size={16} className="text-blue-500" />
                    صور إضافية (اختياري)
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      id="additionalImageUrlMerchant"
                      placeholder="أضف رابط صورة إضافية..."
                      className="flex-1 bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-medium text-left"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const input = e.target as HTMLInputElement;
                          const val = input.value;
                          if (val) {
                            if ((formData.images || []).length >= 10) return;
                            setFormData(prev => ({ ...prev, images: [...(prev.images || []), val] }));
                            input.value = '';
                          }
                        }
                      }}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const input = document.getElementById('additionalImageUrlMerchant') as HTMLInputElement;
                          const val = input.value;
                          if (val) {
                            if ((formData.images || []).length >= 10) return;
                            setFormData(prev => ({ ...prev, images: [...(prev.images || []), val] }));
                            input.value = '';
                          }
                        }}
                        className="flex-1 sm:flex-none bg-gray-100 text-gray-600 border-2 border-gray-100 hover:border-blue-200 px-4 py-4 rounded-xl transition-all font-bold whitespace-nowrap"
                      >
                        إضافة رابط
                      </button>
                      <label className={`cursor-pointer flex-1 sm:flex-none border-2 px-4 py-4 rounded-xl transition-all flex items-center justify-center gap-2 ${additionalImageUploading ? 'bg-gray-100 text-gray-400 border-gray-100 cursor-not-allowed' : 'bg-blue-50 text-blue-600 border-blue-50 hover:border-blue-200'}`}>
                        <ImageIcon size={20} />
                        <span className="font-bold whitespace-nowrap">{additionalImageUploading ? 'جاري...' : 'من الجهاز'}</span>
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="image/*"
                          disabled={additionalImageUploading}
                          onChange={handleAdditionalImageUpload}
                        />
                      </label>
                    </div>
                  </div>
                  {formData.images && formData.images.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
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

                {/* Description */}
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

                {/* Status Toggle */}
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
                  disabled={isSubmitting || imageUploading || additionalImageUploading || videoUploading}
                  className="w-full h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-blue-600/20 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>جاري الحفظ...</span>
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
    </div>
    </div>
  );
}
