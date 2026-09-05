import React, { useState, useEffect } from 'react';
import { 
  RecaptchaVerifier, 
  signInWithPhoneNumber, 
  ConfirmationResult,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, setDoc, getDoc, serverTimestamp, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { updatePassword } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, CheckCircle2, ArrowRight, User, ShieldCheck, UserPlus, LogIn, Lock, Eye, EyeOff, ShoppingCart, Copy, Check } from 'lucide-react';
import { WHATSAPP_NUMBER } from '../constants';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [step, setStep] = useState<'phone' | 'code' | 'new_password'>('phone');
  const [role, setRole] = useState<'buyer' | 'seller' | 'admin'>('buyer');
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot_password'>('signup');
  const [recoveredPassword, setRecoveredPassword] = useState('');
  const [showRecoverPopup, setShowRecoverPopup] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const navigate = useNavigate();
  const verifierRef = React.useRef<RecaptchaVerifier | null>(null);
  const getVirtualEmail = (phone: string) => `${phone.replace('+', '')}@seven.store`;

  useEffect(() => {
    const checkUser = async () => {
      if (auth.currentUser && step === 'phone') {
        const u = auth.currentUser;
        const isAdmin = u.phoneNumber?.replace('+', '') === WHATSAPP_NUMBER || u.email === 'mahmoudmasry165@gmail.com';
        if (isAdmin) {
          navigate('/admin');
          return;
        }

        try {
          const userRef = doc(db, 'users', u.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const role = userSnap.data().role;
            if (role === 'admin') navigate('/admin');
            else if (role === 'seller') navigate('/merchant');
            else navigate('/');
          } else {
            // Missing profile document. Create a default profile instead of logging out!
            const uEmail = u.email?.toLowerCase() || '';
            const uPhone = u.phoneNumber || '';
            const cleanPhone = uPhone.replace('+', '');
            const isAdminEmail = uEmail === 'mahmoudmasry165@gmail.com';
            const isSellerCred = cleanPhone === WHATSAPP_NUMBER || uPhone === '+' + WHATSAPP_NUMBER || uEmail === '201115454823@seven.store' || uEmail === '01115454823@seven.store';
            
            const defaultRole = isAdminEmail ? 'admin' : (isSellerCred ? 'seller' : 'buyer');
            const defaultName = u.displayName || (isAdminEmail ? 'المشرف' : (isSellerCred ? 'التاجر' : 'مشتري'));
            
            try {
              await setDoc(userRef, {
                name: defaultName,
                email: uEmail || '',
                phoneNumber: uPhone || '',
                role: defaultRole,
                createdAt: serverTimestamp()
              });
              
              if (defaultRole === 'admin') navigate('/admin');
              else if (defaultRole === 'seller') navigate('/merchant');
              else navigate('/');
            } catch (createErr) {
              console.error("Error creating profile in Login useEffect:", createErr);
              navigate('/');
            }
          }
        } catch (e) {
          console.error("Error reading profile in Login useEffect:", e);
          navigate('/');
        }
      }
    };
    checkUser();
  }, [navigate, step]);

  const handleAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    
    const cleanPhoneNumber = phoneNumber.replace(/\s/g, '');

    const cleanPhoneDigits = cleanPhoneNumber.replace(/\D/g, '');
    const isValidEgyptian = 
      (cleanPhoneDigits.length === 11 && (cleanPhoneDigits.startsWith('010') || cleanPhoneDigits.startsWith('011') || cleanPhoneDigits.startsWith('012') || cleanPhoneDigits.startsWith('015'))) ||
      (cleanPhoneDigits.length === 10 && (cleanPhoneDigits.startsWith('10') || cleanPhoneDigits.startsWith('11') || cleanPhoneDigits.startsWith('12') || cleanPhoneDigits.startsWith('15'))) ||
      (cleanPhoneDigits.length === 12 && cleanPhoneDigits.startsWith('20') && (cleanPhoneDigits.slice(2).startsWith('10') || cleanPhoneDigits.slice(2).startsWith('11') || cleanPhoneDigits.slice(2).startsWith('12') || cleanPhoneDigits.slice(2).startsWith('15'))) ||
      (cleanPhoneDigits.length === 13 && cleanPhoneDigits.startsWith('20') && (cleanPhoneDigits.slice(3).startsWith('10') || cleanPhoneDigits.slice(3).startsWith('11') || cleanPhoneDigits.slice(3).startsWith('12') || cleanPhoneDigits.slice(3).startsWith('15')));

    if (!isValidEgyptian && role !== 'admin') {
      setError('يرجى إدخال رقم هاتف مصري حقيقي صحيح تابع لإحدى الشبكات (فودافون، اتصالات، أورنج، أو وي) مثل: 01012345678');
      return;
    }

    if (mode === 'login' && !password && role !== 'admin') {
      setError('يرجى إدخال كلمة السر');
      return;
    }

    if (role === 'admin') {
      let normalizedAdminInput = cleanPhoneNumber;
      if (!normalizedAdminInput.startsWith('2') && !normalizedAdminInput.startsWith('+')) {
        normalizedAdminInput = '2' + normalizedAdminInput;
      }
      if (normalizedAdminInput.replace('+', '') !== WHATSAPP_NUMBER) {
        setError('عذراً، هذا الرقم غير مسجل كمشرف.');
        return;
      }

      return handleSendOTP(normalizedAdminInput);
    }

    if (mode === 'signup') {
      if (!fullName.trim() || !password || password.length < 6) {
        setError('يرجى إكمال البيانات (كلمة السر 6 أحرف على الأقل)');
        return;
      }
      
      return handleSendOTP(cleanPhoneNumber);
    } else if (mode === 'forgot_password') {
      return handleSendOTP(cleanPhoneNumber);
    } else {
      if (!password) {
        setError('يرجى إدخال كلمة السر');
        return;
      }
      return handleLogin(cleanPhoneNumber);
    }
  };

  const handleSignup = async (phone: string) => {
    setLoading(true);
    setError('');
    try {
      const email = getVirtualEmail(phone);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        name: fullName,
        email: email,
        phoneNumber: phone,
        password: password,
        role: 'buyer',
        createdAt: serverTimestamp()
      });

      navigate('/');
    } catch (err: any) {
      console.error(err);
      setError('حدث خطأ أثناء إنشاء الحساب. قد يكون الرقم مسجل مسبقاً.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (phone: string) => {
    setLoading(true);
    setError('');
    try {
      const phoneVariations = Array.from(new Set([
        phone.trim(),
        phone.trim().replace('+20', '0'),
        phone.trim().replace('+', ''),
        phone.trim().replace(/^0/, '+20')
      ])).filter(Boolean);

      let loggedInUser = null;
      let lastError = null;

      for (const p of phoneVariations) {
        try {
          const email = getVirtualEmail(p);
          const userCredential = await signInWithEmailAndPassword(auth, email, password);
          loggedInUser = userCredential.user;
          break; // Success!
        } catch (err: any) {
          lastError = err;
          // Continue to next variation if credentials fail
        }
      }

      if (!loggedInUser) {
        throw lastError || new Error("بيانات الدخول غير صحيحة.");
      }

      const userRef = doc(db, 'users', loggedInUser.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await loggedInUser.delete();
        setError('عذراً، تم حذف حسابك من قبل الإدارة. يمكنك الآن إنشاء حساب جديد تماماً.');
        setMode('signup');
        return;
      }

      const userData = userSnap.data();
      
      // Sync password to firestore if it changed
      if (userData.password !== password) {
        try {
          await updateDoc(userRef, { password: password });
        } catch(e) {}
      }

      if (userData.role === 'admin') {
         navigate('/admin');
      } else if (userData.role === 'seller') {
         navigate('/merchant');
      } else {
         navigate('/');
      }
    } catch (err: any) {
      if (err.code === 'auth/too-many-requests') {
        setError('لقد حاولت عدة مرات متتالية. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.');
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.message?.includes('invalid-credential')) {
        setError('بيانات الدخول غير صحيحة. يرجى التأكد من رقم الهاتف وكلمة السر المكتوبة.');
      } else if (err.code === 'auth/requires-recent-login' || err.message?.includes('recent-login')) {
        setError('حدث خطأ أثناء محاولة تهيئة حسابك. يرجى المحاولة مرة أخرى.');
      } else {
        console.error("Login Error:", err);
        setError('بيانات الدخول غير صحيحة. تأكد من الرقم وكلمة السر.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async (phone: string) => {
    let normalizedPhone = phone.trim();
    if (!normalizedPhone.startsWith('+')) {
      if (normalizedPhone.startsWith('0')) {
        normalizedPhone = '+2' + normalizedPhone;
      } else if (!normalizedPhone.startsWith('2')) {
        normalizedPhone = '+20' + normalizedPhone;
      } else {
        normalizedPhone = '+' + normalizedPhone;
      }
    }

    setLoading(true);
    setError('');
    
    try {
      // Initialize reCAPTCHA singleton
      if (!verifierRef.current) {
        let container = document.getElementById('recaptcha-container');
        if (!container) {
          container = document.createElement('div');
          container.id = 'recaptcha-container';
          container.className = 'hidden';
          document.body.appendChild(container);
        }
        
        // Use window as a global registry to truly prevent multi-init
        if ((window as any)._recaptchaVerifier) {
          verifierRef.current = (window as any)._recaptchaVerifier;
        } else {
          try {
            verifierRef.current = new RecaptchaVerifier(auth, container, {
              'size': 'invisible'
            });
            (window as any)._recaptchaVerifier = verifierRef.current;
          } catch (reErr) {
            console.warn('reCAPTCHA init error:', reErr);
            // If it already exists but we somehow didn't have it in window logic, 
            // the error message might be what the user saw.
          }
        }
      }

      if (!verifierRef.current) {
        throw new Error('تعذر تهيئة نظام التحقق (reCAPTCHA). يرجى تحديث الصفحة.');
      }

      const confirmation = await signInWithPhoneNumber(auth, normalizedPhone, verifierRef.current);
      setConfirmationResult(confirmation);
      setStep('code');
    } catch (err: any) {
      if (err.code !== 'auth/too-many-requests') {
        console.error('Phone Auth Error:', err);
      }
      let errorMsg = 'حدث خطأ أثناء إرسال الكود.';
      
      const isInternalError = err.message?.includes('-39') || err.code?.includes('-39') || err.message?.includes('auth/internal-error');
      if (isInternalError) {
        errorMsg = 'حدث خطأ في خدمة التحقق. يرجى التأكد من اتصالك بالإنترنت والمحاولة مرة أخرى.';
      } else if (err.code === 'auth/invalid-phone-number') {
        errorMsg = 'رقم الهاتف غير صحيح، يرجى التأكد من كتابته بشكل كامل مع كود الدولة (مثال: +201111111111).';
      } else if (err.code === 'auth/too-many-requests') {
        errorMsg = 'لقد حاولت عدة مرات متتالية. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.';
      } else if (err.code === 'auth/invalid-credential' || err.message?.includes('invalid-credential')) {
        errorMsg = 'حدث خطأ في تفعيل خدمة التحقق أو رُفض التحقق (reCAPTCHA). يرجى تصفح الموقع من الرابط المعتمد أو إعادة المحاولة لاحقاً.';
      } else {
        errorMsg += ` تفاصيل: ${err.message || err.code || 'تعذر التواصل مع خدمات التحقق.'}`;
      }
      setError(errorMsg);
      // reset reCAPTCHA
      if ((window as any).recaptchaVerifier) {
        (window as any).recaptchaVerifier.clear();
        (window as any).recaptchaVerifier = null;
      }
      if (verifierRef.current) {
        verifierRef.current.clear();
        verifierRef.current = null;
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || !confirmationResult) return;

    setLoading(true);
    setError('');

    try {
      const result = await confirmationResult.confirm(verificationCode);
      const user = result.user;

      if (mode === 'forgot_password') {
         const idToken = await user.getIdToken();
          
         try {
           const res = await fetch('/api/auth/recover-password', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ idToken })
           });
           const data = await res.json();
           await auth.signOut();
           
           if (!res.ok) {
              setError(data.error || "حدث خطأ غير متوقع.");
              setStep('phone');
              setLoading(false);
              return;
           }
           
           setRecoveredPassword(data.password);
           setShowRecoverPopup(true);
           setLoading(false);
           return;
         } catch (err: any) {
           await auth.signOut();
           setError("فشل الاتصال بالخادم. يرجى المحاولة لاحقاً.");
           setStep('phone');
           setLoading(false);
           return;
         }
      }

      const usersRef = collection(db, 'users');
      const p1 = user.phoneNumber || phoneNumber;
      const p2 = p1.replace('+20', '0');
      const p3 = p1.replace('+', '');
      const variations = Array.from(new Set([p1, p2, p3, phoneNumber, phoneNumber.replace(/\s/g, '')]));
      
      let userSnap = null;
      for (const v of variations) {
        if (!v) continue;
        try {
          const snapshot = await getDocs(query(usersRef, where('phoneNumber', '==', v)));
          if (!snapshot.empty) {
            userSnap = snapshot.docs[0];
            break;
          }
        } catch (e) {}
      }

      if (mode === 'signup' && (role === 'buyer' || role === 'seller')) {
        if (userSnap) {
           setError('رقم الهاتف هذا مسجل مسبقاً بالموقع، يرجى تسجيل الدخول.');
           await auth.signOut();
           setStep('phone');
           setMode('login');
           setLoading(false);
           return;
        }

        const email = getVirtualEmail(phoneNumber);
        try {
          const userCredential = await createUserWithEmailAndPassword(auth, email, password);
          
          await setDoc(doc(db, 'users', userCredential.user.uid), {
            name: fullName,
            email: email,
            phoneNumber: phoneNumber,
            password: password,
            role: role,
            createdAt: serverTimestamp()
          });
        } catch (e: any) {
          if (e.code === 'auth/email-already-in-use') {
            setError('رقم الهاتف هذا مسجل مسبقاً بالموقع، يرجى تسجيل الدخول.');
          } else if (e.code === 'auth/network-request-failed') {
             setError('فشل الاتصال بالإنترنت، يرجى التأكد من اتصالك والمحاولة مرة أخرى.');
          } else {
             console.error('Error creating user after OTP', e);
             setError('حدث خطأ غير متوقع، يرجى المحاولة لاحقاً.');
          }
          
          try { await user.delete(); } catch(err){}
          await auth.signOut();
          setStep('phone');
          setMode('login');
          setLoading(false);
          return;
        }
        if (role === 'seller') {
          navigate('/merchant');
        } else {
          navigate('/');
        }
      } else {
        if (!userSnap) {
            await user.delete();
            setError('هذا الرقم غير مسجل أو تم حذفه من قبل الإدارة. يرجى اختيار "إنشاء حساب" أولاً.');
            setStep('phone');
            setMode('signup');
            setLoading(false);
            return;
        } else {
            const userData = userSnap.data();
            const email = getVirtualEmail(userData.phoneNumber || phoneNumber);
            try {
              if (userData.password) {
                 await signInWithEmailAndPassword(auth, email, userData.password);
              }
            } catch (err) {
               console.log("Secondary login failed, continuing with phone auth");
            }

            if (userData?.role === 'admin') {
              navigate('/admin');
            } else if (userData?.role === 'seller') {
              navigate('/merchant');
            } else {
              navigate('/');
            }
        }
      }
    } catch (err: any) {
      if (err.code === 'auth/too-many-requests') {
        setError('لقد حاولت عدة مرات متتالية. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.');
      } else {
        if (err.code !== 'auth/invalid-verification-code' && err.code !== 'auth/invalid-credential') {
          console.error("OTP Error:", err);
        }
        setError('كود التحقق غير صحيح، يرجى المحاولة مرة أخرى.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-10 px-4">
      {/* Role Selection */}
      <div className="flex bg-gray-100 p-1.5 rounded-2xl mb-8 overflow-x-auto no-scrollbar whitespace-nowrap">
        <button
          onClick={() => {
            setRole('buyer');
            setStep('phone');
            setError('');
          }}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all px-2 ${
            role === 'buyer' 
              ? 'bg-white text-blue-600 shadow-sm' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <User size={18} />
          <span className="text-sm">مشتري</span>
        </button>
        <button
          onClick={() => {
            setRole('seller');
            setStep('phone');
            setError('');
          }}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all px-2 ${
            role === 'seller' 
              ? 'bg-amber-600 text-white shadow-sm' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <ShoppingCart size={18} />
          <span className="text-sm">تاجر</span>
        </button>
        <button
          onClick={() => {
            setRole('admin');
            setMode('login'); // Admins always use login
            setStep('phone');
            setError('');
          }}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all px-2 ${
            role === 'admin' 
              ? 'bg-blue-600 text-white shadow-sm' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <ShieldCheck size={18} />
          <span className="text-sm">مشرف</span>
        </button>
      </div>

      {/* Login/Signup Toggle for Buyer & Seller */}
      {(role === 'buyer' || role === 'seller') && step === 'phone' && (
        <div className="flex bg-blue-50 p-1.5 rounded-2xl mb-8">
          <button
            onClick={() => setMode('signup')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold transition-all ${
              mode === 'signup' 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'text-blue-400 hover:text-blue-600'
            }`}
          >
            <UserPlus size={18} />
            إنشاء حساب
          </button>
          <button
            onClick={() => setMode('login')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold transition-all ${
              mode === 'login' 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'text-blue-400 hover:text-blue-600'
            }`}
          >
            <LogIn size={18} />
            تسجيل دخول
          </button>
        </div>
      )}

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 flex flex-col items-center text-center"
      >
        <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-6 transition-colors ${
          role === 'admin' ? 'bg-gray-900 text-white' : role === 'seller' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
        }`}>
          {role === 'admin' ? <ShieldCheck size={40} /> : role === 'seller' ? <ShoppingCart size={40} /> : <User size={40} />}
        </div>

        <h1 className="text-3xl font-black text-gray-900 mb-2">
          {role !== 'admin' 
            ? (mode === 'signup' ? 'إنشاء حساب جديد' : 'أهلاً بك مجدداً') 
            : 'دخول المشرف'}
        </h1>
        <p className="text-gray-500 mb-8">
          {role !== 'admin' 
            ? (mode === 'signup' ? 'أدخل اسمك ورقمك للبدء' : 'سجل دخولك للمتابعة') 
            : 'أدخل رقمك المسجل للدخول للوحة التحكم'}
        </p>

        {error && (
          <div className="w-full bg-red-50 text-red-600 p-4 rounded-xl mb-6 text-sm font-medium whitespace-pre-wrap text-right border border-red-100">
            {error}
          </div>
        )}

        <AnimatePresence mode="wait">
          {step === 'phone' ? (
            <motion.form 
              key="phone-step"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onSubmit={handleAction}
              className="w-full space-y-4"
            >



              {(role === 'buyer' || role === 'seller') && mode === 'signup' && (
                <div className="text-right">
                  <label className="text-sm font-bold text-gray-700 mr-1">الاسم الكامل</label>
                  <input
                    required
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="اكتب اسمك هنا"
                    className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-bold text-lg text-center"
                  />
                </div>
              )}
              <div className="text-right">
                <label className="text-sm font-bold text-gray-700 mr-1">رقم الهاتف</label>
                <input
                  required
                  type="tel"
                  dir="ltr"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+20XXXXXXXXXX"
                  className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-bold text-lg text-center"
                />
              </div>
              {(role === 'buyer' || role === 'seller') && mode !== 'forgot_password' && (
                <div className="text-right">
                  <div className="flex justify-between items-center mb-1">
                    {mode === 'login' && (
                      <button 
                        type="button" 
                        onClick={() => {
                          setMode('forgot_password');
                          setError('');
                        }}
                        className="text-xs text-blue-600 font-bold hover:underline"
                      >
                        نسيت كلمة السر؟
                      </button>
                    )}
                    <label className="text-sm font-bold text-gray-700 mr-1">كلمة السر</label>
                  </div>
                  <div className="relative">
                    <input
                      required={mode === 'login'}
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 pr-12 pl-12 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-bold text-lg text-center"
                    />
                    <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-500 transition-colors p-1"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl transition-all font-bold text-lg shadow-lg shadow-blue-600/20 active:scale-95 disabled:opacity-50"
              >
                {loading ? 'جاري العمل...' : (mode === 'signup' && (role === 'buyer' || role === 'seller') ? 'إنشاء حساب جديد' : mode === 'forgot_password' ? 'إرسال كود التحقق' : 'تسجيل الدخول')}
                <ArrowRight size={20} className="rotate-180" />
              </button>
              
              {mode === 'forgot_password' && (
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="w-full text-center text-sm font-bold text-gray-500 hover:text-gray-700 mt-2 hover:underline"
                >
                  العودة لتسجيل الدخول
                </button>
              )}
            </motion.form>
          ) : step === 'code' ? (
            <motion.form 
              key="code-step"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onSubmit={handleVerifyCode}
              className="w-full space-y-4"
            >
              <div className="text-right">
                <label className="text-sm font-bold text-gray-700 mr-1">كود التحقق المرسل إلى</label>
                <div className="text-blue-600 font-black text-lg mb-2" dir="ltr">{phoneNumber}</div>
                <input
                  required
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="------"
                  className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-bold text-2xl tracking-[0.5em] text-center"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 bg-green-500 hover:bg-green-600 text-white py-4 rounded-2xl transition-all font-bold text-lg shadow-lg shadow-green-600/20 active:scale-95 disabled:opacity-50"
              >
                {loading ? 'جاري التحقق...' : 'تأكيد الرمز'}
                <CheckCircle2 size={20} />
              </button>
              <button
                type="button"
                onClick={() => setStep('phone')}
                className="text-gray-400 hover:text-gray-600 text-sm font-medium underline"
              >
                تغيير رقم الهاتف
              </button>
            </motion.form>
          ) : (
            <div />
          )}
        </AnimatePresence>
        
        <p className="mt-10 text-xs text-gray-400">
          {role === 'buyer' 
            ? 'يتم تأمين حسابك بكلمة سر خاصة بك.' 
            : 'ستصلك رسالة نصية تحتوي على كود التحقق للمشرف.'}
        </p>
      </motion.div>

      {/* Recover Password Popup */}
      <AnimatePresence>
        {showRecoverPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl relative overflow-hidden"
            >
              <div className="bg-blue-50 text-blue-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                <Lock size={32} />
              </div>
              <h2 className="text-2xl font-black text-gray-900 mb-2">كلمة السر الخاصة بك</h2>
              <p className="text-gray-500 mb-6 font-medium">تم استرجاع كلمة السر بنجاح</p>
              
              <div className="bg-gray-50 border-2 border-gray-100 rounded-2xl p-4 mb-8 flex items-center justify-between">
                <span className="font-mono text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 select-all tracking-wider flex-1 text-left" dir="ltr">
                  {recoveredPassword}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(recoveredPassword);
                    setIsCopied(true);
                    setTimeout(() => setIsCopied(false), 2000);
                  }}
                  className={`p-2 rounded-xl transition-all flex border items-center justify-center gap-1 min-w-[80px] ${
                    isCopied 
                      ? 'bg-green-50 text-green-600 border-green-200' 
                      : 'bg-white text-blue-600 border-blue-100 shadow-sm hover:bg-blue-50'
                  }`}
                  title="نسخ كلمة السر"
                >
                  {isCopied ? (
                    <>
                      <Check size={18} />
                      <span className="text-xs font-bold">تم النسخ</span>
                    </>
                  ) : (
                    <>
                      <Copy size={18} />
                      <span className="text-xs font-bold">نسخ</span>
                    </>
                  )}
                </button>
              </div>
              
              <button
                onClick={() => {
                  setShowRecoverPopup(false);
                  setMode('login');
                  setStep('phone');
                }}
                className="w-full flex justify-center items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-4 font-bold text-lg shadow-lg shadow-blue-200 transition-all active:scale-95"
              >
                تسجيل الدخول
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
