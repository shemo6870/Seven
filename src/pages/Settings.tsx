import React, { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { updatePassword, updateProfile } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { motion } from 'motion/react';
import { User, Lock, Save, AlertCircle, CheckCircle2, MapPin, Smartphone, Eye, EyeOff } from 'lucide-react';

export default function Settings() {
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState({
    city: '',
    area: '',
    street: '',
    building: '',
    apartment: ''
  });
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [canChangePassword, setCanChangePassword] = useState(false);

  useEffect(() => {
    if (auth.currentUser) {
      const providers = auth.currentUser.providerData.map(p => p.providerId);
      setCanChangePassword(providers.includes('password'));
    }
    
    const fetchUserData = async () => {
      if (auth.currentUser) {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          setName(data.name || '');
          setPhoneNumber(data.phoneNumber || auth.currentUser.phoneNumber || '');
          if (data.address) {
            setAddress(data.address);
          }
        }
      }
    };
    fetchUserData();
  }, []);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      if (auth.currentUser) {
        // Update Firestore
        const userRef = doc(db, 'users', auth.currentUser.uid);
        await updateDoc(userRef, { 
          name: name.trim(),
          phoneNumber: phoneNumber.trim(),
          address: address 
        });
        
        // Update Auth Profile Display Name (optional but good)
        await updateProfile(auth.currentUser, { displayName: name.trim() });

        // Update Password if provided
        if (newPassword.trim()) {
          if (newPassword.length < 6) {
            throw new Error('كلمة السر يجب أن تكون 6 أحرف على الأقل');
          }
          await updatePassword(auth.currentUser, newPassword);
          await updateDoc(userRef, { password: newPassword });
          setNewPassword('');
        }

        setMessage({ type: 'success', text: 'تم تحديث البيانات بنجاح' });
        // Reload page or update local state global if needed, but let's just show success
      }
    } catch (err: any) {
      console.error(err);
      let errorMsg = 'حدث خطأ أثناء تحديث البيانات.';
      if (err.code === 'auth/requires-recent-login') {
        errorMsg = 'لتغيير كلمة السر، يجب تسجيل الدخول مرة أخرى حديثاً لدواعي الأمان.';
      } else if (err.message) {
        errorMsg = err.message;
      }
      setMessage({ type: 'error', text: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-6 sm:py-10 px-4 sm:px-0">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-5 sm:p-8 border border-gray-100"
      >
        <div className="flex items-center gap-4 mb-6 sm:mb-8 pb-4 sm:pb-6 border-b border-gray-50">
          <div className="w-12 h-12 sm:w-14 sm:h-14 bg-blue-50 rounded-xl sm:rounded-2xl flex items-center justify-center text-blue-600">
            <User size={24} className="sm:w-[30px] sm:h-[30px]" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-gray-900">إعدادات الحساب</h1>
            <p className="text-gray-500 text-xs sm:text-base">تعديل معلوماتك الشخصية وعنوان التوصيل</p>
          </div>
        </div>

        {message.text && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`flex items-center gap-3 p-4 rounded-2xl mb-6 font-bold ${
              message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}
          >
            {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            {message.text}
          </motion.div>
        )}

        <form onSubmit={handleUpdateProfile} className="space-y-8">
          <section className="space-y-6">
            <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <User size={20} className="text-blue-600" />
              المعلومات الأساسية
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 mr-2">الاسم الكامل</label>
                <div className="relative">
                  <input
                    required
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="اسمك الجديد"
                    className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-bold text-lg"
                  />
                  <User className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 mr-2">رقم الهاتف (للدفع الإلكتروني)</label>
                <div className="relative">
                  <input
                    required
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="مثلاً: 01012345678"
                    className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-bold text-lg"
                  />
                  <Smartphone className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-6 text-right" dir="rtl">
            <h2 className="text-lg font-black text-gray-900 flex items-center gap-2 justify-end">
              عنوان التوصيل
              <MapPin size={20} className="text-blue-600" />
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 mr-1">المدينة</label>
                <input
                  required
                  type="text"
                  value={address.city}
                  onChange={(e) => setAddress({...address, city: e.target.value})}
                  placeholder="مثلاً: القاهرة"
                  className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-bold text-lg text-right"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 mr-1">المنطقة / الحي</label>
                <input
                  required
                  type="text"
                  value={address.area}
                  onChange={(e) => setAddress({...address, area: e.target.value})}
                  placeholder="مثلاً: المعادي"
                  className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-bold text-lg text-right"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 mr-1">اسم الشارع</label>
                <input
                  required
                  type="text"
                  value={address.street}
                  onChange={(e) => setAddress({...address, street: e.target.value})}
                  placeholder="مثلاً: شارع النصر"
                  className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-bold text-lg text-right"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 mr-1">رقم المبنى</label>
                <input
                  required
                  type="text"
                  value={address.building}
                  onChange={(e) => setAddress({...address, building: e.target.value})}
                  placeholder="مثلاً: 5"
                  className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-bold text-lg text-right"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 mr-1">رقم الشقة (اختياري)</label>
                <input
                  type="text"
                  value={address.apartment}
                  onChange={(e) => setAddress({...address, apartment: e.target.value})}
                  placeholder="مثلاً: 402"
                  className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-bold text-lg text-right"
                />
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <Lock size={20} className="text-blue-600" />
              الأمان
            </h2>
            
            {canChangePassword ? (
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 mr-2">كلمة سر جديدة (اتركه فارغاً إذا لا تريد التغيير)</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 pr-12 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-bold text-lg"
                  />
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 transition-colors p-1"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-orange-50 p-4 rounded-2xl border border-orange-100 flex gap-3 text-orange-700 text-sm font-medium">
                <AlertCircle size={20} className="shrink-0" />
                <p>حسابك مسجل عبر الهاتف، لا يوجد كلمة سر لتعديلها. يمكنك فقط تعديل اسمك.</p>
              </div>
            )}
          </section>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl transition-all font-bold text-xl shadow-lg shadow-blue-600/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
          >
            {loading ? 'جاري الحفظ...' : 'حفظ التعديلات'}
            <Save size={24} />
          </button>
        </form>
      </motion.div>
    </div>
  );
}
