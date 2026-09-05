const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/pages/Login.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const regex = /if \(isInternalError\) \{[\s\S]*?errorMsg \+=/g;

content = content.replace(regex, `if (isInternalError) {
        errorMsg = 'حدث خطأ في خدمة التحقق. يرجى التأكد من اتصالك بالإنترنت والمحاولة مرة أخرى.';
      } else if (err.code === 'auth/invalid-phone-number') {
        errorMsg = 'رقم الهاتف غير صحيح، يرجى التأكد من كتابته بشكل كامل مع كود الدولة (مثال: +201111111111).';
      } else if (err.code === 'auth/too-many-requests') {
        errorMsg = 'لقد حاولت عدة مرات متتالية. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.';
      } else if (err.code === 'auth/invalid-credential' || err.message?.includes('invalid-credential')) {
        errorMsg = 'حدث خطأ في تفعيل خدمة التحقق أو رُفض التحقق (reCAPTCHA). يرجى تصفح الموقع من الرابط المعتمد أو إعادة المحاولة لاحقاً.';
      } else {
        errorMsg +=`);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed syntax error in Login.tsx');
