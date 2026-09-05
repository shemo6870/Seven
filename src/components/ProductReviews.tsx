import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, getDocs, addDoc, serverTimestamp, getDoc, doc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Review } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Star, MessageSquare, User, Send, StarHalf, AlertCircle } from 'lucide-react';

interface ProductReviewsProps {
  productId: string;
}

export default function ProductReviews({ productId }: ProductReviewsProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const fetchReviews = async () => {
      try {
        const q = query(
          collection(db, 'reviews'),
          where('productId', '==', productId),
          orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);
        const reviewsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Review[];
        setReviews(reviewsData);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `reviews/${productId}`);
      } finally {
        setLoading(false);
      }
    };

    fetchReviews();

    // Fetch current user's name for submission
    const fetchUserName = async () => {
      if (auth.currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
          if (userDoc.exists()) {
            setUserName(userDoc.data().name || 'مشتري');
          } else {
            setUserName(auth.currentUser.displayName || 'مشتري');
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${auth.currentUser.uid}`);
          setUserName('مشتري');
        }
      }
    };

    fetchUserName();
  }, [productId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) {
      alert('يرجى تسجيل الدخول أولاً لإضافة تقييم.');
      return;
    }
    if (rating < 1 || rating > 5) return;
    if (!comment.trim()) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'reviews'), {
        productId,
        userId: auth.currentUser.uid,
        userName: userName || 'مشتري',
        rating,
        comment: comment.trim(),
        createdAt: serverTimestamp()
      });
      setComment('');
      setRating(5);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'reviews');
      alert('حدث خطأ أثناء إرسال التقييم. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const averageRating = reviews.length > 0 
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : 0;

  const StarRating = ({ value, isInteractive = false, onRate }: { value: number, isInteractive?: boolean, onRate?: (rate: number) => void }) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={!isInteractive}
            onClick={() => onRate?.(star)}
            className={`${isInteractive ? 'hover:scale-110 active:scale-95 transition-transform cursor-pointer' : 'cursor-default'}`}
          >
            <Star 
              size={isInteractive ? 28 : 16} 
              className={star <= value ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'} 
            />
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-8 mt-12 bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-6 border-b border-gray-50 pb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
            <MessageSquare size={28} />
          </div>
          <div>
            <h3 className="text-2xl font-black text-gray-900 border-none p-0 mb-1">التقييمات والآراء</h3>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 font-bold text-sm">{reviews.length} تعليقات</span>
              {reviews.length > 0 && (
                <>
                  <span className="text-gray-300">•</span>
                  <div className="flex items-center gap-1">
                    <span className="text-blue-600 font-black">{averageRating}</span>
                    <Star size={14} className="fill-blue-600 text-blue-600" />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Review Submission Form */}
      {auth.currentUser ? (
        <form onSubmit={handleSubmit} className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="font-bold text-gray-700">ما هو تقييمك للمنتج؟</p>
            <StarRating value={rating} isInteractive onRate={setRating} />
          </div>
          <div className="relative">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="اكتب رأيك هنا بكل صراحة..."
              className="w-full bg-white border border-gray-200 rounded-xl p-4 min-h-[100px] text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none shadow-sm font-medium"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting || !comment.trim()}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20 active:scale-95 text-lg"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Send size={18} />
                  <span>نشر المراجعة</span>
                </>
              )}
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-amber-50 border border-amber-100 p-6 rounded-2xl flex items-center gap-4 text-amber-800">
          <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
            <AlertCircle size={24} />
          </div>
          <div>
            <p className="font-bold">سجل دخولك لإضافة تقييم</p>
            <p className="text-sm opacity-80 font-medium">آراؤك تهمنا وتساعد الآخرين في اتخاذ قرارات الشراء.</p>
          </div>
        </div>
      )}

      {/* Reviews List */}
      <div className="space-y-6">
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Star size={32} className="text-gray-200" />
            </div>
            <p className="text-gray-400 font-bold">لا توجد تقييمات لهذا المنتج بعد. كن أول من يقيم!</p>
          </div>
        ) : (
          <div className="grid gap-6">
            <AnimatePresence>
              {reviews.map((review) => (
                <motion.div
                  key={review.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center font-black">
                        {review.userName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-black text-gray-900 group-hover:text-blue-600 transition-colors">{review.userName}</h4>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                          {review.createdAt?.toDate().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    <StarRating value={review.rating} />
                  </div>
                  <p className="text-gray-600 font-medium leading-relaxed pr-13">
                    {review.comment}
                  </p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
