import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { Coupon } from '../types';
import { motion } from 'motion/react';
import { Tag, Ticket, CheckCircle2, Copy, Check } from 'lucide-react';

export default function Coupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [usedCouponCodes, setUsedCouponCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    // 1. Try cache first
    const cachedCoupons = sessionStorage.getItem('cached_coupons');
    if (cachedCoupons) {
      try {
        const parsed = JSON.parse(cachedCoupons);
        if (Array.isArray(parsed)) {
          setCoupons(parsed);
          setLoading(false);
        }
      } catch (e) {
        console.error("Error parsing cached coupons:", e);
      }
    }

    // Fetch active coupons with real-time updates
    const unsubCoupons = onSnapshot(
      query(collection(db, 'coupons'), where('isActive', '==', true)),
      (snapshot) => {
        const couponsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Coupon[];
        setCoupons(couponsData);
        sessionStorage.setItem('cached_coupons', JSON.stringify(couponsData));
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'coupons');
        setLoading(false);
      }
    );

    // Fetch used coupons if logged in
    const fetchUsedCoupons = async () => {
      if (auth.currentUser) {
        try {
          const uq = query(collection(db, 'couponUsages'), where('userId', '==', auth.currentUser.uid));
          const snapshot = await getDocs(uq);
          const codes = snapshot.docs.map(doc => doc.data().couponCode);
          setUsedCouponCodes(codes);
        } catch (error) {
          console.error("Error fetching used coupons:", error);
        }
      }
    };

    fetchUsedCoupons();

    return () => {
      unsubCoupons();
    };
  }, []);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const availableCoupons = coupons.filter(c => !usedCouponCodes.includes(c.code));

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-black text-gray-900 flex items-center justify-center gap-3">
          <Ticket className="text-blue-600" size={36} />
          الكوبونات المتاحة
        </h1>
        <p className="text-gray-500 font-bold">استخدم هذه الكوبونات للحصول على خصومات حصرية على مشترياتك!</p>
      </div>

      {availableCoupons.length === 0 ? (
        <div className="bg-white rounded-3xl p-20 text-center shadow-sm border border-gray-100">
          <Tag className="mx-auto text-gray-200 mb-4" size={64} />
          <p className="text-gray-400 font-bold text-xl">لا توجد كوبونات متاحة لك حالياً</p>
          <p className="text-gray-400">لقد استخدمت جميع العروض المتاحة أو لا توجد عروض حالياً</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {availableCoupons.map((coupon) => (
            <motion.div
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              key={coupon.id}
              className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 relative overflow-hidden group"
            >
              {/* Decorative elements */}
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-blue-50 rounded-full group-hover:scale-110 transition-transform" />
              <div className="absolute top-1/2 -left-3 w-6 h-6 bg-gray-50 rounded-full border border-gray-100" style={{ transform: 'translateY(-50%)' }} />
              <div className="absolute top-1/2 -right-3 w-6 h-6 bg-gray-50 rounded-full border border-gray-100" style={{ transform: 'translateY(-50%)' }} />
              
              <div className="relative flex justify-between items-center">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-black text-blue-600">
                      {coupon.discountType === 'percentage' ? `${coupon.discountValue}%` : `${coupon.discountValue} ج.م`}
                    </span>
                    <span className="text-sm font-bold text-gray-400">خصم</span>
                  </div>
                  <h3 className="text-xl font-black text-gray-900 tracking-wider">
                    {coupon.code}
                  </h3>
                  {coupon.minOrderAmount > 0 && (
                    <p className="text-xs text-gray-500 font-bold flex items-center gap-1">
                      <CheckCircle2 size={12} className="text-green-500" />
                      للطلبات فوق {coupon.minOrderAmount} ج.م
                    </p>
                  )}
                </div>

                <button
                  onClick={() => handleCopy(coupon.code)}
                  className={`flex flex-col items-center justify-center gap-1 p-4 rounded-2xl transition-all ${copiedCode === coupon.code ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-400 hover:bg-blue-50 hover:text-blue-600'}`}
                >
                  {copiedCode === coupon.code ? <Check size={24} /> : <Copy size={24} />}
                  <span className="text-[10px] font-black uppercase">{copiedCode === coupon.code ? 'نسخ!' : 'نسخ الكود'}</span>
                </button>
              </div>

              <div className="mt-6 pt-6 border-t border-dashed border-gray-100">
                <div className="flex items-center gap-2 text-gray-400">
                  <Tag size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">كوبون فعال وموثوق</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <div className="bg-blue-600 rounded-3xl p-8 text-white text-center shadow-xl shadow-blue-600/20">
        <h3 className="text-xl font-black mb-2">كيفية الاستخدام؟</h3>
        <p className="text-blue-100 font-bold text-sm max-w-md mx-auto">
          قم بنسخ الكود المفضل لديك ثم أضفه في سلة المشتريات قبل إتمام الطلب للحصول على الخصم فوراً!
        </p>
      </div>
    </div>
  );
}
