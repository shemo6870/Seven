const fs = require('fs');
const path = require('path');

const replacement = `  const handleVerifyCode = async (e: React.FormEvent) => {
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
      const variations = Array.from(new Set([p1, p2, p3, phoneNumber, phoneNumber.replace(/\\s/g, '')]));
      
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
  };`;

const filePath = path.join(__dirname, 'src/pages/Login.tsx');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

const startIdx = lines.findIndex(l => l.includes('const handleVerifyCode = async (e: React.FormEvent) => {'));
let endIdx = -1;

for (let i = startIdx; i < lines.length; i++) {
  if (lines[i].includes('  return (')) {
    endIdx = i - 1; // Actually lines[i-1] should be the empty line or the closing brace of handleVerifyCode
    // walk back until we find `};`
    for (let j = endIdx; j >= startIdx; j--) {
        if (lines[j].trim() === '};') {
             endIdx = j;
             break;
        }
    }
    break;
  }
}

if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
  lines.splice(startIdx, endIdx - startIdx + 1, replacement);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  console.log('Successfully replaced handleVerifyCode');
} else {
  console.log('Failed to find bounds', startIdx, endIdx);
}
