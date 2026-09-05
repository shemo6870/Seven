import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Info, Heart, ShieldCheck, Truck, Star } from 'lucide-react';

interface AboutUsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AboutUsModal({ isOpen, onClose }: AboutUsModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="p-6 bg-blue-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                  <Info size={24} />
                </div>
                <h2 className="text-2xl font-black">من نحن - Seven Store</h2>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-gray-900">مرحباً بك في Seven Store</h3>
                <p className="text-gray-600 leading-relaxed text-lg">
                  نحن في <span className="font-bold text-blue-600">Seven Store</span> نسعى لتقديم تجربة تسوق فريدة ومميزة تجمع بين الجودة العالية والأسعار التنافسية. بدأنا شغفنا بتوفير أفضل المنتجات لعملائنا، ونطمح دائماً لنكون وجهتكم الأولى للتسوق الإلكتروني.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="p-5 bg-blue-50 rounded-2xl border border-blue-100 space-y-3">
                  <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center">
                    <Heart size={20} />
                  </div>
                  <h4 className="font-bold text-gray-900">رؤيتنا</h4>
                  <p className="text-sm text-gray-600">تقديم أفضل المنتجات بأعلى معايير الجودة لضمان رضا عملائنا الدائم.</p>
                </div>

                <div className="p-5 bg-amber-50 rounded-2xl border border-amber-100 space-y-3">
                  <div className="w-10 h-10 bg-amber-500 text-white rounded-xl flex items-center justify-center">
                    <Star size={20} />
                  </div>
                  <h4 className="font-bold text-gray-900">قيمنا</h4>
                  <p className="text-sm text-gray-600">الشفافية، المصداقية، وسرعة الاستجابة لجميع استفساراتكم.</p>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-xl font-bold text-gray-900 border-b pb-2 flex items-center gap-2">
                  <ShieldCheck size={20} className="text-blue-600" />
                  لماذا تختار Seven Store؟
                </h3>
                <ul className="space-y-4">
                  <li className="flex items-start gap-3">
                    <div className="mt-1 w-5 h-5 bg-green-100 text-green-600 rounded-full flex items-center justify-center shrink-0">
                      <Truck size={12} />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">شحن سريع وموثوق</p>
                      <p className="text-sm text-gray-500">نصل إليك أينما كنت في أسرع وقت ممكن.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="mt-1 w-5 h-5 bg-green-100 text-green-600 rounded-full flex items-center justify-center shrink-0">
                      <ShieldCheck size={12} />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">أقوى العروض</p>
                      <p className="text-sm text-gray-500">نقدم دائماً كوبونات خصم وعروض لا تقبل المنافسة.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="mt-1 w-5 h-5 bg-green-100 text-green-600 rounded-full flex items-center justify-center shrink-0">
                      <Heart size={12} />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">دعم فني متميز</p>
                      <p className="text-sm text-gray-500">فريقنا متاح دائماً للرد على استفساراتكم عبر الدردشة المباشرة.</p>
                    </div>
                  </li>
                </ul>
              </div>

              <div className="p-6 bg-gray-50 rounded-2xl text-center space-y-2">
                <p className="text-gray-500 text-sm">Seven Store ©</p>
                <p className="text-blue-600 font-bold">شكراً لثقتكم بنا!</p>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
