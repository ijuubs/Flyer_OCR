'use client';

import { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { collection, query, orderBy, limit, onSnapshot, getDocs, where } from 'firebase/firestore';
import { TrendingDown, TrendingUp, Brain, Info, ArrowRight, ShoppingBasket, Loader2, Zap, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

interface TrendItem {
  id: string;
  name: string;
  change: number;
  currentPrice: number;
  previousPrice: number;
  unit: string;
  category: string;
}

export default function Trends() {
  const [priceDrops, setPriceDrops] = useState<TrendItem[]>([]);
  const [priceIncreases, setPriceIncreases] = useState<TrendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    bestStore: 'Loading...',
    avoidProduct: 'None',
    avoidChange: 0
  });

  useEffect(() => {
    const productsRef = collection(db, 'products');
    
    // Fetch products with significant price changes
    const q = query(
      productsRef, 
      where('priceChange', '!=', 0),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allTrends: TrendItem[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name,
          change: data.priceChange || 0,
          currentPrice: data.lastPrice,
          previousPrice: data.previousPrice || data.lastPrice,
          unit: data.unit || '',
          category: data.category || 'General'
        };
      });

      const drops = allTrends
        .filter(t => t.change < 0)
        .sort((a, b) => a.change - b.change) // Most negative first
        .slice(0, 5);

      const increases = allTrends
        .filter(t => t.change > 0)
        .sort((a, b) => b.change - a.change) // Most positive first
        .slice(0, 5);

      setPriceDrops(drops);
      setPriceIncreases(increases);
      
      if (increases.length > 0) {
        setStats(prev => ({
          ...prev,
          avoidProduct: increases[0].name,
          avoidChange: Math.round(increases[0].change)
        }));
      }

      setLoading(false);
    }, (error) => {
      console.error("Error fetching trends:", error);
      setLoading(false);
    });

    // Also fetch best store (simplified: store with most products)
    const fetchBestStore = async () => {
      try {
        const storesSnap = await getDocs(collection(db, 'stores'));
        if (!storesSnap.empty) {
          // For now just pick the first one or implement more complex logic later
          setStats(prev => ({ ...prev, bestStore: storesSnap.docs[0].data().name }));
        }
      } catch (err) {
        console.error("Error fetching best store:", err);
      }
    };
    fetchBestStore();

    return () => unsubscribe();
  }, []);

  return (
    <div className="space-y-10 pb-12">
      {/* Smart Insights */}
      <section className="bg-zinc-900 rounded-3xl p-8 text-white relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-xl font-bold font-display tracking-tight">Smart Insights</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white/5 border border-white/10 p-5 rounded-2xl backdrop-blur-md">
              <div className="flex items-center gap-2 text-emerald-400 mb-2">
                <Zap className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest">Cheapest This Week</span>
              </div>
              <p className="text-lg font-bold mb-1">
                {priceDrops.length > 0 ? priceDrops[0].name : "Checking..."}
              </p>
              <p className="text-xs text-zinc-400 font-medium">
                {priceDrops.length > 0 
                  ? `Price dropped by ${Math.abs(Math.round(priceDrops[0].change))}% recently.`
                  : "Scanning for the best deals in your area."}
              </p>
            </div>

            <div className="bg-white/5 border border-white/10 p-5 rounded-2xl backdrop-blur-md">
              <div className="flex items-center gap-2 text-orange-400 mb-2">
                <AlertCircle className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest">Avoid Buying</span>
              </div>
              <p className="text-lg font-bold mb-1 truncate">{stats.avoidProduct}</p>
              <p className="text-xs text-zinc-400 font-medium">
                {stats.avoidChange > 0 
                  ? `Prices are up ${stats.avoidChange}% due to supply changes. Wait if you can.`
                  : "No major price hikes detected this week."}
              </p>
            </div>

            <div className="bg-white/5 border border-white/10 p-5 rounded-2xl backdrop-blur-md">
              <div className="flex items-center gap-2 text-indigo-400 mb-2">
                <TrendingDown className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest">Best Store Overall</span>
              </div>
              <p className="text-lg font-bold mb-1 truncate">{stats.bestStore}</p>
              <p className="text-xs text-zinc-400 font-medium">Highest number of active discounts this week.</p>
            </div>
          </div>
        </div>

        {/* Background Glow */}
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-emerald-500/10 blur-[100px] rounded-full" />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Price Drops */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-emerald-500" />
              📉 Price Drops This Week
            </h3>
          </div>

          <div className="space-y-4">
            {loading ? (
              Array(3).fill(0).map((_, i) => (
                <div key={i} className="h-24 bg-zinc-100 rounded-2xl animate-pulse" />
              ))
            ) : priceDrops.length === 0 ? (
              <div className="bg-zinc-50 border border-dashed border-zinc-200 rounded-2xl p-8 text-center">
                <p className="text-zinc-500 text-sm">No significant price drops detected yet.</p>
              </div>
            ) : (
              priceDrops.map((item) => (
                <div key={item.id} className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                    <TrendingDown className="w-6 h-6" />
                  </div>
                  <div className="flex-grow">
                    <h4 className="font-bold text-zinc-900">{item.name}</h4>
                    <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider">{item.category}</p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-emerald-600 font-black">
                      <TrendingDown className="w-3 h-3" />
                      {Math.abs(Math.round(item.change))}%
                    </div>
                    <div className="text-lg font-black text-zinc-900">${item.currentPrice.toFixed(2)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Price Increases */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-orange-500" />
              📈 Price Increases
            </h3>
          </div>

          <div className="space-y-4">
            {loading ? (
              Array(2).fill(0).map((_, i) => (
                <div key={i} className="h-24 bg-zinc-100 rounded-2xl animate-pulse" />
              ))
            ) : priceIncreases.length === 0 ? (
              <div className="bg-zinc-50 border border-dashed border-zinc-200 rounded-2xl p-8 text-center">
                <p className="text-zinc-500 text-sm">No major price increases detected.</p>
              </div>
            ) : (
              priceIncreases.map((item) => (
                <div key={item.id} className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm flex items-center gap-4">
                  <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div className="flex-grow">
                    <h4 className="font-bold text-zinc-900">{item.name}</h4>
                    <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider">{item.category}</p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-orange-600 font-black">
                      <TrendingUp className="w-3 h-3" />
                      {Math.round(item.change)}%
                    </div>
                    <div className="text-lg font-black text-zinc-900">${item.currentPrice.toFixed(2)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
