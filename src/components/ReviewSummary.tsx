import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Star } from 'lucide-react';

interface ReviewSummaryProps {
  productId: string;
  showCount?: boolean;
}

const reviewStatsCache: Record<string, { avg: number; count: number }> = {};

export default function ReviewSummary({ productId, showCount = true }: ReviewSummaryProps) {
  const [stats, setStats] = useState({ avg: 0, count: 0 });

  useEffect(() => {
    if (reviewStatsCache[productId]) {
      setStats(reviewStatsCache[productId]);
      return;
    }

    const fetchStats = async () => {
      try {
        const q = query(
          collection(db, 'reviews'),
          where('productId', '==', productId)
        );

        const snapshot = await getDocs(q);
        if (snapshot.empty) {
          const emptyStats = { avg: 0, count: 0 };
          reviewStatsCache[productId] = emptyStats;
          setStats(emptyStats);
          return;
        }
        
        const total = snapshot.docs.reduce((sum, doc) => sum + (doc.data().rating || 0), 0);
        const newStats = {
          avg: Number((total / snapshot.docs.length).toFixed(1)),
          count: snapshot.docs.length
        };
        
        reviewStatsCache[productId] = newStats;
        setStats(newStats);
      } catch (error) {
        // Silently ignore to prevent log spamming on quota exceeded
      }
    };

    fetchStats();
  }, [productId]);

  if (stats.count === 0) return null;

  return (
    <div className="flex items-center gap-1.5 text-sm">
      <div className="flex items-center gap-0.5 text-yellow-500">
        <Star size={14} className="fill-yellow-500" />
        <span className="font-black text-gray-900">{stats.avg}</span>
      </div>
      {showCount && (
        <span className="text-gray-400 font-medium">({stats.count})</span>
      )}
    </div>
  );
}
