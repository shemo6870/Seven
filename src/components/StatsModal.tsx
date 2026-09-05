import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Users, ShoppingBag, TrendingUp, Package, BarChart3, Activity, Store, Banknote } from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { WHATSAPP_NUMBER } from '../constants';

interface Stats {
  totalBuyers: number;
  totalProducts: number;
  totalItemsSold: number;
  totalMerchants: number;
  totalRevenue: number;
  topProducts: { name: string; count: number; price?: number }[];
  topCategories: { name: string; count: number }[];
  updatedAt?: string;
}

export default function StatsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const currentUser = auth.currentUser;
  const isSeller = (currentUser?.phoneNumber?.replace('+', '') === WHATSAPP_NUMBER) || 
                   (currentUser?.phoneNumber === WHATSAPP_NUMBER) || 
                   (currentUser?.phoneNumber === '+' + WHATSAPP_NUMBER) ||
                   (currentUser?.email?.toLowerCase() === 'mahmoudmasry165@gmail.com') ||
                   (currentUser?.email?.toLowerCase() === '201115454823@seven.store') ||
                   (currentUser?.email?.toLowerCase() === '01115454823@seven.store');

  useEffect(() => {
    if (isOpen) {
      fetchStats();
    }
  }, [isOpen]);

  const fetchStats = async (forceUpdate = false) => {
    // Try cache first if not forced
    const cachedStats = sessionStorage.getItem('store_stats');
    if (!forceUpdate && cachedStats) {
      try {
        const parsed = JSON.parse(cachedStats);
        if (parsed && typeof parsed === 'object') {
          parsed.topProducts = parsed.topProducts || [];
          parsed.topCategories = parsed.topCategories || [];
          setStats(parsed);
          setLoading(false);
          return;
        }
      } catch (e) {
        console.error("Error parsing cached stats:", e);
      }
    }

    setLoading(true);
    setFetchError(null);
    try {
      if (isSeller) {
        // Seller can fetch everything or use mirrror
        const productsSnap = await getDocs(collection(db, 'products'));
        const productsData = productsSnap.docs.map(d => d.data());
        const totalProducts = productsData.length;
        const uniqueMerchants = new Set(productsData.map(p => p.sellerId).filter(id => id)).size;

        const ordersSnap = await getDocs(collection(db, 'orders'));
        const orders = ordersSnap.docs.map(doc => doc.data());
        
        const paidOrders = orders.filter(o => o.status === 'paid' || o.status === 'delivered' || o.status === 'shipped');
        const totalOrders = paidOrders.length;
        const uniqueBuyers = new Set(paidOrders.map(o => o.userId)).size;

        let totalItemsSold = 0;
        let totalRevenue = 0;
        const productCounts: { [key: string]: number } = {};
        const categoryCounts: { [key: string]: number } = {};

        paidOrders.forEach(order => {
          totalRevenue += (order.total || 0);
          if (order.items && Array.isArray(order.items)) {
            order.items.forEach((item: any) => {
              const qty = item.quantity || 1;
              totalItemsSold += qty;
              productCounts[item.name] = (productCounts[item.name] || 0) + qty;
              if (item.category) {
                categoryCounts[item.category] = (categoryCounts[item.category] || 0) + qty;
              }
            });
          }
        });

        const topProducts = Object.entries(productCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        const topCategories = Object.entries(categoryCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);

        const newStats: Stats = {
          totalBuyers: uniqueBuyers,
          totalProducts,
          totalItemsSold,
          totalMerchants: uniqueMerchants,
          totalRevenue,
          topProducts,
          topCategories,
          updatedAt: new Date().toISOString()
        };

        setStats(newStats);
        sessionStorage.setItem('store_stats', JSON.stringify(newStats));

        // Update the public mirror
        try {
          const publicStats = { ...newStats };
          delete (publicStats as any).totalRevenue;
          await setDoc(doc(db, 'public_stats', 'dashboard'), publicStats);
        } catch (e: any) {
          console.error('Error updating public stats mirror:', e);
        }
      } else {
        // Buyer/Guest fetch from public mirror
        const statsDoc = await getDoc(doc(db, 'public_stats', 'dashboard'));
        if (statsDoc.exists()) {
          const statsData = statsDoc.data() as Stats;
          setStats(statsData);
          sessionStorage.setItem('store_stats', JSON.stringify(statsData));
        } else {
          setFetchError('لا توجد بيانات متاحة حالياً. يرجى الانتظار حتى يقوم التاجر بتحديث الإحصائيات.');
        }
      }
    } catch (error: any) {
      console.error('Error fetching stats:', error);
      setFetchError('حدث خطأ أثناء تحميل البيانات. يرجى المحاولة لاحقاً.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          dir="rtl"
        >
          {/* Header */}
          <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700 text-white">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
                <BarChart3 size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black">إحصائيات المتجر</h2>
                <p className="text-xs text-blue-100 font-bold opacity-80 uppercase tracking-widest">Store Insights & Analytics</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-xl transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-blue-600 font-bold animate-pulse">جاري تحليل البيانات...</p>
              </div>
            ) : fetchError ? (
              <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-3xl border border-dashed border-gray-200">
                <Activity className="text-gray-300 mb-4" size={48} />
                <p className="text-gray-600 font-bold max-w-xs">{fetchError}</p>
                {isSeller && (
                   <button 
                     onClick={() => fetchStats()}
                     className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
                   >
                     إعادة المحاولة
                   </button>
                )}
              </div>
            ) : stats ? (
              <div className="space-y-6">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard 
                    label="إجمالي المشترين" 
                    value={(stats.totalBuyers ?? 0).toLocaleString('en-US')} 
                    icon={<Users className="text-blue-600" size={20} />}
                    color="blue"
                  />
                  <StatCard 
                    label="المنتجات المتاحة" 
                    value={(stats.totalProducts ?? 0).toLocaleString('en-US')} 
                    icon={<Package className="text-purple-600" size={20} />}
                    color="purple"
                  />
                  <StatCard 
                    label="المتاجر المسجلة" 
                    value={(stats.totalMerchants ?? 0).toLocaleString('en-US')} 
                    icon={<Store className="text-green-600" size={20} />}
                    color="green"
                  />
                  <StatCard 
                    label="المنتجات المباعة" 
                    value={(stats.totalItemsSold ?? 0).toLocaleString('en-US')} 
                    icon={<ShoppingBag className="text-rose-600" size={20} />}
                    color="rose"
                  />
                </div>
                
                {isSeller && stats.totalRevenue !== undefined && (
                  <div className="bg-gradient-to-l from-emerald-500 to-teal-500 p-6 rounded-3xl text-white shadow-lg shadow-emerald-500/20 relative overflow-hidden">
                    <div className="absolute -right-4 -bottom-4 opacity-10">
                      <Banknote size={150} />
                    </div>
                    <div className="relative z-10 flex flex-col gap-1">
                      <p className="text-emerald-50 text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                        <Activity size={16} /> إجمالي الإيرادات
                      </p>
                      <h3 className="text-3xl font-black">{stats.totalRevenue.toLocaleString('en-US')} <span className="text-lg font-bold">ج.م</span></h3>
                    </div>
                  </div>
                )}

                <div className="grid lg:grid-cols-2 gap-4">
                  {/* Top Products */}
                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                    <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
                      <TrendingUp size={20} className="text-blue-600" />
                      المنتجات الأكثر مبيعاً
                    </h3>
                    {stats && (stats.topProducts || []).length > 0 ? (
                      <div className="space-y-3">
                        {(stats.topProducts || []).map((product, index) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors group">
                            <div className="flex items-center gap-3">
                              <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-black text-xs">
                                {index + 1}
                              </span>
                              <span className="font-bold text-gray-800 group-hover:text-blue-600 transition-colors text-sm">{product.name}</span>
                            </div>
                            <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-full border border-gray-100 shadow-sm shrink-0">
                              <span className="text-xs font-black text-blue-600">{product.count}</span>
                              <span className="text-[8px] text-gray-400 font-bold">بـيـع</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center py-6 text-gray-400 italic text-sm">لا توجد بيانات مبيعات بعد.</p>
                    )}
                  </div>

                  {/* Top Categories */}
                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                    <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
                      <Package size={20} className="text-purple-600" />
                      الأقسام الأكثر نشاطاً
                    </h3>
                    {stats && (stats.topCategories || []).length > 0 ? (
                      <div className="space-y-3">
                        {(stats.topCategories || []).map((cat, index) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl">
                            <span className="font-bold text-gray-800 text-sm">{cat.name}</span>
                            <div className="flex items-center gap-1">
                              <div className="h-1.5 w-24 bg-gray-200 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-purple-600" 
                                  style={{ width: `${(cat.count / (stats.totalItemsSold || 1)) * 100}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-black text-gray-400">{Math.round((cat.count / (stats.totalItemsSold || 1)) * 100)}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center py-6 text-gray-400 italic text-sm">لا توجد بيانات كافية.</p>
                    )}
                  </div>
                </div>

                {/* Footer Info */}
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <p className="text-[10px] text-gray-500 font-bold text-center flex items-center justify-center gap-2">
                    <Activity size={12} />
                    تم التحديث: {stats.updatedAt ? new Date(stats.updatedAt).toLocaleString('ar-EG') : 'الآن'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-10">
                <p className="text-red-500 font-bold">لم تتوفر بيانات بعد.</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  const bgColors: { [key: string]: string } = {
    blue: 'bg-blue-50 border-blue-100',
    purple: 'bg-purple-50 border-purple-100',
    green: 'bg-green-50 border-green-100',
    amber: 'bg-amber-50 border-amber-100',
    rose: 'bg-rose-50 border-rose-100',
    cyan: 'bg-cyan-50 border-cyan-100',
  };

  return (
    <div className={`p-4 rounded-3xl border-2 ${bgColors[color]} flex flex-col gap-2 transition-all hover:scale-[1.02] cursor-default`}>
      <div className="flex items-center justify-between">
        <div className="p-2 bg-white rounded-xl shadow-sm border border-gray-50">
          {icon}
        </div>
      </div>
      <div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
        <p className="text-lg font-black text-gray-900 tracking-tight">{value}</p>
      </div>
    </div>
  );
}
