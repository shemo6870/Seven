import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, getDocs, writeBatch, doc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Order } from '../types';
import { motion } from 'motion/react';
import { ClipboardList, Package, MapPin, CheckCircle2, Clock, XCircle, ShoppingBag, Trash2, X, Tag } from 'lucide-react';
import ReceiptModal from '../components/ReceiptModal';

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'orders'),
      where('userId', '==', auth.currentUser?.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...(doc.data() as any)
        }))
        .filter((order: any) => !order.buyerDeleted) as Order[];
      setOrders(ordersData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'orders');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrderIds(prev => 
      prev.includes(orderId) 
        ? prev.filter(id => id !== orderId) 
        : [...prev, orderId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedOrderIds.length === orders.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(orders.map(o => o.id));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedOrderIds.length === 0) return;
    if (!confirm(`هل أنت متأكد من حذف ${selectedOrderIds.length} طلبات من القائمة؟ لن يتم حذفها من عند البائع.`)) return;

    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      selectedOrderIds.forEach(id => {
        batch.update(doc(db, 'orders', id), {
          buyerDeleted: true,
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();
      setSelectedOrderIds([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'orders_bulk_delete');
      alert('حدث خطأ أثناء الحذف. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsDeleting(false);
    }
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'paid':
        return { color: 'text-green-600 bg-green-50', icon: <CheckCircle2 size={16} />, label: 'تم التحقق والدفع - جاري الشحن' };
      case 'awaiting_verification':
        return { color: 'text-blue-600 bg-blue-50', icon: <Clock size={16} />, label: 'طلبك تحت المراجعة (تأكيد الدفع)' };
      case 'pending':
        return { color: 'text-amber-600 bg-amber-50', icon: <Clock size={16} />, label: 'في انتظار التوصيل / COD' };
      case 'delivered':
        return { color: 'text-emerald-600 bg-emerald-50', icon: <Package size={16} />, label: 'تم التوصيل' };
      case 'canceled':
        return { color: 'text-red-600 bg-red-50', icon: <XCircle size={16} />, label: 'ملغي' };
      default:
        return { color: 'text-gray-600 bg-gray-50', icon: <Clock size={16} />, label: status || 'غير معروف' };
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-10 pb-6 border-b border-gray-100 px-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 shadow-sm border border-blue-100">
            <ClipboardList size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">طلباتي</h1>
            <p className="text-gray-500 font-medium">عرض جميع طلباتك وحالتها</p>
          </div>
        </div>

        {selectedOrderIds.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-4 bg-red-50 border border-red-100 px-4 py-2 rounded-2xl"
          >
            <span className="text-red-600 font-bold text-sm">تم تحديد {selectedOrderIds.length}</span>
            <button
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-red-700 transition-all active:scale-95 disabled:opacity-50"
            >
              <Trash2 size={16} />
              <span>{isDeleting ? 'جاري الحذف...' : 'حذف المحدد'}</span>
            </button>
            <button 
              onClick={() => setSelectedOrderIds([])}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </div>

      {orders.length > 0 && (
        <div className="px-4 mb-4 flex items-center gap-2">
          <input 
            type="checkbox"
            checked={selectedOrderIds.length === orders.length && orders.length > 0}
            onChange={toggleSelectAll}
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-bold text-gray-500">تحديد الكل</span>
        </div>
      )}

      {orders.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl p-16 text-center shadow-xl shadow-gray-200/50 border border-gray-50 mx-4"
        >
          <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShoppingBag size={48} className="text-gray-300" />
          </div>
          <h2 className="text-2xl font-black text-gray-900 mb-2">لا يوجد طلبات بعد</h2>
          <p className="text-gray-500 mb-8 max-w-xs mx-auto">ابدأ التسوق الآن وسيظهر تاريخ مشترياتك هنا!</p>
          <button 
            onClick={() => window.location.href = '/'}
            className="bg-blue-600 text-white px-10 py-4 rounded-2xl font-black text-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95"
          >
            تصفح المنتجات
          </button>
        </motion.div>
      ) : (
        <div className="space-y-6 px-4">
          {orders.map((order) => {
            const statusInfo = getStatusInfo(order.status);
            return (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bg-white rounded-3xl p-6 shadow-xl shadow-gray-200/40 border transition-all ${selectedOrderIds.includes(order.id) ? 'border-blue-500 ring-2 ring-blue-500/10' : 'border-gray-100'}`}
              >
                <div className="flex flex-wrap justify-between items-start gap-4 mb-6 pb-6 border-b border-gray-50">
                  <div className="flex gap-4">
                    <div className="pt-1">
                      <input 
                        type="checkbox" 
                        checked={selectedOrderIds.includes(order.id)}
                        onChange={() => toggleOrderSelection(order.id)}
                        className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-black text-gray-400 uppercase tracking-wider">رقم الطلب</span>
                        <span className="text-sm font-bold text-gray-900">#{order.id.slice(-6).toUpperCase()}</span>
                      </div>
                      <p className="text-gray-500 text-sm font-medium">
                        {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString('ar-EG', { 
                          weekday: 'long', 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric',
                          hour: 'numeric',
                          minute: 'numeric'
                        }) : 'جاري التحميل...'}
                      </p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm ${statusInfo.color}`}>
                    {statusInfo.icon}
                    <span>{statusInfo.label}</span>
                  </div>
                </div>

                {order.status === 'canceled' && (order as any).rejectionReason && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600">
                    <p className="text-sm font-black mb-1 flex items-center gap-2">
                       <XCircle size={16} />
                       سبب الرفض من المتجر:
                    </p>
                    <p className="text-sm font-bold opacity-90">{(order as any).rejectionReason}</p>
                  </div>
                )}

                <div className="space-y-4 mb-6">
                  {(order.items || []).map((item: any, idx: number) => (
                    <div key={idx} className="flex gap-4 items-center bg-gray-50/50 p-3 rounded-2xl">
                      <img 
                        src={item.imageUrl} 
                        alt={item.name} 
                        className="w-16 h-16 rounded-xl object-cover bg-white border border-gray-100 shadow-sm"
                        referrerPolicy="no-referrer"
                      />
                      <div className="flex-1">
                        <h4 className="font-bold text-gray-900">{item.name}</h4>
                        <div className="flex gap-3 text-xs font-bold mt-1">
                          <span className="text-gray-500">الكمية: {item.quantity}</span>
                          <span className="text-blue-600">{item.price} ج.م</span>
                          {(item.selectedColor || item.selectedSize) && (
                            <span className="text-gray-400 font-medium">
                              {item.selectedColor && `لون: ${item.selectedColor}`}
                              {item.selectedColor && item.selectedSize && ' - '}
                              {item.selectedSize && `مقاس: ${item.selectedSize}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap justify-between items-center gap-6 pt-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col gap-1 text-gray-500">
                      <div className="flex items-center gap-2">
                        <MapPin size={16} className="text-blue-600" />
                        <span className="text-sm font-bold">عنوان التوصيل:</span>
                      </div>
                      <span className="text-sm font-medium mr-6" dir="rtl">
                        {order.address.city}، {order.address.area}، {order.address.street}، عمارة {order.address.building}{order.address.apartment ? `، شقة ${order.address.apartment}` : ''}
                      </span>
                    </div>
                    {statusInfo.label.includes('تم التحقق') && (
                      <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg w-fit">
                        <Package size={14} />
                        <span className="text-[10px] font-black">يتم التسليم خلال يومين إلى 3 أيام عمل</span>
                      </div>
                    )}
                    {order.paymentMethod && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-400">طريقة الدفع:</span>
                          <span className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full uppercase">
                            {order.paymentMethod === 'instapay' ? 'Instapay' : order.paymentMethod === 'wallet' ? 'Electronic Wallet' : 'Cash On Delivery'}
                          </span>
                        </div>
                        {order.receiptUrl && (
                          <div className="mt-2">
                            <span className="text-[10px] font-bold text-gray-400 block mb-1">إيصال الدفع المرفق:</span>
                            <div 
                              onClick={() => setSelectedReceipt(order.receiptUrl)}
                              className="w-24 h-16 rounded-lg overflow-hidden border border-gray-100 cursor-pointer hover:opacity-80 transition-opacity"
                            >
                              <img src={order.receiptUrl} alt="Receipt" className="w-full h-full object-cover" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 text-right">
                    {order.subtotalPrice && (
                      <div className="flex items-center justify-end gap-3 text-sm text-gray-500">
                        <span className="font-bold">المجموع الفرعي:</span>
                        <span>{order.subtotalPrice} ج.م</span>
                      </div>
                    )}
                    {order.couponCode && (
                      <div className="flex items-center justify-end gap-3 text-sm text-green-600">
                        <span className="font-black flex items-center gap-1"><Tag size={12} /> كوبون ({order.couponCode}):</span>
                        <span>-{order.couponDiscount} ج.م</span>
                      </div>
                    )}
                    {(order as any).paymentDiscount > 0 && (
                      <div className="flex items-center justify-end gap-3 text-sm text-emerald-600">
                        <span className="font-bold text-[10px]">خصم الدفع الإلكتروني:</span>
                        <span>-{(order as any).paymentDiscount} ج.م</span>
                      </div>
                    )}
                    <div className="flex items-center justify-end gap-3 text-sm text-gray-500">
                      <span className="font-bold">الشحن:</span>
                      <span>{order.shippingCost === 0 ? 'مجاني' : `${order.shippingCost} ج.م`}</span>
                    </div>
                    <div className="flex items-center justify-end gap-3 mt-1">
                      <span className="text-gray-500 font-bold">الإجمالي النهائي:</span>
                      <span className="text-2xl font-black text-blue-600">{order.totalPrice} ج.م</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <ReceiptModal 
        imageUrl={selectedReceipt} 
        onClose={() => setSelectedReceipt(null)} 
      />
    </div>
  );
}
