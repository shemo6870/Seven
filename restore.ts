import * as fs from "fs";

const oldCode = `import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where, serverTimestamp, orderBy } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Category, Product, Order } from '../types';
import { compressImage } from '../lib/image-utils';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, Edit2, X, Save, Image as ImageIcon, Box, Tag, LayoutGrid, ClipboardList, Package, ExternalLink, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryParentId, setNewCategoryParentId] = useState('');
  
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<Partial<Product>>({
    name: '',
    price: 0,
    quantity: 0,
    imageUrl: '',
    images: [] as string[],
    description: '',
    category: '',
    isActive: true
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setMerchantId(user.uid);
        import('firebase/firestore').then(({ doc, getDoc }) => {
          getDoc(doc(db, 'users', user.uid)).then(snap => {
            if (snap.exists() && snap.data().storeName) {
              setStoreName(snap.data().storeName);
              setNewStoreName(snap.data().storeName);
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, isMain: boolean = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("حجم الصورة كبير جداً. الحد الأقصى هو 2 ميجابايت.");
      return;
    }

    setImageUploading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const compressed = await compressImage(reader.result as string, 800, 0.4);
        if (isMain) {
          setFormData(prev => ({ ...prev, imageUrl: compressed }));
        } else {
          setFormData(prev => ({ ...prev, images: [...prev.images!, compressed] }));
        }
      } catch (err) {
        console.error('Compression error:', err);
      } finally {
        setImageUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const removeAdditionalImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images!.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchantId) return;
    setIsSubmitting(true);

    try {
      const productData = {
        name: formData.name,
        price: Number(formData.price),
        quantity: Number(formData.quantity) || 0,
        imageUrl: formData.imageUrl,
        images: formData.images || [],
        description: formData.description,
        category: formData.category || 'عام',
        isActive: formData.isActive,
        sellerId: merchantId,
        storeName: storeName || 'متجر جديد',
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
      await updateDoc(doc(db, 'orders', orderId), { status });
    } catch (error) {
      console.error('Error updating order:', error);
      alert('حدث خطأ أثناء تحديث حالة الطلب');
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  const saveStoreName = async () => {
    if (!merchantId) return;
    try {
      await updateDoc(doc(db, 'users', merchantId), {
        storeName: newStoreName
      });
      setStoreName(newStoreName);
      alert('تم حفظ بيانات المتجر بنجاح');
    } catch (error) {
      console.error('Error saving store name:', error);
      alert('حدث خطأ أثناء حفظ اسم المتجر');
    }
  };

  const handleAddCategory = async () => {
    if (!merchantId || !newCategoryName.trim()) return;
    try {
      await addDoc(collection(db, 'categories'), {
        name: newCategoryName.trim(),
        sellerId: merchantId,
        parentId: newCategoryParentId || null
      });
      setNewCategoryName('');
      setNewCategoryParentId('');
      alert('تمت إضافة القسم بنجاح');
    } catch (error) {
      console.error('Error adding category:', error);
      alert('حدث خطأ أثناء إضافة القسم');
    }
  };

  const resetForm = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      price: 0,
      quantity: 0,
      imageUrl: '',
      images: [],
      description: '',
      category: '',
      isActive: true
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
      isActive: product.isActive ?? true
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
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-80px)] gap-6" dir="rtl">
      {/* Sidebar */}
      <div className="lg:w-64 flex-shrink-0 w-full">
        <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 flex flex-row lg:flex-col gap-2 overflow-x-auto lg:sticky top-24 no-scrollbar">
          <button
            onClick={() => setActiveTab('products')}
            className={\`flex items-center gap-3 p-4 rounded-xl font-bold transition-all whitespace-nowrap min-w-max \${
              activeTab === 'products' ? 'bg-amber-50 text-amber-600' : 'text-gray-600 hover:bg-gray-50'
            }\`}
          >
            <Box size={24} className={activeTab === 'products' ? 'animate-bounce' : ''} />
            المنتجات
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={\`flex items-center gap-3 p-4 rounded-xl font-bold transition-all whitespace-nowrap min-w-max \${
              activeTab === 'orders' ? 'bg-amber-50 text-amber-600' : 'text-gray-600 hover:bg-gray-50'
            }\`}
          >
            <ClipboardList size={24} className={activeTab === 'orders' ? 'animate-bounce' : ''} />
            الطلبات
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={\`flex items-center gap-3 p-4 rounded-xl font-bold transition-all whitespace-nowrap min-w-max \${
              activeTab === 'categories' ? 'bg-amber-50 text-amber-600' : 'text-gray-600 hover:bg-gray-50'
            }\`}
          >
            <LayoutGrid size={24} className={activeTab === 'categories' ? 'animate-bounce' : ''} />
            الأقسام
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={\`flex items-center gap-3 p-4 rounded-xl font-bold transition-all whitespace-nowrap min-w-max \${
              activeTab === 'settings' ? 'bg-amber-50 text-amber-600' : 'text-gray-600 hover:bg-gray-50'
            }\`}
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
                <Box className="text-amber-600" /> منتجاتي
              </h2>
              <button
                onClick={() => { resetForm(); setIsFormOpen(true); }}
                className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg shadow-amber-600/20 active:scale-95"
              >
                <Plus size={20} /> إضافة منتج
              </button>
            </div>

            {isFormOpen && (
              <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 mb-8">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-black">{editingProduct ? 'تعديل المنتج' : 'إضافة منتج جديد'}</h3>
                  <button onClick={() => { setIsFormOpen(false); resetForm(); }} className="p-2 hover:bg-gray-100 rounded-full"><X /></button>
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">اسم المنتج</label>
                      <input required type="text" value={formData.name} onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} className="w-full border-2 border-gray-100 rounded-xl px-4 py-3" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">السعر (ج.م)</label>
                      <input required type="number" min="0" value={formData.price} onChange={e => setFormData(prev => ({ ...prev, price: Number(e.target.value) }))} className="w-full border-2 border-gray-100 rounded-xl px-4 py-3" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">الكمية المخزنة</label>
                      <input type="number" min="0" value={formData.quantity} onChange={e => setFormData(prev => ({ ...prev, quantity: Number(e.target.value) }))} placeholder="الكمية (اختياري)" className="w-full border-2 border-gray-100 rounded-xl px-4 py-3" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">القسم</label>
                      <select required value={formData.category} onChange={e => setFormData(prev => ({ ...prev, category: e.target.value }))} className="w-full border-2 border-gray-100 rounded-xl px-4 py-3">
                        <option value="">اختر القسم</option>
                        {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                     <label className="block text-sm font-bold text-gray-700 mb-2">الصورة الرئيسية</label>
                     {formData.imageUrl ? (
                       <div className="relative inline-block border-2 border-amber-500 rounded-xl overflow-hidden">
                         <img src={formData.imageUrl} className="w-40 h-40 object-cover" alt="Main" />
                         <button type="button" onClick={() => setFormData(prev => ({...prev, imageUrl: ''}))} className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full bg-opacity-80 hover:bg-opacity-100"><X size={14}/></button>
                       </div>
                     ) : (
                       <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:bg-gray-50 bg-gray-50">
                         {imageUploading ? <div className="animate-spin rounded-full h-8 w-8 border-4 border-amber-600 border-t-transparent"></div> : <div className="text-gray-400 font-bold flex gap-2"><ImageIcon/> اختر صورة للمنتج</div>}
                         <input type="file" accept="image/*" onChange={e => handleImageUpload(e, true)} className="hidden" disabled={imageUploading} />
                       </label>
                     )}
                  </div>

                  <button type="submit" disabled={isSubmitting || imageUploading} className="w-full bg-amber-600 text-white py-4 rounded-xl font-black shadow-lg hover:bg-amber-700 disabled:opacity-50">
                    {isSubmitting ? 'جاري الحفظ...' : 'حفظ المنتج'}
                  </button>
                </form>
              </motion.div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map(product => (
                <div key={product.id} className="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 relative group p-4 flex flex-col gap-4">
                  <div className="aspect-square rounded-2xl overflow-hidden bg-gray-50 border border-gray-100 relative">
                     <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                     {!product.isActive && <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-black text-xl">غير مفعل</div>}
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 mb-1">{product.name}</h3>
                    <p className="text-gray-500 text-sm mb-3">{product.category}</p>
                    <div className="flex justify-between items-center">
                      <p className="font-black text-amber-600 text-xl">{product.price} <span className="text-sm text-amber-600/60">ج.م</span></p>
                      <p className="text-gray-400 text-sm font-medium">الكمية: {product.quantity || 0}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                     <button onClick={() => openEditForm(product)} className="flex-1 bg-amber-50 text-amber-600 py-2 rounded-xl hover:bg-amber-100 font-bold">تعديل</button>
                     <button onClick={() => handleDelete(product.id)} className="px-4 bg-red-50 text-red-600 rounded-xl hover:bg-red-100"><Trash2 size={20}/></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
              <h2 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                <ClipboardList className="text-amber-600" /> الطلبات
              </h2>
            </div>
            
            <div className="grid gap-6">
              {orders.map(order => {
                const merchantItems = order.items.filter(item => item.sellerId === merchantId);

                return (
                  <div key={order.id} className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
                    <div className="flex flex-col sm:flex-row justify-between items-start mb-6 gap-4 border-b border-gray-100 pb-6">
                      <div>
                        <p className="text-xs font-mono text-gray-400 mb-2 flex items-center gap-2">
                          <ExternalLink size={12} />
                          {order.id}
                        </p>
                        <h3 className="font-bold text-lg text-gray-900 mb-1">العميل: {order.userName || 'غير متوفر'}</h3>
                        <p className="text-gray-500 font-medium">{order.userPhone}</p>
                      </div>
                      <div className="flex flex-col gap-2 items-end">
                        <select
                          value={order.status}
                          onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                          disabled={isUpdatingStatus === order.id}
                          className={\`font-bold text-sm px-4 py-2 rounded-xl border-2 appearance-none 
                            \${order.status === 'delivered' ? 'border-green-500 bg-green-50 text-green-700' :
                              order.status === 'canceled' ? 'border-red-500 bg-red-50 text-red-700' :
                              order.status === 'paid' ? 'border-blue-500 bg-blue-50 text-blue-700' :
                              'border-amber-500 bg-amber-50 text-amber-700'
                            }\`}
                        >
                          <option value="pending">قيد المراجعة</option>
                          <option value="paid">تم الدفع</option>
                          <option value="delivered">مكتمل</option>
                          <option value="canceled">ملغي</option>
                        </select>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      {merchantItems.map((item, index) => (
                        <div key={index} className="flex bg-gray-50 rounded-2xl p-4 gap-4 items-center">
                          <img src={item.imageUrl} alt={item.name} className="w-16 h-16 object-cover rounded-xl border border-gray-200" />
                          <div className="flex-1">
                            <h4 className="font-bold text-gray-900">{item.name}</h4>
                            <p className="text-amber-600 font-black">{item.price} ج.م</p>
                          </div>
                          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center font-black text-gray-900 shadow-sm border border-gray-100">
                            x{item.quantity}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {orders.length === 0 && (
                <div className="bg-white rounded-3xl p-12 shadow-sm border border-gray-100 text-center">
                  <ClipboardList size={64} className="mx-auto text-gray-200 mb-4" />
                  <p className="text-gray-500 font-bold text-lg">لا توجد طلبات حالية</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'categories' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 mb-6">
              <h2 className="text-2xl font-black text-gray-900 flex items-center gap-3 mb-6">
                <LayoutGrid className="text-amber-600" /> إدارة الأقسام
              </h2>
              <div className="flex flex-col gap-4">
                <div className="flex gap-4">
                  <input
                    type="text"
                    placeholder="اسم القسم الجديد"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    className="flex-1 border-2 border-gray-100 rounded-xl px-4 py-3 font-bold focus:border-amber-500 focus:outline-none"
                  />
                  <button
                    onClick={handleAddCategory}
                    disabled={!newCategoryName.trim()}
                    className="bg-amber-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    <Plus size={20} /> إضافة قسم
                  </button>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">جعل هذا القسم متفرع من (اختياري)</label>
                  <select
                    value={newCategoryParentId}
                    onChange={(e) => setNewCategoryParentId(e.target.value)}
                    className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-4 py-3 focus:bg-white focus:border-amber-500 focus:outline-none transition-all font-bold appearance-none"
                  >
                    <option value="">-- قسم رئيسي (بدون أب) --</option>
                    {categories.filter(c => !c.parentId).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              {categories.filter(c => !c.parentId).map(mainCat => (
                <div key={mainCat.id} className="space-y-2">
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between font-bold text-blue-800">
                    <span>{mainCat.name}</span>
                  </div>
                  {categories.filter(sub => sub.parentId === mainCat.id).map(subCat => (
                     <div key={subCat.id} className="mr-8 flex items-center gap-2 bg-gray-50 p-3 rounded-xl border border-gray-100 font-bold text-gray-600">
                       <div className="w-4 h-px bg-gray-300"></div>
                       <span>{subCat.name}</span>
                     </div>
                  ))}
                </div>
              ))}
              {categories.filter(c => c.parentId && !categories.some(parent => parent.id === c.parentId)).map(orphan => (
                  <div key={orphan.id} className="bg-red-50 p-4 rounded-2xl shadow-sm border border-red-100 flex items-center justify-between font-bold text-red-600">
                    <span>{orphan.name} (قسم بدون أب)</span>
                  </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6 flex justify-center">
             <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 mb-6 max-w-lg w-full">
              <h2 className="text-2xl font-black text-gray-900 flex items-center gap-3 mb-6">
                <ShieldCheck className="text-amber-600" /> إعدادات المتجر
              </h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">اسم المتجر (يظهر للعملاء بالموقع)</label>
                  <input
                    type="text"
                    placeholder="مثال: متجر السعادة"
                    value={newStoreName}
                    onChange={(e) => setNewStoreName(e.target.value)}
                    className="w-full border-2 border-gray-100 rounded-xl px-4 py-3 font-bold focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <button
                  onClick={saveStoreName}
                  disabled={!newStoreName.trim()}
                  className="w-full bg-amber-600 text-white px-6 py-4 rounded-xl font-black hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Save size={20} /> حفظ التعديلات
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
\`;

fs.writeFileSync('src/pages/Merchant.tsx', oldCode);
`;

