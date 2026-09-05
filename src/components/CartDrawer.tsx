import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Trash2, Plus, Minus, ShoppingCart, CreditCard, Loader2, Info, Smartphone, Wallet, Banknote, Upload, CheckCircle2, Copy, Check, Tag } from 'lucide-react';
import { useCart } from '../context/CartContext';

import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, collection, addDoc, serverTimestamp, query, where, onSnapshot } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { Coupon } from '../types';
import { compressImage } from '../lib/image-utils';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const { items, removeFromCart, updateQuantity, totalPrice, shippingCost, clearCart } = useCart();
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [step, setStep] = useState<'cart' | 'payment'>('cart');
  const [paymentMethod, setPaymentMethod] = useState<'instapay' | 'wallet' | 'cod'>('instapay');
  const [receiptBase64, setReceiptBase64] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [availableCoupons, setAvailableCoupons] = useState<Coupon[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponInput, setCouponInput] = useState('');
  const [usedCouponCodes, setUsedCouponCodes] = useState<string[]>([]);
  const navigate = useNavigate();

  // Reset state when drawer opens
  useEffect(() => {
    if (isOpen) {
      setStep('cart');
      setReceiptBase64(null);
      setAppliedCoupon(null);
      setCouponInput('');
    }
  }, [isOpen]);

  // Fetch active coupons and user's used coupons
  useEffect(() => {
    if (!isOpen) return;

    const q = query(collection(db, 'coupons'), where('isActive', '==', true));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const coupons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Coupon));
        setAvailableCoupons(coupons);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'coupons');
      }
    );

    // Fetch used coupons if logged in
    let unsubUsed: (() => void) | undefined;
    if (auth.currentUser) {
      const uq = query(collection(db, 'couponUsages'), where('userId', '==', auth.currentUser.uid));
      unsubUsed = onSnapshot(uq, (snapshot) => {
        const codes = snapshot.docs.map(doc => doc.data().couponCode);
        setUsedCouponCodes(codes);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'couponUsages');
      });
    }

    return () => {
      unsubscribe();
      if (unsubUsed) unsubUsed();
    };
  }, [isOpen]);

  const applyCoupon = (coupon: Coupon) => {
    if (usedCouponCodes.includes(coupon.code)) {
      alert('لقد استخدمت هذا الكوبون مسبقاً');
      return;
    }

    if (coupon.minOrderAmount && totalPrice < coupon.minOrderAmount) {
      alert(`هذا الكوبون يتطلب حداً أدنى للطلب بقيمة ${coupon.minOrderAmount} ج.م. المبلغ الحالي هو ${totalPrice} ج.م`);
      return;
    }

    setAppliedCoupon(coupon);
    setCouponInput('');
  };

  const handleApplyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    const coupon = availableCoupons.find(c => c.code === code);
    
    if (coupon) {
      applyCoupon(coupon);
    } else {
      alert('كوبون غير صحيح أو غير مفعل');
    }
  };

  // Ensure applied coupon still meets requirements if cart changes
  useEffect(() => {
    if (appliedCoupon && appliedCoupon.minOrderAmount && totalPrice < appliedCoupon.minOrderAmount) {
      setAppliedCoupon(null);
      // Optional: alert('تم إزالة الكوبون لأن إجمالي الطلب أصبح أقل من الحد الأدنى المطلوب');
    }
  }, [totalPrice, appliedCoupon]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const paymentDiscount = (paymentMethod === 'instapay' || paymentMethod === 'wallet') ? Math.round(totalPrice * 0.07) : 0;
  
  let couponDiscount = 0;
  if (appliedCoupon) {
    if (appliedCoupon.discountType === 'percentage') {
      couponDiscount = Math.round(totalPrice * (appliedCoupon.discountValue / 100));
    } else {
      couponDiscount = appliedCoupon.discountValue;
    }
  }

  const totalDiscount = paymentDiscount + couponDiscount;
  const finalAmount = Math.max(0, totalPrice - totalDiscount + shippingCost);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) { // 2MB limit
      alert("حجم الملف كبير جداً. الحد الأقصى هو 2 ميجابايت.");
      return;
    }

    setUploadingReceipt(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const compressed = await compressImage(reader.result as string, 800, 0.4);
        setReceiptBase64(compressed);
      } catch (err) {
        console.error('Compression error:', err);
        setReceiptBase64(reader.result as string);
      } finally {
        setUploadingReceipt(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const goToPayment = () => {
    const user = auth.currentUser;
    if (!user) {
      alert("يرجى تسجيل الدخول أولاً لإتمام عملية الشراء.");
      onClose();
      navigate('/login');
      return;
    }
    setStep('payment');
  };

  const handleCheckout = async () => {
    if (items.length === 0) return;
    
    const user = auth.currentUser;
    if (!user) {
      alert("يرجى تسجيل الدخول أولاً لإتمام عملية الشراء.");
      onClose();
      navigate('/login');
      return;
    }

    if ((paymentMethod === 'instapay' || paymentMethod === 'wallet') && !receiptBase64) {
      alert("يرجى رفع إيصال الدفع أو لقطة شاشة لإتمام الطلب.");
      return;
    }

    setIsProcessingPayment(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.data() || {};

      const addr = userData?.address;
      if (!addr || !addr.city || !addr.area || !addr.street || !addr.building) {
        alert("يرجى إكمال عنوان التوصيل في إعدادات حسابك قبل إتمام الشراء.");
        onClose();
        navigate('/settings');
        return;
      }

      const phone = userData?.phoneNumber || user.phoneNumber || '';
      if (!phone || phone.length < 11) {
        alert("يرجى إضافة رقم هاتف صحيح في إعدادات حسابك لإتمام عملية الشراء.");
        onClose();
        navigate('/settings');
        return;
      }
      
      const orderData = {
        userId: user.uid,
        userName: userData.name || user.displayName || 'عميل',
        userEmail: user.email,
        userPhone: phone,
        items: items.map(item => ({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.cartQuantity,
          imageUrl: item.imageUrl,
          sellerId: item.sellerId || null,
          selectedColor: item.selectedColor || null,
          selectedSize: item.selectedSize || null
        })),
        totalPrice: finalAmount,
        subtotalPrice: totalPrice,
        shippingCost: shippingCost,
        originalPrice: totalPrice,
        discount: totalDiscount,
        couponCode: appliedCoupon?.code || null,
        couponDiscount: couponDiscount,
        paymentDiscount: paymentDiscount,
        address: addr,
        sellerIds: [...new Set(items.map(item => item.sellerId).filter(Boolean))],
        status: paymentMethod === 'cod' ? 'pending' : 'awaiting_verification',
        paymentMethod,
        receiptUrl: receiptBase64,
        createdAt: serverTimestamp()
      };

      const orderRef = collection(db, 'orders');
      await addDoc(orderRef, orderData);

      // Record coupon usage
      if (appliedCoupon) {
        const usageRef = collection(db, 'couponUsages');
        await addDoc(usageRef, {
          userId: user.uid,
          couponCode: appliedCoupon.code,
          usedAt: serverTimestamp()
        });
      }
      
      clearCart();
      alert(paymentMethod === 'cod' ? 'تم تسجيل طلبك بنجاح! سيتم التواصل معك قريباً.' : 'تم استلام طلبك وإيصال الدفع. سيتم مراجعته وتأكيده قريباً.');
      
      onClose();
      navigate('/orders');
    } catch (error: any) {
      console.error('Checkout error:', error);
      alert(`حدث خطأ أثناء إتمام الطلب: ${error.message || 'يرجى المحاولة مرة أخرى لاحقاً'}`);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-[101] flex flex-col"
          >
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div className="flex items-center gap-2">
                {step === 'payment' && (
                  <button onClick={() => setStep('cart')} className="p-2 hover:bg-gray-200 rounded-full transition-colors ml-1">
                    <X className="rotate-90" size={20} />
                  </button>
                )}
                <ShoppingCart className="text-blue-600" />
                <h3 className="text-xl font-black text-gray-900">{step === 'cart' ? 'سلة المشتريات' : 'إتمام الدفع'}</h3>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center">
                    <ShoppingCart size={40} className="text-gray-300" />
                  </div>
                  <div>
                    <p className="text-gray-900 font-bold text-lg">سلتك فارغة</p>
                    <p className="text-gray-500">ابدأ بإضافة بعض المنتجات الرائعة!</p>
                  </div>
                  <button 
                    onClick={onClose}
                    className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-bold hover:bg-blue-700 transition-all"
                  >
                    تصفح المتجر
                  </button>
                </div>
              ) : step === 'cart' ? (
                <>
                  <div className="space-y-4">
                    {items.map((item) => {
                      const cartId = `${item.id}-${item.selectedColor || ''}-${item.selectedSize || ''}`;
                      return (
                        <div key={cartId} className="flex gap-4 bg-gray-50/50 p-4 rounded-2xl border border-gray-100 group">
                          <img 
                            src={item.imageUrl} 
                            alt={item.name} 
                            className="w-20 h-20 rounded-xl object-cover bg-white shadow-sm"
                            referrerPolicy="no-referrer"
                          />
                          <div className="flex-1 space-y-2">
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="font-bold text-gray-900 leading-tight">{item.name}</h4>
                                {(item.selectedColor || item.selectedSize) && (
                                  <div className="flex gap-2 mt-1">
                                    {item.selectedColor && <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold">{item.selectedColor}</span>}
                                    {item.selectedSize && <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-bold">{item.selectedSize}</span>}
                                  </div>
                                )}
                              </div>
                              <button 
                                onClick={() => removeFromCart(cartId)}
                                className="text-gray-400 hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                            <div className="flex justify-between items-center">
                              <p className="text-blue-600 font-black">{item.price} ج.م</p>
                              <div className="flex items-center bg-white border border-gray-200 rounded-xl px-2 py-1 gap-4">
                                <button 
                                  onClick={() => updateQuantity(cartId, item.cartQuantity - 1)}
                                  className="text-gray-500 hover:text-blue-600 transition-colors"
                                >
                                  <Minus size={16} />
                                </button>
                                <span className="font-bold min-w-[20px] text-center">{item.cartQuantity}</span>
                                <button 
                                  onClick={() => updateQuantity(cartId, item.cartQuantity + 1)}
                                  className="text-gray-500 hover:text-blue-600 transition-colors"
                                >
                                  <Plus size={16} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-8 space-y-4 border-t pt-6">
                    <h4 className="font-black text-gray-900 flex items-center gap-2">
                      <Tag size={18} className="text-blue-600" />
                      كوبونات الخصم
                    </h4>
                    
                    {!appliedCoupon ? (
                      <div className="flex gap-2">
                        <input 
                          type="text"
                          value={couponInput}
                          onChange={(e) => setCouponInput(e.target.value)}
                          placeholder="أدخل كود الخصم..."
                          className="flex-1 bg-gray-50 border-2 border-gray-100 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 font-bold"
                        />
                        <button 
                          onClick={handleApplyCoupon}
                          className="bg-gray-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-black transition-all active:scale-95"
                        >
                          تطبيق
                        </button>
                      </div>
                    ) : (
                      <div className="bg-green-50 border border-green-100 p-4 rounded-xl flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="text-green-600" size={20} />
                          <div>
                            <p className="font-black text-green-900">كوبون {appliedCoupon.code} مطبق</p>
                            <p className="text-xs text-green-600 font-bold">
                              لقد وفرت {appliedCoupon.discountType === 'percentage' ? `${appliedCoupon.discountValue}%` : `${appliedCoupon.discountValue} ج.م`}
                              {appliedCoupon.discountType === 'percentage' && ` (${couponDiscount} ج.م)`}
                            </p>
                          </div>
                        </div>
                        <button 
                          onClick={() => setAppliedCoupon(null)}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    )}

                    {availableCoupons.length > 0 && !appliedCoupon && (
                      <div className="space-y-2">
                        <p className="text-[10px] text-gray-400 font-black uppercase">الكوبونات المتاحة:</p>
                        <div className="flex flex-wrap gap-2">
                          {availableCoupons
                            .filter(coupon => !usedCouponCodes.includes(coupon.code))
                            .map(coupon => {
                              const isApplicable = !coupon.minOrderAmount || totalPrice >= coupon.minOrderAmount;
                              return (
                                <button
                                  key={coupon.id}
                                  onClick={() => applyCoupon(coupon)}
                                  className={`px-3 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 border ${
                                    isApplicable 
                                      ? 'bg-blue-50 border-blue-100 text-blue-600 hover:bg-blue-100' 
                                      : 'bg-gray-50 border-gray-100 text-gray-400 opacity-60'
                                  }`}
                                >
                                  <span>{coupon.code}</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${isApplicable ? 'bg-white' : 'bg-gray-200'}`}>
                                    {coupon.discountValue}{coupon.discountType === 'percentage' ? '%' : ' ج.م'}
                                  </span>
                                  {!isApplicable && (
                                    <span className="text-[8px] bg-red-50 text-red-500 px-1 rounded">يحتاج {coupon.minOrderAmount} ج.م</span>
                                  )}
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-6"
                >
                  <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 space-y-3">
                    <div className="flex justify-between items-center text-sm font-bold text-blue-600">
                      <span>إجمالي المنتجات:</span>
                      <span>{totalPrice} ج.م</span>
                    </div>
                    <div className="flex justify-between items-center text-sm font-bold text-gray-600">
                      <span>تكلفة الشحن:</span>
                      <span>{shippingCost === 0 ? 'مجاني' : `${shippingCost} ج.م`}</span>
                    </div>
                    {couponDiscount > 0 && (
                      <div className="flex justify-between items-center text-sm font-bold text-green-600">
                        <span>خصم الكوبون ({appliedCoupon?.code}):</span>
                        <span>-{couponDiscount} ج.م</span>
                      </div>
                    )}
                    {paymentDiscount > 0 && (
                      <div className="flex justify-between items-center text-sm font-bold text-green-600">
                        <span>خصم الدفع الإلكتروني (7%):</span>
                        <span>-{paymentDiscount} ج.م</span>
                      </div>
                    )}
                    {totalPrice < 2000 && (
                      <p className="text-[10px] text-blue-500 font-bold bg-blue-100/50 p-2 rounded-lg mt-2 text-center">
                        اضف منتجات بقيمة {2000 - totalPrice} ج.م إضافية للحصول على شحن مجاني!
                      </p>
                    )}
                    <div className="pt-2 border-t border-blue-200">
                      <p className="text-blue-600 font-black text-xs opacity-80 mb-1">المبلغ النهائي للدفع:</p>
                      <p className="text-3xl font-black text-blue-900">{finalAmount} ج.م</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-bold text-gray-900 px-1">اختر طريقة الدفع:</h4>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="space-y-3">
                        <button 
                          onClick={() => { setPaymentMethod('instapay'); setReceiptBase64(null); }}
                          className={`w-full flex items-center gap-3 p-4 rounded-2xl border transition-all text-right ${paymentMethod === 'instapay' ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-600/10' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                        >
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${paymentMethod === 'instapay' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                            <CreditCard size={24} />
                          </div>
                          <div className="flex-1">
                            <p className="font-black text-gray-900 text-sm">Instapay (خصم 7%)</p>
                            <p className="text-[10px] text-gray-500 font-bold">تحويل {finalAmount} ج.م فوراً</p>
                          </div>
                          {paymentMethod === 'instapay' && <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-white" /></div>}
                        </button>
                        
                        {paymentMethod === 'instapay' && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="bg-white border-2 border-blue-100 rounded-2xl p-4 space-y-4 overflow-hidden"
                          >
                            <div className="space-y-2 bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                              <p className="text-[10px] font-black text-blue-600 uppercase tracking-wider">بيانات التحويل:</p>
                              <div className="flex justify-between items-center group/copy">
                                <span className="text-xs font-bold text-gray-500">الرقم:</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-black text-gray-900 select-all">01115454823</span>
                                  <button 
                                    onClick={() => handleCopy('01115454823')}
                                    className="p-1 text-blue-400 hover:text-blue-600 transition-colors"
                                  >
                                    {copiedText === '01115454823' ? <Check size={14} /> : <Copy size={14} />}
                                  </button>
                                </div>
                              </div>
                              <div className="flex justify-between items-center group/copy">
                                <span className="text-xs font-bold text-gray-500">العنوان:</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-black text-gray-900 select-all">mahmoudmasry77@instapay</span>
                                  <button 
                                    onClick={() => handleCopy('mahmoudmasry77@instapay')}
                                    className="p-1 text-blue-400 hover:text-blue-600 transition-colors"
                                  >
                                    {copiedText === 'mahmoudmasry77@instapay' ? <Check size={14} /> : <Copy size={14} />}
                                  </button>
                                </div>
                              </div>
                            </div>
                            <ReceiptUpload receiptBase64={receiptBase64} setReceiptBase64={setReceiptBase64} uploadingReceipt={uploadingReceipt} handleFileUpload={handleFileUpload} />
                          </motion.div>
                        )}
                      </div>

                      <div className="space-y-3">
                        <button 
                          onClick={() => { setPaymentMethod('wallet'); setReceiptBase64(null); }}
                          className={`w-full flex items-center gap-3 p-4 rounded-2xl border transition-all text-right ${paymentMethod === 'wallet' ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-600/10' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                        >
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${paymentMethod === 'wallet' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                            <Smartphone size={24} />
                          </div>
                          <div className="flex-1">
                            <p className="font-black text-gray-900 text-sm">محفظة إلكترونية (خصم 7%)</p>
                            <p className="text-[10px] text-gray-500 font-bold">تحويل {finalAmount} ج.م (فودافون كاش، إلخ)</p>
                          </div>
                          {paymentMethod === 'wallet' && <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-white" /></div>}
                        </button>

                        {paymentMethod === 'wallet' && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="bg-white border-2 border-blue-100 rounded-2xl p-4 space-y-4 overflow-hidden"
                          >
                            <div className="space-y-2 bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                              <p className="text-[10px] font-black text-blue-600 uppercase tracking-wider">بيانات المحفظة:</p>
                              <div className="flex justify-between items-center group/copy">
                                <span className="text-xs font-bold text-gray-500">رقم التحويل:</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-black text-gray-900 select-all">01115454823</span>
                                  <button 
                                    onClick={() => handleCopy('01115454823')}
                                    className="p-1 text-blue-400 hover:text-blue-600 transition-colors"
                                  >
                                    {copiedText === '01115454823' ? <Check size={14} /> : <Copy size={14} />}
                                  </button>
                                </div>
                              </div>
                            </div>
                            <ReceiptUpload receiptBase64={receiptBase64} setReceiptBase64={setReceiptBase64} uploadingReceipt={uploadingReceipt} handleFileUpload={handleFileUpload} />
                          </motion.div>
                        )}
                      </div>

                      <button 
                        onClick={() => { setPaymentMethod('cod'); setReceiptBase64(null); }}
                        className={`w-full flex items-center gap-3 p-4 rounded-2xl border transition-all text-right ${paymentMethod === 'cod' ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-600/10' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                      >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${paymentMethod === 'cod' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                          <Banknote size={24} />
                        </div>
                        <div className="flex-1">
                          <p className="font-black text-gray-900 text-sm">الدفع عند الاستلام</p>
                          <p className="text-[10px] text-gray-500 font-bold">ادفع {Math.max(0, totalPrice - couponDiscount)} ج.م نقداً عند الاستلام</p>
                        </div>
                        {paymentMethod === 'cod' && <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-white" /></div>}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {items.length > 0 && (
              <div className="p-6 border-t border-gray-100 space-y-4 bg-gray-50/50">
                <div className="flex justify-between items-center text-lg">
                  <span className="text-gray-600 font-bold">المطلوب سداده:</span>
                  <span className="text-2xl font-black text-blue-600">{finalAmount} ج.م</span>
                </div>

                {step === 'cart' ? (
                  <button 
                    onClick={goToPayment}
                    className="w-full h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-blue-600/20 active:scale-[0.98]"
                  >
                    <ShoppingCart size={24} />
                    <span>تأكيد الطلب</span>
                  </button>
                ) : (
                  <button 
                    onClick={handleCheckout}
                    disabled={isProcessingPayment || uploadingReceipt}
                    className="w-full h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-blue-600/20 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isProcessingPayment ? (
                      <>
                        <Loader2 size={24} className="animate-spin" />
                        <span>جاري معالجة الطلب...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={24} />
                        <span>إتمام الطلب</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ReceiptUpload({ receiptBase64, setReceiptBase64, uploadingReceipt, handleFileUpload }: any) {
  return (
    <div className="bg-gray-100 p-4 rounded-2xl border-2 border-dashed border-gray-300 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-gray-700">رفع إيصال الدفع:</span>
        <Info size={16} className="text-gray-400" />
      </div>
      
      {!receiptBase64 ? (
        <label className="flex flex-col items-center justify-center w-full py-6 bg-white rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors group">
          {uploadingReceipt ? (
            <Loader2 size={32} className="text-blue-600 animate-spin" />
          ) : (
            <>
              <Upload size={32} className="text-gray-300 group-hover:text-blue-600 transition-colors mb-2" />
              <span className="text-sm font-bold text-gray-500 group-hover:text-blue-600 transition-colors">اضغط لإرفاق الصورة</span>
              <span className="text-[10px] text-gray-400 mt-1">PNG, JPG (حد أقصي 2MB)</span>
            </>
          )}
          <input 
            type="file" 
            className="hidden" 
            accept="image/*" 
            onChange={handleFileUpload}
            disabled={uploadingReceipt}
          />
        </label>
      ) : (
        <div className="relative group">
          <img 
            src={receiptBase64} 
            alt="Receipt preview" 
            className="w-full h-32 object-cover rounded-xl border border-gray-200"
          />
          <button 
            type="button"
            onClick={() => setReceiptBase64(null)}
            className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X size={16} />
          </button>
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center pointer-events-none">
            <span className="text-white font-bold text-xs">تم إرفاق الإيصال</span>
          </div>
        </div>
      )}
      <p className="text-[10px] text-gray-500 text-center leading-relaxed font-medium">يجب تحويل المبلغ أولاً ثم رفع صورة التحويل لضمان تأكيد طلبك بسرعة.</p>
    </div>
  );
}
